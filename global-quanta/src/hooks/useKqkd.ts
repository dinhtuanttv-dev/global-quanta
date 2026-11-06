import useSWR from "swr";
import { fetchMarketJson } from "../services/marketDataClient";
import type { KqkdDetail, KqkdSummary } from "../lib/kqkd/types";

/** K6 (06/11/2026): KQKD theo quý — bảng toàn thị trường (Gateway /api/fundamentals/kqkd/summary). */
export function useKqkdSummary(enabled = true) {
  const { data, error, isLoading } = useSWR<KqkdSummary>(enabled ? "kqkd-summary" : null, () => fetchMarketJson<KqkdSummary>("/api/fundamentals/kqkd/summary"), {
    revalidateOnFocus: false, dedupingInterval: 10 * 60_000, refreshInterval: 30 * 60_000,
  });
  return { data: data ?? null, error: error ? String((error as Error).message ?? error) : null, isLoading };
}

/** Chi tiết một mã (ma trận quý & lũy kế, thác nước, chất lượng, mùa vụ, 3D/4D). */
export function useKqkdTicker(ticker: string | null) {
  const t = ticker?.toUpperCase() ?? null;
  const { data, error, isLoading } = useSWR<KqkdDetail>(t ? `kqkd-ticker:${t}` : null, () => fetchMarketJson<KqkdDetail>(`/api/fundamentals/kqkd/ticker/${encodeURIComponent(t!)}`), {
    revalidateOnFocus: false, dedupingInterval: 10 * 60_000,
  });
  return { data: data ?? null, error: error ? String((error as Error).message ?? error) : null, isLoading };
}
