import useSWR from "swr";
import { fetchMarketJson } from "../../services/marketDataClient";
import type { LiqStats, LqRules } from "../../lib/elite10/decisionTypes";
import type { LqPoint } from "../../lib/elite10/liquidity";

// LQ1: số đo + chuỗi GTGD 60 phiên của một mã (Hồ sơ 360°), tại phiên quyết định mới nhất.
export interface EliteLiquidity { date: string; ticker: string; missing?: boolean; inPanel?: boolean; sigma20?: number | null; liq?: LiqStats; series?: LqPoint[]; rules: LqRules }
export function useEliteLiquidity(ticker: string | null) {
  return useSWR<EliteLiquidity | null>(ticker ? ["elite-liquidity", ticker] : null, async () => {
    try { return await fetchMarketJson<EliteLiquidity>(`/api/elite/liquidity/${ticker}`); } catch (e) { if (/404|chưa có/i.test(String((e as Error).message))) return null; throw e; }
  }, { revalidateOnFocus: false, refreshInterval: 30 * 60_000, dedupingInterval: 5 * 60_000, errorRetryCount: 1 });
}
