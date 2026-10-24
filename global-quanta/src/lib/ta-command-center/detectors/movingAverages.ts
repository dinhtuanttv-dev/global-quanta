import type { OhlcvBar } from "../types";

// Bộ đường trung bình + Ichimoku Kinko Hyo (yêu cầu 25/10/2026) — công thức chuẩn, tính từ OHLCV, mọi giá trị tại nến t chỉ dùng
// bars[0..t]. Riêng Ichimoku: Senkou A/B tính tại t nhưng VẼ dịch +26 kỳ (vùng tương lai — đã biết tại t); Chikou là giá đóng cửa
// vẽ lùi −26 kỳ (quy ước hiển thị của Hosoda, không phải tín hiệu tại nến được vẽ).

/** EMA, khởi tạo bằng SMA của `period` giá trị đầu (cùng quy ước với MACD của chart). */
export function ema(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let e = values.slice(0, period).reduce((s, v) => s + v, 0) / period;
  out[period - 1] = e;
  for (let i = period; i < values.length; i++) { e = values[i] * k + e * (1 - k); out[i] = e; }
  return out;
}

/** SMA trượt (cộng dồn — O(n)). */
export function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  let s = 0;
  for (let i = 0; i < values.length; i++) {
    s += values[i];
    if (i >= period) s -= values[i - period];
    if (i >= period - 1) out[i] = s / period;
  }
  return out;
}

export const MA_SET = [
  { id: "ema21", label: "EMA 21", kind: "ema", period: 21, color: "#3b82f6" },   // xanh dương
  { id: "ema50", label: "EMA 50", kind: "ema", period: 50, color: "#facc15" },   // vàng
  { id: "ema100", label: "EMA 100", kind: "ema", period: 100, color: "#a855f7" }, // tím
  { id: "ma200", label: "MA 200", kind: "sma", period: 200, color: "#fca5a5" },   // đỏ nhạt
] as const;
export type MaId = (typeof MA_SET)[number]["id"];

export function movingAverageSet(bars: OhlcvBar[]): Record<MaId, (number | null)[]> {
  const c = bars.map((b) => b.close);
  return Object.fromEntries(MA_SET.map((m) => [m.id, m.kind === "ema" ? ema(c, m.period) : sma(c, m.period)])) as Record<MaId, (number | null)[]>;
}

export interface IchimokuParams { tenkan: number; kijun: number; senkouB: number; shift: number }
export const ICHIMOKU_DEFAULT: IchimokuParams = { tenkan: 9, kijun: 26, senkouB: 52, shift: 26 };
export interface IchimokuResult {
  tenkan: (number | null)[]; kijun: (number | null)[];
  /** Senkou A / B TÍNH tại nến i — vẽ tại i + shift. */
  spanA: (number | null)[]; spanB: (number | null)[];
  /** Chikou: close[i + shift] vẽ tại nến i (null cho `shift` nến cuối). */
  chikou: (number | null)[];
  shift: number;
}

/** Trung điểm (đỉnh cao nhất + đáy thấp nhất) / 2 của `period` nến kết thúc tại i. */
function midline(bars: OhlcvBar[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(bars.length).fill(null);
  for (let i = period - 1; i < bars.length; i++) {
    let hi = -Infinity, lo = Infinity;
    for (let j = i - period + 1; j <= i; j++) { if (bars[j].high > hi) hi = bars[j].high; if (bars[j].low < lo) lo = bars[j].low; }
    out[i] = (hi + lo) / 2;
  }
  return out;
}

export function ichimoku(bars: OhlcvBar[], p: IchimokuParams = ICHIMOKU_DEFAULT): IchimokuResult {
  const tenkan = midline(bars, p.tenkan), kijun = midline(bars, p.kijun), spanB = midline(bars, p.senkouB);
  const spanA = tenkan.map((t, i) => (t != null && kijun[i] != null ? (t + (kijun[i] as number)) / 2 : null));
  const chikou = bars.map((_, i) => (i + p.shift < bars.length ? bars[i + p.shift].close : null));
  return { tenkan, kijun, spanA, spanB, chikou, shift: p.shift };
}
