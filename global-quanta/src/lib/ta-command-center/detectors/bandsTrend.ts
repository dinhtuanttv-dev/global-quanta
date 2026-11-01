// Bollinger Bands và SuperTrend (lớp phủ giá, mặc định tắt). Hàm thuần: giá trị tại nến i chỉ dùng dữ liệu đến nến i.
import { atrSeries } from "../../quant-core/math";
import type { OhlcvBar } from "../types";

export const BB_COLORS = { upper: "#38bdf8", mid: "#94a3b8", lower: "#38bdf8" } as const;
export const ST_COLORS = { up: "#34d399", down: "#fb7185" } as const;

export interface BollingerParams { period: number; mult: number }
export interface BollingerResult { upper: (number | null)[]; mid: (number | null)[]; lower: (number | null)[] }

/** SMA ± mult × độ lệch chuẩn tổng thể của `period` giá đóng cửa (công thức gốc của John Bollinger). */
export function bollingerBands(bars: OhlcvBar[], { period, mult }: BollingerParams): BollingerResult {
  const n = bars.length;
  const upper: (number | null)[] = new Array(n).fill(null), mid = [...upper], lower = [...upper];
  let sum = 0, sq = 0;
  for (let i = 0; i < n; i++) {
    const c = bars[i].close;
    sum += c; sq += c * c;
    if (i >= period) { const o = bars[i - period].close; sum -= o; sq -= o * o; }
    if (i < period - 1) continue;
    const m = sum / period;
    const sd = Math.sqrt(Math.max(0, sq / period - m * m));
    mid[i] = m; upper[i] = m + mult * sd; lower[i] = m - mult * sd;
  }
  return { upper, mid, lower };
}

export interface SuperTrendParams { period: number; mult: number }
export interface SuperTrendResult {
  /** Đường tại nến i: dải dưới khi xu hướng tăng, dải trên khi xu hướng giảm. */
  line: (number | null)[];
  /** 1 tăng, −1 giảm. */
  dir: (1 | -1 | null)[];
  /** Tách theo chiều để vẽ hai màu; đổi chiều thì đứt nét, không nối hai dải. */
  up: (number | null)[]; down: (number | null)[];
}

/** SuperTrend chuẩn: (H+L)/2 ± mult × ATR Wilder, dải cuối chỉ siết lại, đảo chiều khi giá đóng cửa vượt dải. */
export function superTrend(bars: OhlcvBar[], { period, mult }: SuperTrendParams): SuperTrendResult {
  const n = bars.length;
  const line: (number | null)[] = new Array(n).fill(null), up = [...line], down = [...line];
  const dir: (1 | -1 | null)[] = new Array(n).fill(null);
  if (n < period) return { line, dir, up, down };
  const atr = atrSeries(bars, period);
  let upper = Infinity, lower = -Infinity, d: 1 | -1 = 1;
  for (let i = period - 1; i < n; i++) {
    const b = bars[i], hl2 = (b.high + b.low) / 2;
    const rawUp = hl2 + mult * atr[i], rawLo = hl2 - mult * atr[i];
    const prevClose = i > period - 1 ? bars[i - 1].close : null;
    const nextUpper = prevClose != null && upper !== Infinity && !(rawUp < upper || prevClose > upper) ? upper : rawUp;
    const nextLower = prevClose != null && lower !== -Infinity && !(rawLo > lower || prevClose < lower) ? lower : rawLo;
    if (prevClose != null) {
      if (d === -1 && b.close > upper) d = 1;
      else if (d === 1 && b.close < lower) d = -1;
    } else d = b.close >= hl2 ? 1 : -1;
    upper = nextUpper; lower = nextLower;
    const v = d === 1 ? lower : upper;
    line[i] = v; dir[i] = d;
    if (d === 1) up[i] = v; else down[i] = v;
  }
  return { line, dir, up, down };
}
