import useSWR from "swr";
import { fetchMarketJson, isMarketGatewayEnabled } from "../../services/marketDataClient";
import type { RankHistory } from "../../lib/elite10/portfolioRadar";

/** Lịch sử hạng gọn của danh mục Elite 10 (Gateway /api/elite/rank-history) — vệt Z, lên/xuống hạng, sự kiện, tua lại. */
export function useRankHistory(days = 6) {
  const { data, error, isLoading } = useSWR<RankHistory>(isMarketGatewayEnabled() ? ["elite-rank-history", days] : null,
    () => fetchMarketJson<RankHistory>(`/api/elite/rank-history?days=${days}`), { revalidateOnFocus: false, dedupingInterval: 5 * 60_000, refreshInterval: 30 * 60_000 });
  return { history: data ?? null, error, isLoading };
}
