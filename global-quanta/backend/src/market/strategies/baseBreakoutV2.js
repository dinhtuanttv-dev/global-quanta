// Base Breakout v2 (Screener Engine v2 / S2) — dựa trên đặc trưng của baseBreakout.cjs (bản AFL nâng cấp) nhưng:
//   1. Điều kiện CỨNG chỉ còn phần cấu trúc (xu hướng, nền chặt, vượt pivot, chưa kéo xa, rủi ro chấp nhận được);
//      các điều kiện "xác nhận" (khối lượng, MACD, MFI, sức nến, biên độ, …) thành ĐIỂM 0–100 + hạng A/B/C.
//   2. Điểm cộng mới: vượt POC/VAH của Volume Profile nền giá 60 phiên; khối ngoại mua ròng 5 phiên.
//   3. Trạng thái SETUP: nền chặt, xu hướng tốt, giá cách pivot ≤ 3% — danh sách theo dõi trước breakout.
//   4. Backtest theo luật VN: T+2,5 (không bán trước chiều T+2), phí + trượt giá mỗi chiều + thuế bán 0,1%,
//      bỏ lệnh mua khi phiên vào lệnh khoá trần, không bán được khi khoá sàn.
// Mọi giá trị tại phiên t chỉ dùng dữ liệu ≤ t (không nhìn trước).

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const BaseBreakout = require("./baseBreakout.cjs");

// Ngưỡng đơn vị của preset gốc tắt — cổng giá/thanh khoản VND áp ở technicalFilters.js.
const FEATURE_OPTIONS = Object.freeze({ minPrice: 0, maxPrice: 0, minAvgVol: 0, minAvgValue: 0, minVol0: 0, minVol1: 0, minVol2: 0, minValue0: 0 });
export const HARD_CHECKS = Object.freeze(["trend", "tightBase", "breakout", "notExtended", "riskOK"]);

export const V2 = Object.freeze({
  setupMaxBelowPivot: 0.03,
  vpBars: 60, vpBins: 40, valueArea: 0.7,
  gradeA: 75, gradeB: 55,
  // chi phí mỗi chiều + thuế bán (Thông tư 111/2013: 0,1% giá trị bán)
  feePct: 0.0015, slipPct: 0.001, sellTaxPct: 0.001,
  limitPct: 0.065, // ≥ 6,5% so với tham chiếu ≈ chạm biên độ HOSE 7% (HNX 10%, UPCoM 15% vẫn bị coi là khoá — bảo thủ)
  settleBars: 2,   // T+2,5: hàng về chiều T+2 -> phiên đầu tiên được bán là entry+2 (chỉ phiên chiều)
  // Thoát lệnh chọn theo TRONG MẪU: trailing MA20 sau 5 phiên, mục tiêu 3R (PF 1,57 vs 1,20 của MA15/3 2R)
  trailMA: 20, trailMinHold: 5, rr: 3,
});

/** Volume Profile của các nến [from..to] (giá điều chỉnh): chia KL đều theo dải H–L của từng nến. */
export function dailyVolumeProfile(H, L, V, from, to, bins = V2.vpBins, area = V2.valueArea) {
  let lo = Infinity, hi = -Infinity;
  for (let i = from; i <= to; i++) { if (L[i] < lo) lo = L[i]; if (H[i] > hi) hi = H[i]; }
  if (!(hi > lo)) return null;
  const step = (hi - lo) / bins;
  const vol = new Float64Array(bins);
  for (let i = from; i <= to; i++) {
    const a = Math.min(bins - 1, Math.floor((L[i] - lo) / step)), b = Math.min(bins - 1, Math.floor((H[i] - lo) / step));
    const share = V[i] / (b - a + 1);
    for (let k = a; k <= b; k++) vol[k] += share;
  }
  let poc = 0, total = 0;
  for (let k = 0; k < bins; k++) { total += vol[k]; if (vol[k] > vol[poc]) poc = k; }
  if (!(total > 0)) return null;
  let lk = poc, hk = poc, acc = vol[poc];
  while (acc < total * area && (lk > 0 || hk < bins - 1)) {
    const down = lk > 0 ? vol[lk - 1] : -1, up = hk < bins - 1 ? vol[hk + 1] : -1;
    if (up >= down) acc += vol[++hk]; else acc += vol[--lk];
  }
  const mid = (k) => lo + (k + 0.5) * step;
  return { poc: mid(poc), vah: lo + (hk + 1) * step, val: lo + lk * step };
}

/** Đặc trưng + mảng phụ cho một chuỗi (dùng chung cho quét và backtest). */
export function prepareV2(bars) {
  const S = BaseBreakout.prepare(bars, FEATURE_OPTIONS);
  S.value = bars.map((b) => (Number(b.value) > 0 ? Number(b.value) : b.close * b.volume));
  S.foreign = bars.map((b) => (Number.isFinite(b.foreignNet) ? b.foreignNet : null));
  return S;
}

const clamp01 = (x) => Math.max(0, Math.min(1, x));

function smaOf(a, n) {
  const out = new Float64Array(a.length).fill(NaN);
  let s = 0;
  for (let i = 0; i < a.length; i++) { s += a[i]; if (i >= n) s -= a[i - n]; if (i >= n - 1) out[i] = s / n; }
  return out;
}

/**
 * Đánh giá phiên t: { status: BREAKOUT|SETUP|null, grade, score, components, plan, metrics }.
 * ctx.marketUp(date) -> true/false/null: VN-Index trên MA20 tại ngày đó (yếu tố M).
 */
export function evaluateV2(S, t, ctx = {}) {
  const r = BaseBreakout.evaluateAt(S, t, FEATURE_OPTIONS);
  if (!r.metrics) return { status: null };
  const m = r.metrics, c = r.checks;
  const hardFailed = HARD_CHECKS.filter((k) => !c[k]);
  const belowPivot = 1 - m.close / m.basePivot;
  const isBreakout = hardFailed.length === 0;
  const isSetup = !isBreakout && c.trend && c.tightBase && !c.breakout && belowPivot >= 0 && belowPivot <= V2.setupMaxBelowPivot;
  if (!isBreakout && !isSetup) return { status: null, hardFailed };

  const vp = dailyVolumeProfile(S.H, S.L, S.V, Math.max(0, t - V2.vpBars), t - 1);
  let fNet5 = null;
  { let s = 0, k = 0; for (let i = Math.max(0, t - 4); i <= t; i++) if (S.foreign[i] != null) { s += S.foreign[i]; k++; } if (k >= 3) fNet5 = s; }

  // Trọng số chọn theo bằng chứng TRONG MẪU (2024-10 → 2026-03, 934 lệnh; xem PR S2):
  //   MFI tăng & ≥ 50: PF 1,31 vs 0,68 · VN-Index > MA20: 1,30 vs 0,75 · tăng phiên ≤ 6%: 1,29 vs 0,74.
  //   Khối ngoại mua ròng 5 phiên: 0,54 vs 1,35 (ngược) ; sức nến, biên độ 250 phiên: không phân tách -> chỉ hiển thị.
  const market = typeof ctx.marketUp === "function" ? ctx.marketUp(S.date[t]) : null;
  const comp = [];
  const add = (key, label, max, frac, value) => comp.push({ key, label, max, points: max ? Math.round(max * clamp01(frac) * 10) / 10 : 0, value, ok: frac >= 0.5 });
  add("moneyFlow", "MFI tăng & ≥ 50", 30, c.moneyFlow ? 1 : m.mfi >= 50 ? 0.5 : 0, m.mfi);
  add("market", "VN-Index trên MA20", 20, market === true ? 1 : 0, market);
  add("dayGain", "Tăng trong phiên ≤ 6%", 15, c.dayGain ? 1 : 0, m.rate);
  add("volume", "KL so với TB20", 15, Number.isFinite(m.volRatio) ? (m.volRatio - 1) / 1.5 : 0, m.volRatio); // 2,5× = đủ điểm
  add("volumeProfile", "Vượt VAH/POC nền 60 phiên", 10, vp ? (m.close > vp.vah ? 1 : m.close > vp.poc ? 0.5 : 0) : 0, vp ? m.close / vp.vah - 1 : null);
  add("macd", "MACD 7-15-3 cắt lên", 10, c.macd ? 1 : m.macd >= m.macdSignal ? 0.5 : 0, m.macd - m.macdSignal);
  // chỉ thông tin (0 điểm)
  add("foreign", "Khối ngoại ròng 5 phiên", 0, fNet5 > 0 ? 1 : 0, fNet5);
  add("closeStrength", "Đóng cửa nửa trên nến", 0, Number.isFinite(m.closePos) ? m.closePos : 0, m.closePos);
  add("context", "Biên độ 250 phiên ≥ 50%", 0, c.context ? 1 : 0, m.rangePct);
  const score = Math.round(comp.reduce((a, x) => a + x.points, 0));
  const grade = score >= V2.gradeA ? "A" : score >= V2.gradeB ? "B" : "C";
  return {
    status: isBreakout ? "BREAKOUT" : "SETUP",
    grade, score, components: comp, hardFailed,
    plan: { ...m.plan, target: m.plan.entry + V2.rr * (m.plan.entry - m.plan.stop), rr: V2.rr },
    metrics: {
      ...m, score, belowPivotPct: belowPivot * 100,
      vp: vp && { poc: vp.poc, vah: vp.vah, val: vp.val }, foreignNet5: fNet5,
    },
    checks: c,
  };
}

export function scanBaseBreakoutV2(bars, ctx = {}) {
  const S = prepareV2(bars);
  if (S.n < 260) return { status: null };
  const r = evaluateV2(S, S.n - 1, ctx);
  return r.status ? { ...r, date: S.date[S.n - 1] } : r;
}

const isLimitUp = (S, i) => i > 0 && S.L[i] === S.H[i] && S.C[i] / S.C[i - 1] - 1 >= V2.limitPct;
const isLimitDown = (S, i) => i > 0 && S.L[i] === S.H[i] && S.C[i] / S.C[i - 1] - 1 <= -V2.limitPct;

/**
 * Backtest một mã theo luật VN. `eligible(t)` (tuỳ chọn) — cổng thanh khoản tại thời điểm t.
 * Chỉ lấy tín hiệu BREAKOUT; vào lệnh giá mở cửa t+1; không chồng lệnh.
 */
export function backtestV2(bars, { eligible = () => true, accept = () => true, ctx = {}, minGrade = "C", maxHold = 30, trailMA = V2.trailMA, trailMinHold = V2.trailMinHold, rr = V2.rr, maxGapPct = 0.05, startIndex = 259 } = {}) {
  const S = prepareV2(bars);
  const trailLine = trailMA > 0 ? smaOf(S.C, trailMA) : null;
  const rank = { A: 3, B: 2, C: 1 };
  const trades = [];
  let skippedLimitUp = 0;
  let t = Math.max(startIndex, 2);
  while (t < S.n - 1) {
    if (!eligible(t)) { t++; continue; }
    const sig = evaluateV2(S, t, ctx);
    if (sig.status !== "BREAKOUT" || rank[sig.grade] < rank[minGrade] || !accept(sig, t, S)) { t++; continue; }
    const e = t + 1;
    // Phiên vào lệnh khoá trần (H=L, +≥6,5%) -> không khớp được lệnh mua.
    if (isLimitUp(S, e)) { skippedLimitUp++; t++; continue; }
    const stop = sig.plan.stop;
    if (!(S.O[e] > stop) || Math.abs(S.O[e] / S.C[t] - 1) > maxGapPct) { t++; continue; }
    const entry = S.O[e] * (1 + V2.slipPct);
    const risk = entry - stop;
    const target = entry + rr * risk;
    const firstSell = e + V2.settleBars;
    let exitIdx = -1, exitPx = NaN, reason = "", breached = false;
    for (let j = e; j < S.n; j++) {
      if (j < firstSell) { if (S.L[j] <= stop) breached = true; continue; } // chưa có hàng để bán
      if (isLimitDown(S, j)) continue; // trắng bên mua -> không bán được
      if (j === firstSell) {
        // Chỉ bán được phiên chiều: giá xấu nhất hợp lý = min(stop, đóng cửa) khi đã thủng stop.
        if (breached || S.L[j] <= stop) { exitIdx = j; exitPx = Math.min(stop, S.C[j]); reason = "STOP"; break; }
        if (S.C[j] >= target) { exitIdx = j; exitPx = target; reason = "TARGET"; break; }
      } else {
        if (S.L[j] <= stop) { exitIdx = j; exitPx = Math.min(S.O[j], stop); reason = "STOP"; break; }
        if (S.H[j] >= target) { exitIdx = j; exitPx = Math.max(S.O[j], target); reason = "TARGET"; break; }
      }
      const held = j - e;
      const trail = trailLine && held >= trailMinHold && S.C[j] < trailLine[j];
      if (trail || held + 1 >= maxHold) {
        if (j + 1 < S.n) { exitIdx = j + 1; exitPx = S.O[j + 1]; } else { exitIdx = j; exitPx = S.C[j]; }
        reason = trail ? "TRAIL" : "TIME"; break;
      }
    }
    if (exitIdx < 0) break; // lệnh còn mở ở cuối chuỗi: không tính
    const fill = exitPx * (1 - V2.slipPct);
    const net = (fill * (1 - V2.feePct - V2.sellTaxPct)) / (entry * (1 + V2.feePct)) - 1;
    trades.push({
      signalDate: S.date[t], entryDate: S.date[e], exitDate: S.date[exitIdx], entryIdx: e, exitIdx,
      entry, stop, exit: fill, grade: sig.grade, score: sig.score, reason, netPct: net * 100, R: net / (risk / entry), bars: exitIdx - e + 1,
      features: Object.fromEntries(sig.components.map((x) => [x.key, x.max ? x.points / x.max : 0])),
    });
    t = Math.max(exitIdx, t + 1);
  }
  return { trades, skippedLimitUp };
}

/** Thống kê gộp: n, tỷ lệ thắng, TB/median %, PF, kỳ vọng R, số phiên giữ. */
export function summarizeTrades(trades) {
  if (!trades.length) return { n: 0 };
  const net = trades.map((x) => x.netPct).sort((a, b) => a - b);
  const wins = trades.filter((x) => x.netPct > 0);
  const gw = wins.reduce((a, x) => a + x.netPct, 0);
  const gl = -trades.filter((x) => x.netPct <= 0).reduce((a, x) => a + x.netPct, 0);
  const r1 = (v) => Math.round(v * 100) / 100;
  return {
    n: trades.length,
    winRate: r1((wins.length / trades.length) * 100),
    avgNetPct: r1(net.reduce((a, b) => a + b, 0) / net.length),
    medianNetPct: r1(net[Math.floor(net.length / 2)]),
    profitFactor: gl > 0 ? r1(gw / gl) : null,
    expectancyR: r1(trades.reduce((a, x) => a + x.R, 0) / trades.length),
    avgBars: r1(trades.reduce((a, x) => a + x.bars, 0) / trades.length),
    byReason: trades.reduce((m, x) => ({ ...m, [x.reason]: (m[x.reason] ?? 0) + 1 }), {}),
  };
}

/**
 * Bằng chứng gộp toàn universe (Evidence Card): backtest từng mã, tách trong/ngoài mẫu theo NGÀY chung
 * (70% đầu / 30% cuối khoảng thời gian), thêm theo hạng và lợi nhuận nền (giữ 10 phiên mọi ngày đủ điều kiện).
 * Nhãn: VALIDATED khi ngoài mẫu ≥ 30 lệnh, PF ≥ 1,1, kỳ vọng > 0 và vượt nền; còn lại EXPERIMENTAL.
 */
export function buildEvidence(seriesList, { minAvgValue20 = 0, oosRatio = 0.3, ctx = {} } = {}) {
  const all = [];
  const baseline = [];
  let skippedLimitUp = 0;
  let first = null, last = null;
  for (const bars of seriesList) {
    if (bars.length < 300) continue;
    const val = bars.map((b) => (Number(b.value) > 0 ? Number(b.value) : b.close * b.volume));
    const avg20 = new Float64Array(bars.length).fill(NaN);
    let s = 0;
    for (let i = 0; i < bars.length; i++) { s += val[i]; if (i >= 20) s -= val[i - 20]; if (i >= 19) avg20[i] = s / 20; }
    const eligible = (t) => !(avg20[t] < minAvgValue20);
    const r = backtestV2(bars, { eligible, ctx });
    skippedLimitUp += r.skippedLimitUp;
    for (const x of r.trades) all.push(x);
    for (let t = 259; t + 10 < bars.length; t += 5) {
      if (!eligible(t)) continue;
      baseline.push({ date: bars[t].date, netPct: ((bars[t + 10].close * (1 - V2.feePct - V2.sellTaxPct - V2.slipPct)) / (bars[t + 1].open * (1 + V2.feePct + V2.slipPct)) - 1) * 100 });
    }
    if (bars[259]) { first = !first || bars[259].date < first ? bars[259].date : first; last = !last || bars.at(-1).date > last ? bars.at(-1).date : last; }
  }
  if (!first) return { label: "EXPERIMENTAL", reason: "Chưa đủ lịch sử để kiểm định.", all: { n: 0 } };
  const span = Date.parse(last) - Date.parse(first);
  const cut = new Date(Date.parse(first) + span * (1 - oosRatio)).toISOString().slice(0, 10);
  const inS = all.filter((x) => x.exitDate < cut), outS = all.filter((x) => x.entryDate >= cut);
  const baseMean = (list) => (list.length ? Math.round((list.reduce((a, x) => a + x.netPct, 0) / list.length) * 100) / 100 : null);
  const oos = summarizeTrades(outS);
  const baseOos = baseMean(baseline.filter((x) => x.date >= cut));
  const validated = oos.n >= 30 && (oos.profitFactor ?? 0) >= 1.1 && oos.expectancyR > 0 && baseOos != null && oos.avgNetPct > baseOos;
  return {
    label: validated ? "VALIDATED" : "EXPERIMENTAL",
    reason: validated ? "Ngoài mẫu: PF ≥ 1,1, kỳ vọng dương và vượt nền." :
      oos.n < 30 ? `Ngoài mẫu mới ${oos.n} lệnh (< 30).` : "Ngoài mẫu chưa đạt PF ≥ 1,1 / kỳ vọng dương / vượt nền.",
    period: { from: first, to: last, oosFrom: cut },
    rules: "Vào giá mở cửa T+1 · T+2,5 · phí 0,15% + trượt 0,1%/chiều + thuế bán 0,1% · bỏ phiên khoá trần, không bán khi khoá sàn · stop nền/ATR, mục tiêu 3R, trailing MA20 sau 5 phiên, tối đa 30 phiên",
    all: summarizeTrades(all), inSample: summarizeTrades(inS), outOfSample: oos,
    byGrade: Object.fromEntries(["A", "B", "C"].map((g) => [g, summarizeTrades(all.filter((x) => x.grade === g))])),
    byGradeOutOfSample: Object.fromEntries(["A", "B", "C"].map((g) => [g, summarizeTrades(outS.filter((x) => x.grade === g))])),
    byMarket: { up: summarizeTrades(all.filter((x) => x.features?.market >= 0.5)), down: summarizeTrades(all.filter((x) => !(x.features?.market >= 0.5))) },
    baseline: { holdBars: 10, all: baseMean(baseline), outOfSample: baseOos },
    skippedLimitUp,
  };
}

/** Yếu tố M: VN-Index đóng cửa trên MA20 tại từng ngày (chỉ dùng dữ liệu đến ngày đó). */
export function marketContext(indexBars) {
  const up = new Map();
  let s = 0;
  const bars = (indexBars ?? []).filter((b) => b.close > 0);
  for (let i = 0; i < bars.length; i++) {
    s += bars[i].close;
    if (i >= 20) s -= bars[i - 20].close;
    if (i >= 19) up.set(bars[i].date, bars[i].close > s / 20);
  }
  return { marketUp: (date) => (up.has(date) ? up.get(date) : null), lastDate: bars.at(-1)?.date ?? null };
}
