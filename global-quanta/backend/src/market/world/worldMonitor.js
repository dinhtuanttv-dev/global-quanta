// Giám sát thị trường & rủi ro (U1, 31/10/2026): một kho giá cho chỉ số, vĩ mô và hàng hoá giá ngày.
// Mỗi dòng kèm nguồn, ngày phiên và cờ dữ liệu cũ. Các số đo chỉ mô tả, không phải tín hiệu dự báo.
// z = (biến động phiên − TB 60 phiên trước) / độ lệch chuẩn 60 phiên trước. Cửa sổ KHÔNG gồm phiên đang xét.
import { COMMODITIES } from "../commodities/catalog.js";
import { PULSE_MACRO, PULSE_MARKETS } from "./worldPulse.js";

const UA = { "user-agent": "Mozilla/5.0 (compatible; GlobalQuanta/1.0)" };
const TTL_MS = 5 * 60_000;
export const Z_WINDOW = 60;
export const Z_MIN_OBS = 30;
export const RANGE_WINDOW = 252;
export const ABNORMAL_Z = 2;
export const STALE_DAYS = 4;
const SPARK_POINTS = 60;
const day = (s) => new Date(s * 1000).toISOString().slice(0, 10);

const MACRO_META = {
  dxy: { nameVi: "Chỉ số USD (DXY)", unit: "điểm" },
  vix: { nameVi: "VIX (biến động S&P 500)", unit: "điểm" },
  treasury_10y: { nameVi: "Lợi suất TPCP Mỹ 10 năm", unit: "%", changeIn: "bps" },
};

/** Danh mục không trùng mã: chỉ số, vĩ mô, rồi hàng hoá Yahoo. Vàng và dầu chỉ nằm ở nhóm hàng hoá. */
export function monitorCatalog() {
  const out = PULSE_MARKETS.map(([symbol, nameVi]) => ({ id: symbol, symbol, nameVi, group: "index", unit: "điểm", sourceVi: "Yahoo Finance" }));
  for (const [key, m] of Object.entries(MACRO_META)) out.push({ id: key, symbol: PULSE_MACRO[key].symbol, nameVi: m.nameVi, group: "macro", unit: m.unit, changeIn: m.changeIn ?? "pct", sourceVi: "Yahoo Finance" });
  for (const c of COMMODITIES) if (c.source?.kind === "yahoo") out.push({ id: c.id, symbol: c.source.symbol, nameVi: c.nameVi, group: "commodity", unit: c.unit, sourceVi: `Yahoo Finance, ${c.source.labelVi}` });
  return out;
}

/** JSON chart Yahoo -> [{ date, close, time }] theo thứ tự thời gian; bỏ giá thiếu, mỗi ngày một giá (giữ giá sau cùng). */
export function barsFromChart(json) {
  const r = json?.chart?.result?.[0];
  const ts = r?.timestamp ?? [], closes = r?.indicators?.quote?.[0]?.close ?? [];
  const byDay = new Map();
  ts.forEach((t, i) => { if (Number.isFinite(closes[i]) && closes[i] > 0) byDay.set(day(t), { date: day(t), close: closes[i], time: new Date(t * 1000).toISOString() }); });
  return [...byDay.values()];
}

const meanOf = (a) => a.reduce((s, x) => s + x, 0) / a.length;
function sampleStd(a) {
  const m = meanOf(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
}

/**
 * Số đo cho một chuỗi. changeIn "bps": biến động là chênh lệch bậc nhất (lợi suất); còn lại là log-return.
 * Thiếu dữ liệu thì trả null từng phần, không điền số thay thế.
 */
export function monitorStats(bars, { changeIn = "pct", now = Date.now() } = {}) {
  if (!bars.length) return null;
  const last = bars.at(-1);
  const prev = bars.at(-2) ?? null;
  const moves = [];
  for (let i = 1; i < bars.length; i++) moves.push(changeIn === "bps" ? bars[i].close - bars[i - 1].close : Math.log(bars[i].close / bars[i - 1].close));
  const move = moves.at(-1) ?? null;
  const prior = moves.slice(0, -1).slice(-Z_WINDOW);
  let z = null;
  if (move != null && prior.length >= Z_MIN_OBS) {
    const sd = sampleStd(prior);
    if (sd > 0) z = (move - meanOf(prior)) / sd;
  }
  // Vị trí trong biên giá 252 phiên gần nhất (gồm phiên hiện tại): 0 = đáy, 100 = đỉnh.
  const yr = bars.slice(-RANGE_WINDOW).map((b) => b.close);
  const lo = Math.min(...yr), hi = Math.max(...yr);
  const rangePct = yr.length >= Z_MIN_OBS && hi > lo ? ((last.close - lo) / (hi - lo)) * 100 : null;
  // Tỷ lệ phiên trong năm có biến động nhỏ hơn hoặc bằng phiên này (theo độ lớn).
  const yrMoves = moves.slice(0, -1).slice(-(RANGE_WINDOW - 1));
  const moveRank = move != null && yrMoves.length >= Z_MIN_OBS ? (yrMoves.filter((m) => Math.abs(m) <= Math.abs(move)).length / yrMoves.length) * 100 : null;
  const ageDays = Math.floor((now - Date.parse(`${last.date}T00:00:00Z`)) / 86_400_000);
  return {
    value: last.close, date: last.date, time: last.time, prevClose: prev?.close ?? null,
    change: prev ? (changeIn === "bps" ? (last.close - prev.close) * 100 : (last.close / prev.close - 1) * 100) : null, changeIn,
    z, unusual: z != null && Math.abs(z) >= ABNORMAL_Z, rangePct, moveRank, ageDays, stale: ageDays > STALE_DAYS, nBars: bars.length,
    spark: bars.slice(-SPARK_POINTS).map((b) => [b.date, b.close]),
  };
}

/** Tóm tắt mô tả: số dòng bất thường và độ rộng các chỉ số. Không phải chỉ báo dự báo. */
export function monitorSummary(items) {
  const live = items.filter((i) => i.available && !i.stale);
  const index = live.filter((i) => i.group === "index" && i.change != null);
  const vix = items.find((i) => i.id === "vix");
  return {
    total: items.length, available: items.filter((i) => i.available).length, stale: items.filter((i) => i.available && i.stale).length,
    abnormal: live.filter((i) => i.unusual).map((i) => ({ id: i.id, nameVi: i.nameVi, z: i.z })).sort((a, b) => Math.abs(b.z) - Math.abs(a.z)),
    indexUp: index.filter((i) => i.change > 0).length, indexTotal: index.length,
    vixRangePct: vix?.available ? vix.rangePct : null,
  };
}

export function createWorldMonitor({ fetchImpl = globalThis.fetch, now = Date.now, catalog = monitorCatalog(), log = console, concurrency = 6 } = {}) {
  let cache = null, inflight = null;
  async function series(symbol) {
    const r = await fetchImpl(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=2y&interval=1d`, { headers: UA, signal: AbortSignal.timeout(15_000) });
    if (!r.ok) throw new Error(`Yahoo ${symbol} HTTP ${r.status}`);
    return barsFromChart(await r.json());
  }
  async function build() {
    const items = new Array(catalog.length);
    let next = 0;
    await Promise.all(Array.from({ length: concurrency }, async () => {
      while (next < catalog.length) {
        const i = next++;
        const c = catalog[i];
        try {
          const stats = monitorStats(await series(c.symbol), { changeIn: c.changeIn ?? "pct", now: now() });
          items[i] = stats ? { ...c, available: true, ...stats } : { ...c, available: false };
        } catch (e) {
          log.warn?.(`[world-monitor] ${c.symbol}: ${e.message}`);
          items[i] = { ...c, available: false };
        }
      }
    }));
    return {
      generatedAt: new Date(now()).toISOString(), items, summary: monitorSummary(items),
      method: { window: Z_WINDOW, abnormalZ: ABNORMAL_Z, rangeWindow: RANGE_WINDOW, staleDays: STALE_DAYS, noteVi: `z so biến động phiên với ${Z_WINDOW} phiên trước đó, không gồm phiên đang xét. Vị trí biên tính trên ${RANGE_WINDOW} phiên. Chỉ mô tả, không phải tín hiệu dự báo.` },
    };
  }
  return {
    async get() {
      if (cache && now() - cache.at < TTL_MS) return cache.doc;
      if (!inflight) inflight = build().then((doc) => { cache = { at: now(), doc }; return doc; }).finally(() => { inflight = null; });
      // Có bản cũ thì trả ngay và làm mới nền, để không chờ nguồn ngoài.
      if (cache) return cache.doc;
      return inflight;
    },
  };
}
