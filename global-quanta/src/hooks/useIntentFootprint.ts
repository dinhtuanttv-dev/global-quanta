import useSWR from "swr";
import { fetchMarketJson } from "../services/marketDataClient";

export interface IntentProb { id: string; label: string; p: number }
export interface IntentBucket {
  bucket: number; label: string; volume: number; delta?: number | null; deltaPct?: number | null; ret?: number;
  zEffort?: number | null; zResult?: number | null; zLarge?: number | null; rvol?: number | null;
  flags: string[]; intent?: IntentProb;
}
export interface StealthWindow {
  z: number; percentile: number; intensity: number; quietness: number; persistence: number; ret: number; reading: string;
}
export interface IntentValidationState {
  id: string; label: string; n: number; upRate: number; downRate: number; liftUp: number; liftDown: number;
  significantUp: boolean; significantDown: boolean; stableUp: boolean; stableDown: boolean; verdict: string; validated: boolean;
}

export interface IntentFootprint {
  symbol: string; live: boolean; viewDate: string; ready: boolean; reason?: string;
  method?: "BVC" | "LEE_READY"; methodNote?: string; sessions?: number; largeMinuteThreshold?: number;
  lambda?: { bucket: number | null; recent5: number | null; ratio: number | null; daily: number | null };
  today?: { volume: number; delta: number; largeDelta: number; smallDelta: number; deltaPct: number | null; buckets: IntentBucket[] } | null;
  /** Trạng thái cả phiên (HMM theo phiên) — KHÁC trạng thái khung gần nhất. */
  sessionIntent?: { date: string | null; probs: IntentProb[]; top: IntentProb; confident: boolean };
  /** Trạng thái khung gần nhất (HMM theo khung). */
  intent?: { probs: IntentProb[]; top: IntentProb; confident: boolean };
  intentBucket?: string | null;
  dailyIntent?: { date: string; id: string; label: string; p: number; deltaPctAdv: number | null; ret: number | null }[];
  stealth?: { s1: StealthWindow | null; s5: StealthWindow | null; s20: StealthWindow | null };
  bigSmall?: { series: { date: string; large: number; small: number }[]; cumLarge: number; cumSmall: number; divergent: boolean; reading: string };
  execution?: {
    intraPersistence: number | null; dailyPersistence: number | null; hurst: number | null; participationCV: number | null; alignedBuckets: number;
    clipRegularity: { share: number; topSizes: { size: number; prints: number }[]; prints: number } | null;
    samePriceClusters: { time: string; price: number; volume: number; side: string }[];
  };
  flagLabels?: Record<string, string>;
  validation?: {
    generatedAt: string; samples: number; symbols: number; from: string; to: string; horizonDays: number; barrierAtr: number;
    base: { up: number; down: number }; states: IntentValidationState[]; method: string;
  } | null;
  disclaimer: string;
}

/** IFE — bản đồ ý đồ dòng tiền; chỉ tải khi dòng phụ mở, làm mới 60s. */
export function useIntentFootprint(symbol: string | null) {
  const { data, error, isLoading } = useSWR<IntentFootprint>(
    symbol ? ["intent-footprint", symbol] : null,
    () => fetchMarketJson<IntentFootprint>(`/api/market/scanner/${encodeURIComponent(symbol!)}/intent`),
    { refreshInterval: 60_000, revalidateOnFocus: false, dedupingInterval: 30_000 },
  );
  return { data, error, isLoading };
}
