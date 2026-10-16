// X6 — nhãn bằng chứng cho chiều tác động của engine Chất xúc tác.
// Kiểm định đặt trước (X6-prereg.md -> X6-result.json) cho ĐẠT, nhưng rà soát nguồn gốc 2026-10-16 phát hiện 15/47 tín hiệu đến từ
// DỮ LIỆU MẪU bịa (scripts/seed-catalyst.ts, đã gỡ). Loại chúng (+ tin trung lập) -> mẫu còn 29 < 30 (ngưỡng đăng ký trước)
// => nhãn hạ về EXPERIMENTAL (X6-sensitivity.json). Test catalystEvidence.test.ts đỏ nếu số ở đây lệch 2 file kết quả.
export const CATALYST_EVIDENCE = {
  label: "EXPERIMENTAL" as const,
  ranOn: "2026-10-16",
  window: "07/09–09/10/2026",
  prereg: { n20: 47, meanSar20: 0.0312, ci95: [0.0081, 0.0559] as [number, number], verdict: "PASS" as const },
  seedSignals: 15,
  clean: { n20: 29, meanSar20: 0.0306, ci95: [0.0006, 0.0632] as [number, number] },
  minN: 30,
};
