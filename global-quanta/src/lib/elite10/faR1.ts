// FA-r1 (17/11/2026) — kết quả kiểm định đăng ký trước các cổng chặn mua mới theo chất lượng doanh nghiệp cho Elite HL (G2r).
// Nguồn: backend/research/FA-r1-report.md (nhánh research/fa-r1). Giai đoạn quyết định 2014–2019; không cổng nào đạt.
// Dùng để gắn nhãn bằng chứng cho cảnh báo của Hồ sơ 360°: cảnh báo là thông tin rủi ro, KHÔNG dự báo được lợi suất.
export interface FaR1Gate { gate: string; vsBase20: number; t: number; noteVi: string }
export const FA_R1 = Object.freeze({
  ranAt: "2026-11-17", period: "03/03/2014 → 31/12/2019", verdict: "KHÔNG ĐẠT",
  summaryVi: "Kiểm định FA-r1 (đăng ký trước, 2014–2019): chặn mua mới theo các cờ này KHÔNG làm danh mục Elite HL tốt hơn; chặn theo Beneish và dồn tích còn làm kém đi. Cảnh báo chỉ để biết rủi ro kế toán, không phải tín hiệu bán hay tránh mua.",
  gates: {
    LOSS_TTM: { gate: "V1", vsBase20: -0.0001, t: -0.19, noteVi: "Hầu như không xảy ra ở mã đạt tầng 1 (7/383 lệnh mua)." },
    PIOTROSKI_LOW: { gate: "V2", vsBase20: 0.003, t: 1.56, noteVi: "Đúng chiều nhưng chưa đủ chắc (t 1,56)." },
    BENEISH: { gate: "V3", vsBase20: -0.0052, t: -2.32, noteVi: "Ngược chiều: lệnh mua dính cờ lại vượt trội hơn; chặn làm danh mục kém đi." },
    ACCRUAL: { gate: "V4", vsBase20: -0.0043, t: -1.73, noteVi: "Ngược chiều: thường đi cùng doanh nghiệp tăng trưởng nhanh." },
  } as Record<string, FaR1Gate>,
});
