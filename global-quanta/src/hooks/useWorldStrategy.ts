import useSWR from "swr";
import { fetchMarketJson } from "../services/marketDataClient";
import type { Strategy } from "../lib/worldSectors/strategyTypes";

/** Gateway /api/world-sectors/strategy — chiến lược ngắn/trung hạn + sổ theo dõi tiến (S1–S2). */
export function useWorldStrategy() {
  return useSWR<Strategy>("world-strategy", () => fetchMarketJson<Strategy>("/api/world-sectors/strategy"), { refreshInterval: 5 * 60_000, revalidateOnFocus: false });
}
