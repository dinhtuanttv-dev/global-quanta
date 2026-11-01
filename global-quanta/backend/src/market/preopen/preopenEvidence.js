// Kết quả PO-r2-prereg.md (PO-r2-results.md). Cổng nào đạt thì phần tương ứng mới được hiện. Chỉ đổi sau khi có kiểm định mới.
export const PREOPEN_EVIDENCE = Object.freeze({
  rule: "PO-r2", openBand: false, dayBand: true, dayModel: "ms", probabilities: false, noPanicSell: false, noChase: false, defensive: false,
  sample: { tested: 376, from: "2025-04-29", to: "2026-10-30" },
  openCoverage: 85.1, dayCoverage: 80.1, brierSkill: -0.014,
  history: [
    { id: "neg", label: "ES ≤ −1σ", n: 27, gap: -0.3, oc: -0.19, cc: -0.48 },
    { id: "mid", label: "ES trong ±1σ", n: 319, gap: 0.17, oc: -0.04, cc: 0.13 },
    { id: "pos", label: "ES ≥ +1σ", n: 30, gap: 0.63, oc: -0.3, cc: 0.32 },
  ],
});
