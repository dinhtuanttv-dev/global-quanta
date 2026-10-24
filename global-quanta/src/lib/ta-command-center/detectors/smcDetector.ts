import type { OhlcvBar } from "../types";

// Bộ phát hiện SMC cũ (OB/FVG/BOS/CHoCH/thanh khoản) đã gỡ: chart dùng quant-core (point-in-time). Bản cũ dùng swing
// CHƯA xác nhận (cửa sổ đối xứng ±5 nến) để báo phá cấu trúc -> nhìn trước dữ liệu. Chỉ giữ tiện ích đếm lần test vùng vẽ tay.

/** ĐÃ THÊM — đếm số lần giá quay lại "test" 1 vùng giá (dùng cho
 * Demand/Supply Zone vẽ tay). Chỉ đếm khi giá VỪA chạm vào vùng sau 1
 * khoảng không chạm (tránh đếm trùng nhiều nến liên tiếp nằm sẵn trong
 * vùng thành nhiều lần test). Độ tin cậy của vùng giảm dần theo số lần
 * test — đúng nguyên lý SMC/ICT chuẩn: vùng bị "cày" nhiều lần thì lệnh
 * chờ tại đó đã cạn dần, không còn nguyên vẹn như lúc mới hình thành. */
export function countZoneTests(bars: OhlcvBar[], top: number, bottom: number, sinceDate: string): number {
  let count = 0;
  let wasInside = false;
  for (const b of bars) {
    if (b.date <= sinceDate) continue;
    const touches = b.low <= top && b.high >= bottom;
    if (touches && !wasInside) count++;
    wasInside = touches;
  }
  return count;
}
