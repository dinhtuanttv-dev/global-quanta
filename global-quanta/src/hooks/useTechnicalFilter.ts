import useSWR from "swr";
import { marketUrl } from "../services/marketDataClient";

export type TechnicalFilterStrategy = "camslim" | "base-breakout";

export interface TechnicalFilterMetrics {
  score: number;
  pivot?: number;
  depthPct?: number;
  handleBars?: number;
  rightBars?: number;
  leftBars?: number;
  close?: number;
  basePivot?: number;
  baseRangePct?: number;
  volRatio?: number;
  mfi?: number;
  riskPct?: number;
  plan?: { entry?: number; stop: number; target: number; riskPct: number; rr?: number };
  belowPivotPct?: number;
  rs?: number | null;
  cupBars?: number;
  handleDepthPct?: number;
  distributionDays?: number | null;
  foreignNet20?: number | null;
  foreignNet5?: number | null;
  vp?: { poc: number; vah: number; val: number } | null;
}

export interface TechnicalFilterComponent {
  key: string;
  factor?: "C" | "A" | "N" | "S" | "L" | "I" | "M" | null;
  label: string;
  max: number;
  points: number;
  ok: boolean;
  value: number | boolean | null;
}

export interface TradeStats {
  n: number;
  winRate?: number;
  avgNetPct?: number;
  medianNetPct?: number;
  profitFactor?: number | null;
  expectancyR?: number;
  avgBars?: number;
  byReason?: Record<string, number>;
}

export interface TechnicalFilterEvidence {
  label: "VALIDATED" | "EXPERIMENTAL";
  reason: string;
  period?: { from: string; to: string; oosFrom: string };
  rules?: string;
  all: TradeStats;
  inSample?: TradeStats;
  outOfSample?: TradeStats;
  byGrade?: Record<"A" | "B" | "C", TradeStats>;
  byGradeOutOfSample?: Record<"A" | "B" | "C", TradeStats>;
  byMarket?: { up: TradeStats; down: TradeStats };
  baseline?: { holdBars: number; all: number | null; outOfSample: number | null };
  skippedLimitUp?: number;
  /** S6 — kiểm định: KTC 95% bootstrap (theo ngày vào lệnh), t so với nền, walk-forward nửa năm, số cấu hình đã thử. */
  validation?: {
    ciAll: { mean: [number, number]; pf: [number, number]; clusters: number } | null;
    ciOutOfSample: { mean: [number, number]; pf: [number, number]; clusters: number } | null;
    tVsBaseline: number | null;
    tVsBaselineOos: number | null;
    periods: (TradeStats & { period: string })[];
    trials: number;
  };
}

export interface LiveStat { n: number; hitRate: number; baseline: number; hitLow: number; hitHigh: number; z: number | null; avgSignedExcess: number | null; verdict: "edge" | "negative" | "none" | "insufficient" }
export interface LiveTracking {
  generatedAt: string | null;
  breakout: Record<"h3" | "h5" | "h10", LiveStat | null>;
  setup: Record<"h3" | "h5" | "h10", LiveStat | null>;
}

export interface CupHandlePattern {
  status: "BREAKOUT" | "SETUP";
  leftLipIdx: number; cupLowIdx: number; rightLipIdx: number; handleLowIdx: number;
  leftLipDate: string; cupLowDate: string; rightLipDate: string; handleLowDate: string;
  leftLip: number; cupLow: number; rightLip: number; handleLow: number; pivot: number;
  depthPct: number; handleDepthPct: number; cupBars: number; handleBars: number;
  uShape: boolean; handleVolDry: boolean; belowPivotPct: number;
}

export interface PricePoint { date: string; price: number }

export interface ConfluenceCluster { price: number; low: number; high: number; weight: number; sources: string[] }

/** S4 — hợp lưu Elliott/Fibonacci của tay cầm (tính từ đáy cốc bên phải). */
export interface HandleConfluence {
  rightLeg: { from: PricePoint; to: PricePoint };
  retracePct: number;
  fib: { ratio: number; price: number }[];
  wave: { count: string; points: PricePoint[]; wave4Zone: { ratio: number; price: number }[]; overlapLimit: number } | null;
  abc: { A: PricePoint; B: PricePoint; bRatio: number; cTarget: number } | null;
  avwap: number | null;
  poc: number | null;
  clusters: ConfluenceCluster[];
  best: ConfluenceCluster | null;
  handleAtConfluence: boolean;
  earlyEntry: { price: number; stop: number; riskPct: number } | null;
}

export interface CanSlimFundamentals {
  latestQuarter: string;
  npGrowthQ: number | null; npGrowthPrevQ: number | null; revGrowthQ: number | null; accelerating: boolean;
  npGrowthTtm: number | null; sustained: boolean; roe: number | null;
}

export interface TechnicalFilterResult {
  ticker: string;
  name?: string | null;
  sector?: string | null;
  status: "SETUP" | "BREAKOUT";
  grade?: "A" | "B" | "C";
  components?: TechnicalFilterComponent[];
  plan?: { entry: number; stop: number; target: number; riskPct: number; rr: number; buyZoneTop?: number };
  pattern?: CupHandlePattern;
  handle?: HandleConfluence | null;
  /** Base Breakout: hộp nền 10 phiên. */
  base?: { fromDate: string; toDate: string; high: number; low: number };
  fundamentals?: CanSlimFundamentals | null;
  date: string;
  metrics: TechnicalFilterMetrics;
  checks: Record<string, boolean>;
  liquidity?: { price: number; avgValue20: number };
  priceBasis?: string;
  bars?: number;
}

export interface TechnicalFilterCriteria {
  minPrice: number;
  minAvgValue20: number;
  range: string;
  priceBasis: string;
}

export type TechnicalFilterSkipReason = "INSUFFICIENT_BARS" | "STALE" | "ILLIQUID" | "LOW_PRICE" | "LOAD_FAILED" | "INVALID_DATA";

export interface TechnicalFilterResponse {
  strategy: TechnicalFilterStrategy;
  generatedAt: string;
  dataAsOf: string;
  source: string;
  universeCount: number;
  scannedCount: number;
  resultCount: number;
  results: TechnicalFilterResult[];
  engine?: string;
  evidence?: TechnicalFilterEvidence;
  market?: { indexAsOf: string | null; up: boolean | null; rule: string; distributionDays?: number | null };
  fundamentalsCoverage?: { withData: number; with12Quarters: number };
  liveTracking?: LiveTracking;
  criteria?: TechnicalFilterCriteria;
  priceBasis?: Record<string, number>;
  skipped: { ticker: string; reason: TechnicalFilterSkipReason | string; bars?: number; message?: string; lastDate?: string; price?: number; avgValue20?: number }[];
  disclaimer: string;
}

const fetcher = async (url: string): Promise<TechnicalFilterResponse> => {
  const response = await fetch(url, { cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error ?? `Market API lỗi ${response.status}`);
  return body as TechnicalFilterResponse;
};

export function useTechnicalFilter(strategy: TechnicalFilterStrategy) {
  const { data, error, isLoading, mutate } = useSWR<TechnicalFilterResponse>(
    marketUrl(`/api/market/strategies/${strategy}`),
    fetcher,
    { refreshInterval: 5 * 60_000, revalidateOnFocus: false, dedupingInterval: 60_000 },
  );
  return {
    data,
    error: error as Error | undefined,
    isLoading,
    refresh: mutate,
  };
}
