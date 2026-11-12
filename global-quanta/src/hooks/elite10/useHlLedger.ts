import useSWR from "swr";
import { fetchMarketJson } from "../../services/marketDataClient";

// HL-v1: sổ theo dõi tiến của quy tắc hợp lưu đa yếu tố (Gateway /api/elite/confluence/ledger). Ghi 1 lần/phiên lúc 20:45.
export interface HlLedgerGroup { labelVi: string; days: number; avgSize: number | null; meanEx: number | null; posShare: number | null; t: number | null; verdict: string }
export interface HlLedger {
  version: string; start: string; updatedAt: string | null; days: number; scoredDays: number; from: string | null; to: string | null;
  rule: { horizon: number; minDays: number }; groups: Record<string, HlLedgerGroup>; label: string; noteVi: string;
  latest: { d: string; n: number; groups: Record<string, string[]> } | null;
}
export function useHlLedger() {
  return useSWR<HlLedger | null>("elite-hl-ledger", async () => {
    try { return await fetchMarketJson<HlLedger>("/api/elite/confluence/ledger"); } catch { return null; }
  }, { revalidateOnFocus: false, refreshInterval: 30 * 60_000, dedupingInterval: 5 * 60_000, errorRetryCount: 1 });
}
