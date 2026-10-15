// Dịch vụ Trung tâm vĩ mô của Gateway.
//   - Engine (gói MacroCenter của người dùng, đóng gói sẵn) chạy trong worker thread; `inline: true` cho test.
//   - Số liệu THẬT lưu chỉ-thêm trong KV `macro:observations` (mỗi quan sát = seriesId, period, value, asOf, source).
//     Nguồn: CSV nạp qua route admin (GSO/NHNN/...), và chuỗi chỉ số HOSE (tháng đã đóng) lấy từ lịch sử giá Gateway.
//   - Chưa đủ số liệu thật (>= 1 biến vĩ mô và >= 1 chỉ số, 60 tháng) -> engine dùng kho MÔ PHỎNG, có biểu ngữ. Không trộn.
import { Worker } from "node:worker_threads";
import { createMacroCore, mergeObservations, parseSeriesCsv, vnToday } from "./macroCore.js";
import { buildMacroCatalystEvents } from "./catalystEvents.js";

export const MACRO_KV_KEY = "macro:observations";
// Mã chỉ số trong danh mục MacroCenter -> mã chỉ số của Gateway.
export const HOSE_TARGETS = { VNINDEX: "VNINDEX", VN30: "VN30", VN100: "VN100", VNMIDCAP: "VNMID", VNSMALLCAP: "VNSML", VNALLSHARE: "VNALLSHARE" };
const HOSE_SOURCE = "gateway-hose";
const HOSE_REFRESH_MS = 12 * 3600_000;
const CALL_TIMEOUT_MS = 90_000;

function workerEngine() {
  let worker = null;
  let seq = 0;
  const pending = new Map();
  let lastReal = null;
  const failAll = (msg) => {
    for (const { reject, timer } of pending.values()) {
      clearTimeout(timer);
      reject(new Error(msg));
    }
    pending.clear();
  };
  const spawn = () => {
    worker = new Worker(new URL("./macroWorker.js", import.meta.url));
    worker.unref();
    worker.on("message", ({ id, ok, value, error }) => {
      const p = pending.get(id);
      if (!p) return;
      pending.delete(id);
      clearTimeout(p.timer);
      ok ? p.resolve(value) : p.reject(new Error(error));
    });
    const dead = (why) => {
      worker = null;
      failAll(`Worker vĩ mô dừng (${why}).`);
    };
    worker.on("error", (e) => dead(e.message));
    worker.on("exit", (code) => dead(`mã ${code}`));
    // khởi động lại: nạp lại số liệu thật đã biết
    if (lastReal) send("setReal", [lastReal]).catch(() => {});
  };
  const send = (op, args) => {
    if (!worker) spawn();
    const id = ++seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error("Tính toán vĩ mô quá thời gian."));
      }, CALL_TIMEOUT_MS);
      pending.set(id, { resolve, reject, timer });
      worker.postMessage({ id, op, args });
    });
  };
  return {
    setReal: (list) => {
      lastReal = list;
      return send("setReal", [list]);
    },
    source: () => send("source"),
    handle: (req) => send("handle", [req]),
    runTool: (name, args) => send("runTool", [name, args]),
    toolSpecs: () => send("toolSpecs"),
    close: async () => {
      const w = worker;
      worker = null;
      if (w) await w.terminate();
    },
  };
}

function inlineEngine(opts) {
  const core = createMacroCore(opts);
  return {
    setReal: async (list) => core.setReal(list),
    source: async () => core.source(),
    handle: async (req) => core.handle(req),
    runTool: async (name, args) => core.runTool(name, args),
    toolSpecs: async () => core.toolSpecs(),
    close: async () => {},
  };
}

/** Chuỗi tháng ĐÃ ĐÓNG (giá đóng cửa phiên cuối tháng) từ lịch sử ngày. asOf = ngày đầu tháng kế tiếp (HOSE công bố ngay). */
export function monthlyCloses(bars, todayIso) {
  const nowPeriod = todayIso.slice(0, 7);
  const last = new Map();
  for (const b of bars ?? []) {
    if (!b?.date || !Number.isFinite(b.close) || b.close <= 0) continue;
    const p = String(b.date).slice(0, 7);
    if (p >= nowPeriod) continue;
    const prev = last.get(p);
    if (!prev || b.date > prev.date) last.set(p, b);
  }
  return [...last.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([period, b]) => {
    const [y, m] = period.split("-").map(Number);
    const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
    return { period, value: b.close, asOf: `${next}-01` };
  });
}

export function createMacroService({ store, history, inline = false, now = Date.now, log = console } = {}) {
  const engine = inline ? inlineEngine({ today: () => vnToday(now()) }) : workerEngine();
  let observations = [];
  let ready = null;
  let writeChain = Promise.resolve();
  let hoseAt = 0;
  let hosePending = null;

  const todayIso = () => vnToday(now());

  async function persist(list) {
    observations = list;
    if (store?.setKv) await store.setKv(MACRO_KV_KEY, { observations: list, updatedAt: new Date(now()).toISOString() });
    await engine.setReal(list);
  }

  function init() {
    if (!ready) {
      ready = (async () => {
        try {
          const saved = store?.getKv ? await store.getKv(MACRO_KV_KEY) : null;
          observations = Array.isArray(saved?.observations) ? saved.observations : [];
        } catch (e) {
          log.warn?.(`[macro] không đọc được ${MACRO_KV_KEY}: ${e.message}`);
          observations = [];
        }
        await engine.setReal(observations);
      })().catch((e) => {
        ready = null;
        throw e;
      });
    }
    return ready;
  }

  /** Ghi tuần tự (một hàng đợi) để hai lần nạp cùng lúc không ghi đè nhau. */
  function serialized(fn) {
    const p = writeChain.then(fn, fn);
    writeChain = p.catch(() => {});
    return p;
  }

  /** Bổ sung chuỗi chỉ số HOSE thật từ lịch sử giá Gateway (tối đa 10 năm), tối đa 2 lần/ngày; lỗi thì bỏ qua. */
  function refreshHoseTargets({ force = false } = {}) {
    if (!history?.get) return Promise.resolve({ skipped: "no-history" });
    if (!force && now() - hoseAt < HOSE_REFRESH_MS) return Promise.resolve({ skipped: "fresh" });
    if (hosePending) return hosePending;
    hosePending = (async () => {
      await init();
      const incoming = [];
      const report = {};
      for (const [seriesId, symbol] of Object.entries(HOSE_TARGETS)) {
        try {
          const h = await history.get(symbol, { years: 10 });
          const months = monthlyCloses(h?.bars, todayIso());
          report[seriesId] = months.length;
          for (const m of months) incoming.push({ seriesId, ...m, source: HOSE_SOURCE });
        } catch (e) {
          report[seriesId] = `lỗi: ${e.message}`;
        }
      }
      hoseAt = now();
      if (!incoming.length) return { report, added: 0, changed: 0 };
      return serialized(async () => {
        const { list, added, changed } = mergeObservations(observations, incoming);
        if (added || changed) await persist(list);
        return { report, added, changed };
      });
    })().finally(() => {
      hosePending = null;
    });
    return hosePending;
  }

  return {
    init,
    refreshHoseTargets,
    async handle(req) {
      await init();
      refreshHoseTargets().catch((e) => log.warn?.(`[macro] nạp chỉ số HOSE lỗi: ${e.message}`));
      return engine.handle(req);
    },
    async source() {
      await init();
      const s = await engine.source();
      const bySource = {};
      for (const o of observations) bySource[o.source ?? "csv"] = (bySource[o.source ?? "csv"] ?? 0) + 1;
      return { ...s, bySource };
    },
    async runTool(name, args) {
      await init();
      return engine.runTool(name, args);
    },
    async toolSpecs() {
      await init();
      return engine.toolSpecs();
    },
    /** Nạp CSV một chuỗi. dryRun -> chỉ báo cáo. Có lỗi chất lượng mức "error" -> từ chối trừ khi force. */
    async importCsv({ seriesId, csv, locale, delimiter, hasHeader, monthly, asOf, source, dryRun = false, force = false }) {
      await init();
      const parsed = parseSeriesCsv({ seriesId, csv, locale, delimiter, hasHeader, monthly, asOf, today: todayIso() });
      const base = { seriesId, rows: parsed.observations.length, rejectedRows: parsed.rejectedRows, first: parsed.observations[0]?.period ?? null, last: parsed.observations.at(-1)?.period ?? null, issues: parsed.issues, hasErrors: parsed.hasErrors };
      if (!parsed.observations.length) return { ...base, written: false, reason: "Không có dòng hợp lệ." };
      if (dryRun) return { ...base, written: false, reason: "dryRun" };
      if (parsed.hasErrors && !force) return { ...base, written: false, reason: "Có lỗi chất lượng mức error — sửa dữ liệu hoặc gửi force=true." };
      const tag = typeof source === "string" && source.trim() ? `csv:${source.trim().slice(0, 40)}` : "csv";
      return serialized(async () => {
        const { list, added, changed } = mergeObservations(observations, parsed.observations.map((o) => ({ ...o, source: tag })));
        if (added || changed) await persist(list);
        return { ...base, written: true, added, changed, source: await engine.source() };
      });
    },
    /** X3: lịch xúc tác vĩ mô hợp nhất (công bố số liệu ước tính, FOMC, cảnh báo/chế độ khi có số liệu thật). */
    async catalystEvents({ horizonDays = 60 } = {}) {
      await init();
      return buildMacroCatalystEvents(this, { todayIso: todayIso(), horizonDays });
    },
    close: () => engine.close(),
  };
}
