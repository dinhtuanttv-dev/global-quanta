import useSWR from "swr";
import { fetchMarketJson } from "../services/marketDataClient";
import type { CommoditySnapshot } from "../lib/commodities/types";

/** Gateway /api/commodities/snapshot — làm mới 5 phút/lần (Pink Sheet tháng, Yahoo ngày). */
export function useCommoditySnapshot() {
  return useSWR<CommoditySnapshot>("commodities-snapshot", () => fetchMarketJson<CommoditySnapshot>("/api/commodities/snapshot"), {
    refreshInterval: 5 * 60_000,
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });
}
