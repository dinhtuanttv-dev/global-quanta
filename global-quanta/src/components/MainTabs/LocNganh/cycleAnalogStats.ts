// Thống kê các giai đoạn tương tự của Cycle Fingerprint: trung vị và dải phân bố có trọng số, kiểm tra biên độ.
// Dùng trung vị vì trung bình dễ bị một giai đoạn ngoại lệ kéo lệch. Đây là mô tả lịch sử, không phải dự báo.
import type { CycleV2Neighbor } from '../../../types/cycleFingerprintV2';

export const AMPLITUDE_RATIO = 2;
export const AMPLITUDE_MIN_PCT = 15;
export type HorizonKey = 'd10' | 'd20' | 'd40' | 'd60';

/** Phân vị có trọng số: giá trị nhỏ nhất có tổng trọng số luỹ kế đạt q. */
export function weightedQuantile(items: { v: number; w: number }[], q: number): number | null {
  const s = items.filter((x) => Number.isFinite(x.v) && x.w > 0).sort((a, b) => a.v - b.v);
  if (!s.length) return null;
  const total = s.reduce((a, x) => a + x.w, 0);
  let cum = 0;
  for (const x of s) { cum += x.w; if (cum >= q * total - 1e-12) return x.v; }
  return s[s.length - 1].v;
}

export interface AnalogSummary { median: number | null; p10: number | null; p90: number | null; shareUp: number | null; n: number }

/** Phân bố lợi suất vượt VN-Index của các giai đoạn tại một kỳ. Trọng số thiếu tính là 1. */
export function summarizeAnalogs(neighbors: CycleV2Neighbor[], key: HorizonKey): AnalogSummary {
  const items = neighbors.flatMap((n) => { const v = n.excess[key]; return v == null ? [] : [{ v, w: n.weight ?? 1 }]; });
  const total = items.reduce((a, x) => a + x.w, 0);
  return {
    median: weightedQuantile(items, 0.5), p10: weightedQuantile(items, 0.1), p90: weightedQuantile(items, 0.9),
    shareUp: total > 0 ? items.filter((x) => x.v > 0).reduce((a, x) => a + x.w, 0) / total : null, n: items.length,
  };
}

/** Biến động trong cửa sổ, đơn vị %, từ chuỗi base 100. */
export function windowMovePct(pattern: number[]): number | null {
  if (pattern.length < 2 || !(pattern[0] > 0)) return null;
  return (pattern[pattern.length - 1] / pattern[0] - 1) * 100;
}

/** Hình dạng giống nhưng biên độ khác hẳn: gấp từ 2 lần trở lên và lớn hơn 15%. So hình dạng đã chuẩn hóa nên engine không phân biệt được điều này. */
export function amplitudeMismatch(currentMove: number | null, neighborMove: number | null): boolean {
  if (currentMove == null || neighborMove == null) return false;
  return Math.abs(neighborMove) > AMPLITUDE_MIN_PCT && Math.abs(neighborMove) >= AMPLITUDE_RATIO * Math.abs(currentMove);
}
