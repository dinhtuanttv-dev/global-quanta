// ARL-v1 (26/11/2026): sổ phán quyết Phòng họp AI (Gateway GET /api/elite/ai-room/ledger — tổng hợp công khai, không dữ liệu cá nhân).
import useSWR from "swr";
import { fetchMarketJson } from "../../services/marketDataClient";

export interface AiLedgerSide { n: number; matched: number; structural: number; rejected: number; highUncertainty: number }
export interface AiLedgerResult { entry: string; exit: string; ret: number; vnRet: number; excess: number; limitUp?: boolean }
export interface AiLedgerEntry {
  id: string; ticker: string; session: string; state: string | null; membership: string | null; hlRank: number | null;
  sides: { BULL: AiLedgerSide | null; BEAR: AiLedgerSide | null; JUDGE: AiLedgerSide | null };
  balance: number | null; results: Partial<Record<"5" | "10" | "20", AiLedgerResult>>;
}
export interface AiLedgerHorizon {
  n: number; baseline: number | null; positive: { n: number; meanExcess: number | null }; negative: { n: number; meanExcess: number | null };
  directional: number; hitRate: number | null; hitCi90: [number, number] | null; valueAdd: number | null;
}
export interface AiLedgerDoc {
  version: string; updatedAt: string | null;
  summary: { version: string; total: number; ready: number; withBalance: number; horizons: Record<string, AiLedgerHorizon>; label: string; labelVi: string; methodVi: string };
  entries: AiLedgerEntry[];
}

export function useAiRoomLedger(ticker: string | null = null, enabled = true) {
  const t = ticker && /^[A-Z][A-Z0-9]{2}$/.test(ticker) ? ticker : null;
  return useSWR<AiLedgerDoc>(enabled ? `ai-room-ledger:${t ?? "*"}` : null,
    () => fetchMarketJson<AiLedgerDoc>(`/api/elite/ai-room/ledger${t ? `?ticker=${t}` : ""}`),
    { revalidateOnFocus: false, refreshInterval: 30 * 60_000, dedupingInterval: 5 * 60_000, errorRetryCount: 1 });
}
