import useSWR from "swr";
import { getRadarSignals, isMarketGatewayEnabled, type RadarSignals } from "../services/marketDataClient";
import { useResearchUi } from "./useResearchUi";

/**
 * Lớp tín hiệu dòng tiền cho ELITE COMMAND RADAR (một lần gọi cho cả danh mục, làm mới 5 phút).
 * Tôn trọng công tắc hiển thị AI nghiên cứu (mặc định bật).
 */
export function useRadarSignals(tickers: string[]) {
  const [enabled] = useResearchUi();
  const key = [...tickers].sort().join(",");
  const { data, error, isLoading } = useSWR<RadarSignals>(
    enabled && isMarketGatewayEnabled() && key ? ["radar-signals", key] : null,
    () => getRadarSignals(key.split(",")),
    { revalidateOnFocus: false, refreshInterval: 5 * 60_000, dedupingInterval: 60_000, shouldRetryOnError: false },
  );
  return { data: data ?? null, error: error instanceof Error ? error.message : null, isLoading, enabled };
}
