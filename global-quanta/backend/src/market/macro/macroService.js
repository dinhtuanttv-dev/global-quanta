// Dịch vụ Trung tâm vĩ mô của Gateway.
//   - Engine (gói MacroCenter của người dùng, đóng gói sẵn) chạy trong worker thread; `inline: true` cho test.
//   - Số liệu THẬT lưu chỉ-thêm trong KV `macro:observations` (mỗi quan sát = seriesId, period, value, asOf, source).
//     Nguồn tự động (tháng đã đóng, 2 lần/ngày): chỉ số HOSE từ lịch sử giá Gateway; FED/OIL (FRED), DXY/EX (Yahoo) —
//     macroGlobalFeeds.js. Biến nội địa VN (CPI, M2, tín dụng, ...): CSV nạp qua route admin.
//   - Chưa đủ số liệu thật (>= 1 biến vĩ mô và >= 1 chỉ số, 60 tháng) -> engine dùng kho MÔ PHỎNG, có biểu ngữ. Không trộn.
import { createInlineProxy, createWorkerProxy } from "./workerProxy.js";
import { createMacroCore, latestPerPeriod, mergeObservations, parseSeriesCsv, vintageCounts, vnToday, VN_CATALOG } from "./macroCore.js";
import { buildMacroCatalystEvents } from "./catalystEvents.js";
import { fetchGlobalFeeds } from "./macroGlobalFeeds.js";

export const MACRO_KV_KEY = "macro:observations";
// Mã chỉ số trong danh mục MacroCenter -> mã chỉ số của Gateway.
// V1 (19/11/2026): từ 06/05/2025 SSI đổi mã (VNMID -> VNMIDCAP, VNSML -> VNSMALLCAP, VNALL -> VNALLSHARE). Đã đối chiếu chỗ nối
// (VNMID 1.755,42 ngày 29/04/2025 -> VNMIDCAP 1.787,57 ngày 06/05/2025): cùng một chỉ số đổi tên -> nối mã cũ + mã mới (mã mới ưu tiên).
export const HOSE_TARGETS = { VNINDEX: ["VNINDEX"], VN30: ["VN30"], VN100: ["VN100"], VNMIDCAP: ["VNMID", "VNMIDCAP"], VNSMALLCAP: ["VNSML", "VNSMALLCAP"], VNALLSHARE: ["VNALL", "VNALLSHARE"] };
/** Chuỗi chỉ số được công bố lại (sửa số) -> lưu thành vintage mới. Giá thị trường không được "sửa": thay đổi là do sửa lỗi dữ liệu -> ghi đè. */
export const REVISABLE_SOURCE = /^(IMF:|FRED:FEDFUNDS|csv)/;

const periodIdx = (p) => Number(p.slice(0, 4)) * 12 + Number(p.slice(5, 7)) - 1;
const periodOf = (i) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
const DAY = 86_400_000;
/** Ân hạn trước khi coi là quá hạn công bố (ngày công bố thực tế lệch vài ngày so với ngày điển hình). */
export const OVERDUE_GRACE_DAYS = 3;

/**
 * V1: hạn công bố của kỳ KẾ TIẾP mỗi chuỗi và số ngày quá hạn. Kỳ P công bố vào tháng P + max(1, độ trễ công bố), ngày điển hình
 * của danh mục (CPI tháng 10 -> 06/11). Chuỗi chưa có số liệu -> không tính (đã báo "chưa có số liệu thật").
 */
export function releaseStatus(meta, lastPeriod, todayIso) {
  if (!lastPeriod) return null;
  const next = periodOf(periodIdx(lastPeriod) + 1);
  const relMonth = periodOf(periodIdx(next) + Math.max(1, meta.pubLagMonths ?? 0));
  const day = String(Math.min(Math.max(meta.typicalReleaseDay ?? 1, 1), 28)).padStart(2, "0");
  const expected = `${relMonth}-${day}`;
  const late = Math.round((Date.parse(`${todayIso}T00:00:00Z`) - Date.parse(`${expected}T00:00:00Z`)) / DAY) - OVERDUE_GRACE_DAYS;
  return { nextPeriod: next, expected, overdueDays: late > 0 ? late : 0 };
}

/**
 * V1: các kỳ mà HAI nguồn trở lên cho giá trị lệch nhau (VD CPI nạp tay từ TCTK và CPI qua IMF). So bản mới nhất của từng nguồn.
 * Ngưỡng: chuỗi tỷ lệ 0,05 điểm %; chuỗi mức 0,5%.
 */
export function sourceConflicts(list, catalog = VN_CATALOG) {
  const kind = Object.fromEntries(catalog.map((m) => [m.id, m.kind]));
  const per = new Map();
  for (const o of list) {
    const k = `${o.seriesId}|${o.period}`;
    const bySrc = per.get(k) ?? new Map();
    const src = o.source ?? "csv";
    const prev = bySrc.get(src);
    if (!prev || o.asOf > prev.asOf) bySrc.set(src, o);
    per.set(k, bySrc);
  }
  const out = [];
  for (const [k, bySrc] of per) {
    if (bySrc.size < 2) continue;
    const vals = [...bySrc.values()];
    const lo = Math.min(...vals.map((v) => v.value)), hi = Math.max(...vals.map((v) => v.value));
    const [seriesId, period] = k.split("|");
    const tooFar = kind[seriesId] === "rate" ? hi - lo > 0.05 : lo > 0 ? hi / lo - 1 > 0.005 : hi !== lo;
    if (tooFar) out.push({ seriesId, period, values: Object.fromEntries(vals.map((v) => [v.source ?? "csv", v.value])) });
  }
  return out.sort((a, b) => (a.seriesId < b.seriesId ? -1 : a.seriesId > b.seriesId ? 1 : a.period < b.period ? -1 : 1));
}

/** Nối nến ngày của nhiều mã (theo thứ tự cũ -> mới); ngày trùng thì lấy mã mới hơn. */
export function stitchBars(lists) {
  const by = new Map();
  for (const bars of lists) for (const b of bars ?? []) if (b?.date) by.set(b.date, b);
  return [...by.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}
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
    for (const [seriesId, symbols] of Object.entries(HOSE_TARGETS)) {
      try {
        const lists = [];
        for (const symbol of symbols) lists.push((await history.get(symbol, { years: 10 }).catch(() => null))?.bars ?? []);
        const months = monthlyCloses(stitchBars(lists), todayIso());
        report[seriesId] = { source: HOSE_SOURCE, codes: symbols, months: months.length, first: months[0]?.period ?? null, last: months.at(-1)?.period ?? null };
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
        const { list, added, changed, revised } = mergeObservations(observations, incoming, { revisable: (o) => REVISABLE_SOURCE.test(o.source ?? "csv"), todayIso: todayIso() });
        if (added || changed || revised) await persist(list);
        return { report, added, changed, revised };
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
    /** Quan sát thật hiện có (chỉ đọc), bản MỚI NHẤT mỗi kỳ — Kết nối thế giới dùng lại FED/DXY/OIL (hợp đồng một giá trị/kỳ giữ nguyên). */
    async observations() {
      await init();
      return latestPerPeriod(observations);
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
      const meta = Object.fromEntries(VN_CATALOG.map((m) => [m.id, m]));
      const today = todayIso();
      return {
        ...s, bySource,
        vintages: vintageCounts(observations),
        conflicts: sourceConflicts(observations),
        series: s.series.map((x) => ({ ...x, sources: [...(seriesSources[x.id] ?? [])], release: meta[x.id] ? releaseStatus(meta[x.id], x.last, today) : null })),
      };
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
    /**
     * mode "revision" (mặc định): số khác bản đang có = nguồn công bố lại -> vintage mới (asOf hôm nay), giữ bản cũ.
     * mode "correction": sửa lỗi nhập trước đó -> ghi đè đúng (kỳ, asOf).
     */
    async importCsv({ seriesId, csv, locale, delimiter, hasHeader, monthly, asOf, source, dryRun = false, force = false, mode = "revision" }) {
      await init();
      const parsed = parseSeriesCsv({ seriesId, csv, locale, delimiter, hasHeader, monthly, asOf, today: todayIso() });
      const base = { seriesId, rows: parsed.observations.length, rejectedRows: parsed.rejectedRows, first: parsed.observations[0]?.period ?? null, last: parsed.observations.at(-1)?.period ?? null, issues: parsed.issues, hasErrors: parsed.hasErrors };
      if (!parsed.observations.length) return { ...base, written: false, reason: "Không có dòng hợp lệ." };
      if (dryRun) return { ...base, written: false, reason: "dryRun" };
      if (parsed.hasErrors && !force) return { ...base, written: false, reason: "Có lỗi chất lượng mức error — sửa dữ liệu hoặc gửi force=true." };
      const tag = typeof source === "string" && source.trim() ? `csv:${source.trim().slice(0, 40)}` : "csv";
      return serialized(async () => {
        const opts = mode === "correction" ? { correction: true } : { revisable: () => true, todayIso: todayIso() };
        const { list, added, changed, revised } = mergeObservations(observations, parsed.observations.map((o) => ({ ...o, source: tag })), opts);
        if (added || changed || revised) await persist(list);
        return { ...base, written: true, mode: mode === "correction" ? "correction" : "revision", added, changed, revised, source: await engine.source() };
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
