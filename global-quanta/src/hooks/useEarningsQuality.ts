import useSWR from "swr";
import { fetchMarketJson } from "../services/marketDataClient";

/** F5 (06/11/2026): Chất lượng KQKD (Gateway /api/fundamentals/earnings-quality). */
export type GrowthStatus = "NORMAL" | "LOW_BASE" | "TURNAROUND" | "TO_LOSS" | "LOSS" | "NA";
export interface EarningsQualityRow {
  ticker: string; fiscal: string; quarter: string; publishedAt: string | null; current: boolean;
  revenue: number | null; npat: number | null;
  npatYoY: number | null; npatStatus: GrowthStatus; npatYoYRaw: number | null; revYoY: number | null; revStatus: GrowthStatus;
  sue: number | null; sur: number | null; margin: number | null; marginDelta: number | null; ttmYoY: number | null; streak: number;
  spark: { q: string; npat: number | null }[]; notes: string[]; score: number | null; rank: number | null;
}
export interface EarningsQuality {
  version: string; label: string; asOf: string; fetchedAt: string | null; source?: string; latestQuarter: string | null; latestFiscal: string | null;
  counts: { tickers: number; reportedLatest: number; ranked: number; turnaround: number; toLoss: number; lowBase: number; positiveSue: number };
  medianNpatYoY: number | null; shareNpatUp: number | null;
  method: { weights: Record<string, number>; lowBaseVnd: number; lowBaseRel: number; growthCap: [number, number]; sueWindow: number; sueMinObs: number; noteVi: string };
  rows: EarningsQualityRow[]; stale?: boolean; staleReason?: string;
}

export function useEarningsQuality(enabled = true) {
  const { data, error, isLoading } = useSWR<EarningsQuality>(enabled ? "earnings-quality" : null, () => fetchMarketJson<EarningsQuality>("/api/fundamentals/earnings-quality"), {
    revalidateOnFocus: false, dedupingInterval: 10 * 60_000, refreshInterval: 30 * 60_000,
  });
  return { data: data ?? null, error: error ? String((error as Error).message ?? error) : null, isLoading };
}
