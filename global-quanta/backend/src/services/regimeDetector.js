// regimeDetector.js — Thay Math.random() bằng phân loại chế độ thị trường
// THẬT dựa trên ADX (sức mạnh xu hướng) và ATR percentile (biến động so với
// lịch sử của chính mã đó). Đây là 2 chỉ báo đã dùng ở nơi khác trong hệ
// thống (technicalOscillators.ts phía frontend) — cùng công thức, khác
// ngôn ngữ (JS thuần cho backend, không phụ thuộc React).

const ADX_PERIOD = 14;
const ATR_PERIOD = 14;
const ATR_LOOKBACK_FOR_PERCENTILE = 100; // so ATR hiện tại với 100 phiên gần nhất

function trueRange(bars, i) {
  if (i === 0) return bars[0].high - bars[0].low;
  return Math.max(
    bars[i].high - bars[i].low,
    Math.abs(bars[i].high - bars[i - 1].close),
    Math.abs(bars[i].low - bars[i - 1].close)
  );
}

function calcATRSeries(bars, period = ATR_PERIOD) {
  const atr = new Array(bars.length).fill(0);
  let sum = 0;
  for (let i = 0; i < bars.length; i++) {
    const tr = trueRange(bars, i);
    sum += tr;
    if (i >= period) sum -= trueRange(bars, i - period);
    atr[i] = sum / Math.min(i + 1, period);
  }
  return atr;
}

function calcADX(bars, period = ADX_PERIOD) {
  if (bars.length < period * 2) return null;

  const plusDM = [0];
  const minusDM = [0];
  const tr = [0];
  for (let i = 1; i < bars.length; i++) {
    const upMove = bars[i].high - bars[i - 1].high;
    const downMove = bars[i - 1].low - bars[i].low;
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
    tr.push(trueRange(bars, i));
  }

  const smooth = (arr) => {
    const out = new Array(arr.length).fill(0);
    let sum = arr.slice(1, period + 1).reduce((s, v) => s + v, 0);
    out[period] = sum;
    for (let i = period + 1; i < arr.length; i++) {
      sum = sum - sum / period + arr[i];
      out[i] = sum;
    }
    return out;
  };

  const smoothTR = smooth(tr);
  const smoothPlusDM = smooth(plusDM);
  const smoothMinusDM = smooth(minusDM);

  let adx = null;
  const dxValues = [];
  for (let i = period; i < bars.length; i++) {
    if (smoothTR[i] === 0) continue;
    const plusDI = (smoothPlusDM[i] / smoothTR[i]) * 100;
    const minusDI = (smoothMinusDM[i] / smoothTR[i]) * 100;
    const diSum = plusDI + minusDI;
    const dx = diSum === 0 ? 0 : (Math.abs(plusDI - minusDI) / diSum) * 100;
    dxValues.push(dx);
  }
  if (dxValues.length < period) return null;

  adx = dxValues.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (let i = period; i < dxValues.length; i++) {
    adx = (adx * (period - 1) + dxValues[i]) / period;
  }
  return adx;
}

function percentileRank(series, value) {
  const sorted = [...series].sort((a, b) => a - b);
  const countBelow = sorted.filter((v) => v <= value).length;
  return (countBelow / sorted.length) * 100;
}

/**
 * @param {Array<{high:number, low:number, close:number}>} bars - nến lịch sử thật (KHÔNG dùng mock)
 * @returns {"Trending" | "Sideway" | "Volatility Spike" | "Undetermined"}
 */
export function detectRegime(bars) {
  if (!Array.isArray(bars) || bars.length < ADX_PERIOD * 2) return "Undetermined";

  const adx = calcADX(bars);
  const atrSeries = calcATRSeries(bars);
  const recentAtr = atrSeries[atrSeries.length - 1];
  const atrHistory = atrSeries.slice(-ATR_LOOKBACK_FOR_PERCENTILE);
  const atrPercentile = percentileRank(atrHistory, recentAtr);

  // Biến động đang ở top 15% lịch sử gần đây -> ưu tiên gắn nhãn "Volatility
  // Spike" trước, bất kể ADX (vì biến động đột biến thường làm nhiễu ADX).
  if (atrPercentile >= 85) return "Volatility Spike";
  if (adx === null) return "Undetermined";
  if (adx >= 25) return "Trending";
  return "Sideway";
}
