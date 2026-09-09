// technicalOscillators.js — RSI/MACD/ADX tính THẬT bằng công thức chuẩn
// (Wilder's smoothing), không qua AI. Đây là phần thay thế cho việc trước
// đây để Vision AI "đọc" giá trị RSI/MACD từ ảnh chụp biểu đồ — số liệu
// giờ được tính trực tiếp từ historicalCandles thật, chính xác 100% và
// nhanh hơn nhiều so với gọi AI.

function calcEMA(values, period) {
  const k = 2 / (period + 1);
  const ema = new Array(values.length).fill(null);
  let prev = values[0];
  ema[0] = prev;
  for (let i = 1; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    ema[i] = prev;
  }
  return ema;
}

function calcRSI(candles, period = 14) {
  if (candles.length < period + 1) return null;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < candles.length; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return Math.round((100 - 100 / (1 + rs)) * 10) / 10;
}

function calcMACD(candles, fast = 12, slow = 26, signalPeriod = 9) {
  if (candles.length < slow + signalPeriod) return null;
  const closes = candles.map((c) => c.close);
  const emaFast = calcEMA(closes, fast);
  const emaSlow = calcEMA(closes, slow);
  const macdLine = closes.map((_, i) => emaFast[i] - emaSlow[i]);
  const signalLine = calcEMA(macdLine, signalPeriod);
  const last = macdLine.length - 1;
  const value = Math.round(macdLine[last]);
  const signal = Math.round(signalLine[last]);
  return { value, signal, histogram: value - signal, label: value > signal ? "Bullish" : "Bearish" };
}

function calcADX(candles, period = 14) {
  if (candles.length < period * 2) return null;
  const tr = [0];
  const plusDM = [0];
  const minusDM = [0];
  for (let i = 1; i < candles.length; i++) {
    const upMove = candles[i].high - candles[i - 1].high;
    const downMove = candles[i - 1].low - candles[i].low;
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
    tr.push(
      Math.max(
        candles[i].high - candles[i].low,
        Math.abs(candles[i].high - candles[i - 1].close),
        Math.abs(candles[i].low - candles[i - 1].close)
      )
    );
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

  const dxValues = [];
  for (let i = period; i < candles.length; i++) {
    if (smoothTR[i] === 0) continue;
    const plusDI = (smoothPlusDM[i] / smoothTR[i]) * 100;
    const minusDI = (smoothMinusDM[i] / smoothTR[i]) * 100;
    const diSum = plusDI + minusDI;
    dxValues.push(diSum === 0 ? 0 : (Math.abs(plusDI - minusDI) / diSum) * 100);
  }
  if (dxValues.length < period) return null;

  let adx = dxValues.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (let i = period; i < dxValues.length; i++) {
    adx = (adx * (period - 1) + dxValues[i]) / period;
  }
  return { value: Math.round(adx * 10) / 10, signal: adx >= 25 ? "trending" : "neutral" };
}

/** Tổng hợp cả 3 chỉ báo, dùng ngay trong scan.js. */
export function computeOscillators(candles) {
  return {
    rsi: calcRSI(candles),
    macd: calcMACD(candles),
    adx: calcADX(candles),
  };
}
