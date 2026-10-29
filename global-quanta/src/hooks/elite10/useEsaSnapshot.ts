import useSWR from "swr";
import { fetchMarketJson, isMarketGatewayEnabled } from "../../services/marketDataClient";

/** Phần cần dùng của snapshot ESA R0 (Gateway /api/market/research/esa/:symbol — cùng nguồn panel ESA của Siêu Quét AI). */
export interface EsaLive {
  symbol: string;
  status: "research_only" | "insufficient_data" | "market_closed" | "stale";
  sessionLive: boolean;
  asOf: string | null;
  reason: string | null;
  observation: null | { sessionDate: string; observedMinute: string; relativeVolume: number; robustZ: number | null; priceChangePct: number | null; direction: string; sampleSize: number };
  alert: null | { type: string; severity: "high_anomaly" | "unusual_activity"; interpretation: string };
  method: { version: string };
  /** N0: có khi gọi kèm `since` (thời điểm ra tin trong phiên hôm nay). */
  sinceNews?: EsaSince | null;
}

/** KL cộng dồn từ phút ra tin tới hiện tại so cùng khung phút các phiên trước (Gateway buildEsaSince). */
export interface EsaSince {
  status: "research_only" | "not_applicable" | "waiting" | "insufficient_data"; sinceIso: string; reason: string | null;
  sinceMinute?: string; observedMinute?: string; currentVolume?: number; medianSameWindow?: number; p90SameWindow?: number;
  relativeVolume?: number | null; robustZ?: number | null; priceChangeSincePct?: number | null; sampleSize?: number;
  alert: null | { severity: "high_anomaly" | "unusual_activity"; triggeredBy: string[] };
}

/** CH3D — ESA intraday cho chart Hồ sơ 360°; làm mới 60 giây (như panel ESA), chỉ tải khi `enabled`. `since` = ISO thời điểm ra tin (N0). */
export function useEsaSnapshot(symbol: string | null, enabled: boolean, since: string | null = null) {
  const key = enabled && symbol && isMarketGatewayEnabled() ? ["esa-live", symbol, since ?? ""] : null;
  const { data, error, isLoading } = useSWR(key, () => fetchMarketJson<EsaLive>(`/api/market/research/esa/${encodeURIComponent(symbol!.trim().toUpperCase())}${since ? `?since=${encodeURIComponent(since)}` : ""}`),
    { refreshInterval: 60_000, dedupingInterval: 30_000, revalidateOnFocus: false, errorRetryCount: 1 });
  return { esa: data ?? null, loading: isLoading, error: error ? String((error as Error).message ?? error) : null };
}
