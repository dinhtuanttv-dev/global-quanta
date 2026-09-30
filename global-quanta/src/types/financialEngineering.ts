import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────
// Financial Engineering Layer — Phase 1 (tich hop tu goi ban giao Chat Xuc Tac 2.0)
// Lop phan tich dinh luong & rui ro dung tren catalyst engine hien tai.
// Toan bo la PURE TYPES / PURE FUNCTIONS - khong doi schema CatalystCard/
// CatalystSnapshot hien co, khong dung API moi nao.
// ─────────────────────────────────────────────────────────────────────────

// ── A.1 Fundamental Forensics ──────────────────────────────────────────────
export const FinancialStatementInputSchema = z.object({
  ticker: z.string(),
  period: z.string(), // "2026Q3"
  // Bang can doi ke toan & KQKD toi thieu - don vi: VND, nhat quan 2 ky lien ke
  receivables: z.number(),
  sales: z.number(),
  costOfGoodsSold: z.number(),
  currentAssets: z.number(),
  ppeGross: z.number(), // tai san co dinh huu hinh (gross)
  totalAssets: z.number(),
  depreciation: z.number(),
  sgaExpense: z.number(),
  netIncome: z.number(),
  totalLongTermDebt: z.number(),
  operatingCashFlow: z.number(),
  currentLiabilities: z.number(),
  retainedEarnings: z.number(),
  ebit: z.number(),
  bookValueEquity: z.number(),
  totalLiabilities: z.number(),
  workingCapital: z.number(),
  sharesOutstanding: z.number(),
});
export type FinancialStatementInput = z.infer<typeof FinancialStatementInputSchema>;

export interface ForensicScoreResult {
  ticker: string;
  beneishMScore: number;
  beneishFlag: "likely_manipulator" | "unlikely" | "insufficient_data";
  altmanZScore: number;
  altmanZone: "safe" | "grey" | "distress";
  piotroskiFScore: number; // 0-9
  piotroskiFlag: "strong" | "moderate" | "weak";
  /** true neu catalyst tich cuc nhung nen tang dang xau di - "aspect conflict" */
  fundamentalSentimentConflict: boolean;
  computedAt: string;
}

// ── A.5 Portfolio Risk Overlay ─────────────────────────────────────────────
export interface PositionSizeInput {
  winProbability: number; // [0,1] - tu historicalWinRate/100 cua catalyst card
  winLossRatio: number; // trung binh lai khi dung / trung binh lo khi sai (b trong Kelly)
  kellyFraction: number; // he so chiet khau, mac dinh 0.25 (1/4 Kelly)
  portfolioValue: number;
  maxPositionPct: number; // tran cung, vd 0.1 = toi da 10% NAV/ma
}
export interface PositionSizeResult {
  fullKellyPct: number;
  recommendedPct: number; // da chiet khau + ap tran
  recommendedAmount: number;
  capped: boolean;
}

export interface VarInput {
  /** Chuoi loi suat lich su hang ngay cua danh muc, dang thap phan (0.012 = +1.2%) */
  dailyReturns: number[];
  confidenceLevel: number; // vd 0.95, 0.99
  portfolioValue: number;
}
export interface VarResult {
  varPct: number; // luon duong, ton thất toi da voi xac suat confidenceLevel
  varAmount: number;
  cvarPct: number; // expected shortfall - ton thất TB khi vuot VaR
  cvarAmount: number;
  sampleSize: number;
  warning: string | null; // canh bao khi sampleSize qua nho de tin cay
}

export interface StressScenario {
  name: string;
  description: string;
  /** he so nhay cam ap dung len NAV danh muc, am = lo */
  shockPct: number;
}
export interface StressTestResult {
  scenario: StressScenario;
  estimatedPnlPct: number;
  estimatedPnlAmount: number;
}

// ── A.6 Corporate Action Intelligence ──────────────────────────────────────
export interface DividendEvent {
  ticker: string;
  exDate: string; // ISO
  dividendPerShare: number;
  priceBeforeExDate: number;
}
export interface DividendDriftResult {
  ticker: string;
  sampleSize: number;
  avgDriftPct: number; // trung binh % bien dong gia 5 phien sau GDKHQ, da dieu chinh co tuc
  stdDevPct: number;
  confidence: "low" | "medium" | "high"; // dua tren sampleSize
}

export interface DilutionEvent {
  ticker: string;
  sharesOutstandingBefore: number;
  newSharesIssued: number;
  issueType: "private_placement" | "esop" | "rights_issue" | "convertible_bond";
}
export interface DilutionImpactResult {
  dilutionPct: number;
  compositeScoreAdjustment: number; // diem tru de xuat ap vao compositeScore
}

// ── A.7 Explainability ──────────────────────────────────────────────────────
export interface ScoreContributor {
  factor: string;
  weight: number; // [0,1], tong cac contributor nen ~1
  direction: "positive" | "negative";
  detail: string;
}
export interface ScoreExplanation {
  ticker: string;
  compositeScore: number;
  topContributors: ScoreContributor[]; // toi da 3, sap theo |weight| giam dan
  narrativeVi: string; // cau giai thich ngon ngu tu nhien, rule-based
  auditId: string;
}
