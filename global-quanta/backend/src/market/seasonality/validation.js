// Nhãn bằng chứng của mùa vụ tháng — giao diện / dịch vụ đọc từ đây, không tự gắn "đạt kiểm định".
// Kiểm định HỢP LỆ duy nhất: SEAS-prereg-v2 (chạy MỘT lần 29/10/2026; cấu hình 3862d2e5…, dữ liệu VNDirect 2013–2019 d3c98081…;
// engine SEAS-v1.1). SEAS-prereg-v1 đã THU HỒI (lỗi engine v1 làm dự báo ngược hạng) — xem SEAS-prereg.md.
export const SEAS_VALIDATION = Object.freeze({
  prereg: "SEAS-prereg-v2",
  ranAt: "2026-10-29",
  engine: "SEAS-v1.1",
  retracted: [{ prereg: "SEAS-prereg-v1", reason: "Lỗi engine v1: đích co bỏ chính mã -> dự báo ngược hạng; kết quả không hợp lệ." }],
  tickers: {
    verdict: "FAIL", label: "THĂM DÒ",
    reason: "KHÔNG ĐẠT (dữ liệu chưa từng nhìn 2016–2019, 48 tháng, ~806 mã/tháng): IC TB +0,013 (t 1,56) — có dấu hiệu lặp lại yếu nhưng chưa "
      + "có ý nghĩa; long–short sau phí −0,13%/tháng [−0,58; +0,33]; long-only nhóm dự báo cao nhất sau phí −0,41% [−0,73; −0,10] so với bình "
      + "quân đều; placebo hạng 2/12. Mùa vụ tháng của từng mã KHÔNG tạo lợi thế dùng được sau chi phí.",
  },
  sectors: {
    verdict: "FAIL", label: "THĂM DÒ",
    reason: "KHÔNG ĐẠT (2016–2019, 45 tháng, ~18 ngành): IC TB +0,040 (t 1,08), 2/4 năm dương; long–short sau phí −0,81% [−1,94; +0,31]; "
      + "long-only −0,47% [−1,33; +0,42]; placebo hạng 1/12 (chỉ tiêu duy nhất đạt). Chưa đủ bằng chứng; mặt cắt ngành nhỏ nên công suất thấp.",
  },
  /** Hệ quả (SEAS-prereg-v2 §Hệ quả): mùa vụ chỉ là BỐI CẢNH; không có bậc ĐẠT / GẦN ĐẠT. Sổ theo dõi tiến (R3) vẫn ghi để đánh giá độc lập. */
  timelineTier: "CONTEXT",
});
