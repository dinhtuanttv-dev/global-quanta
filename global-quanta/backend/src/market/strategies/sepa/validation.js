// SEPA SP3 — kiểm định point-in-time trên dữ liệu VN với TIÊU CHÍ ĐẶT TRƯỚC (ghi 2026-10-09 trước khi chạy, không sửa sau).
// Engine sepa/SP2 (main 26bdab4), tham số mặc định; series2 (SSI điều chỉnh cộng dồn, 10/2023–10/2026), 467 phiên đánh giá;
// tập mã tại ngày d: ≥ 260 nến, GTGD TB20 ≥ 5 tỷ, giá ≥ 5.000đ TẠI d. OOS từ 2026-03-07. Vượt trội: mở cửa T+1 -> đóng cửa T+20,
// trừ phí 0,6%, trừ TB cùng ngày của tập mã. KTC 95% bootstrap theo cụm ngày. Một sự kiện / mã / 20 phiên. Không gọi SSI, không ghi DB.
//
// Giới hạn ghi rõ: kho BCTC chỉ giữ ≤ 20 quý gần nhất (nhiều mã mới 6 quý trước lượt tải 10/10/2026) -> ở các ngày lịch sử phần lớn
// mã thiếu quý, điểm cơ bản ≈ 0 (S7: chỉ 1 sự kiện có điểm cơ bản ≥ 50). Kiểm định này vì vậy chủ yếu đo phần KỸ THUẬT của SEPA.

export const SEPA_VALIDATION = Object.freeze({
  version: "SP3-2026-10-09",
  engine: "sepa/SP2",
  period: { from: "2024-10", to: "2026-09", oosFrom: "2026-03-07", sessions: 467 },
  rules: "Vượt trội 20 phiên so TB cùng ngày · phí 0,6% · KTC 95% bootstrap cụm ngày · 1 sự kiện/mã/20 phiên",
  hypotheses: [
    { id: "S1", label: "Vào danh sách SẴN SÀNG MUA", criterion: "OOS n ≥ 30, TB > 0, cận dưới KTC > 0",
      is: { n: 318, mean: 0.6, ci: [-0.75, 2.1] }, oos: { n: 87, mean: 0.81, ci: [-1.39, 3.16] }, verdict: "FAIL" },
    { id: "S2", label: "Phá vỡ đạt chuẩn (SẴN SÀNG MUA + BREAKOUT, KL ≥ 1,4× TB50)", criterion: "OOS n ≥ 30, TB > 0, cận dưới KTC > 0",
      is: { n: 158, mean: -0.48, ci: [-2.62, 1.95] }, oos: { n: 37, mean: 3.66, ci: [0.69, 7.33] }, verdict: "PASS",
      caveat: "Đạt ngưỡng ngoài mẫu nhưng TRONG mẫu không có lợi thế (−0,48%) và n nhỏ (37) — 4 giả thuyết được thử, có thể là may mắn." },
    { id: "S3", label: "Thứ bậc danh sách (mẫu cuối tuần)", criterion: "OOS: SẴN SÀNG ≥ CẢNH BÁO ≥ THEO DÕI ≥ LOẠI và cận dưới KTC SẴN SÀNG > TB LOẠI",
      oos: { "SẴN SÀNG MUA": { n: 78, mean: 2.19, ci: [0.52, 3.82] }, "CẢNH BÁO MUA": { n: 396, mean: 0.92, ci: [-0.29, 2.31] }, "THEO DÕI": { n: 151, mean: -1.32, ci: [-3.25, 0.97] }, "LOẠI": { n: 3771, mean: -0.09, ci: [-0.3, 0.12] } },
      verdict: "FAIL", caveat: "Không đơn điệu: THEO DÕI (−1,32%) thấp hơn LOẠI (−0,09%)." },
    { id: "S4", label: "Trend Template 8/8 (mẫu cuối tuần)", criterion: "OOS TB > 0 và cận dưới KTC > 0",
      oos: { n: 407, mean: 0.43, ci: [-1.32, 2.29] }, control: { n: 3989, mean: -0.04, ci: [-0.22, 0.13] }, verdict: "FAIL" },
    { id: "S5", label: "Cổng thị trường (mô tả)", oos: { favourable: { n: 37, mean: 1.48, ci: [-2.54, 6.61] }, hard: { n: 50, mean: 0.32, ci: [-1.85, 3.11] } },
      all: { favourable: { n: 301, mean: 0.93 }, hard: { n: 104, mean: -0.18 } }, verdict: "DESCRIPTIVE" },
    { id: "S6", label: "Mô phỏng lệnh S1 (dừng lỗ kế hoạch, mục tiêu 3R, tối đa 60 phiên, T+2,5, phí + thuế)",
      all: { n: 393, winRate: 27.5, avgNetPct: -0.89, profitFactor: 0.8, avgR: -0.25 }, oos: { n: 82, winRate: 23.2, avgNetPct: -1.88, profitFactor: 0.58, avgR: -0.41 },
      verdict: "DESCRIPTIVE", caveat: "Dừng lỗ 6–7,5% bị chạm thường xuyên trên dữ liệu VN: lợi suất 20 phiên dương nhưng giao dịch theo kế hoạch sách lỗ." },
    { id: "S7", label: "VCP vs mô hình khác (S1, mô tả)", all: { vcp: { n: 264, mean: 0.66 }, other: { n: 141, mean: 0.61 } }, oos: { vcp: { n: 48, mean: 1.56 }, other: { n: 39, mean: -0.12 } }, verdict: "DESCRIPTIVE" },
  ],
});

/** Thẻ bằng chứng cho KV strategies:sepa. Tổng thể EXPERIMENTAL; riêng tín hiệu S2 đạt ngưỡng ngoài mẫu (kèm cảnh báo). */
export function sepaEvidence() {
  return {
    label: "EXPERIMENTAL",
    reason: "Kiểm định đặt trước (SP3): chỉ 'phá vỡ đạt chuẩn' (S2) đạt ngưỡng ngoài mẫu (n 37, +3,66%/20 phiên) nhưng trong mẫu âm; vào danh sách SẴN SÀNG, thứ bậc danh sách và Trend Template không đạt; mô phỏng lệnh theo kế hoạch sách lỗ (PF 0,80). Danh sách để xem xét, không phải tín hiệu mua.",
    validation: SEPA_VALIDATION,
    signals: { breakoutReady: "PASS_OOS_WITH_CAVEAT" },
  };
}
