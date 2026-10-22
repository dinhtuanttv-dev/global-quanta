// TOPBAR T2 — MỘT snapshot cho thanh ngang từ Gateway /api/market/topbar (thay 5 hook gọi riêng VN-Index / độ rộng /
// vĩ mô / lịch sử vĩ mô / thanh khoản, trong đó 3 hook gọi Project A). Mỗi khối có DataMeta riêng — UI không tự gán "live".
// Làm mới 15 giây trong giờ khớp lệnh, 60 giây ngoài giờ; tab ẩn -> 5 phút.
import useSWR from "swr";
import { isMarketGatewayEnabled, marketUrl } from "../services/marketDataClient";

export type DataStatus = "live" | "delayed" | "stale" | "fallback" | "simulated" | "loading" | "empty" | "error" | "closed";
export interface DataMeta { source: string | null; status: DataStatus; asOf: string | null; receivedAt: string | null; ageMs: number | null; staleAfterMs: number | null; reason: string | null }
export interface Block<T> { data: T | null; meta: DataMeta }
export interface SeriesPoint { time: string; value: number }

export interface IndexData { code: string; value: number; reference: number | null; change: number | null; changePct: number | null; volumeShares: number | null; valueVnd: number | null; unit: string; series: SeriesPoint[]; partialSession: boolean }
export interface BreadthData { universe: string; advances: number; declines: number; unchanged: number; ceilings: number | null; floors: number | null; total: number; advanceShare: number; declineShare: number; netBreadth: number; adRatio: number | null }
export interface MacroData { symbol: string; label: string; value: number; unit: string; digits: number; change: number | null; changePct: number | null; series: SeriesPoint[] }
export type SessionPhase = "pre_open" | "open" | "break" | "auction" | "closing" | "closed" | "holiday" | "unknown";
export interface SessionData { exchange: string; timezone: string; phase: SessionPhase; label: string; nextTransitionAt: string | null; calendar: string; note: string | null }
export interface LiquidityData {
  measure: "value" | "volume"; unit: string; cutoff: string; date: string | null; current: number | null;
  history: { date: string; v: number | null }[]; n: number; mean: number | null; std: number | null; deviationPct: number | null; z: number | null; reason: string | null;
  valueSessionsRecorded?: number;
}
export interface RegimeData { state: "RISK_ON" | "RISK_OFF" | "NEUTRAL" | "UNKNOWN"; score: number | null; label?: string; inputs?: { dxy: number; vix: number; treasury10y: number }; evidence: { verdict: string; note: string } }
export interface TopbarSnapshot {
  version: string; generatedAt: string; freshness: { liveMs: number; delayedMs: number };
  index: Block<IndexData>; breadth: Block<BreadthData>; sessions: Block<{ VN: SessionData; HK: SessionData; US: SessionData }>;
  macro: Block<MacroData>[]; liquidity: Block<LiquidityData>; regime: Block<RegimeData>;
}

const fetcher = async (url: string): Promise<TopbarSnapshot> => {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`Gateway trả HTTP ${r.status}`);
  return r.json();
};

const hidden = () => typeof document !== "undefined" && document.visibilityState === "hidden";

export function useTopbar() {
  const enabled = isMarketGatewayEnabled();
  const { data, error, isLoading } = useSWR<TopbarSnapshot>(enabled ? marketUrl("/api/market/topbar") : null, fetcher, {
    refreshInterval: (d) => (hidden() ? 5 * 60_000 : d?.sessions?.data?.VN?.phase === "open" || d?.sessions?.data?.VN?.phase === "auction" ? 15_000 : 60_000),
    revalidateOnFocus: true, dedupingInterval: 5_000, keepPreviousData: true,
  });
  return { data, error: error as Error | undefined, isLoading, enabled };
}

/** Khối khi chưa có snapshot (đang tải / lỗi / Gateway tắt) — không bao giờ giả số liệu. */
export function placeholderMeta(state: { isLoading: boolean; error?: Error; enabled: boolean }): DataMeta {
  const status: DataStatus = !state.enabled ? "empty" : state.error ? "error" : "loading";
  const reason = !state.enabled ? "Market Gateway đang tắt — không có nguồn dữ liệu thật." : state.error ? state.error.message : null;
  return { source: null, status, asOf: null, receivedAt: null, ageMs: null, staleAfterMs: null, reason };
}
