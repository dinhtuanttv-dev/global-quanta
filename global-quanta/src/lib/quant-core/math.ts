// @gq/quant-core · toán học nền (thuần TypeScript, không phụ thuộc DOM — chạy được trong Worker/Node).
// Mọi chuỗi đều POINT-IN-TIME: giá trị tại i chỉ dùng dữ liệu ≤ i (z-score dùng cửa sổ TRƯỚC i).

export interface Bar { date: string; open: number; high: number; low: number; close: number; volume: number }
export type Dir = "bullish" | "bearish";

/** True Range Wilder. */
export function trueRange(bars: Bar[], i: number): number {
  const b = bars[i];
  if (i === 0) return b.high - b.low;
  const pc = bars[i - 1].close;
  return Math.max(b.high - b.low, Math.abs(b.high - pc), Math.abs(b.low - pc));
}

/** ATR Wilder (RMA). Trước khi đủ `period` nến: trung bình TR đã có (không nhìn trước). */
export function atrSeries(bars: Bar[], period = 14): number[] {
  const out = new Array<number>(bars.length).fill(0);
  let sum = 0;
  let atr = 0;
  for (let i = 0; i < bars.length; i++) {
    const tr = trueRange(bars, i);
    if (i < period) {
      sum += tr;
      atr = sum / (i + 1);
    } else {
      atr = (atr * (period - 1) + tr) / period;
    }
    out[i] = atr;
  }
  return out;
}

export function emaSeries(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  const k = 2 / (period + 1);
  let ema = NaN;
  for (let i = 0; i < values.length; i++) {
    ema = i === 0 ? values[0] : values[i] * k + ema * (1 - k);
    out[i] = ema;
  }
  return out;
}

/** z-score của x[i] so với cửa sổ `window` phần tử ĐỨNG TRƯỚC i. null khi chưa đủ dữ liệu hoặc độ lệch = 0. */
export function trailingZ(values: number[], i: number, window: number): number | null {
  if (i < window) return null;
  let s = 0;
  let s2 = 0;
  for (let j = i - window; j < i; j++) { s += values[j]; s2 += values[j] * values[j]; }
  const mean = s / window;
  const variance = s2 / window - mean * mean;
  if (!(variance > 1e-12)) return null;
  return (values[i] - mean) / Math.sqrt(variance);
}

export const logVolumes = (bars: Bar[]): number[] => bars.map((b) => Math.log(Math.max(0, b.volume) + 1));
export const spreads = (bars: Bar[]): number[] => bars.map((b) => b.high - b.low);

/** Close Location Value: 0 = đóng cửa ở đáy nến, 1 = ở đỉnh. */
export function clv(b: Bar): number {
  const r = b.high - b.low;
  return r > 0 ? (b.close - b.low) / r : 0.5;
}

/** Bước giá: HOSE < 10.000đ → 10đ; < 50.000đ → 50đ; còn lại 100đ. Chỉ số → 0,01 điểm. */
export function tickSize(price: number, isIndex = false): number {
  if (isIndex) return 0.01;
  return price < 10_000 ? 10 : price < 50_000 ? 50 : 100;
}

/** Nến bị khoá trần/sàn (gap do biên độ, không phải mất cân bằng cung cầu tự nhiên). */
export function isLimitLocked(bars: Bar[], i: number, limitPct: number | null): boolean {
  if (!limitPct || i === 0) return false;
  const b = bars[i];
  const pc = bars[i - 1].close;
  if (!(pc > 0)) return false;
  const move = Math.abs(b.close / pc - 1);
  return move >= limitPct - 0.003 && (b.close === b.high || b.close === b.low);
}
