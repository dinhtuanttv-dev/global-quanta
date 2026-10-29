// MV2 — kết quả kiểm định đăng ký trước SEAS-prereg-v1 (chạy MỘT lần 29/10/2026 với cấu hình chốt sha256 4c9adcf8…, dữ liệu a25a67a1…).
// ⚠ 29/10/2026: KẾT QUẢ v1 BỊ THU HỒI — engine SEAS-v1 co về TB các mã khác (bỏ chính mã) -> dự báo ngược hạng; kiểm định không hợp lệ.
// Nhãn giữ THĂM DÒ (chưa có kiểm định hợp lệ) cho tới khi SEAS-prereg-v2 (dữ liệu 2013–2019 chưa từng nhìn) chạy xong.
// Nguồn: seas-prereg-report.json. Giao diện / dịch vụ đọc nhãn từ đây — không tự gắn "đạt kiểm định" cho mùa vụ.
export const SEAS_VALIDATION = Object.freeze({
  prereg: "SEAS-prereg-v1",
  ranAt: "2026-10-29",
  retracted: true,
  retractionNote: "Kiểm định v1 không hợp lệ (lỗi engine: đích co bỏ chính mã làm dự báo ngược hạng). Chưa có kết luận — chờ SEAS-prereg-v2.",
  tickers: {
    verdict: "INVALID", label: "THĂM DÒ",
    reason: "CHƯA CÓ KIỂM ĐỊNH HỢP LỆ — số liệu v1 (IC +0,009) tính trên dự báo ngược hạng do lỗi engine, đã thu hồi.",
  },
  sectors: {
    verdict: "INVALID", label: "THĂM DÒ",
    reason: "CHƯA CÓ KIỂM ĐỊNH HỢP LỆ — IC ngành −0,115 của v1 tính trên dự báo ngược hạng (nhiều khả năng là ảo giác), đã thu hồi; giả thuyết đảo chiều bị huỷ.",
  },
  /** Hệ quả (SEAS-prereg §Hệ quả): mọi dòng mùa vụ chỉ ở bậc BỐI CẢNH; không có bậc ĐẠT KIỂM ĐỊNH / GẦN ĐẠT cho mùa vụ. */
  timelineTier: "CONTEXT",
});
