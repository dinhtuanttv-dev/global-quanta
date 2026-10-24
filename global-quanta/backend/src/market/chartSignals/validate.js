// R6 — kiểm định ĐẶT TRƯỚC tín hiệu của chart TA VN-Index (CHART-SIGNALS-prereg.md): C1–C6 khung ngày + W1/W3/W4 khung tuần.
// Cùng dữ liệu / tập mã / lợi suất vượt trội / KTC bootstrap cụm ngày / placebo như kiểm định MTF. Hàm thuần: nhận chuỗi giá cục bộ
// và thư viện tín hiệu (`lib` = mã nguồn chart đóng gói bằng esbuild), không gọi SSI, không ghi DB.
import { benchmark, bhQ, eligibility, forward, stat } from "../strategies/pring/validate.js";
import { dedupBy, excess, placebo, seg } from "../structure/validate.js";

export const CHART_SIGNALS_PREREG = Object.freeze({
  version: "chartSignals/R6-prereg-2026-10-24 (a914ae3)",
  isTo: "2024-12-31", oosFrom: "2025-01-02", endBuffer: 21, feePct: 0.6, dedupBars: 20, minOosN: 30, fdrQ: 0.1, placeboMaxP: 0.1,
  minTickerShare: 0.5, minTickerEvents: 2, extraHorizons: [5, 20, 40],
  hypotheses: {
    C1: { label: "RSI 14 cắt lên 30", side: 1, h: 10, tf: "D" },
    C2: { label: "RSI 14 cắt xuống 70 (cảnh báo)", side: -1, h: 10, tf: "D" },
    C3: { label: "MACD 12/26/9 cắt lên Signal", side: 1, h: 20, tf: "D" },
    C4: { label: "ADX ≥ 25 + DI+ cắt lên DI−", side: 1, h: 20, tf: "D" },
    C5: { label: "CHoCH tăng (quant-core)", side: 1, h: 10, tf: "D" },
    C6: { label: "CVD divergence tăng (BVC)", side: 1, h: 10, tf: "D" },
    W1: { label: "Tuần: RSI 14 cắt lên 30", side: 1, h: 20, tf: "W" },
    W3: { label: "Tuần: MACD cắt lên Signal", side: 1, h: 20, tf: "W" },
    W4: { label: "Tuần: ADX ≥ 25 + DI+ cắt lên DI−", side: 1, h: 20, tf: "W" },
  },
});
const P = CHART_SIGNALS_PREREG;
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const r2 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100) / 100);

/** Chỉ số tín hiệu theo nến của một chuỗi (D hoặc W) — mọi giá trị tại t chỉ dùng bars[0..t]. */
export function oscillatorSignals(lib, bars) {
  const rsi = lib.calculateRSI(bars).series, hist = lib.calculateMACD(bars).histogram, adx = lib.calculateADX(bars);
  const out = { RSI_UP: [], RSI_DN: [], MACD_UP: [], ADX_DI: [] };
  for (let t = 1; t < bars.length; t++) {
    const r0 = rsi[t - 1], r1 = rsi[t];
    if (r0 != null && r1 != null && r0 <= 30 && r1 > 30) out.RSI_UP.push(t);
    if (r0 != null && r1 != null && r0 >= 70 && r1 < 70) out.RSI_DN.push(t);
    if (hist[t - 1] != null && hist[t] != null && hist[t - 1] <= 0 && hist[t] > 0) out.MACD_UP.push(t);
    const p0 = adx.plusDI[t - 1], m0 = adx.minusDI[t - 1], p1 = adx.plusDI[t], m1 = adx.minusDI[t];
    if (adx.series[t] != null && adx.series[t] >= 25 && p0 != null && m0 != null && p1 != null && m1 != null && p0 <= m0 && p1 > m1) out.ADX_DI.push(t);
  }
  return out;
}

/** Nến tuần k -> chỉ số phiên CUỐI của tuần đó trong chuỗi ngày (thời điểm tín hiệu tuần được biết). */
export function weekEndIndex(daily, weekly) {
  const out = [];
  let i = 0;
  for (let k = 0; k < weekly.length; k++) {
    const next = weekly[k + 1]?.date ?? "9999";
    while (i + 1 < daily.length && daily[i + 1].date < next) i++;
    out.push(daily[i].date < next ? i : -1);
  }
  return out;
}

/** Mọi sự kiện C1–C6, W1/W3/W4 của một mã (chưa lọc điều kiện / chống lặp). */
export function eventsOf(lib, symbol, bars) {
  const ev = [];
  const push = (kind, t) => ev.push({ symbol, t, date: bars[t].date, kind });
  const d = oscillatorSignals(lib, bars);
  d.RSI_UP.forEach((t) => push("C1", t)); d.RSI_DN.forEach((t) => push("C2", t)); d.MACD_UP.forEach((t) => push("C3", t)); d.ADX_DI.forEach((t) => push("C4", t));
  const st = lib.computeStructure(bars);
  for (const e of st.events) if (e.kind === "CHoCH" && e.dir === "bullish") push("C5", e.confirmedIndex);
  const flow = lib.buildFlowBars(bars, []);
  for (const v of lib.detectCvdDivergence(st.pivots, flow)) if (v.dir === "bullish" && v.confirmedIndex < bars.length) push("C6", v.confirmedIndex);
  const wb = lib.aggregateToWeekly(bars), we = weekEndIndex(bars, wb), w = oscillatorSignals(lib, wb);
  for (const [sig, kind] of [["RSI_UP", "W1"], ["MACD_UP", "W3"], ["ADX_DI", "W4"]]) for (const k of w[sig]) if (we[k] >= 0 && k < wb.length - 1) push(kind, we[k]);
  return ev;
}

function tickerStability(rows, side) {
  const by = new Map();
  for (const r of rows) if (r.x != null) { if (!by.has(r.symbol)) by.set(r.symbol, []); by.get(r.symbol).push(r.x); }
  const elig = [...by.values()].filter((xs) => xs.length >= P.minTickerEvents);
  if (!elig.length) return { tickers: 0, share: null };
  return { tickers: elig.length, share: r2(elig.filter((xs) => side * mean(xs) > 0).length / elig.length) };
}

export function runChartSignalValidation({ daily, lib, onProgress = () => {} }) {
  const t0 = Date.now();
  const syms = Object.keys(daily).filter((s) => s !== "VNINDEX" && daily[s].length >= 300);
  const uni = [], evs = [];
  for (const s of syms) {
    const bars = daily[s];
    const u = { symbol: s, bars, elig: eligibility(bars), fwd: Object.fromEntries([5, 10, 20, 40].map((h) => [h, forward(bars, h)])) };
    uni.push(u);
    const lastT = bars.length - 1 - P.endBuffer;
    for (const e of eventsOf(lib, s, bars)) if (e.t <= lastT && u.elig[e.t]) evs.push(e);
    onProgress(`tín hiệu ${uni.length}/${syms.length}`);
  }
  const uniBy = new Map(uni.map((u) => [u.symbol, u]));
  const bench = Object.fromEntries([5, 10, 20, 40].map((h) => [h, benchmark(uni, h)]));
  const events = dedupBy(evs, P.dedupBars);

  const results = {};
  for (const [id, H] of Object.entries(P.hypotheses)) {
    const fee = H.side > 0 ? P.feePct : 0;
    const rows = events.filter((e) => e.kind === id).map((e) => ({ ...e, seg: seg(e.date), x: excess(uniBy.get(e.symbol), bench, e.t, H.h, fee) }));
    const by = (g) => rows.filter((r) => r.seg === g && r.x != null);
    const IS = stat(by("IS"), { side: H.side }), OOS = stat(by("OOS"), { side: H.side });
    const oosRows = by("OOS");
    const plc = oosRows.length >= P.minOosN ? placebo(oosRows, uniBy, bench, H.h, fee, H.side) : null;
    const years = {};
    for (const r of rows.filter((x) => x.x != null)) { const y = r.date.slice(0, 4); (years[y] ??= []).push(r.x); }
    const extra = Object.fromEntries(P.extraHorizons.map((h) => [h, r2(mean(oosRows.map((r) => excess(uniBy.get(r.symbol), bench, r.t, h, fee)).filter((x) => x != null)))]));
    results[id] = {
      ...H, IS, OOS, placeboP: plc?.p ?? null, stability: tickerStability(oosRows, H.side),
      byYear: Object.fromEntries(Object.entries(years).sort().map(([y, xs]) => [y, { n: xs.length, mean: r2(mean(xs)) }])), oosExtraHorizons: extra,
    };
    onProgress(`đo ${id}`);
  }
  const ids = Object.keys(results);
  const qs = bhQ(ids.map((id) => results[id].OOS?.p ?? null));
  ids.forEach((id, i) => {
    const r = results[id]; r.q = qs[i];
    const o = r.OOS, s = r.side;
    if (!o?.n || o.n < P.minOosN) { r.verdict = "INSUFFICIENT"; r.reason = `OOS n = ${o?.n ?? 0} < ${P.minOosN}`; return; }
    const fails = [];
    if (!(s * o.mean > 0)) fails.push("TB OOS sai chiều");
    if (!o.ci || !(s > 0 ? o.ci[0] > 0 : o.ci[1] < 0)) fails.push("KTC OOS chứa 0");
    if (!(s * (r.IS?.mean ?? 0) > 0)) fails.push("TB IS sai chiều");
    if (!(r.q != null && r.q <= P.fdrQ)) fails.push(`q = ${r.q} > ${P.fdrQ}`);
    if (!(r.placeboP != null && r.placeboP <= P.placeboMaxP)) fails.push(`placebo p = ${r.placeboP}`);
    if (!(r.stability.share != null && r.stability.share >= P.minTickerShare)) fails.push(`ổn định theo mã ${r.stability.share}`);
    r.verdict = fails.length ? "FAIL" : "PASS"; r.reason = fails.join("; ") || "đạt cả 6 tiêu chí";
  });
  const tf = Object.fromEntries([["RSI", "C1", "W1"], ["MACD", "C3", "W3"], ["ADX", "C4", "W4"]].map(([k, d, w]) => [k, {
    D: results[d].OOS?.mean ?? null, W: results[w].OOS?.mean ?? null,
    sameSign: results[d].OOS?.mean != null && results[w].OOS?.mean != null ? Math.sign(results[d].OOS.mean) === Math.sign(results[w].OOS.mean) : null,
  }]));
  return {
    prereg: P.version, generatedAt: new Date().toISOString().slice(0, 10), universe: uni.length,
    data: { from: uni[0]?.bars[0]?.date ?? null, to: uni[0]?.bars.at(-1)?.date ?? null },
    results, tfConsistency: tf, ms: Date.now() - t0,
    verdicts: Object.fromEntries(ids.map((id) => [id, results[id].verdict])),
  };
}
