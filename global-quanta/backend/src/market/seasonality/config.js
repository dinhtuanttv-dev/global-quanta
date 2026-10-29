// MV1 — cấu hình phương pháp mùa vụ tháng `SEAS-v1` (đã duyệt 25/10/2026: DEC-1…DEC-3). Đổi bất kỳ hằng số nào = phiên bản mới.
export const SEAS = Object.freeze({
  version: "SEAS-v1",
  /** "5 năm gần nhất" = 5 năm DƯƠNG LỊCH đã hoàn tất trước năm của ngày dữ liệu (DEC-2). */
  years: 5,
  /** Phiên cuối tháng phải rơi từ ngày 20 trở đi (tháng có dữ liệu tới cuối tháng; Tết / tạm ngừng giao dịch dài -> bỏ tháng). */
  monthEndMinDay: 20,
  /** Mục tiêu xác suất (DEC-1): lợi suất vượt VN-Index sau phí khứ hồi 0,40% > 0 trong tháng nắm giữ. */
  roundTripCost: 0.004,
  /** Hoán vị nhãn tháng trong từng năm (độ mạnh mùa vụ). */
  permutations: 2000,
  /** BH-FDR: "mùa vụ rõ" khi q ≤ 0,10. */
  fdrQ: 0.1,
  /** Khoảng tin cậy hai phía (Wilson cho tỷ lệ, Beta hậu nghiệm). */
  level: 0.9,
  /** Trần độ mạnh prior Beta (α₀+β₀) — cùng giá trị Project A dùng cho cổ tức. */
  priorStrength: 10,
  /** Prior ngành × tháng cần ≥ 3 mã cùng ngành; ít hơn -> prior toàn universe cùng tháng. */
  minSectorPeers: 3,
  /** Ô có n < 4 năm = mẫu thấp. */
  lowSampleN: 4,
});
