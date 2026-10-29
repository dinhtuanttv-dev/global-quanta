// MV2 — kết quả kiểm định đăng ký trước SEAS-prereg-v1 (chạy MỘT lần 29/10/2026 với cấu hình chốt sha256 4c9adcf8…, dữ liệu a25a67a1…).
// Nguồn: seas-prereg-report.json. Giao diện / dịch vụ đọc nhãn từ đây — không tự gắn "đạt kiểm định" cho mùa vụ.
export const SEAS_VALIDATION = Object.freeze({
  prereg: "SEAS-prereg-v1",
  ranAt: "2026-10-29",
  tickers: {
    verdict: "FAIL", label: "THĂM DÒ",
    reason: "KHÔNG ĐẠT: IC ngoài mẫu TB +0,009 (t 0,45; 33 tháng, ~270 mã/tháng); long–short ngũ phân vị sau phí −0,13%/tháng "
      + "[KTC 90% −1,17; +0,92]; placebo dịch nhãn tháng xếp 4/12 — mùa vụ 5 năm của từng mã không dự báo được tháng tương ứng năm sau.",
  },
  sectors: {
    verdict: "FAIL", label: "THĂM DÒ",
    reason: "KHÔNG ĐẠT: IC ngoài mẫu TB −0,115 (t −2,13; 18 ngành ICB cấp 2) — tháng mạnh trong lịch sử của ngành có xu hướng KÉM năm sau "
      + "(đảo chiều). Đây là quan sát sau kiểm định, KHÔNG được dùng làm tín hiệu ngược chiều khi chưa đăng ký trước và kiểm định riêng.",
  },
  /** Hệ quả (SEAS-prereg §Hệ quả): mọi dòng mùa vụ chỉ ở bậc BỐI CẢNH; không có bậc ĐẠT KIỂM ĐỊNH / GẦN ĐẠT cho mùa vụ. */
  timelineTier: "CONTEXT",
});
