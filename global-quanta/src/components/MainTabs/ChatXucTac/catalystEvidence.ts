// X6 — nhãn bằng chứng cho chiều tác động của engine Chất xúc tác. Nguồn: backend/src/market/catalystValidation/X6-result.json
// (kiểm định đặt trước X6-prereg.md). Test catalystEvidence.test.ts đỏ nếu số ở đây lệch file kết quả.
export const CATALYST_EVIDENCE = {
  label: "VALIDATED_IN_SAMPLE" as const,
  ranOn: "2026-10-16",
  n20: 47,
  meanSar20: 0.0312,
  ci95: [0.0081, 0.0559] as [number, number],
  hitRate20: 0.5745,
  meanSar5: -0.0054,
  window: "07/09–09/10/2026",
};
