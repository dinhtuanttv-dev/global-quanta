import type { DividendLifecycleEvent } from "./dividend-lifecycle";

// Dividend Quality Score - 4 tang, theo dung cong thuc tai lieu:
// Score = 30% Tang1(Co tuc ben vung) + 30% Tang2(KQKD) + 25% Tang3(Dinh
// gia) + 15% Tang4(Suc khoe ky thuat).
//
// DA DON GIAN HOA 2 diem (thong bao ro, khong an giau):
// - Bo FCF coverage (Tang 1): thieu du lieu Cash Flow Statement da khai
//   thac, Tang 1 chia deu 3 tieu chi con lai (Payout/So nam/No-VCSH)
//   thay vi 4.
// - Bo P/B (Tang 3): thieu nguon So co phieu luu hanh. P/E dung XAP XI
//   "trung vi 17 ma CUNG NGANH" thay vi "trung vi 5 nam CUA CHINH MA"
//   nhu tai lieu goc de xuat (can lich su EPS+gia 5 nam phuc tap hon,
//   de lam sau neu can do chinh xac cao hon). Tang 3 chia deu 2 tieu chi
//   (P/E nganh + Yield vs lai suat) thay vi 3.
//
// Lai suat tiet kiem 12 thang dung lam moc: 6.8%/nam (Big 4 - Agribank/
// BIDV/Vietcombank/VietinBank, thang 8/2026, nguon CafeF qua Finhay) -
// chon Big 4 vi on dinh hon ngan hang nho hay thay doi marketing.
export const SAVINGS_RATE_12M = 6.8;

// ============================================================
// TANG 1 - CHAT LUONG CO TUC (30%)
// ============================================================

/** Payout ratio ly tuong 30-70%. Qua thap (<30%) hoac qua cao (>90%) deu
 * giam diem theo dung nguyen tac tai lieu (khong hap dan / khong ben vung). */
export function scorePayoutRatio(payoutPct: number): number {
  if (payoutPct >= 30 && payoutPct <= 70) return 100;
  if (payoutPct < 30) return Math.max(0, (payoutPct / 30) * 100);
  if (payoutPct <= 90) return 100 - ((payoutPct - 70) / 20) * 50; // 100 -> 50
  return Math.max(0, 50 - ((payoutPct - 90) / 10) * 50); // 50 -> 0 tai 100%
}

/** So nam chi tra lien tuc khong giam, nguong >=5 nam = 100 diem. */
export function scoreConsecutiveYears(years: number): number {
  return Math.min(100, (years / 5) * 100);
}

/** No/VCSH thap hon trung vi nganh = tot hon (giam rui ro cat co tuc khi
 * lai suat tang, dung nguyen tac tai lieu). */
export function scoreDebtEquityVsIndustry(debtEquity: number, industryMedian: number): number {
  if (industryMedian <= 0) return 50; // khong co du lieu trung vi tin cay, tra ve trung tinh
  if (debtEquity <= industryMedian) return 100;
  return Math.max(0, 100 - ((debtEquity - industryMedian) / industryMedian) * 100);
}

export function calculateTier1Score(input: {
  payoutRatioPct: number | null;
  consecutiveYears: number | null;
  debtEquity: number | null;
  industryMedianDebtEquity: number | null;
}): number | null {
  const parts: number[] = [];
  if (input.payoutRatioPct !== null) parts.push(scorePayoutRatio(input.payoutRatioPct));
  if (input.consecutiveYears !== null) parts.push(scoreConsecutiveYears(input.consecutiveYears));
  if (input.debtEquity !== null && input.industryMedianDebtEquity !== null) {
    parts.push(scoreDebtEquityVsIndustry(input.debtEquity, input.industryMedianDebtEquity));
  }
  if (parts.length === 0) return null;
  return parts.reduce((a, b) => a + b, 0) / parts.length;
}

// ============================================================
// TANG 2 - CHAT LUONG TANG TRUONG (30%)
// ============================================================

/** Tai su dung diem KQKD da tinh san (earnings-scoring.ts), tru diem
 * manh neu co "co do": LNST giam YoY >20% ma van giu nguyen/tang co tuc
 * (nghi ngo dung von/quy du phong de duy tri chi tra, khong ben vung -
 * dung nguyen tac tai lieu Phan 3.2). */
export function calculateTier2Score(input: {
  earningsScore: number | null; // Diem KQKD da co san (0-100)
  hasRedFlag: boolean; // LNST YoY giam >20% nhung DPS khong giam
}): number | null {
  if (input.earningsScore === null) return null;
  const penalty = input.hasRedFlag ? 30 : 0;
  return Math.max(0, input.earningsScore - penalty);
}

/** Phat hien co do: LNST quy gan nhat giam YoY >20% MA DPS dot gan nhat
 * khong giam so voi dot truoc lien ke (cung ky/dot truoc). */
export function detectDividendRedFlag(netProfitYoYPct: number | null, latestDps: number | null, previousDps: number | null): boolean {
  if (netProfitYoYPct === null || latestDps === null || previousDps === null) return false;
  return netProfitYoYPct < -20 && latestDps >= previousDps;
}

// ============================================================
// TANG 3 - DINH GIA TUONG DOI (25%)
// ============================================================

/** P/E thap hon trung vi NGANH = re hon, tot hon (XAP XI thay "trung vi
 * 5 nam cua chinh ma" - xem ghi chu dau file). */
export function scorePeVsIndustry(pe: number, industryMedianPe: number): number {
  if (industryMedianPe <= 0) return 50;
  if (pe <= industryMedianPe) return 100;
  return Math.max(0, 100 - ((pe - industryMedianPe) / industryMedianPe) * 100);
}

/** Dividend Yield cao hon lai suat tiet kiem = phan thuong rui ro co
 * phieu hap dan hon (dung nguyen tac tai lieu Phan 3.3). */
export function scoreYieldVsSavings(yieldPct: number, savingsRate: number = SAVINGS_RATE_12M): number {
  if (savingsRate <= 0) return 50;
  return Math.max(0, Math.min(100, (yieldPct / savingsRate) * 100));
}

export function calculateTier3Score(input: {
  pe: number | null;
  industryMedianPe: number | null;
  dividendYieldPct: number | null;
}): number | null {
  const parts: number[] = [];
  if (input.pe !== null && input.industryMedianPe !== null) parts.push(scorePeVsIndustry(input.pe, input.industryMedianPe));
  if (input.dividendYieldPct !== null) parts.push(scoreYieldVsSavings(input.dividendYieldPct));
  if (parts.length === 0) return null;
  return parts.reduce((a, b) => a + b, 0) / parts.length;
}

// ============================================================
// TANG 4 - SUC KHOE KY THUAT (15%)
// ============================================================

/** RS 3 thang duong -> dong tien dang ung ho (dung nguyen tac tai lieu). */
export function scoreRs3m(rs3m: number): number {
  return Math.max(0, Math.min(100, 50 + rs3m * 2));
}

/** Moi co do (Red Flag) tru 25 diem, toi da 4 co (ve 0). */
export function scoreRedFlagCount(flagCount: number): number {
  return Math.max(0, 100 - flagCount * 25);
}

export function calculateTier4Score(input: { rs3m: number | null; redFlagCount: number }): number | null {
  const parts: number[] = [];
  if (input.rs3m !== null) parts.push(scoreRs3m(input.rs3m));
  parts.push(scoreRedFlagCount(input.redFlagCount)); // luon co (khong phu thuoc du lieu ben ngoai)
  if (parts.length === 0) return null;
  return parts.reduce((a, b) => a + b, 0) / parts.length;
}

// ============================================================
// TONG HOP - Dividend Quality Score
// ============================================================

// ============================================================
// HAM TIEN ICH - So nam chi tra lien tuc + Trung vi nhom
// ============================================================

/**
 * Dem so nam LIEN TUC (tu nam gan nhat lui ve qua khu) ma tong DPS
 * (chi tinh su kien CASH) KHONG GIAM so voi nam truoc do. Nhom theo
 * NAM cua exrightDate (hoac publicDate neu thieu exrightDate).
 */
export function calculateConsecutiveYears(events: DividendLifecycleEvent[]): number {
  const cashEvents = events.filter((e) => e.eventType === "CASH" && e.valuePerShare !== null);
  if (cashEvents.length === 0) return 0;

  const dpsByYear = new Map<number, number>();
  for (const e of cashEvents) {
    const dateStr = e.exrightDate ?? e.publicDate;
    if (!dateStr) continue;
    const year = new Date(dateStr).getFullYear();
    if (Number.isNaN(year)) continue;
    dpsByYear.set(year, (dpsByYear.get(year) ?? 0) + (e.valuePerShare ?? 0));
  }

  let years = Array.from(dpsByYear.keys()).sort((a, b) => b - a); // moi nhat truoc

  // FIX QUAN TRONG: NAM HIEN TAI (chua ket thuc) LUON co it dot chi tra
  // hon nam DA HOAN TAT truoc do (vi chua het nam de tich luy du cac
  // dot) - so sanh truc tiep se SAI LECH mot cach he thong, gay ngat
  // "lien tuc" oan cho HAU HET cac ma (da xac nhan bang du lieu that:
  // VNM tra ve 1 thay vi phai la nhieu nam). Bo qua nam hien tai khoi
  // phep so sanh, bat dau tinh tu nam DA HOAN TAT gan nhat.
  const currentYear = new Date().getFullYear();
  if (years.length > 0 && years[0] === currentYear) {
    years = years.slice(1);
  }
  if (years.length === 0) return 0;

  let consecutive = 1; // nam gan nhat (da hoan tat) luon tinh la 1 (co chi tra)
  for (let i = 0; i < years.length - 1; i++) {
    const currentYearInLoop = years[i];
    const prevYear = years[i + 1];
    // Chi tinh "lien tuc" neu 2 nam ke tiep nhau (khong bi "hut" 1 nam nao)
    if (currentYearInLoop - prevYear !== 1) break;
    const currentDps = dpsByYear.get(currentYearInLoop) ?? 0;
    const prevDps = dpsByYear.get(prevYear) ?? 0;
    if (currentDps >= prevDps) {
      consecutive++;
    } else {
      break;
    }
  }
  return consecutive;
}

/** Trung vi mot mang so (bo qua null). */
export function calculateMedian(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => v !== null).sort((a, b) => a - b);
  if (nums.length === 0) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 === 0 ? (nums[mid - 1] + nums[mid]) / 2 : nums[mid];
}

export interface DividendQualityScoreResult {
  overall: number | null;
  tier1: number | null;
  tier2: number | null;
  tier3: number | null;
  tier4: number | null;
  passesGate: boolean; // >=65 - dieu kien "cong vao" cho Phan IV (Timing Engine)
}

export function calculateDividendQualityScore(tier1: number | null, tier2: number | null, tier3: number | null, tier4: number | null): DividendQualityScoreResult {
  // Neu thieu 1 tang, PHAN BO LAI trong so cho cac tang con lai (theo
  // dung ty le goc 30/30/25/15) thay vi coi tang thieu la 0 diem (tranh
  // phat oan cac ma thieu du lieu 1 phan).
  const weights: { value: number | null; weight: number }[] = [
    { value: tier1, weight: 30 },
    { value: tier2, weight: 30 },
    { value: tier3, weight: 25 },
    { value: tier4, weight: 15 },
  ];
  const available = weights.filter((w) => w.value !== null);
  if (available.length === 0) {
    return { overall: null, tier1, tier2, tier3, tier4, passesGate: false };
  }
  const totalWeight = available.reduce((s, w) => s + w.weight, 0);
  const overall = available.reduce((s, w) => s + (w.value as number) * (w.weight / totalWeight), 0);

  return {
    overall: Math.round(overall * 10) / 10,
    tier1, tier2, tier3, tier4,
    passesGate: overall >= 65,
  };
}

// ============================================================
// F-SCORE (Piotroski) - RUT GON 6/9 tieu chi. 3 tieu chi con lai KHONG
// dua vao vi THIEU DU LIEU DA XAC NHAN (khong doan mo):
//   - CFO duong, CFO > LNST: can Cash Flow Statement - CHUA XAC NHAN
//     CHAC CHAN field nao la CFO qua doi chieu (chi co goi y do lon hop
//     ly, KHONG du tin cay de dung).
//   - Khong phat hanh them CP: can So co phieu luu hanh - KHONG CO
//     NGUON du lieu nao xac nhan duoc.
//
// 6 tieu chi DA DUNG deu XAC NHAN qua PHEP TINH KE TOAN KHOP CHINH XAC
// voi du lieu that VNM Q1/2018 (xem ghi chu trong vci-balance-sheet-
// adapter.ts va vci-financials-adapter.ts).
// ============================================================

export interface FScoreQuarterInput {
  netProfit: number | null;
  totalAssets: number | null;
  longTermDebt: number | null;
  currentAssets: number | null;
  currentLiabilities: number | null;
  revenue: number | null;
  grossProfit: number | null;
}

export interface FScoreResult {
  score: number; // 0-6
  maxScore: 6;
  details: {
    roaPositive: boolean | null;
    roaIncreasing: boolean | null;
    leverageDecreasing: boolean | null;
    currentRatioIncreasing: boolean | null;
    grossMarginIncreasing: boolean | null;
    assetTurnoverIncreasing: boolean | null;
  };
}

/**
 * Tinh F-Score rut gon (6/9) tu 2 ky: hien tai (current) va cung ky nam
 * truoc (yearAgo, cach 4 quy trong mang da sort moi->cu). Neu THIEU du
 * lieu 1 trong 2 ky cho 1 tieu chi, tieu chi do tra ve null (khong tinh
 * vao diem cong lan khong tru diem) - KHONG suy dien/gia dinh gia tri.
 */
export function calculateFScoreLite(current: FScoreQuarterInput, yearAgo: FScoreQuarterInput | null): FScoreResult {
  const details: FScoreResult["details"] = {
    roaPositive: null, roaIncreasing: null, leverageDecreasing: null,
    currentRatioIncreasing: null, grossMarginIncreasing: null, assetTurnoverIncreasing: null,
  };

  // 1. ROA duong (chi can ky hien tai)
  const roaCurrent = current.netProfit !== null && current.totalAssets && current.totalAssets !== 0
    ? current.netProfit / current.totalAssets : null;
  if (roaCurrent !== null) details.roaPositive = roaCurrent > 0;

  if (yearAgo) {
    const roaPrev = yearAgo.netProfit !== null && yearAgo.totalAssets && yearAgo.totalAssets !== 0
      ? yearAgo.netProfit / yearAgo.totalAssets : null;

    // 2. ROA tang so cung ky nam truoc
    if (roaCurrent !== null && roaPrev !== null) details.roaIncreasing = roaCurrent > roaPrev;

    // 3. Don bay dai han giam (No dai han/Tong tai san giam)
    const leverageCurrent = current.longTermDebt !== null && current.totalAssets && current.totalAssets !== 0
      ? current.longTermDebt / current.totalAssets : null;
    const leveragePrev = yearAgo.longTermDebt !== null && yearAgo.totalAssets && yearAgo.totalAssets !== 0
      ? yearAgo.longTermDebt / yearAgo.totalAssets : null;
    if (leverageCurrent !== null && leveragePrev !== null) details.leverageDecreasing = leverageCurrent < leveragePrev;

    // 4. Current ratio tang (TSNH/NNH tang)
    const currentRatioCurrent = current.currentAssets !== null && current.currentLiabilities && current.currentLiabilities !== 0
      ? current.currentAssets / current.currentLiabilities : null;
    const currentRatioPrev = yearAgo.currentAssets !== null && yearAgo.currentLiabilities && yearAgo.currentLiabilities !== 0
      ? yearAgo.currentAssets / yearAgo.currentLiabilities : null;
    if (currentRatioCurrent !== null && currentRatioPrev !== null) details.currentRatioIncreasing = currentRatioCurrent > currentRatioPrev;

    // 5. Bien loi nhuan gop tang
    const grossMarginCurrent = current.grossProfit !== null && current.revenue && current.revenue !== 0
      ? current.grossProfit / current.revenue : null;
    const grossMarginPrev = yearAgo.grossProfit !== null && yearAgo.revenue && yearAgo.revenue !== 0
      ? yearAgo.grossProfit / yearAgo.revenue : null;
    if (grossMarginCurrent !== null && grossMarginPrev !== null) details.grossMarginIncreasing = grossMarginCurrent > grossMarginPrev;

    // 6. Vong quay tai san tang (Doanh thu/Tong tai san tang)
    const assetTurnoverCurrent = current.revenue !== null && current.totalAssets && current.totalAssets !== 0
      ? current.revenue / current.totalAssets : null;
    const assetTurnoverPrev = yearAgo.revenue !== null && yearAgo.totalAssets && yearAgo.totalAssets !== 0
      ? yearAgo.revenue / yearAgo.totalAssets : null;
    if (assetTurnoverCurrent !== null && assetTurnoverPrev !== null) details.assetTurnoverIncreasing = assetTurnoverCurrent > assetTurnoverPrev;
  }

  const score = Object.values(details).filter((v) => v === true).length;
  return { score, maxScore: 6, details };
}
