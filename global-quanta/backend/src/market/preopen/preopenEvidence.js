// Kết quả PO-prereg.md (PO-results.md). Cổng nào đạt thì phần tương ứng mới được hiện. Chỉ đổi sau khi có kiểm định mới.
export const PREOPEN_EVIDENCE = Object.freeze({
  rule: "PO-r1", openBand: false, dayBand: false, probabilities: false, noPanicSell: false, noChase: false,
  sample: { tested: 376, from: "2025-04-29", to: "2026-10-30" },
  openCoverage: 82.2, dayCoverage: 66.8, brierSkill: 0,
  history: [
    { id: "neg", label: "ES ≤ −0,8%", n: 36, gap: -0.27, oc: -0.15, cc: -0.42 },
    { id: "mid", label: "ES trong ±0,8%", n: 288, gap: 0.17, oc: -0.04, cc: 0.13 },
    { id: "pos", label: "ES ≥ +0,8%", n: 52, gap: 0.53, oc: -0.2, cc: 0.32 },
  ],
});
