import useSWR from "swr";

import type { WindowStat } from "./useCycleDetail";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "https://tuan-quant-scanner-psi.vercel.app";
const fetcher = (url: string) => fetch(url).then((r) => {
  if (!r.ok) throw new Error(`Loi ${r.status}`);
  return r.json();
});

export interface FvgZone { startDate: string; endDate: string; direction: "bullish" | "bearish"; top: number; bottom: number; isMitigated: boolean; mitigatedDate: string | null; }
export interface StructureEvent { date: string; type: "BOS" | "CHoCH"; direction: "bullish" | "bearish"; brokenSwingPrice: number; brokenSwingDate: string; }
export interface OrderBlockZone { date: string; direction: "bullish" | "bearish"; top: number; bottom: number; linkedEventDate: string; impulseRatio: number; }
export interface VsaSignal { date: string; type: "no_demand" | "no_supply"; volume: number; volumePercentile: number; }

export interface WyckoffRange { startDate: string; endDate: string; support: number; resistance: number; avgVolume: number; avgSpread: number; }
export interface WyckoffEvent { date: string; type: "spring" | "sos" | "lps"; price: number; volume: number; volumeVsAvgPct: number; }
export interface WyckoffSchematic { range: WyckoffRange; spring: WyckoffEvent | null; sos: WyckoffEvent | null; lps: WyckoffEvent | null; status: "range_only" | "spring_confirmed" | "sos_confirmed" | "lps_confirmed"; }

export interface SmcDetectorData {
  ticker: string; swingPointCount: number;
  fvg: { total: number; unmitigated: number; zones: FvgZone[] };
  structure: { totalEvents: number; recentEvents: StructureEvent[]; currentBias: "bullish" | "bearish" | null; lastEventType: "BOS" | "CHoCH" | null };
  orderBlocks: { total: number; zones: OrderBlockZone[] };
  vsa: { recentSignals: VsaSignal[]; lastSignal: VsaSignal | null };
  wyckoff: WyckoffSchematic | null;
  backtest: {
    holdDays: number;
    fvgBullish: WindowStat | null; fvgBearish: WindowStat | null;
    bosBullish: WindowStat | null; bosBearish: WindowStat | null;
    chochBullish: WindowStat | null; chochBearish: WindowStat | null;
    orderBlockBullish: WindowStat | null; orderBlockBearish: WindowStat | null;
    wyckoffNote: string;
  };
  methodologyNote: string;
}

// Elite 10 - SMC THAT (Giai doan 1: FVG + BOS/CHoCH). Noi voi route MOI
// /api/elite10/smc/{ticker} - HOAN TOAN TACH BIET voi du lieu mock cua
// route /api/ta-vn-index/analyze (khong dong vao route dang chay).
export function useSmcDetector(ticker: string | null) {
  const { data, error, isLoading } = useSWR<SmcDetectorData>(
    ticker ? `${API_BASE}/api/elite10/smc/${ticker}` : null,
    fetcher,
    { refreshInterval: 60 * 60 * 1000, revalidateOnFocus: false, dedupingInterval: 30 * 60 * 1000 }
  );
  return { smcReal: data ?? null, isLoading, error };
}
