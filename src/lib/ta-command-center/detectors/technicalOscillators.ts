import type { OhlcvBar } from "../types";

export interface RsiResult { series: (number | null)[]; latest: number | null; }
export interface MacdResult {
  macdLine: (number | null)[]; signalLine: (number | null)[]; histogram: (number | null)[];
  latest: { macd: number | null; signal: number | null; histogram: number | null };
}
export interface AdxResult { series: (number | null)[]; latest: number | null; trendStrength: "yeu" | "trung_binh" | "manh" | "rat_manh"; }

// 3 chi bao ky thuat chuan - cong thuc dung, tinh truc tiep tu OHLCV that.
// Khac Wyckoff/Elliott, day la HARD_DATA (khong mang tinh suy luan chu quan).

function calculateEMA(values: number[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < period) return result;
  const k = 2 / (period + 1);
  let ema = values.slice(0, period).reduce((s, v) => s + v, 0) / period;
  result[period - 1] = ema;
  for (let i = period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
    result[i] = ema;
  }
  return result;
}

export function calculateRSI(bars: OhlcvBar[], period = 14): RsiResult {
  const closes = bars.map((b) => b.close);
  const series: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length < period + 1) return { series, latest: null };

  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const delta = closes[i] - closes[i - 1];
    if (delta >= 0) avgGain += delta; else avgLoss -= delta;
  }
  avgGain /= period; avgLoss /= period;
  series[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < closes.length; i++) {
    const delta = closes[i] - closes[i - 1];
    const gain = delta >= 0 ? delta : 0;
    const loss = delta < 0 ? -delta : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    series[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }

  return { series, latest: series[series.length - 1] };
}

export function calculateMACD(bars: OhlcvBar[], fast = 12, slow = 26, signalPeriod = 9): MacdResult {
  const closes = bars.map((b) => b.close);
  const emaFast = calculateEMA(closes, fast);
  const emaSlow = calculateEMA(closes, slow);
  const macdLine: (number | null)[] = closes.map((_, i) =>
    emaFast[i] !== null && emaSlow[i] !== null ? (emaFast[i] as number) - (emaSlow[i] as number) : null
  );

  const macdValuesOnly = macdLine.filter((v): v is number => v !== null);
  const signalRaw = calculateEMA(macdValuesOnly, signalPeriod);
  const signalLine: (number | null)[] = new Array(macdLine.length).fill(null);
  let signalIdx = 0;
  for (let i = 0; i < macdLine.length; i++) {
    if (macdLine[i] !== null) {
      signalLine[i] = signalRaw[signalIdx] ?? null;
      signalIdx++;
    }
  }

  const histogram: (number | null)[] = macdLine.map((v, i) =>
    v !== null && signalLine[i] !== null ? v - (signalLine[i] as number) : null
  );

  const lastIdx = macdLine.length - 1;
  return {
    macdLine, signalLine, histogram,
    latest: { macd: macdLine[lastIdx], signal: signalLine[lastIdx], histogram: histogram[lastIdx] },
  };
}

export function calculateADX(bars: OhlcvBar[], period = 14): AdxResult {
  const series: (number | null)[] = new Array(bars.length).fill(null);
  if (bars.length < period * 2) return { series, latest: null, trendStrength: "yeu" };

  const plusDM: number[] = [0];
  const minusDM: number[] = [0];
  const tr: number[] = [0];

  for (let i = 1; i < bars.length; i++) {
    const upMove = bars[i].high - bars[i - 1].high;
    const downMove = bars[i - 1].low - bars[i].low;
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
    tr.push(Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - bars[i - 1].close),
      Math.abs(bars[i].low - bars[i - 1].close)
    ));
  }

  const smooth = (arr: number[]): number[] => {
    const out: number[] = new Array(arr.length).fill(0);
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

  const dx: (number | null)[] = new Array(bars.length).fill(null);
  for (let i = period; i < bars.length; i++) {
    if (smoothTR[i] === 0) continue;
    const plusDI = (smoothPlusDM[i] / smoothTR[i]) * 100;
    const minusDI = (smoothMinusDM[i] / smoothTR[i]) * 100;
    const diSum = plusDI + minusDI;
    dx[i] = diSum === 0 ? 0 : (Math.abs(plusDI - minusDI) / diSum) * 100;
  }

  const validDx = dx.filter((v): v is number => v !== null);
  if (validDx.length < period) return { series, latest: null, trendStrength: "yeu" };

  let adx = validDx.slice(0, period).reduce((s, v) => s + v, 0) / period;
  let dxIdx = period;
  const firstAdxBarIdx = dx.findIndex((v) => v !== null) + period - 1;
  if (firstAdxBarIdx >= 0 && firstAdxBarIdx < series.length) series[firstAdxBarIdx] = adx;

  for (let i = firstAdxBarIdx + 1; i < bars.length; i++) {
    if (dx[i] === null) continue;
    adx = (adx * (period - 1) + (dx[i] as number)) / period;
    series[i] = adx;
  }

  const latest = series[series.length - 1];
  let trendStrength: AdxResult["trendStrength"] = "yeu";
  if (latest !== null) {
    if (latest >= 50) trendStrength = "rat_manh";
    else if (latest >= 25) trendStrength = "manh";
    else if (latest >= 15) trendStrength = "trung_binh";
  }

  return { series, latest, trendStrength };
}
