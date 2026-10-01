import useSWR from "swr";
import { fetchMarketJson } from "../services/marketDataClient";

export interface Prob { p: number; low: number; high: number; n: number; k: number; enough: boolean }
export interface BucketProfile {
  id: string; label: string; median: number; p25: number; p75: number; medianRange: number;
  cumShare: number | null; cumShareP25: number | null; cumShareP75: number | null; medianCumVolume: number;
}

export interface IntradayCycle {
  symbol: string;
  viewDate: string;
  live: boolean;
  ready: boolean;
  reason?: string;
  sessions: number;
  from?: string;
  to?: string;
  buckets?: { id: string; label: string }[];
  profile?: BucketProfile[];
  validation?: {
    evaluatedSessions: number;
    surge: { brierSkill: number | null; samples: number; events: number };
    dry: { brierSkill: number | null; samples: number; events: number };
    calibration: { predicted: number; observed: number; n: number }[];
    validated: { surge: boolean; dry: boolean };
  };
  current?: {
    date: string; lastBucket: number; inProgress: boolean; sessionDone: boolean;
    cumVolume: number; timeAdjustedRvol: number | null; projectedVolume: number | null; projectedRange: [number, number] | null;
    bucketRvol: (number | null)[];
    state: { priceBin: string; priceLabel: string; vwapPos: "Vup" | "Vdn"; rvolBin: string; rvolLabel: string; changePct: number; cumRvol: number | null } | null;
    next: { bucket: number; label: string; surge: Prob; dry: Prob; up: Prob; down: Prob; baseline: { surge: number; dry: number; up: number; down: number } } | null;
    cell: string | null;
    transitionsFromCell: { n: number; to: Record<string, Prob> } | null;
    enterHighUpWithin2: number | null;
    enterHighDownWithin2: number | null;
    buckets: ({ volume: number; open: number; high: number; low: number; close: number } | null)[];
  } | null;
  disclaimer: string;
}

/** Chu kỳ & xác suất khối lượng trong phiên — làm mới 60s khi đang mở dòng phụ. */
export function useIntradayCycle(symbol: string | null) {
  const { data, error, isLoading } = useSWR<IntradayCycle>(
    symbol ? ["intraday-cycle", symbol] : null,
    () => fetchMarketJson<IntradayCycle>(`/api/market/scanner/${encodeURIComponent(symbol!)}/intraday-cycle`),
    { refreshInterval: 60_000, revalidateOnFocus: false, dedupingInterval: 30_000 },
  );
  return { data, error, isLoading };
}
