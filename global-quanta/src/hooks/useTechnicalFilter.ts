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
  foreignNet5?: number | null;
  vp?: { poc: number; vah: number; val: number } | null;
}

export interface TechnicalFilterComponent {
  key: string;
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
}

export interface TechnicalFilterResult {
  ticker: string;
  name?: string | null;
  sector?: string | null;
  status: "SETUP" | "BREAKOUT";
  grade?: "A" | "B" | "C";
  components?: TechnicalFilterComponent[];
  plan?: { entry: number; stop: number; target: number; riskPct: number; rr: number };
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
  market?: { indexAsOf: string | null; up: boolean | null; rule: string };
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
