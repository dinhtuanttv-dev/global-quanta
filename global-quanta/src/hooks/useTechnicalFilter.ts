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
  plan?: { stop: number; target: number; riskPct: number };
}

export interface TechnicalFilterResult {
  ticker: string;
  status: "SETUP" | "BREAKOUT";
  date: string;
  metrics: TechnicalFilterMetrics;
  checks: Record<string, boolean>;
}

export interface TechnicalFilterResponse {
  strategy: TechnicalFilterStrategy;
  generatedAt: string;
  dataAsOf: string;
  source: string;
  universeCount: number;
  scannedCount: number;
  resultCount: number;
  results: TechnicalFilterResult[];
  skipped: { ticker: string; reason: string; bars?: number; message?: string }[];
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
