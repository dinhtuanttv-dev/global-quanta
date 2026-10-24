// EP1 — nghiệm thu engine v3 (đo 24/10/2026 trên dữ liệu thật: VNINDEX + 58 mã Siêu Quét, 750 phiên / mã).
export const EP1_VALIDATION = {
  measuredAt: "2026-10-24",
  tickers: 59,
  coverage: 58 / 59,               // ew-v3.1 (tiên nghiệm RFL −2,0 / RTR −1,2); ew-v3.0: 57 / 59               // có "vị trí hiện tại" (cấu trúc ≥ 2 sóng ở ít nhất một bậc) — mục tiêu ≥ 95%
  inconsistent: 0,                 // 0 / 59 mã, kiểm độc lập 6.999 điểm — mục tiêu < 2%
  msP50: 4, msP95: 12,             // mục tiêu ≤ 15 ms / mã
  recentPivotStability: 0.995,     // pivot đã xác nhận trong 200 nến gần nhất giữ nguyên khi thêm 5 nến
  level1StructureStability: 0.942, // cấu trúc bậc 1 đã kết thúc giữ nguyên khi thêm 5 nến (≈ 5,8% được đếm lại)
  summary: "Engine v3.1 (24/10/2026, 59 mã): có vị trí 98,3% · không nhất quán 0 · 4 ms (p95 12 ms) · pivot gần đây ổn định 99,5% · cấu trúc bậc 1 được đếm lại ≈ 5,8% khi có nến mới. Diễn giải, chưa có lợi thế ngoài mẫu (EXPERIMENTAL).",
} as const;
