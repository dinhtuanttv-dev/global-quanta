// SEPA (Mark Minervini, "Giao dịch như một phù thủy chứng khoán", NXB KT TP.HCM 2019) — toàn bộ ngưỡng.
// Chuyển 1:1 từ gói Python sepa_screener/config.py (chuẩn đối chiếu); [s.xxx] = trang sách.
// Sách tr.52: chạy nhiều bộ lọc tách biệt rồi tổng hợp bằng ĐIỂM, không AND cứng mọi tiêu chí.

const deepFreeze = (o) => { Object.values(o).forEach((v) => v && typeof v === "object" && deepFreeze(v)); return Object.freeze(o); };

export const SEPA = deepFreeze({
  // Hình mẫu xu hướng — 8 tiêu chí [s.101–102]
  trend: {
    maShort: 50, maMid: 150, maLong: 200,
    ma200UpMinDays: 21, // TC3: MA200 dốc lên ít nhất 1 tháng
    ma200UpPrefMonths: 4, // "nhiều trường hợp tối thiểu 4–5 tháng"
    minAbove52wLow: 0.3, // TC6
    maxBelow52wHigh: 0.25, // TC7
    minRsRating: 70, prefRsRating: 80, // TC8
    lookback52w: 252,
  },
  // 4 giai đoạn [s.86–100] + đếm nền [s.102–104]
  stage: {
    slopeWindow: 21, flatSlopePct: 0.01, ma200CrossLookback: 60, rallyOffLowMin: 0.25,
    baseMinWeeks: 3, baseMinDepth: 0.08, lateStageBaseCount: 3,
  },
  // VCP [s.237–270]
  vcp: {
    minBaseWeeks: 3, maxBaseWeeks: 65, minContractions: 2, maxContractions: 6,
    firstDepthMax: 0.35, firstDepthHardMax: 0.6, firstDepthMin: 0.08, finalDepthMax: 0.1,
    contractionRatioIdeal: 0.5, contractionTolerance: 0.15, pivotMaxBelowHigh: 0.15,
    swingDownMin: 0.025, swingUpRetrace: 0.4, swingUpMin: 0.03,
    volAvgWindow: 50, pivotWindow: 10, pivotVolRatioMax: 1.0, dryupRatio: 0.5,
    breakoutVolRatio: 1.4, maxChasePct: 0.05, breakoutLookback: 5,
    vShapeRecoveryRatio: 0.35,
  },
  flat: { minWeeks: 4, maxWeeks: 7, maxDepth: 0.15 }, // [s.239, s.271]
  cup: { // [s.286–291]
    minWeeks: 6, maxWeeks: 65, minDepth: 0.12, maxDepth: 0.4, hardMaxDepth: 0.5,
    handleMinDays: 5, handleMaxDepth: 0.15, handleUpperThird: 2 / 3, rightSideRecovery: 0.85,
  },
  threeC: { // [s.289–293]
    priorAdvanceMin: 0.25, priorAdvanceLookbackDays: 756, minWeeks: 3, maxWeeks: 45,
    minDepth: 0.15, maxDepth: 0.4, hardMaxDepth: 0.6, pauseMinDays: 4, pauseMaxDays: 25, pauseMaxRange: 0.1,
    aboveMa200: true,
  },
  power: { // [s.299–302]
    thrustMinGain: 1.0, thrustMaxDays: 40, thrustVolRatio: 1.5, flagMinDays: 10, flagMaxDays: 30, flagMaxDepth: 0.25,
  },
  primary: { maxListingDays: 504, minBaseDays: 15, maxDepth: 0.35, maxDepth3w: 0.25 }, // [s.305–310]
  // Chương 9 — RS kiểu IBD + dẫn dắt
  lead: {
    rsWeights: [0.4, 0.2, 0.2, 0.2], rsPeriods: [63, 126, 189, 252],
    nearHighBand: [0.05, 0.15], maxCorrection: 0.35, maxVsIndexMult: 2.0,
    newHighAfterBottomWeeks: 8, fastMovePct: 0.2, fastMoveDays: 25,
  },
  // Chương 12–13. riskPerTrade = 5% vốn theo lựa chọn của người dùng (2026-10-09; gói Python mặc định 1,25%).
  // Trần 25%/vị thế vẫn áp dụng: với stop 7,5% thì rủi ro thực tế ≈ 25% × 7,5% ≈ 1,9% vốn.
  risk: {
    avgGain: 0.15, maxStop: 0.1, hardMarketStop: 0.06, minRewardRisk: 2.0, breakevenRMultiple: 3.0,
    maxPositions: 6, maxPositionPct: 0.25, riskPerTrade: 0.05, lot: 100,
  },
});
