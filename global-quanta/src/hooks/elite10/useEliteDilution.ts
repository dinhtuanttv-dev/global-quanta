import useSWR from "swr";
import { fetchMarketJson } from "../../services/marketDataClient";
import type { DilutionPhase, PxR1 } from "../../lib/elite10/decisionTypes";

// PX0 / PX-L: hồ sơ đợt pha loãng của một mã + sổ theo dõi tiến (chỉ hiển thị).
export interface DilutionHistoryRow { ex: string; cat: DilutionPhase["cat"]; ratio: number; listing: string | null; lag: number | null; exDay: number | null; x10: number | null; x20: number | null; x30: number | null }
export interface PxLedgerEntry { id: string; t: string; ex: string; cat: string; ratio: number; registeredAt: string; entry: string; listing: string | null; listingSeen: string | null; x: Record<string, number> }
export interface EliteDilution {
  version: string; asOf: string; ticker: string; pxR1: PxR1; phase: DilutionPhase | { phase: "NONE" };
  ownLags: { ex: string; listing: string; lag: number }[]; marketLag: { lag: number | null; n: number; p25: number | null; p75: number | null };
  history: DilutionHistoryRow[]; historyNote: string | null; ledger: PxLedgerEntry[];
}
type Stat = { n: number; mean?: number; median?: number; pos?: number };
export interface PxLedger { version: string; start: string; updatedAt: string | null; label: string; pxR1: PxR1; summary: { registered: number; listed: number; 10: Stat; 20: Stat; 30: Stat }; entries: PxLedgerEntry[] }
const OPTS = { revalidateOnFocus: false, refreshInterval: 30 * 60_000, dedupingInterval: 5 * 60_000, errorRetryCount: 1 };
async function quiet<T>(p: string): Promise<T | null> {
  try { return await fetchMarketJson<T>(p); } catch (e) { if (/404|chưa có/i.test(String((e as Error).message))) return null; throw e; }
}
export function useEliteDilution(ticker: string | null) {
  return useSWR<EliteDilution | null>(ticker ? ["elite-dilution", ticker] : null, () => quiet<EliteDilution>(`/api/elite/dilution/${ticker}`), OPTS);
}
export function usePxLedger() {
  return useSWR<PxLedger | null>("elite-px-ledger", () => quiet<PxLedger>("/api/elite/px-ledger"), OPTS);
}
