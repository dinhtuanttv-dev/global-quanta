// @gq/quant-core · MTF v3 — chuỗi nền dùng chung cho khung Ngày / Tuần / Tháng (MTF-v3-prereg.md). Mọi giá trị tại nến t chỉ dùng
// bars[0..t]; thiếu dữ liệu -> NaN (không ước lượng). EMA cùng quy ước với đường EMA trên biểu đồ (hạt giống = SMA `period` nến đầu)
// để số trên bảng MTF trùng khớp với đường vẽ.
import type { Bar } from "../math";
import { weekKey } from "../mtf/align";

export type Tf3 = "D" | "W" | "M";

/** EMA hạt giống SMA: NaN trước nến period−1; bỏ qua giá trị không hữu hạn ở phần đầu. */
export function ema(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let e = 0;
  for (let i = 0; i < period; i++) e += values[i];
  e /= period;
  out[period - 1] = e;
  for (let i = period; i < values.length; i++) { e = values[i] * k + e * (1 - k); out[i] = e; }
  return out;
}

/** SMA trượt O(n); NaN khi chưa đủ `period` nến. */
export function sma(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  let s = 0;
  for (let i = 0; i < values.length; i++) {
    s += values[i];
    if (i >= period) s -= values[i - period];
    if (i >= period - 1) out[i] = s / period;
  }
  return out;
}

/** ATR Wilder: hạt giống = TB true range `period` nến đầu; NaN trước đó. */
export function atr(bars: Bar[], period = 14): number[] {
  const n = bars.length, out = new Array<number>(n).fill(NaN);
  if (n < period) return out;
  const tr = bars.map((b, i) => (i === 0 ? b.high - b.low : Math.max(b.high - b.low, Math.abs(b.high - bars[i - 1].close), Math.abs(b.low - bars[i - 1].close))));
  let a = 0;
  for (let i = 0; i < period; i++) a += tr[i];
  a /= period;
  out[period - 1] = a;
  for (let i = period; i < n; i++) { a = (a * (period - 1) + tr[i]) / period; out[i] = a; }
  return out;
}

export const monthKey = (date: string) => date.slice(0, 7);
const keyOf: Record<Exclude<Tf3, "D">, (d: string) => string> = { W: weekKey, M: monthKey };

/** Gộp nến ngày thành nến tuần / tháng; ngày của nến gộp = phiên cuối kỳ. Kỳ cuối có thể CHƯA đóng — dùng closedIndex khi ghép. */
export function aggregate(daily: Bar[], tf: Exclude<Tf3, "D">): Bar[] {
  const key = keyOf[tf], out: Bar[] = [];
  let cur = "";
  for (const b of daily) {
    const k = key(b.date), last = out[out.length - 1];
    if (k !== cur || !last) { out.push({ ...b }); cur = k; continue; }
    last.high = Math.max(last.high, b.high); last.low = Math.min(last.low, b.low);
    last.close = b.close; last.volume += b.volume; last.date = b.date;
  }
  return out;
}

/**
 * Với mỗi nến ngày: chỉ số nến khung lớn ĐÃ ĐÓNG gần nhất (−1 nếu chưa có) = kỳ có khoá < kỳ của ngày đó. Nến tuần/tháng được dùng từ
 * phiên ĐẦU của kỳ sau (không đoán phiên cuối kỳ bằng lịch) -> kết quả trên bars[0..t] trùng với trên toàn chuỗi.
 */
export function closedIndex(daily: Bar[], htf: Bar[], tf: Exclude<Tf3, "D">): number[] {
  const key = keyOf[tf], hk = htf.map((b) => key(b.date)), out = new Array<number>(daily.length).fill(-1);
  let j = -1;
  for (let i = 0; i < daily.length; i++) {
    const k = key(daily[i].date);
    while (j + 1 < htf.length && hk[j + 1] < k) j++;
    out[i] = j;
  }
  return out;
}

/** Phân vị (0–100) của x[i] trong cửa sổ `window` giá trị hữu hạn ĐỨNG TRƯỚC i; null nếu < window/2 giá trị. */
export function trailingPct(x: number[], i: number, window: number): number | null {
  if (!Number.isFinite(x[i])) return null;
  let below = 0, eq = 0, n = 0;
  for (let j = Math.max(0, i - window); j < i; j++) {
    const v = x[j];
    if (!Number.isFinite(v)) continue;
    n++;
    if (v < x[i]) below++; else if (v === x[i]) eq++;
  }
  return n >= window / 2 ? ((below + eq / 2) / n) * 100 : null;
}
