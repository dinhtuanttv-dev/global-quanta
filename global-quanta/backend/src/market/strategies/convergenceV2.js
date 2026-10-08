// Bộ lọc Hợp lưu v2 (H1) — chiến lược thứ ba của bộ lọc kỹ thuật TA VN-Index, thay /api/convergence-scan của Project A
// (Yahoo chưa điều chỉnh, Wyckoff v1, OB/FVG không xét chiều, effort 1 nến). Engine = quant-core (bản đóng gói vendor/quantCore.mjs),
// cùng mã nguồn với biểu đồ và bảng phụ -> cùng kết luận. Điều kiện cứng: cấu trúc Wyckoff ĐANG HOẠT ĐỘNG.
//
// Bằng chứng lịch sử: point-in-time MỌI nến (cửa sổ 400 nến, VN-Index cắt tới cùng ngày), luật VN (vnBacktest.js),
// tiêu chí đặt trước (PR H1). Tốn ~4 phút cho ~225 mã -> KHÔNG tính trong request: job đêm buildConvergenceEvidence lưu KV,
// lần quét đọc lại; nhả event loop sau mỗi mã để Gateway vẫn phục vụ API.

import { convergenceAt, CONVERGENCE_VERSION } from "../vendor/quantCore.mjs";
import { baselineReturns, evidenceFromTrades, simulateVnTrade } from "./vnBacktest.js";
import { liquidityAt } from "./baseBreakoutV2.js";
import { Worker } from "node:worker_threads";

export { CONVERGENCE_VERSION };
export const CONVERGENCE_EVIDENCE_KV = "strategies:convergence:evidence";
/** Bằng chứng cũ hơn 7 ngày hoặc khác phiên bản engine -> job đêm tính lại. */
export const CONVERGENCE_EVIDENCE_MAX_AGE_MS = 7 * 86_400_000;
export const CONVERGENCE_WINDOW = 400;
const MIN_SCORE = 50;
const MAX_HOLD = 30;

/** Chỉ số VN-Index tới ngày `date` (chuỗi đã sắp theo ngày). */
function indexUpTo(indexBars, date) {
  let lo = 0, hi = indexBars.length - 1, k = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (indexBars[m].date <= date) { k = m; lo = m + 1; } else hi = m - 1; }
  return k < 0 ? [] : indexBars.slice(Math.max(0, k - 120), k + 1);
}

/** Kế hoạch phía mua đặt trước: cắt lỗ = min(đáy cụm hợp lưu, đáy range) × 0,99; mục tiêu = max(đỉnh range + 1× độ rộng, 2R). */
export function convergencePlan(r) {
  if (r.side !== "buy" || r.wyckoff.rangeLow == null || r.wyckoff.rangeHigh == null) return null;
  const stop = Math.min(r.zone?.low ?? r.wyckoff.rangeLow, r.wyckoff.rangeLow) * 0.99;
  if (!(stop < r.close)) return null;
  const height = r.wyckoff.rangeHigh - r.wyckoff.rangeLow;
  const target = Math.max(r.wyckoff.rangeHigh + height, r.close + 2 * (r.close - stop));
  return { entry: r.close, stop, target, rr: (target - r.close) / (r.close - stop) };
}

/** Quét phiên cuối: null khi không có cấu trúc Wyckoff đang hoạt động. */
export function scanConvergenceV2(bars, { indexBars = [], avgValue20 } = {}) {
  const window = bars.slice(-CONVERGENCE_WINDOW);
  const last = window.at(-1);
  const r = convergenceAt(window, indexUpTo(indexBars, last.date), { avgValue20 });
  if (!r) return null;
  return {
    status: r.status, grade: r.grade, date: r.dataAsOf, side: r.side,
    metrics: { score: r.score, close: r.close, side: r.side },
    components: r.components, zone: r.zone, levels: r.levels, wyckoff: r.wyckoff,
    liquidityCapacity: r.liquidity.capacity, plan: convergencePlan(r), version: r.version,
  };
}

/** Backtest một mã (phía mua): bắt đầu đạt hạng ≥ B -> vào lệnh T+1 theo luật VN, không chồng lệnh. */
export function backtestConvergence(bars, { indexBars = [], eligible = () => true, startIndex = 299 } = {}) {
  const S = { n: bars.length, date: bars.map((b) => b.date), O: bars.map((b) => b.open), H: bars.map((b) => b.high), L: bars.map((b) => b.low), C: bars.map((b) => b.close) };
  const trades = [];
  let prevOk = false, busy = -1, skippedLimitUp = 0;
  for (let t = Math.max(startIndex, 60); t < S.n - 1; t++) {
    if (!eligible(t)) { prevOk = false; continue; }
    const r = convergenceAt(bars.slice(Math.max(0, t - CONVERGENCE_WINDOW + 1), t + 1), indexUpTo(indexBars, S.date[t]));
    const ok = !!r && r.side === "buy" && r.score >= MIN_SCORE;
    if (ok && !prevOk && t > busy) {
      const plan = convergencePlan(r);
      if (plan) {
        const sim = simulateVnTrade(S, t, { stop: plan.stop, target: (e, s) => Math.max(plan.target, e + 2 * (e - s)), maxHold: MAX_HOLD, maxGapPct: 0.05 });
        if (sim.skip === "LIMIT_UP") skippedLimitUp++;
        if (sim.trade) { trades.push({ ...sim.trade, grade: r.grade, score: r.score }); busy = sim.trade.exitIdx; }
      }
    }
    prevOk = ok;
  }
  return { trades, skippedLimitUp };
}

/** Bằng chứng gộp toàn universe — nhả event loop sau mỗi mã. */
export async function buildConvergenceEvidence(seriesList, { indexBars = [], minAvgValue20 = 0, oosRatio = 0.3, yieldFn = () => new Promise((r) => setImmediate(r)) } = {}) {
  const all = [], baseline = [];
  let first = null, last = null, skippedLimitUp = 0;
  for (const bars of seriesList) {
    if (bars.length < 300) continue;
    const eligible = liquidityAt(bars, minAvgValue20);
    const r = backtestConvergence(bars, { indexBars, eligible });
    all.push(...r.trades);
    skippedLimitUp += r.skippedLimitUp;
    baseline.push(...baselineReturns(bars, { eligible }));
    first = !first || bars[259].date < first ? bars[259].date : first;
    last = !last || bars.at(-1).date > last ? bars.at(-1).date : last;
    await yieldFn();
  }
  return evidenceFromTrades(all, baseline, {
    first, last, oosRatio,
    rules: "Bắt đầu đạt hạng ≥ B phía mua · vào giá mở cửa T+1 · T+2,5 · phí 0,15% + trượt 0,1%/chiều + thuế bán 0,1% · bỏ phiên khoá trần, không bán khi khoá sàn · cắt lỗ min(đáy cụm hợp lưu, đáy range) × 0,99, mục tiêu max(đỉnh range + 1× độ rộng, 2R), tối đa 30 phiên",
    // Trọng số đặt trước, không tinh chỉnh theo kết quả.
    trials: 1,
    extra: { skippedLimitUp, engine: CONVERGENCE_VERSION },
  });
}

/**
 * Tính bằng chứng trong worker thread (event loop chính không bị chặn). Trả Promise<evidence>.
 * `timeoutMs` — quá hạn thì dừng worker và báo lỗi (không treo job mãi).
 */
export function buildConvergenceEvidenceInWorker(seriesList, { indexBars = [], minAvgValue20 = 0, timeoutMs = 30 * 60_000 } = {}) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./convergenceEvidenceWorker.js", import.meta.url), { workerData: { seriesList, indexBars, minAvgValue20 } });
    const timer = setTimeout(() => { worker.terminate(); reject(new Error(`Worker bằng chứng Hợp lưu quá ${Math.round(timeoutMs / 60_000)} phút`)); }, timeoutMs);
    worker.once("message", (m) => { clearTimeout(timer); worker.terminate(); m.ok ? resolve(m.evidence) : reject(new Error(m.message)); });
    worker.once("error", (e) => { clearTimeout(timer); reject(e); });
    worker.once("exit", (code) => { clearTimeout(timer); if (code !== 0 && code !== 1) reject(new Error(`Worker thoát mã ${code}`)); });
  });
}

/** Bằng chứng đã lưu còn dùng được? */
export function convergenceEvidenceFresh(stored, now = Date.now()) {
  return !!stored && stored.engine === CONVERGENCE_VERSION && now - Date.parse(stored.computedAt) < CONVERGENCE_EVIDENCE_MAX_AGE_MS;
}
