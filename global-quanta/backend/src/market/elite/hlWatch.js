// PZ-v2 — dịch vụ BẢNG THEO DÕI CHỜ NỀN của Elite HL. Mỗi phiên (trong lượt dựng quyết định cuối ngày):
//   1. đọc ảnh chụp trạng thái vị trí giá của phiên trước (KV elite:hl:watch:<ngày>),
//   2. chạy máy trạng thái pzStep cho mọi mã đạt tầng 1 của HL + mã đang giữ + mã còn trong bảng theo dõi,
//   3. KHOÁ ảnh chụp phiên này (không sửa về sau) và nối nhật ký chuyển trạng thái (elite:hl:watch:log, 400 phiên).
// Giai đoạn hiện tại CHỈ HIỂN THỊ: PZ_GATE = false -> danh mục chính thức, lệnh mua và sổ theo dõi tiến không đổi một dòng.
import { detectBox, PZ_RULES, PZ_STATES, PZ_STATE_VI, PZ_VERSION, PZ_WATCH, pzPublic, pzStep } from "./pricePosition.js";

/** Cổng chặn mua ngoài Vùng mua. CHỈ bật sau khi qua kiểm định PZ-r1 (đặc tả mục "Kiểm định trước khi bật cổng"). */
export const PZ_GATE = false;
export const PZ_KV = { snapshot: (d) => `elite:hl:watch:${d}`, index: "elite:hl:watch:index", log: "elite:hl:watch:log" };
const KEEP_SESSIONS = 400, MAX_TICKERS = 150, EXIT_SHOW_SESSIONS = 5;
const r4 = (x) => (typeof x === "number" && Number.isFinite(x) ? Math.round(x * 1e4) / 1e4 : null);

/** Nền cùng phiên từ tài liệu chiến lược: SEPA trước, Base Breakout v2 sau. Tài liệu khác ngày của bảng -> bỏ (không trộn hai phiên). */
export function basesFromStrategies({ sepa, baseBreakout }, date) {
  const out = new Map(), dates = { sepa: sepa?.dataAsOf ?? null, baseBreakout: baseBreakout?.dataAsOf ?? null };
  if (baseBreakout?.dataAsOf === date) for (const r of baseBreakout.results ?? []) {
    const m = r.metrics ?? {};
    if (m.basePivot > 0 && m.baseLow > 0) out.set(r.ticker, { source: "BASE_BREAKOUT", pivot: m.basePivot, stop: m.baseLow, status: r.status === "EXTENDED" ? "EXTENDED" : null });
  }
  if (sepa?.dataAsOf === date) for (const r of sepa.results ?? []) {
    const m = r.metrics ?? {};
    if (m.pivot > 0 && m.stop > 0) out.set(r.ticker, { source: "SEPA", pivot: m.pivot, stop: m.stop, status: r.status ?? null });
  }
  return { bases: out, dates, sameSession: { sepa: dates.sepa === date, baseBreakout: dates.baseBreakout === date } };
}

/**
 * @param deps.store          getKv / setKv
 * @param deps.ohlcBars       (tickers, to) -> Map(mã -> [{ date, open, high, low, close, volume }]) giá ĐIỀU CHỈNH, tăng dần
 * @param deps.strategyDocs   () -> { sepa, baseBreakout } (tài liệu chiến lược mới nhất)
 * @param deps.vnIndex        () -> [[ngày, đóng cửa]]
 */
export function createHlWatch({ store, ohlcBars, strategyDocs = async () => ({}), vnIndex = null, now = Date.now, log = console, cfg = PZ_RULES }) {
  const kv = async (k) => { try { return (await store.getKv(k))?.value ?? null; } catch { return null; } };

  async function previous(date) {
    const dates = (await kv(PZ_KV.index))?.dates ?? [];
    const d = dates.filter((x) => x < date).at(-1);
    return d ? { date: d, snap: await kv(PZ_KV.snapshot(d)) } : null;
  }

  /**
   * @param date      phiên của bảng tín hiệu
   * @param tier1     Set mã đạt tầng 1 của HL phiên này
   * @param held      Set mã đang giữ VÀO phiên này (danh mục đã khoá của phiên trước)
   * @param exchangeOf (mã) -> "HOSE" | "HNX" | "UPCOM"
   */
  async function run({ date, tier1, held, exchangeOf = () => "HOSE", force = false }) {
    const existing = await kv(PZ_KV.snapshot(date));
    if (existing && !force) return existing;
    const prevSnap = await previous(date);
    const prevRecs = prevSnap?.snap?.records ?? {};
    // Theo dõi: tầng 1 + đang giữ + mã còn ở bảng theo dõi phiên trước (để đếm phiên rớt tầng 1 / hết hạn).
    const tracked = [...new Set([...held, ...tier1, ...Object.entries(prevRecs).filter(([, r]) => PZ_WATCH.has(r.state) || PZ_WATCH.has(r.resume?.state)).map(([t]) => t)])].slice(0, MAX_TICKERS);
    let bars = new Map();
    try { bars = (await ohlcBars(tracked, date)) ?? new Map(); } catch (e) { log.warn?.(`[elite] PZ: không tải được giá OHLC (${e.message})`); }
    let docs = {};
    try { docs = (await strategyDocs()) ?? {}; } catch (e) { log.warn?.(`[elite] PZ: không đọc được tài liệu chiến lược (${e.message})`); }
    const { bases, dates: baseDates, sameSession } = basesFromStrategies(docs, date);
    let rsIdx = null;
    if (vnIndex) { try { rsIdx = new Map((await vnIndex()).filter((r) => r[1] > 0)); } catch { rsIdx = null; } }

    const records = {};
    for (const t of tracked) {
      // Nến lỗi (giá ≤ 0) bị loại TRƯỚC khi tính — sự cố 13/11/2026: nến VN-Index có khối lượng nhưng giá = 0.
      const b = (bars.get(t) ?? []).filter((x) => x.date <= date && x.close > 0 && x.high > 0 && x.low > 0);
      const base = bases.get(t) ?? (b.length ? detectBox(b, cfg) : null);
      const rs = rsIdx ? b.filter((x) => rsIdx.has(x.date)).map((x) => [x.date, x.close / rsIdx.get(x.date)]) : null;
      try {
        records[t] = pzStep({ bars: b, base, prev: prevRecs[t] ?? null, ctx: { date, held: held.has(t), tier1: tier1.has(t), exchange: exchangeOf(t), rs }, cfg });
      } catch (e) { log.warn?.(`[elite] PZ ${t}: ${e.message}`); }
    }
    const transitions = Object.entries(records).filter(([, r]) => r.from !== r.state && r.state !== "UNKNOWN")
      .map(([ticker, r]) => ({ ticker, date, from: r.from ?? null, to: r.state, reasonVi: r.reasonVi ?? null, held: r.held,
        measures: { x1: r.measures?.x1 ?? null, risk: r.measures?.risk ?? null, x2: r.measures?.x2 ?? null, x3: r.measures?.x3 ?? null, depth: r.measures?.depth ?? null } }));
    const snap = { version: PZ_VERSION, date, builtAt: new Date(now()).toISOString(), prevDate: prevSnap?.date ?? null, baseDates, sameSession, gate: PZ_GATE,
      coverage: { tracked: tracked.length, priced: Object.values(records).filter((r) => r.state !== "UNKNOWN").length, withBase: Object.values(records).filter((r) => r.base).length,
        bySource: Object.values(records).reduce((a, r) => { const k = r.base?.source ?? "NONE"; a[k] = (a[k] ?? 0) + 1; return a; }, {}) },
      records };
    try {
      await store.setKv(PZ_KV.snapshot(date), snap);
      const idx = (await kv(PZ_KV.index))?.dates ?? [];
      const dates = [...new Set([...idx, date])].sort().slice(-KEEP_SESSIONS);
      await store.setKv(PZ_KV.index, { dates });
      const lg = (await kv(PZ_KV.log))?.entries ?? [];
      const keepFrom = dates[0];
      await store.setKv(PZ_KV.log, { entries: [...lg.filter((e) => e.date !== date && e.date >= keepFrom), ...transitions] });
    } catch (e) { log.warn?.(`[elite] PZ: ghi kho lỗi (${e.message})`); }
    return snap;
  }

  /** Mã vừa rời bảng theo dõi trong `n` phiên gần nhất (về vùng mua / hỏng nền / hết hạn). */
  async function recentExits(date, n = EXIT_SHOW_SESSIONS) {
    const dates = ((await kv(PZ_KV.index))?.dates ?? []).filter((d) => d <= date).slice(-n);
    const from = dates[0] ?? date;
    const lg = (await kv(PZ_KV.log))?.entries ?? [];
    return lg.filter((e) => e.date >= from && e.date <= date && PZ_WATCH.has(e.from) && (e.to === "BUY_ZONE" || e.to === "FAILED"))
      .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12)
      .map((e) => ({ ticker: e.ticker, date: e.date, to: e.to, kindVi: e.to === "BUY_ZONE" ? "Về vùng mua" : /Hết hạn/.test(e.reasonVi ?? "") ? "Hết hạn" : "Hỏng nền", reasonVi: e.reasonVi, held: e.held }));
  }

  async function log_(date) { const lg = (await kv(PZ_KV.log))?.entries ?? []; return date ? lg.filter((e) => e.date === date) : lg.slice(-200); }
  async function snapshot(date) { if (date) return kv(PZ_KV.snapshot(date)); const d = ((await kv(PZ_KV.index))?.dates ?? []).at(-1); return d ? kv(PZ_KV.snapshot(d)) : null; }
  return { run, recentExits, log: log_, snapshot };
}

/**
 * Gắn vị trí giá vào kết quả buildHlPortfolio (HÀM THUẦN — không đổi danh mục, tỷ trọng, lệnh mua hay hàng chờ; chỉ THÊM trường).
 * Ngăn của mã trong danh mục được tính lại sau khi biết lệnh mua phiên này: mã vừa mua mà đang nóng -> Chạy lãi + cờ "mua ngoài vùng mua".
 */
export function annotatePz({ portfolio, hl }, snap, hlRows, { exits = [], gate = PZ_GATE, tradable = null, sectorOf = () => null } = {}) {
  if (!snap?.records) return { portfolio, hl };
  const recs = snap.records, byHl = new Map(hlRows.map((x) => [x.ticker, x]));
  const inPf = new Set(portfolio.map((x) => x.ticker));
  const pub = (t, inPortfolio, isNew) => {
    const r = recs[t]; if (!r) return null;
    const p = pzPublic(r);
    p.lane = inPortfolio ? (PZ_WATCH.has(r.state) || r.state === "FAILED" ? "RUNNER" : "CORE") : PZ_WATCH.has(r.state) ? "WAIT" : null;
    // Cờ chỉ cho lệnh mua khi mã đang NÓNG (cổng chưa bật). Mua mã Trong nền / Chưa có nền là mua trước điểm mua, không phải đuổi giá.
    if (inPortfolio && isNew && PZ_WATCH.has(r.state)) p.boughtOutsideZone = true;
    return p;
  };
  const portfolio2 = portfolio.map((x) => {
    const pz = pub(x.ticker, true, x.hl?.status === "NEW") ?? { state: "UNKNOWN", lane: "CORE", missingVi: ["Chưa tính được vị trí giá"], hotReasons: [] };
    return { ...x, hl: { ...x.hl, pz } };
  });
  const queue = (hl.queue ?? []).map((q) => { const p = pub(q.ticker, false, false); return p ? { ...q, pz: p } : q; });
  const order = { REBASING: 0, COOLING: 1, EXTENDED: 2, FAILED: 3 };
  const watch = [
    ...portfolio2.filter((x) => x.hl.pz.lane === "RUNNER").map((x) => ({ ticker: x.ticker, hlRank: x.hl.rank, cls: x.hl.cls, sectorKey: x.sectorKey, held: true, weight: x.weight, sinceRet: x.hl.sinceRet ?? null, pz: x.hl.pz })),
    ...Object.keys(recs).filter((t) => !inPf.has(t) && PZ_WATCH.has(recs[t].state)).map((t) => {
      const h = byHl.get(t);
      return { ticker: t, hlRank: h?.rank ?? null, cls: h?.cls ?? null, sectorKey: sectorOf(t), held: false, weight: null, sinceRet: null, pz: pub(t, false, false) };
    }),
  ].sort((a, b) => Number(b.held) - Number(a.held) || (order[a.pz.state] ?? 9) - (order[b.pz.state] ?? 9) || (a.hlRank ?? 9999) - (b.hlRank ?? 9999));
  const counts = Object.fromEntries(PZ_STATES.map((s) => [s, 0]));
  for (const r of Object.values(recs)) counts[r.state] = (counts[r.state] ?? 0) + 1;
  const sum = (lane) => r4(portfolio2.filter((x) => x.hl.pz.lane === lane).reduce((a, x) => a + (x.weight ?? 0), 0));
  const selectedTradable = new Set(hlRows.filter((x) => (x.cls === "STRONG" || x.cls === "CONFLUENCE") && (!tradable || tradable.has(x.ticker))).map((x) => x.ticker));
  const toWatch = Object.entries(recs).filter(([, r]) => r.from && !PZ_WATCH.has(r.from) && r.from !== "UNKNOWN" && PZ_WATCH.has(r.state)).map(([t]) => t);
  const backToZone = Object.entries(recs).filter(([, r]) => PZ_WATCH.has(r.from) && r.state === "BUY_ZONE").map(([t]) => t);
  return {
    portfolio: portfolio2,
    hl: {
      ...hl, queue, watch, watchExits: exits,
      funnel: { ...hl.funnel, inZone: [...selectedTradable].filter((t) => recs[t]?.state === "BUY_ZONE").length },
      changes: { ...hl.changes, toWatch, backToZone },
      pz: {
        version: snap.version, gate, rules: PZ_RULES, stateVi: PZ_STATE_VI, counts, date: snap.date, baseDates: snap.baseDates, sameSession: snap.sameSession, coverage: snap.coverage,
        coreWeight: sum("CORE"), runnerWeight: sum("RUNNER"),
        coreNames: portfolio2.filter((x) => x.hl.pz.lane === "CORE").length, runnerNames: portfolio2.filter((x) => x.hl.pz.lane === "RUNNER").length,
        modeVi: gate ? "Cổng vị trí giá: đang bật — chỉ mua mới mã ở Vùng mua." : "Vị trí giá: chỉ hiển thị, chưa ảnh hưởng lệnh mua (chờ kiểm định PZ-r1).",
      },
    },
  };
}
