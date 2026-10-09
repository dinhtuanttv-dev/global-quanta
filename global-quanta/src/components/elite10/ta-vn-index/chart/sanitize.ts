// Làm sạch dữ liệu trước khi đưa vào lightweight-charts (Elite 10).
// Lỗi "Value is null" (lightweight-charts 4.2.3, hàm tô màu nến) xảy ra khi chỉ số nến bị lệch: một series khác (đường xu hướng,
// marker…) chèn mốc thời gian KHÔNG có nến (VD mốc giả rơi vào Chủ nhật của route analyze khi analysisIsMock), hoặc nến có giá
// không hữu hạn. Đồng thời đường giá vô lý (kịch bản mẫu 29.700 trên VN-Index ~1.700) làm trục giá giãn, nén nến.
import type { LineData, SeriesMarker, Time, WhitespaceData } from "lightweight-charts";
import type { OhlcBar } from "../../../../types/taVnIndex";

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const key = (t: unknown) => (typeof t === "object" && t !== null ? JSON.stringify(t) : String(t));

/** Nến hợp lệ: OHLC hữu hạn, cao ≥ max(mở, đóng), thấp ≤ min(mở, đóng); sắp theo thời gian, bỏ trùng (giữ bản sau). */
export function cleanCandles(bars: OhlcBar[]): OhlcBar[] {
  const byTime = new Map<string, OhlcBar>();
  for (const b of bars ?? []) {
    if (!b || b.time == null || ![b.open, b.high, b.low, b.close].every(finite)) continue;
    byTime.set(key(b.time), { ...b, high: Math.max(b.high, b.open, b.close), low: Math.min(b.low, b.open, b.close) });
  }
  return [...byTime.values()].sort((a, b) => (key(a.time) < key(b.time) ? -1 : key(a.time) > key(b.time) ? 1 : 0));
}

/** Tập mốc thời gian của nến — series phụ / marker chỉ được dùng các mốc này (không chèn điểm lạ vào trục thời gian). */
export const candleTimes = (bars: OhlcBar[]) => new Set(bars.map((b) => key(b.time)));

/** Điểm của series đường: chỉ giữ mốc có nến; giá trị không hữu hạn -> bỏ. Sắp + bỏ trùng. */
export function alignLine(data: (LineData | WhitespaceData)[], times: Set<string> | null): (LineData | WhitespaceData)[] {
  const byTime = new Map<string, LineData | WhitespaceData>();
  for (const p of data ?? []) {
    if (!p || p.time == null) continue;
    if (times && !times.has(key(p.time))) continue;
    if ("value" in p && !finite((p as LineData).value)) continue;
    byTime.set(key(p.time), p);
  }
  return [...byTime.values()].sort((a, b) => (key(a.time) < key(b.time) ? -1 : key(a.time) > key(b.time) ? 1 : 0));
}

/** Marker chỉ ở mốc có nến. */
export function alignMarkers(markers: SeriesMarker<Time>[] | undefined, times: Set<string>): SeriesMarker<Time>[] {
  return (markers ?? []).filter((m) => m && times.has(key(m.time))).sort((a, b) => (key(a.time) < key(b.time) ? -1 : 1));
}

/**
 * Đường giá hợp lý: hữu hạn, > 0 và nằm trong [thấp nhất ÷ 2, cao nhất × 2] của chuỗi nến.
 * Ngoài khoảng (VD kịch bản mẫu của mã khác) -> không vẽ, tránh giãn trục giá.
 */
export function plausiblePrice(price: unknown, bars: OhlcBar[]): price is number {
  if (!finite(price) || price <= 0 || !bars.length) return false;
  let lo = Infinity, hi = -Infinity;
  for (const b of bars) { if (finite(b.low) && b.low < lo) lo = b.low; if (finite(b.high) && b.high > hi) hi = b.high; }
  return Number.isFinite(lo) && price >= lo / 2 && price <= hi * 2;
}
