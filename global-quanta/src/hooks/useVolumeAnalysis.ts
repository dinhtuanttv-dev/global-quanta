import useSWR from "swr";
import { fetchMarketJson } from "../services/marketDataClient";

export interface VolumeBar { date: string; volume: number; value: number; close: number; up: boolean }
export interface ProfileBin { priceLow: number; priceHigh: number; volume: number }

export interface VolumeAnalysis {
  symbol: string;
  asOf: string;
  partialToday: boolean;
  coverage?: { detail: "summary" | "full"; lastClosedSession: string; expectedClosedSession: string | null };
  today: {
    date: string; price: number; changePct: number | null; volume: number; value: number;
    dealVolume: number; dealValue: number; avgVolume20: number | null; rvol20: number | null;
    /** "intraday": trong phiên, dùng rvolTimeAdjusted (so cùng thời điểm) thay cho rvol20. */
    rvolMode: "daily" | "intraday";
    rvolTimeAdjusted: number | null;
  };
  trend: {
    bars30: VolumeBar[]; ma20Volume: number | null; upDownVolumeRatio20: number | null;
    obvDirection: "up" | "down" | "flat"; obvChangeVsAvgVolume: number | null; cmf20: number | null;
    divergence: { code: string; label: string; priceChangePct: number; volumeChangePct: number } | null;
  };
  foreign: {
    /** true: đang trong phiên, dữ liệu khối ngoại hôm nay chưa có (không phải 0). */
    pendingToday: boolean;
    lastSettledDate: string;
    today: { buyVol: number; sellVol: number; netVol: number; buyVal: number; sellVal: number; netVal: number } | null;
    net5Val: number; net20Val: number; buySharePct: number | null; sellSharePct: number | null;
    streak: { direction: "buy" | "sell" | "none"; sessions: number };
    room: number | null;
    netSeries20: { date: string; netVal: number }[];
  };
  profile: {
    sessions: number; bins: ProfileBin[]; poc: number; valueAreaLow: number; valueAreaHigh: number;
    position: "above" | "below" | "inside";
  } | null;
  intraday: {
    buckets15m: { time: string; volume: number }[]; totalVolume: number;
    atoSharePct: number | null; atcSharePct: number | null;
    peak: { time: string; volume: number; multipleOfAvgBar: number | null } | null;
    sameTime: { asOfTime: string; ratio: number; sessions: number } | null;
  } | null;
  insights: string[];
  notes: string[];
}

/** Dữ liệu dòng phụ "phân tích khối lượng" — chỉ tải khi dòng được mở. */
export function useVolumeAnalysis(symbol: string | null, enabled = true, detail: "full" | "summary" = "full") {
  const { data, error, isLoading } = useSWR<VolumeAnalysis>(
    symbol && enabled ? detail === "summary" ? ["volume-analysis", symbol, detail] : ["volume-analysis", symbol] : null,
    () => fetchMarketJson<VolumeAnalysis>(`/api/market/scanner/${encodeURIComponent(symbol!)}/volume`,
      detail === "summary" ? { detail } : undefined, { signal: AbortSignal.timeout(detail === "summary" ? 5_000 : 24_000) }),
    { refreshInterval: 60_000, revalidateOnFocus: false, dedupingInterval: 30_000, errorRetryCount: 1 },
  );
  return { data, error, isLoading };
}
