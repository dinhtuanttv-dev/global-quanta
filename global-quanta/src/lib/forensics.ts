import { FinancialStatementInput, ForensicScoreResult } from "../types/financialEngineering";

/**
 * A.1 - Fundamental Forensics (Phase 1, tich hop tu goi ban giao Chat Xuc Tac 2.0)
 *
 * LUU Y QUAN TRONG: cac mo hinh duoi day (Beneish, Altman, Piotroski) la
 * heuristic thong ke duoc kiem dinh tren du lieu thi truong phat trien
 * (chu yeu My). Dung cho thi truong VN can hieu chinh nguong theo backtest
 * noi bo truoc khi coi la tin hieu quyet dinh - day la cong cu ho tro sang
 * loc, khong phai ket luan gian lan/pha san.
 *
 * Input can 2 ky bao cao lien ke (ky hien tai + ky truoc) de tinh cac bien
 * tang truong/chi so. Ham duoi nhan ca 2 ky.
 */

// ── Beneish M-Score (mo hinh 8 bien) ────────────────────────────────────────
export function computeBeneishMScore(
  current: FinancialStatementInput,
  prior: FinancialStatementInput
): { score: number; flag: ForensicScoreResult["beneishFlag"] } {
  if (prior.sales === 0 || prior.receivables === 0 || prior.totalAssets === 0) {
    return { score: NaN, flag: "insufficient_data" };
  }

  const DSRI =
    current.receivables / current.sales / (prior.receivables / prior.sales);

  const currentGM = (current.sales - current.costOfGoodsSold) / current.sales;
  const priorGM = (prior.sales - prior.costOfGoodsSold) / prior.sales;
  const GMI = priorGM / currentGM;

  const currentAQ =
    1 - (current.currentAssets + current.ppeGross) / current.totalAssets;
  const priorAQ = 1 - (prior.currentAssets + prior.ppeGross) / prior.totalAssets;
  const AQI = currentAQ / priorAQ;

  const SGI = current.sales / prior.sales;

  const currentDepRate =
    current.depreciation / (current.depreciation + current.ppeGross);
  const priorDepRate = prior.depreciation / (prior.depreciation + prior.ppeGross);
  const DEPI = priorDepRate / currentDepRate;

  const currentSGAI = current.sgaExpense / current.sales;
  const priorSGAI = prior.sgaExpense / prior.sales;
  const SGAI = currentSGAI / priorSGAI;

  const LVGI =
    (current.totalLongTermDebt + current.currentLiabilities) / current.totalAssets /
    ((prior.totalLongTermDebt + prior.currentLiabilities) / prior.totalAssets);

  const TATA =
    (current.netIncome - current.operatingCashFlow) / current.totalAssets;

  const M =
    -4.84 +
    0.92 * DSRI +
    0.528 * GMI +
    0.404 * AQI +
    0.892 * SGI +
    0.115 * DEPI -
    0.172 * SGAI +
    4.679 * TATA -
    0.327 * LVGI;

  // Nguong kinh dien cua mo hinh 8 bien: M > -2.22 -> kha nang thao tung cao hon
  return { score: M, flag: M > -2.22 ? "likely_manipulator" : "unlikely" };
}
// ── Altman Z''-Score (ban dieu chinh, phu hop thi truong moi noi/phi san xuat) ──
export function computeAltmanZScore(
  s: FinancialStatementInput
): { score: number; zone: ForensicScoreResult["altmanZone"] } {
  const X1 = s.workingCapital / s.totalAssets;
  const X2 = s.retainedEarnings / s.totalAssets;
  const X3 = s.ebit / s.totalAssets;
  const X4 = s.totalLiabilities === 0 ? 0 : s.bookValueEquity / s.totalLiabilities;

  const Z = 6.56 * X1 + 3.26 * X2 + 6.72 * X3 + 1.05 * X4;

  let zone: ForensicScoreResult["altmanZone"] = "grey";
  if (Z > 2.6) zone = "safe";
  else if (Z < 1.1) zone = "distress";

  return { score: Z, zone };
}

// ── Piotroski F-Score (0-9) ─────────────────────────────────────────────────
export function computePiotroskiFScore(
  current: FinancialStatementInput,
  prior: FinancialStatementInput
): { score: number; flag: ForensicScoreResult["piotroskiFlag"] } {
  const roaCurrent = current.netIncome / current.totalAssets;
  const roaPrior = prior.netIncome / prior.totalAssets;
  const leverageCurrent = current.totalLongTermDebt / current.totalAssets;
  const leveragePrior = prior.totalLongTermDebt / prior.totalAssets;
  const currentRatioNow = current.currentAssets / current.currentLiabilities;
  const currentRatioPrior = prior.currentAssets / prior.currentLiabilities;
  const grossMarginNow =
    (current.sales - current.costOfGoodsSold) / current.sales;
  const grossMarginPrior = (prior.sales - prior.costOfGoodsSold) / prior.sales;
  const assetTurnoverNow = current.sales / current.totalAssets;
  const assetTurnoverPrior = prior.sales / prior.totalAssets;

  const criteria = [
    roaCurrent > 0, // 1. ROA duong
    current.operatingCashFlow > 0, // 2. Dong tien hoat dong duong
    roaCurrent > roaPrior, // 3. ROA cai thien YoY
    current.operatingCashFlow > current.netIncome, // 4. Chat luong loi nhuan (accruals)
    leverageCurrent < leveragePrior, // 5. Don bay giam
    currentRatioNow > currentRatioPrior, // 6. Thanh khoan ngan han cai thien
    current.sharesOutstanding <= prior.sharesOutstanding, // 7. Khong pha loang them
    grossMarginNow > grossMarginPrior, // 8. Bien gop cai thien
    assetTurnoverNow > assetTurnoverPrior, // 9. Hieu suat su dung tai san cai thien
  ];

  const score = criteria.filter(Boolean).length;
  const flag: ForensicScoreResult["piotroskiFlag"] =
    score >= 7 ? "strong" : score >= 4 ? "moderate" : "weak";

  return { score, flag };
}

// ── Tong hop ─────────────────────────────────────────────────────────────────
export function computeForensicScore(
  current: FinancialStatementInput,
  prior: FinancialStatementInput,
  catalystDirection: "benefit" | "harm" | "none"
): ForensicScoreResult {
  const beneish = computeBeneishMScore(current, prior);
  const altman = computeAltmanZScore(current);
  const piotroski = computePiotroskiFScore(current, prior);

  // "Aspect conflict" cao cap: catalyst tich cuc nhung nen tang xau di
  const fundamentalWeak =
    altman.zone === "distress" ||
    piotroski.flag === "weak" ||
    beneish.flag === "likely_manipulator";
  const fundamentalSentimentConflict =
    catalystDirection === "benefit" && fundamentalWeak;

  return {
    ticker: current.ticker,
    beneishMScore: beneish.score,
    beneishFlag: beneish.flag,
    altmanZScore: altman.score,
    altmanZone: altman.zone,
    piotroskiFScore: piotroski.score,
    piotroskiFlag: piotroski.flag,
    fundamentalSentimentConflict,
    computedAt: new Date().toISOString(),
  };
}
