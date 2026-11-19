// A4 (18/11/2026) — Sổ bằng chứng của từng lớp Elite HL: phán quyết các kiểm định ĐÃ CÔNG BỐ, kèm nguồn (commit / PR).
// Số ở đây được ghi MỘT LẦN, tại nơi có nguồn, để giao diện không phải gõ số. Thêm mục mới khi một kiểm định chạy xong.
// Phán quyết: "ĐẠT" | "MỘT PHẦN" | "KHÔNG ĐẠT" | "MÔ TẢ" | "CHƯA KIỂM ĐỊNH". Chỉ đọc — không ảnh hưởng danh mục.
export const EVIDENCE_REGISTRY_VERSION = "ER-v1 (18/11/2026)";
export const VERDICTS = Object.freeze(["ĐẠT", "MỘT PHẦN", "KHÔNG ĐẠT", "MÔ TẢ", "CHƯA KIỂM ĐỊNH"]);
export const EVIDENCE_REGISTRY = Object.freeze([
  { id: "HL", layer: "Quy tắc chọn Elite HL (HL-v1 / G2r)", test: "HL-r2", verdict: "MỘT PHẦN", ranAt: "2026-11-14", src: "research/hl-r2-pz-r1 · bf30605",
    detail: "Trong mẫu 2014–2019 đạt (+1,13%/20 phiên, t 2,13); ngoài mẫu 2020–05/2023 không đạt (−1,07%, t −1,13)." },
  { id: "PZ", layer: "Vị trí giá PZ-v2 (Vùng mua / Trong nền / Tăng nóng)", test: "PZ-r2", verdict: "KHÔNG ĐẠT", ranAt: "2026-11-18", src: "research/hl-r2-pz-r1 · f32f2ae",
    detail: "05/2023–11/2026: chỉ mua ở Vùng mua 1,1%/năm so với 5,1%/năm; Sharpe 0,15 so với 0,36; sụt giảm chỉ bớt 0,6 điểm %." },
  { id: "PX", layer: "Cổng hậu GDKHQ pha loãng ≥ 10%", test: "PX-r1", verdict: "KHÔNG ĐẠT", ranAt: "2026-11-18", src: "research/px-r1 · 94b3f06",
    detail: "520 đợt 2020–2026: mua ở ex+1 giữ 30 phiên −0,57% so với thị trường (t −0,65); 06/2023–2026 dương." },
  { id: "LQ", layer: "Phòng tuyến thanh khoản LQ-v1", test: "LQ-r1", verdict: "CHƯA KIỂM ĐỊNH", ranAt: "2026-11-18", src: "#330 · #331",
    detail: "Chỉ hiển thị; đổi cổng chọn mã theo thanh khoản cần kiểm định đăng ký trước LQ-r1." },
  { id: "CG", layer: "Cổng tiền mặt theo thị trường", test: "CG-r1", verdict: "KHÔNG ĐẠT", ranAt: "2026-11-05", src: "#272 · #273",
    detail: "Danh mục giữ 100% theo quy tắc chính; trạng thái cổng chỉ mô tả." },
  { id: "FA", layer: "Cảnh báo cơ bản (Beneish, dồn tích, Piotroski…)", test: "FA-r1", verdict: "KHÔNG ĐẠT", ranAt: "2026-11-17", src: "research/fa-r1 · dee0427",
    detail: "Dùng để chặn mua làm Elite HL kém hơn (Beneish −0,52%/20 phiên, t −2,32); chỉ cảnh báo." },
]);

// D4 (19/11/2026) — sổ bằng chứng của các lớp "Tác động lên cổ phiếu" (Hồ sơ 360° › Tổng hợp). Tách khỏi EVIDENCE_REGISTRY (lớp của Elite HL)
// để Tường bằng chứng không đổi. Giao diện chỉ hiển thị dấu (seal) lấy từ đây, không tự suy ra nhãn.
// Dấu: "ĐẠT" | "MỘT PHẦN" | "THĂM DÒ" | "KHÔNG ĐẠT" | "ĐANG TÍCH LUỸ" | "CHƯA KIỂM ĐỊNH" | "MÔ TẢ".
export const IMPACT_SEALS = Object.freeze(["ĐẠT", "MỘT PHẦN", "THĂM DÒ", "KHÔNG ĐẠT", "ĐANG TÍCH LUỸ", "CHƯA KIỂM ĐỊNH", "MÔ TẢ"]);
export const IMPACT_EVIDENCE = Object.freeze([
  { id: "KQ-r1", layer: "Kết quả kinh doanh — ước tính LNST cả năm", seal: "THĂM DÒ", ranAt: "2026-11-06", src: "fundamentals/kq-r1-report.json · fe31be09",
    detail: "Nowcast đạt ngoài mẫu (IC 0,047, p 0,0005, 19 lứa) nhưng chọn mẫu theo 284 mã hiện tại (thiên lệch sống sót). Chờ KQ-r2 với vũ trụ đúng thời điểm." },
  { id: "WS-v1", layer: "Ngành thế giới — phiên VN kế tiếp (ATO)", seal: "MỘT PHẦN", ranAt: "2026-10-17", src: "worldSectors M1–M5 · #117–#121",
    detail: "α ngành dự báo phiên VN kế tiếp lúc mở cửa (IC 0,020, t 2,53). Từ đóng cửa phiên đó trở đi ≈ 0, nên đã phản ánh khi Elite vào lệnh." },
  { id: "WS-r2", layer: "Ngành thế giới — trung hạn", seal: "KHÔNG ĐẠT", ranAt: "2026-11-11", src: "worldSectors/WS-r2-result.json · dcb2c0c8",
    detail: "Sóng 5 phiên → 10 phiên (IC 0,032, t 1,15), độ nhạy × sóng (IC 0,016, t 1,37), vào lệnh ATO theo ngành thuận gió (chênh 0,026%/phiên): đều không đạt. Chỉ mô tả." },
  { id: "X6-F", layer: "Chất xúc tác — chiều tác động của engine", seal: "ĐANG TÍCH LUỸ", ranAt: null, src: "research/impact/X6-F-prereg.md · 6de70455",
    detail: "Kiểm định tiến trên sổ tín hiệu từ 30/10/2026 (sổ bịt mắt: chỉ đếm, chưa nhìn lợi suất). Chấm sơ bộ khi đủ 30 tín hiệu 20 phiên." },
  { id: "ER-r1", layer: "Sự kiện Event Radar — theo loại sự kiện", seal: "ĐANG TÍCH LUỸ", ranAt: null, src: "research/impact/ER-r1-prereg.md · 6de70455",
    detail: "Mẫu là sự kiện xuất hiện từ 20/11/2026; chấm từ 20/05/2027 cho các loại có ≥ 100 cụm." },
  { id: "CT-r1", layer: "Hàng hoá — quặng sắt + giá thép châu Á → nhóm thép", seal: "CHƯA KIỂM ĐỊNH", ranAt: null, src: "research/impact/CT-r1-prereg.md · 6de70455",
    detail: "Khám phá trong mẫu 2013–2019: phản ánh chậm khoảng 20 phiên, nhất quán qua 4 cách đo. Chưa chạy kiểm định ngoài mẫu 2020+." },
  { id: "CT-r2", layer: "Hàng hoá — bông → dệt may", seal: "CHƯA KIỂM ĐỊNH", ranAt: null, src: "research/impact/CT-r2-prereg.md · 6de70455",
    detail: "Khám phá trong mẫu 2013–2019: bông tăng thì dệt may giảm dần trong 20 phiên, bằng chứng yếu (t −1,8 đến −1,9). Chưa chạy kiểm định ngoài mẫu." },
  { id: "CM-x", layer: "Hàng hoá — phản ánh ngay hoặc không đo được tác động", seal: "MÔ TẢ", ranAt: "2026-11-19", src: "Tac-dong-co-phieu/10 · khám phá 2013–2019",
    detail: "Giá đã phản ánh trong phiên đầu (dầu, đường, cao su) hoặc không thấy tác động (vàng, khí Mỹ, phân bón): không có lợi thế để giao dịch theo." },
  { id: "PX-r1", layer: "Pha loãng ≥ 10% — cổng hậu GDKHQ", seal: "KHÔNG ĐẠT", ranAt: "2026-11-18", src: "research/px-r1 · 94b3f06",
    detail: "520 đợt 2020–2026: mua ở ex+1 giữ 30 phiên −0,57% so với thị trường (t −0,65). Chỉ hiển thị pha." },
]);

export function evidenceRegistry() {
  return { version: EVIDENCE_REGISTRY_VERSION, entries: EVIDENCE_REGISTRY.map((e) => ({ ...e })), impact: IMPACT_EVIDENCE.map((e) => ({ ...e })) };
}
