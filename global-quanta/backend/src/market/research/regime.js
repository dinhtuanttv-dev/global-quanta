// Trạng thái thị trường theo ngày (Uptrend / Downtrend / Sideway) + Market Impulse Gauge dựng lại
// cho TỪNG ngày trong quá khứ (chỉ dùng dữ liệu tới ngày đó) để làm nhãn backtest và chấm điểm Impulse.

import { calculateSMA, calculateRSI, calculateAtrSeries, computeMaAlignmentScore, computeImpulseScore } from "../scanner/formulas.js";

/**
 * Quy tắc (công khai, không khớp tham số):
 *   UPTREND   : giá > MA50, MA20 > MA50 và MA50 dốc lên trong 10 phiên
 *   DOWNTREND : giá < MA50, MA20 < MA50 và MA50 dốc xuống trong 10 phiên
 *   SIDEWAY   : còn lại
 */
export function classifyRegime(close, ma20, ma50, ma50Prev10) {
  if (!(ma50 > 0) || !(ma50Prev10 > 0)) return "SIDEWAY";
  const slope = ma50 / ma50Prev10 - 1;
  if (close > ma50 && ma20 > ma50 && slope > 0) return "UPTREND";
  if (close < ma50 && ma20 < ma50 && slope < 0) return "DOWNTREND";
  return "SIDEWAY";
}

/** Độ rộng: % mã đóng cửa trên MA20 tại mỗi ngày. rowsBySymbol: Map(symbol -> dòng ngày cũ->mới). */
export function breadthByDate(rowsBySymbol) {
  const above = new Map(), total = new Map();
  for (const rows of rowsBySymbol.values()) {
    const closes = [];
    for (const r of rows) {
      closes.push(r.closeAdj ?? r.close);
      if (closes.length < 20) continue;
      const ma20 = calculateSMA(closes, 20);
      total.set(r.date, (total.get(r.date) ?? 0) + 1);
      if (closes.at(-1) > ma20) above.set(r.date, (above.get(r.date) ?? 0) + 1);
    }
  }
  const out = new Map();
  for (const [date, n] of total) if (n >= 20) out.set(date, Math.round(((above.get(date) ?? 0) / n) * 1000) / 10);
  return out;
}

/**
 * @param {{date, close, high?, low?}[]} indexBars  VN-Index cũ -> mới
 * @param {Map<string, number>} breadth
 * @returns {{ date, close, ma20, ma50, ma200, breadthPct, impulseScore, regime }[]}  từ phiên thứ 60
 */
export function buildRegimeSeries(indexBars, breadth) {
  const out = [];
  const closes = [];
  const bars = indexBars.map((b) => ({ ...b, high: b.high ?? b.close, low: b.low ?? b.close }));
  for (let i = 0; i < bars.length; i++) {
    closes.push(bars[i].close);
    if (i < 59) continue;
    const ma20 = calculateSMA(closes, 20), ma50 = calculateSMA(closes, 50);
    const ma200 = closes.length >= 200 ? calculateSMA(closes, 200) : null;
    const ma50Prev10 = calculateSMA(closes.slice(0, -10), 50);
    const rsi = calculateRSI(closes) ?? 50;
    const atr = calculateAtrSeries(bars.slice(0, i + 1), 14);
    const atrPct = atr.length ? (atr.filter((v) => v <= atr.at(-1)).length / atr.length) * 100 : 50;
    const breadthPct = breadth.get(bars[i].date) ?? null;
    const maAlign = computeMaAlignmentScore(ma20, ma50, ma200 ?? ma50);
    out.push({
      date: bars[i].date, close: bars[i].close, ma20, ma50, ma200,
      breadthPct,
      impulseScore: breadthPct === null ? null : computeImpulseScore(rsi, breadthPct, maAlign, atrPct),
      regime: classifyRegime(bars[i].close, ma20, ma50, ma50Prev10),
    });
  }
  return out;
}
