// Trading Matrix (M1) — snapshot trạng thái thị trường đa nguồn từ Gateway /api/market/trading-matrix/overview.
// Làm mới 20 giây trong phiên (Gateway đệm 20 giây), 5 phút ngoài phiên.
import useSWR from "swr";
import { marketUrl } from "../services/marketDataClient";

export type MatrixScope = "VNINDEX" | "VN30" | "UNIVERSE";
export type HealthStatus = "LIVE" | "DELAYED" | "STALE" | "PARTIAL" | "UNAVAILABLE";
export type RegimeLabel = "UPTREND" | "DOWNTREND" | "SIDEWAY" | "TRANSITION" | "UNKNOWN";
export type FlowLabel = "ACCUMULATION" | "DISTRIBUTION" | "MIXED" | "NEUTRAL" | "UNKNOWN";

export interface SourceHealth { id: string; label: string; kind: "daily" | "intraday"; status: HealthStatus; asOf: string | null; detail?: string; ageSec?: number }
export interface DailyBreadth {
  asOf: string; aboveMa20Pct: number | null; aboveMa50Pct: number | null; advancers: number; decliners: number; unchanged: number;
  medianReturn: number | null; newHighs: number; newLows: number; eligibleCount: number; observedCount: number; excludedCount: number;
  excluded: { suspended: number; shortHistory: number }; scopeSize: number; coverage: number | null;
}
export interface IntradayBreadth { index: string; advancers: number; decliners: number; unchanged: number; ceilings: number; floors: number; observedCount: number | null; asOf: string | null; source: string | null; note: string | null }
export interface MatrixOverview {
  version: string; asOf: string; horizon: string;
  session: { phase: string; label: string; tradingDate: string; live: boolean };
  scope: { id: MatrixScope; label: string; eligible: number | null; observed: number | null; source?: string };
  regime: {
    label: RegimeLabel; rule?: string; horizon: string; asOf?: string; probabilities: { bear: number; neutral: number; bull: number } | null; probabilityGap: number | null;
    hmmAsOf: string | null; reason?: string; definition?: string;
    stageOdds: { stage: string; age: number; up: number | null; down: number | null; label: string; dayStage: string | null; typical: { median: number; p75: number } | null } | null;
  };
  breadth: { daily: DailyBreadth | null; intraday: IntradayBreadth | null; trend: { date: string; aboveMa20Pct: number | null; n: number }[] | null };
  flow: {
    state: FlowLabel; sources: string[]; partial: boolean; note: string;
    foreign: { asOf: string; net: number; net5: number; streak: number; settled: boolean } | null;
    ife: { asOf: string; zLd5: number; zFr5: number | null; method: string; coverageDays: number | null } | null;
  };
  volatility: { asOf: string; atr14: number | null; atrPct: number | null; atrPercentile: number | null; realizedVol20: number | null; rangeZ: number | null; note: string | null } | null;
  scenarios: Scenario[]; riskFlags: RiskFlag[];
  neutral?: { active: boolean; reasons: string[] } | null;
  stateVector?: Record<string, number | string | null> | null;
  sourceAsOf: Record<string, string | null>;
  dataHealth: { status: HealthStatus; sources: SourceHealth[] };
}

const fetcher = async <T,>(url: string): Promise<T> => {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error((b as { error?: string }).error || `Gateway trả HTTP ${r.status}`); }
  return r.json();
};

export function useTradingMatrix(scope: MatrixScope) {
  const { data, error, isLoading } = useSWR<MatrixOverview>(marketUrl(`/api/market/trading-matrix/overview?scope=${scope}`), fetcher, {
    refreshInterval: (d) => (d?.session?.live ? 20_000 : 5 * 60_000), revalidateOnFocus: false, dedupingInterval: 10_000, keepPreviousData: true,
  });
  return { data, error: error as Error | undefined, isLoading };
}

// ------------------------------------------------------------------ M2: heatmap ngành + mã biến động đáng chú ý
export type Horizon = 1 | 5 | 20;
export interface SectorStat {
  industry: string; group: string; count: number; eligible: number;
  rs: Record<string, number | null>; medianReturn: Record<string, number | null>;
  breadth: number | null; breadth5: number | null; value20: number; foreign5: number;
  avgSmart: number | null; smartCoverage: number | null; rangeRatio: number | null; flags: { id: string; text: string }[];
}
export interface MatrixSectors {
  version: string; scope: { id: MatrixScope; label: string }; asOf: string; horizons: Horizon[]; indexReturn: Record<string, number | null>;
  sectors: SectorStat[]; unclassified: number; minSectorSize: number; definition: string; smartAsOf: string | null; smartMatched: boolean; taxonomySource: string;
}
export interface Mover { symbol: string; industry: string | null; close: number; ret: number; value: number | null; valueRatio: number | null; avgValue20: number | null; atCeiling: boolean; atFloor: boolean; foreignNet: number }
export interface MatrixMovers { version: string; scope: { id: MatrixScope; label: string }; asOf: string; eligible: number; liquidityFloor: number | null; gainers: Mover[]; losers: Mover[]; valueSpikes: Mover[]; label: string; note: string }

export function useMatrixSectors(scope: MatrixScope, enabled: boolean) {
  const { data, error, isLoading } = useSWR<MatrixSectors>(enabled ? marketUrl(`/api/market/trading-matrix/sectors?scope=${scope}`) : null, fetcher,
    { refreshInterval: 5 * 60_000, revalidateOnFocus: false, dedupingInterval: 60_000, keepPreviousData: true });
  return { data, error: error as Error | undefined, isLoading };
}
export function useMatrixMovers(scope: MatrixScope, enabled: boolean) {
  const { data, error, isLoading } = useSWR<MatrixMovers>(enabled ? marketUrl(`/api/market/trading-matrix/movers?scope=${scope}`) : null, fetcher,
    { refreshInterval: 5 * 60_000, revalidateOnFocus: false, dedupingInterval: 60_000, keepPreviousData: true });
  return { data, error: error as Error | undefined, isLoading };
}

// ------------------------------------------------------------------ M3: kịch bản, cờ rủi ro, sổ tín hiệu
export type ScenarioState = "INACTIVE" | "WATCH" | "CONFIRMED" | "INVALIDATED" | "COOLDOWN";
export interface Scenario {
  id: "SC1" | "SC2" | "SC3"; title: string; meaning: string; state: ScenarioState; since: string | null; displayState: string;
  evidence: string[]; contradictions: string[]; groups: Record<string, boolean>; ruleVersion: string;
  validation: { verdict: string; summary: string; label: string };
}
export interface RiskFlag { id: string; title: string; severity: "INFO" | "CAUTION" | "WARNING" | "HIGH"; status: "ON" | "OFF" | "UNAVAILABLE" | "CHECKLIST"; detail?: string; trigger?: string; close?: string; evidence?: string[]; validation?: string; label: string }
export interface MatrixSignals {
  version: string; scope: string; ruleVersion: string; note: string;
  recent: { scenario: string; date: string; state: ScenarioState; evidence: string[]; health: string }[];
  live: Record<string, Record<string, { n: number; meanExcess: number | null }>>;
  validation: { prereg: string; verdicts: Record<string, string>; summary: Record<string, string>; stats: Record<string, { episodes: { IS: number; OOS: number }; IS: { n: number; mean: number | null; ci: [number, number] | null }; OOS: { n: number; mean: number | null; ci: [number, number] | null } }> };
}
export function useMatrixSignals(scope: MatrixScope, enabled: boolean) {
  const { data, error, isLoading } = useSWR<MatrixSignals>(enabled ? marketUrl(`/api/market/trading-matrix/signals?scope=${scope}`) : null, fetcher,
    { refreshInterval: 10 * 60_000, revalidateOnFocus: false, dedupingInterval: 60_000 });
  return { data, error: error as Error | undefined, isLoading };
}
