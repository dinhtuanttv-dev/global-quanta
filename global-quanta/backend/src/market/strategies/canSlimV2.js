// CAN SLIM v2 (Screener Engine v2 / S3) — CAN SLIM thật của William O'Neil trên dữ liệu VN, không nhìn trước.
//
// Mẫu hình (điều kiện CỨNG): Cốc tay cầm theo O'Neil, dùng giá cao/thấp (không chỉ giá đóng cửa)
//   - Cốc 35–325 phiên (7–65 tuần), sâu 12–40%, có đà tăng trước cốc ≥ 25%, không có đỉnh nào cao hơn miệng trái trong cốc,
//     miệng phải trong khoảng 90–105% miệng trái.
//   - Tay cầm 5–25 phiên, sâu ≤ 15%, nằm ở NỬA TRÊN của cốc.
//   - Pivot = đỉnh tay cầm + 1 bước giá. BREAKOUT: phiên đầu đóng cửa vượt pivot, còn trong vùng mua (≤ pivot + 5%).
//     SETUP: tay cầm hợp lệ, giá cách pivot ≤ 5%.
// Bảy yếu tố C-A-N-S-L-I-M thành điểm 0–100 + hạng (xem COMPONENTS). Báo cáo tài chính dùng theo NGÀY CÔNG BỐ ước tính
// (hết quý + 45 ngày) để không nhìn trước; tăng trưởng đo bằng LNST vì EPS quý của VCI chưa điều chỉnh theo cổ tức cổ phiếu.

import { hoseTick } from "../adjusted/adjustedHistory.js";
import { baselineReturns, evidenceFromTrades, simulateVnTrade, smaOf } from "./vnBacktest.js";
import { liquidityAt } from "./baseBreakoutV2.js";

export const CS = Object.freeze({
  cupMin: 35, cupMax: 325, depthMin: 0.12, depthMax: 0.4, priorRise: 0.25, priorLookback: 130,
  rightLipMin: 0.9, rightLipMax: 1.05,
  handleMin: 5, handleMax: 25, handleDepthMax: 0.15,
  buyZone: 0.05, setupZone: 0.05,
  stopPct: 0.08, targetPct: 0.2, // O'Neil: cắt lỗ 7–8%, chốt lời 20–25%
  trailMA: 50, trailMinHold: 10, maxHold: 90,
  reportLagDays: 45,
  gradeA: 75, gradeB: 55,
});

const DAY = 86_400_000;
const clamp01 = (x) => Math.max(0, Math.min(1, x));

// ------------------------------------------------------------------ mẫu hình

/** Cốc tay cầm tại phiên t (chỉ dùng dữ liệu ≤ t). */
export function detectCupHandle(S, t) {
  const { H, L, C, V } = S;
  if (t < CS.cupMin + CS.handleMin + 2) return null;
  // Miệng phải r: đỉnh cao nhất của [t−26, t−6]; tay cầm = (r, t−1], đỉnh tay cầm phải là r.
  let r = -1;
  for (let i = Math.max(1, t - CS.handleMax - 1); i <= t - CS.handleMin - 1; i++) if (r < 0 || H[i] >= H[r]) r = i;
  if (r < 0) return null;
  let handleLow = Infinity, handleLowIdx = -1, handleHigh = -Infinity;
  for (let i = r + 1; i <= t - 1; i++) { if (L[i] < handleLow) { handleLow = L[i]; handleLowIdx = i; } if (H[i] > handleHigh) handleHigh = H[i]; }
  if (handleHigh > H[r]) return null;
  const handleBars = t - 1 - r;
  // Miệng trái l: đỉnh cao nhất của [r−325, r−35].
  let l = -1;
  for (let i = Math.max(0, r - CS.cupMax); i <= r - CS.cupMin; i++) if (l < 0 || H[i] > H[l]) l = i;
  if (l < 0) return null;
  let cupLow = Infinity, cupLowIdx = -1, inside = -Infinity;
  for (let i = l + 1; i < r; i++) { if (L[i] < cupLow) { cupLow = L[i]; cupLowIdx = i; } if (H[i] > inside) inside = H[i]; }
  const leftLip = H[l], rightLip = H[r];
  if (!(cupLow < Infinity) || inside > Math.max(leftLip, rightLip)) return null;
  const depth = (leftLip - cupLow) / leftLip;
  if (depth < CS.depthMin || depth > CS.depthMax) return null;
  if (rightLip < CS.rightLipMin * leftLip || rightLip > CS.rightLipMax * leftLip) return null;
  let prior = Infinity;
  for (let i = Math.max(0, l - CS.priorLookback); i < l; i++) if (L[i] < prior) prior = L[i];
  if (!(leftLip >= (1 + CS.priorRise) * prior)) return null;
  const handleDepth = (rightLip - handleLow) / rightLip;
  if (handleDepth > CS.handleDepthMax) return null;
  if (handleLow < cupLow + 0.5 * (leftLip - cupLow)) return null; // tay cầm ở nửa trên của cốc

  const pivot = rightLip + hoseTick(rightLip);
  const c = C[t];
  const breakout = c > pivot && c <= pivot * (1 + CS.buyZone) && C[t - 1] <= pivot;
  const setup = !breakout && c <= pivot && c >= pivot * (1 - CS.setupZone);
  if (!breakout && !setup) return null;
  // Chất lượng (chỉ hiển thị): đáy tròn chữ U (đáy nằm 20–80% thời gian cốc), KL tay cầm cạn so với TB50.
  const uPos = (cupLowIdx - l) / (r - l);
  let hv = 0; for (let i = r + 1; i <= t - 1; i++) hv += V[i];
  let v50 = 0, n50 = 0; for (let i = Math.max(0, r - 49); i <= r; i++) { v50 += V[i]; n50++; }
  return {
    status: breakout ? "BREAKOUT" : "SETUP",
    leftLipIdx: l, cupLowIdx, rightLipIdx: r, handleLowIdx,
    leftLip, cupLow, rightLip, handleLow, pivot,
    depthPct: depth * 100, handleDepthPct: handleDepth * 100, cupBars: r - l, handleBars,
    uShape: uPos >= 0.2 && uPos <= 0.8, handleVolDry: handleBars > 0 && hv / handleBars < v50 / n50,
    belowPivotPct: (1 - c / pivot) * 100,
  };
}

// ------------------------------------------------------------------ báo cáo tài chính (point-in-time)

const quarterEnd = (y, q) => Date.UTC(y, q * 3, 0); // ngày cuối quý

/** Quý đã công bố tại `date` (ước tính hết quý + 45 ngày), mới nhất trước. */
export function quartersAvailable(quarters, date, lagDays = CS.reportLagDays) {
  const t = Date.parse(`${date}T00:00:00Z`);
  return (quarters ?? []).filter((q) => quarterEnd(q.year, q.quarter) + lagDays * DAY <= t)
    .sort((a, b) => b.year - a.year || b.quarter - a.quarter);
}

const growth = (now, prev) => (now == null || prev == null ? null : prev > 0 ? now / prev - 1 : now > 0 ? Infinity : null);

/** C và A tại một ngày. */
export function fundamentalFactors(fa, date) {
  const inc = quartersAvailable(fa?.income?.quarters, date);
  const bal = quartersAvailable(fa?.balance?.quarters, date);
  if (!inc.length) return null;
  const key = (q) => `${q.year}-${q.quarter}`;
  const byKey = new Map(inc.map((q) => [key(q), q]));
  const yoy = (q, field) => { const p = byKey.get(`${q.year - 1}-${q.quarter}`); return p ? growth(q[field], p[field]) : null; };
  const q0 = inc[0], q1 = inc[1];
  const npG0 = yoy(q0, "netProfit"), npG1 = q1 ? yoy(q1, "netProfit") : null, revG0 = yoy(q0, "revenue");
  const ttm = (k) => { const s = inc.slice(k, k + 4); return s.length === 4 && s.every((x) => x.netProfit != null) ? s.reduce((a, x) => a + x.netProfit, 0) : null; };
  const ttm0 = ttm(0), ttm1 = ttm(4), ttm2 = ttm(8);
  const eq0 = bal[0]?.totalEquity, eq4 = bal[4]?.totalEquity ?? bal.at(-1)?.totalEquity;
  const roe = ttm0 != null && eq0 > 0 ? ttm0 / ((eq0 + (eq4 > 0 ? eq4 : eq0)) / 2) : null;
  return {
    latestQuarter: q0.periodLabel,
    npGrowthQ: npG0, npGrowthPrevQ: npG1, revGrowthQ: revG0,
    accelerating: npG0 != null && npG1 != null && npG0 > npG1,
    npGrowthTtm: growth(ttm0, ttm1), sustained: ttm0 != null && ttm1 != null && ttm2 != null && ttm0 > ttm1 && ttm1 > ttm2,
    roe,
  };
}

// ------------------------------------------------------------------ RS (L) theo ngày, toàn universe

/**
 * RS kiểu O'Neil: 0,4×lợi nhuận 63 phiên + 0,2×(126, 189, 252 phiên), xếp phần trăm (1–99) theo NGÀY trong universe.
 * Ngành: trung bình RS thô của các mã cùng ngành, xếp phần trăm giữa các ngành.
 * @param seriesBySymbol Map<symbol, { bars, sector }>
 * @returns { rs(symbol, date) -> 1..99 | null, sector(symbol, date) -> 0..1 | null }
 */
export function buildRsTable(seriesBySymbol) {
  const byDate = new Map();
  for (const [sym, { bars, sector }] of seriesBySymbol) {
    for (let t = 252; t < bars.length; t++) {
      const c = bars[t].close;
      const raw = 0.4 * (c / bars[t - 63].close - 1) + 0.2 * (c / bars[t - 126].close - 1) + 0.2 * (c / bars[t - 189].close - 1) + 0.2 * (c / bars[t - 252].close - 1);
      if (!Number.isFinite(raw)) continue;
      if (!byDate.has(bars[t].date)) byDate.set(bars[t].date, []);
      byDate.get(bars[t].date).push([sym, raw, sector ?? "Khác"]);
    }
  }
  const rs = new Map(), sec = new Map();
  for (const [date, rows] of byDate) {
    if (rows.length < 20) continue;
    rows.sort((a, b) => a[1] - b[1]);
    rows.forEach(([sym], i) => rs.set(`${sym}|${date}`, Math.max(1, Math.min(99, Math.round(((i + 0.5) / rows.length) * 100)))));
    const agg = new Map();
    for (const [, raw, s] of rows) { const a = agg.get(s) ?? [0, 0]; a[0] += raw; a[1]++; agg.set(s, a); }
    const ranked = [...agg].filter(([, a]) => a[1] >= 2).map(([s, a]) => [s, a[0] / a[1]]).sort((a, b) => a[1] - b[1]);
    const pct = new Map(ranked.map(([s], i) => [s, ranked.length > 1 ? i / (ranked.length - 1) : 0.5]));
    for (const [sym, , s] of rows) if (pct.has(s)) sec.set(`${sym}|${date}`, pct.get(s));
  }
  return { rs: (sym, date) => rs.get(`${sym}|${date}`) ?? null, sector: (sym, date) => sec.get(`${sym}|${date}`) ?? null };
}

// ------------------------------------------------------------------ M: thị trường chung

/** VN-Index trên MA20 + số ngày phân phối (giảm ≥ 0,2% với KL cao hơn phiên trước) trong 25 phiên. */
export function marketContextM(indexBars) {
  const bars = (indexBars ?? []).filter((b) => b.close > 0);
  const up = new Map(), dist = new Map();
  let s = 0;
  const flags = bars.map((b, i) => i > 0 && b.close / bars[i - 1].close - 1 <= -0.002 && (b.volume ?? 0) > (bars[i - 1].volume ?? 0));
  let d = 0;
  for (let i = 0; i < bars.length; i++) {
    s += bars[i].close; if (i >= 20) s -= bars[i - 20].close;
    d += flags[i] ? 1 : 0; if (i >= 25) d -= flags[i - 25] ? 1 : 0;
    if (i >= 19) up.set(bars[i].date, bars[i].close > s / 20);
    if (i >= 24) dist.set(bars[i].date, d);
  }
  return {
    marketUp: (date) => (up.has(date) ? up.get(date) : null),
    distributionDays: (date) => (dist.has(date) ? dist.get(date) : null),
    lastDate: bars.at(-1)?.date ?? null,
  };
}

// ------------------------------------------------------------------ chấm điểm

export function prepareCs(bars) {
  const n = bars.length;
  const S = { n, date: bars.map((b) => b.date), O: new Float64Array(n), H: new Float64Array(n), L: new Float64Array(n), C: new Float64Array(n), V: new Float64Array(n) };
  bars.forEach((b, i) => { S.O[i] = b.open; S.H[i] = b.high; S.L[i] = b.low; S.C[i] = b.close; S.V[i] = b.volume; });
  S.foreign = bars.map((b) => (Number.isFinite(b.foreignNet) ? b.foreignNet : null));
  S.ma50 = smaOf(S.C, 50);
  return S;
}

/**
 * Đánh giá phiên t. ctx = { symbol, fa, rsTable, market }.
 * Trọng số khởi điểm theo O'Neil; S3 đo lại từng yếu tố trên dữ liệu TRONG MẪU (xem PR) — yếu tố không phân tách / ngược
 * được để 0 điểm (chỉ hiển thị).
 */
export function evaluateCs(S, t, ctx = {}, weights = WEIGHTS) {
  const p = detectCupHandle(S, t);
  if (!p) return { status: null };
  const date = S.date[t];
  const f = ctx.fa ? fundamentalFactors(ctx.fa, date) : null;
  let hi52 = -Infinity; for (let i = Math.max(0, t - 251); i <= t; i++) if (S.H[i] > hi52) hi52 = S.H[i];
  let v50 = 0; for (let i = Math.max(0, t - 50); i < t; i++) v50 += S.V[i]; v50 /= Math.min(50, t);
  let upV = 0, dnV = 0; for (let i = Math.max(1, t - 49); i <= t; i++) { if (S.C[i] > S.C[i - 1]) upV += S.V[i]; else if (S.C[i] < S.C[i - 1]) dnV += S.V[i]; }
  let f20 = 0, nf = 0; for (let i = Math.max(0, t - 19); i <= t; i++) if (S.foreign[i] != null) { f20 += S.foreign[i]; nf++; }
  const rs = ctx.rsTable?.rs(ctx.symbol, date) ?? null;
  const sector = ctx.rsTable?.sector(ctx.symbol, date) ?? null;
  const mUp = ctx.market?.marketUp(date) ?? null;
  const dist = ctx.market?.distributionDays?.(date) ?? null;
  const volRatio = v50 > 0 ? S.V[t] / v50 : null;
  const udRatio = dnV > 0 ? upV / dnV : null;

  const comp = [];
  const add = (key, factor, label, frac, value) => {
    const max = weights[key] ?? 0;
    comp.push({ key, factor, label, max, points: max ? Math.round(max * clamp01(frac) * 10) / 10 : 0, ok: frac >= 0.5, value });
  };
  const g = (x) => (x == null ? null : x === Infinity ? 9.99 : x);
  add("cQuarter", "C", "LNST quý ≥ +25% so cùng kỳ", f?.npGrowthQ == null ? 0 : f.npGrowthQ >= 0.25 ? 1 : f.npGrowthQ > 0 ? 0.4 : 0, g(f?.npGrowthQ));
  add("cAccel", "C", "Tăng trưởng LNST quý tăng tốc", f?.accelerating ? 1 : 0, g(f?.npGrowthPrevQ));
  add("cRevenue", "C", "Doanh thu quý ≥ +20%", f?.revGrowthQ == null ? 0 : f.revGrowthQ >= 0.2 ? 1 : f.revGrowthQ > 0 ? 0.4 : 0, g(f?.revGrowthQ));
  add("aAnnual", "A", "LNST 4 quý ≥ +25%, tăng liên tục", f?.npGrowthTtm == null ? 0 : (f.npGrowthTtm >= 0.25 ? 0.7 : f.npGrowthTtm > 0 ? 0.3 : 0) + (f.sustained ? 0.3 : 0), g(f?.npGrowthTtm));
  add("aRoe", "A", "ROE ≥ 17%", f?.roe == null ? 0 : f.roe >= 0.17 ? 1 : f.roe >= 0.12 ? 0.5 : 0, f?.roe ?? null);
  add("nHigh", "N", "Cách đỉnh 52 tuần ≤ 15%", S.C[t] >= 0.85 * hi52 ? 1 : 0, S.C[t] / hi52 - 1);
  add("sVolume", "S", "KL ≥ 1,5× TB50", volRatio == null ? 0 : (volRatio - 1) / 0.5, volRatio);
  add("sUpDown", "S", "KL phiên tăng / phiên giảm 50 phiên ≥ 1", udRatio == null ? 0 : udRatio >= 1 ? 1 : 0, udRatio);
  add("lRs", "L", "RS ≥ 80", rs == null ? 0 : rs >= 80 ? 1 : rs >= 70 ? 0.5 : 0, rs);
  add("lSector", "L", "Ngành top 40%", sector == null ? 0 : sector >= 0.6 ? 1 : 0, sector);
  add("iForeign", "I", "Khối ngoại mua ròng 20 phiên", nf >= 10 ? (f20 > 0 ? 1 : 0) : 0, nf >= 10 ? f20 : null);
  add("market", "M", "VN-Index trên MA20", mUp === true ? 1 : 0, mUp);
  add("mDistribution", "M", "≤ 5 ngày phân phối / 25 phiên", dist == null ? 0 : dist <= 5 ? 1 : 0, dist);
  const total = comp.reduce((a, x) => a + x.max, 0) || 1;
  const score = Math.round((comp.reduce((a, x) => a + x.points, 0) / total) * 100);
  const grade = score >= CS.gradeA ? "A" : score >= CS.gradeB ? "B" : "C";
  const entry = S.C[t];
  // Cắt lỗ 8% (O'Neil 7–8%), chặt hơn nếu đáy tay cầm cao hơn; luôn cách entry ít nhất 3%.
  const stop = Math.min(Math.max(entry * (1 - CS.stopPct), p.handleLow * 0.99), entry * 0.97);
  return {
    status: p.status, grade, score, components: comp,
    pattern: p,
    fundamentals: f,
    plan: { entry, stop, target: entry * (1 + CS.targetPct), riskPct: ((entry - stop) / entry) * 100, rr: CS.targetPct / ((entry - stop) / entry), buyZoneTop: p.pivot * (1 + CS.buyZone) },
    metrics: {
      score, close: entry, pivot: p.pivot, depthPct: p.depthPct, handleBars: p.handleBars, cupBars: p.cupBars, handleDepthPct: p.handleDepthPct,
      belowPivotPct: p.belowPivotPct, volRatio, rs, distributionDays: dist, foreignNet20: nf >= 10 ? f20 : null,
    },
  };
}

/** Trọng số khởi điểm theo O'Neil (tổng 100). Giá trị cuối cùng do S3 đo trên dữ liệu trong mẫu. */
export const WEIGHTS = Object.freeze({
  cQuarter: 12, cAccel: 4, cRevenue: 4,
  aAnnual: 10, aRoe: 5,
  nHigh: 10,
  sVolume: 8, sUpDown: 7,
  lRs: 10, lSector: 5,
  iForeign: 10,
  market: 10, mDistribution: 5,
});

// ------------------------------------------------------------------ quét + backtest + bằng chứng

export function scanCanSlimV2(bars, ctx) {
  const S = prepareCs(bars);
  if (S.n < 260) return { status: null };
  const r = evaluateCs(S, S.n - 1, ctx, ctx.weights);
  return r.status ? { ...r, date: S.date[S.n - 1] } : r;
}

export function backtestCs(bars, ctx, { eligible = () => true, startIndex = 259, weights = ctx.weights ?? WEIGHTS } = {}) {
  const S = prepareCs(bars);
  const trades = [];
  let skippedLimitUp = 0;
  for (let t = Math.max(startIndex, 2); t < S.n - 1; t++) {
    if (!eligible(t)) continue;
    const sig = evaluateCs(S, t, ctx, weights);
    if (sig.status !== "BREAKOUT") continue;
    const r = simulateVnTrade(S, t, { stop: sig.plan.stop, target: (entry) => entry * (1 + CS.targetPct), trailLine: S.ma50, trailMinHold: CS.trailMinHold, maxHold: CS.maxHold });
    if (r.skip === "LIMIT_UP") skippedLimitUp++;
    if (r.skip === "OPEN") break;
    if (r.skip) continue;
    trades.push({
      ...r.trade, symbol: ctx.symbol, grade: sig.grade, score: sig.score,
      features: Object.fromEntries(sig.components.map((x) => [x.key, x.max ? x.points / x.max : x.ok ? 1 : 0])),
    });
    t = Math.max(r.trade.exitIdx, t);
  }
  return { trades, skippedLimitUp };
}

/**
 * Bằng chứng gộp toàn universe cho CAN SLIM.
 * @param items [{ symbol, bars, fa }]
 */
export function buildCsEvidence(items, { rsTable, market, minAvgValue20 = 0, weights = WEIGHTS } = {}) {
  const all = [], baseline = [];
  let skippedLimitUp = 0, first = null, last = null;
  for (const it of items) {
    if (it.bars.length < 300) continue;
    const eligible = liquidityAt(it.bars, minAvgValue20);
    const r = backtestCs(it.bars, { symbol: it.symbol, fa: it.fa, rsTable, market }, { eligible, weights });
    skippedLimitUp += r.skippedLimitUp;
    all.push(...r.trades);
    baseline.push(...baselineReturns(it.bars, { eligible }));
    first = !first || it.bars[259].date < first ? it.bars[259].date : first;
    last = !last || it.bars.at(-1).date > last ? it.bars.at(-1).date : last;
  }
  return evidenceFromTrades(all, baseline, {
    first, last,
    rules: "Cốc tay cầm O'Neil · vào giá mở cửa T+1 sau phiên vượt pivot · T+2,5 · phí 0,15% + trượt 0,1%/chiều + thuế bán 0,1% · bỏ phiên khoá trần · cắt lỗ 8%, chốt lời 20%, thoát khi đóng cửa dưới MA50 (sau 10 phiên), tối đa 90 phiên",
    extra: { skippedLimitUp },
  });
}
