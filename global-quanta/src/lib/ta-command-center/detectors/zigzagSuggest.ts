import type { OhlcvBar } from "../types";
import type { DomainPoint } from "../DrawingManager";

// ĐÃ THÊM — Nâng cấp Elliott Wave: thay vì bắt người dùng tự click đủ 6
// điểm từ đầu, tự động đề xuất 6 điểm ứng viên dựa trên các đỉnh/đáy
// (swing pivot) THẬT gần nhất trên biểu đồ — người dùng chỉ cần bấm 1 nút
// để tạo ngay 1 bản nháp, sau đó có thể xóa/vẽ lại nếu không đồng ý. Vẫn
// giữ đúng triết lý "người xác nhận, AI chỉ hỗ trợ" — không tự động công
// bố kết luận Elliott mà không qua bước người dùng chấp nhận.

interface ZigzagPivot {
  index: number;
  date: string;
  price: number;
  type: "high" | "low";
}

const PIVOT_LOOKBACK = 4; // cửa sổ nhỏ hơn BOS (5) — cần nhạy hơn để bắt đủ pivot nhỏ cho Elliott

/** Phát hiện toàn bộ đỉnh/đáy xen kẽ (zigzag) trên chuỗi nến. */
function detectZigzagPivots(bars: OhlcvBar[]): ZigzagPivot[] {
  const raw: ZigzagPivot[] = [];
  for (let i = PIVOT_LOOKBACK; i < bars.length - PIVOT_LOOKBACK; i++) {
    const window = bars.slice(i - PIVOT_LOOKBACK, i + PIVOT_LOOKBACK + 1);
    if (window.every((b) => bars[i].high >= b.high)) {
      raw.push({ index: i, date: bars[i].date, price: bars[i].high, type: "high" });
    }
    if (window.every((b) => bars[i].low <= b.low)) {
      raw.push({ index: i, date: bars[i].date, price: bars[i].low, type: "low" });
    }
  }
  raw.sort((a, b) => a.index - b.index);

  // Lọc để đảm bảo XEN KẼ đúng cao-thấp-cao-thấp (zigzag thật) — nếu 2
  // đỉnh liên tiếp không có đáy chen giữa, chỉ giữ đỉnh cao hơn (và tương
  // tự cho đáy) — tránh Elliott bị lệch do 2 pivot cùng loại sát nhau.
  const cleaned: ZigzagPivot[] = [];
  for (const pivot of raw) {
    const last = cleaned[cleaned.length - 1];
    if (!last) { cleaned.push(pivot); continue; }
    if (last.type === pivot.type) {
      if (pivot.type === "high" ? pivot.price > last.price : pivot.price < last.price) {
        cleaned[cleaned.length - 1] = pivot;
      }
    } else {
      cleaned.push(pivot);
    }
  }
  return cleaned;
}

/**
 * Gợi ý 6 điểm ứng viên cho Elliott Wave (đủ 1 chu kỳ 5 sóng đẩy: 0-1-2-3-4-5)
 * — lấy đúng 6 pivot xen kẽ GẦN NHẤT. Trả về null nếu chưa đủ dữ liệu.
 */
export function suggestElliottPoints(bars: OhlcvBar[]): DomainPoint[] | null {
  const pivots = detectZigzagPivots(bars);
  if (pivots.length < 6) return null;
  const last6 = pivots.slice(-6);
  return last6.map((p) => ({ date: p.date, price: p.price }));
}
