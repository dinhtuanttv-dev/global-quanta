// PA-VOL-r1 (26/11/2026) — kết quả kiểm định đăng ký trước Price Action × Khối lượng (docs/price-action-volume).
// Giao diện chỉ đọc nhãn từ đây, không tự suy ra. Đổi nhãn cần kiểm định mới (r2) có đăng ký trước.
export const PA_VOL_R1 = Object.freeze({
  test: "PA-VOL-r1",
  verdict: "KHÔNG ĐẠT" as "ĐẠT" | "KHÔNG ĐẠT" | "THIẾU MẪU",
  ranAt: "2026-11-26",
  engine: "pa-book-2.0.0 · 086106d4",
  prereg: "808ef714 + phụ lục 1e5297da",
  sample: "1.536 mã (kể cả đã huỷ niêm yết), 2014–10/2026, vũ trụ đúng thời điểm (trung vị GTGD 20 phiên ≥ 5 tỷ)",
  /** Vượt trội 10 phiên so với rổ đều trọng số, sau phí 0,20% mua + 0,25% bán, ngoài mẫu 2021–10/2026. */
  oos10: { s1: -0.0081, s2: -0.0106, s2t: -7.38, s2n: 5473, s1NoVol: -0.0070 },
  summaryVi:
    "Ngoài mẫu 2021–10/2026, mua ở giá mở phiên sau khi setup kích hoạt kém rổ cùng kỳ −0,81% sau 10 phiên (sau phí); thêm điều kiện khối lượng tăng vọt còn kém hơn: −1,06% (t −7,4, 5.473 lần), âm ở cả hai nửa và trong mẫu 2014–2020; mọi mẫu hình đều âm. Khối lượng KHÔNG cộng thêm giá trị (chênh −0,36%, p 0,97). Chỉ dùng để mô tả bối cảnh, không phải tín hiệu mua.",
});
