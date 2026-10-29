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
}

/** CH3D — ESA intraday cho chart 3D Hồ sơ 360°; làm mới 60 giây (như panel ESA), chỉ tải khi `enabled`. */
export function useEsaSnapshot(symbol: string | null, enabled: boolean) {
  const key = enabled && symbol && isMarketGatewayEnabled() ? ["esa-live", symbol] : null;
  const { data, error, isLoading } = useSWR(key, () => fetchMarketJson<EsaLive>(`/api/market/research/esa/${encodeURIComponent(symbol!.trim().toUpperCase())}`),
    { refreshInterval: 60_000, dedupingInterval: 30_000, revalidateOnFocus: false, errorRetryCount: 1 });
  return { esa: data ?? null, loading: isLoading, error: error ? String((error as Error).message ?? error) : null };
}
