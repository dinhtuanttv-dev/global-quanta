// Bộ lọc Hợp lưu v2 (H2) — đọc kết quả quét của Gateway (/api/market/strategies/convergence, chiến lược "convergence").
import useSWR from "swr";
import { marketUrl } from "../services/marketDataClient";
import type { ConvergenceComponent, ConvergenceLevel, ConvergenceZone } from "../lib/quant-core/convergence";
import type { LiveTracking, TechnicalFilterCriteria, TechnicalFilterEvidence } from "./useTechnicalFilter";

export interface ConvergenceRow {
  ticker: string;
  name?: string | null;
  sector?: string | null;
  status: "READY" | "WATCH";
  grade: "A" | "B" | "C";
  side: "buy" | "sell";
  date: string;
  metrics: { score: number; close: number; side: "buy" | "sell" };
  components: ConvergenceComponent[];
  zone: ConvergenceZone | null;
  levels: ConvergenceLevel[];
  wyckoff: {
    engine: string; phase: string; wyckoffPhase: string | null; kind: string | null; cyclePhase: string | null;
    rangeHigh: number | null; rangeLow: number | null; rangeStartDate: string | null; rangeEndDate: string | null;
    testsPassed: number | null; testsAvail: number | null;
    tranche: { n: number; status: string; date: string | null } | null;
    signals: { key: string; knownDate: string; fresh: boolean; adverse: boolean }[];
  };
  liquidityCapacity: { pct: number; value: number }[];
  plan: { entry: number; stop: number; target: number; rr: number } | null;
  liquidity?: { price: number; avgValue20: number };
  priceBasis?: string;
  version: string;
}

/** Bằng chứng: như các bộ lọc khác, thêm PENDING (job đêm chưa tính xong). */
export type ConvergenceEvidence = Omit<TechnicalFilterEvidence, "label"> & { label: TechnicalFilterEvidence["label"] | "PENDING"; computedAt?: string };

export interface ConvergenceDoc {
  strategy: "convergence";
  engine: string;
  generatedAt: string;
  dataAsOf: string;
  universeCount: number;
  scannedCount: number;
  resultCount: number;
  results: ConvergenceRow[];
  evidence?: ConvergenceEvidence;
  market?: { indexAsOf: string | null; up: boolean | null; rule: string };
  criteria?: TechnicalFilterCriteria;
  liveTracking?: LiveTracking;
  skipped: { ticker: string; reason: string }[];
  disclaimer: string;
}

const fetcher = async (url: string): Promise<ConvergenceDoc> => {
  const response = await fetch(url, { cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error ?? `Market API lỗi ${response.status}`);
  return body as ConvergenceDoc;
};

export function useConvergenceV2() {
  const { data, error, isLoading, mutate } = useSWR<ConvergenceDoc>(
    marketUrl("/api/market/strategies/convergence"),
    fetcher,
    { refreshInterval: 5 * 60_000, revalidateOnFocus: false, dedupingInterval: 60_000 },
  );
  return { data, error: error as Error | undefined, isLoading, refresh: mutate };
}
