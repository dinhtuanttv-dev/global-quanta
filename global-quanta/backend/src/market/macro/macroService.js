// Dịch vụ Trung tâm vĩ mô của Gateway.
//   - Engine (gói MacroCenter của người dùng, đóng gói sẵn) chạy trong worker thread; `inline: true` cho test.
//   - Số liệu THẬT lưu chỉ-thêm trong KV `macro:observations` (mỗi quan sát = seriesId, period, value, asOf, source).
//     Nguồn tự động (tháng đã đóng, 2 lần/ngày): chỉ số HOSE từ lịch sử giá Gateway; FED/OIL (FRED), DXY/EX (Yahoo) —
//     macroGlobalFeeds.js. Biến nội địa VN (CPI, M2, tín dụng, ...): CSV nạp qua route admin.
//   - Chưa đủ số liệu thật (>= 1 biến vĩ mô và >= 1 chỉ số, 60 tháng) -> engine dùng kho MÔ PHỎNG, có biểu ngữ. Không trộn.
import { createInlineProxy, createWorkerProxy } from "./workerProxy.js";
import { createMacroCore, mergeObservations, parseSeriesCsv, vnToday } from "./macroCore.js";
import { buildMacroCatalystEvents } from "./catalystEvents.js";
import { fetchGlobalFeeds } from "./macroGlobalFeeds.js";

export const MACRO_KV_KEY = "macro:observations";
// Mã chỉ số trong danh mục MacroCenter -> mã chỉ số của Gateway.
export const HOSE_TARGETS = { VNINDEX: "VNINDEX", VN30: "VN30", VN100: "VN100", VNMIDCAP: "VNMID", VNSMALLCAP: "VNSML", VNALLSHARE: "VNALLSHARE" };
const HOSE_SOURCE = "gateway-hose";
const FEED_REFRESH_MS = 12 * 3600_000;
const CALL_TIMEOUT_MS = 90_000;

export const macroOps = (core) => ({
  setReal: ([list]) => core.setReal(list),
  source: () => core.source(),
  handle: ([req]) => core.handle(req),
  runTool: ([name, args]) => core.runTool(name, args),
  toolSpecs: () => core.toolSpecs(),
});

function createEngine({ inline, today }) {
  const p = inline
    ? createInlineProxy(macroOps(createMacroCore({ today })))
    : createWorkerProxy({ url: new URL("./macroWorker.js", import.meta.url), label: "vĩ mô", replayOp: "setReal", timeoutMs: CALL_TIMEOUT_MS });
  return {
    setReal: (list) => p.call("setReal", list),
    source: () => p.call("source"),
    handle: (req) => p.call("handle", req),
    runTool: (name, args) => p.call("runTool", name, args),
    toolSpecs: () => p.call("toolSpecs"),
    close: () => p.close(),
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

export function createMacroService({ store, history, globalFeeds = fetchGlobalFeeds, inline = false, now = Date.now, log = console } = {}) {
  const engine = createEngine({ inline, today: () => vnToday(now()) });
  let observations = [];
  let ready = null;
  let writeChain = Promise.resolve();
  let feedsAt = 0;
  let feedsPending = null;

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
          // getKv của kho Gateway trả { value, updatedAt } (memoryStore và supabaseStore) — đọc .value
          const saved = store?.getKv ? (await store.getKv(MACRO_KV_KEY))?.value ?? null : null;
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

  /** Chuỗi chỉ số HOSE thật từ lịch sử giá Gateway (tối đa 10 năm). */
  async function hoseObservations(report) {
    const out = [];
    if (!history?.get) return out;
    for (const [seriesId, symbol] of Object.entries(HOSE_TARGETS)) {
      try {
        const months = monthlyCloses((await history.get(symbol, { years: 10 }))?.bars, todayIso());
        report[seriesId] = { source: HOSE_SOURCE, months: months.length, first: months[0]?.period ?? null, last: months.at(-1)?.period ?? null };
        for (const m of months) out.push({ seriesId, ...m, source: HOSE_SOURCE });
      } catch (e) {
        report[seriesId] = { source: HOSE_SOURCE, error: e.message };
      }
    }
    return out;
  }

  /** Nạp mọi nguồn tự động (chỉ số HOSE + biến toàn cầu), tối đa 2 lần/ngày; lỗi một nguồn không chặn nguồn khác. */
  function refreshAutoFeeds({ force = false } = {}) {
    if (!force && now() - feedsAt < FEED_REFRESH_MS) return Promise.resolve({ skipped: "fresh" });
    if (feedsPending) return feedsPending;
    feedsPending = (async () => {
      await init();
      const report = {};
      const [hose, global] = await Promise.all([
        hoseObservations(report),
        globalFeeds ? globalFeeds({ todayIso: todayIso() }).catch((e) => ({ observations: [], report: { global: { error: e.message } } })) : { observations: [], report: {} },
      ]);
      Object.assign(report, global.report);
      feedsAt = now();
      const incoming = [...hose, ...global.observations];
      if (!incoming.length) return { report, added: 0, changed: 0 };
      return serialized(async () => {
        const { list, added, changed } = mergeObservations(observations, incoming);
        if (added || changed) await persist(list);
        return { report, added, changed };
      });
    })().finally(() => {
      feedsPending = null;
    });
    return feedsPending;
  }
  const refreshInBackground = () => refreshAutoFeeds().catch((e) => log.warn?.(`[macro] nạp nguồn tự động lỗi: ${e.message}`));

  return {
    init,
    refreshAutoFeeds,
    async handle(req) {
      await init();
      refreshInBackground();
      return engine.handle(req);
    },
    /** Quan sát thật hiện có (chỉ đọc) — Kết nối thế giới dùng lại FED/DXY/OIL. */
    async observations() {
      await init();
      return observations;
    },
    async source() {
      await init();
      refreshInBackground();
      const s = await engine.source();
      const bySource = {};
      const seriesSources = {};
      for (const o of observations) {
        const src = o.source ?? "csv";
        bySource[src] = (bySource[src] ?? 0) + 1;
        (seriesSources[o.seriesId] ??= new Set()).add(src);
      }
      return { ...s, bySource, series: s.series.map((x) => ({ ...x, sources: [...(seriesSources[x.id] ?? [])] })) };
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
