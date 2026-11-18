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

export function evidenceRegistry() {
  return { version: EVIDENCE_REGISTRY_VERSION, entries: EVIDENCE_REGISTRY.map((e) => ({ ...e })) };
}
