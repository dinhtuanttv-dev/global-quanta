// Pattern Scanner v2 (Martin Pring) — đọc kết quả quét của Gateway (/api/market/strategies/patterns, engine pring/P4) và chi tiết
// một mã cho bảng phụ (/api/market/strategies/patterns/:symbol). Kiểm định đặt trước P3: EXPERIMENTAL (xem PatternValidation).
import useSWR from "swr";
import { marketUrl } from "../services/marketDataClient";
import type { LiveTracking, TechnicalFilterCriteria } from "./useTechnicalFilter";

export type PatternState = "FORMING" | "BREAKOUT" | "CONFIRMED" | "PULLBACK" | "TARGET1" | "TARGET2" | "TARGET3" | "FAILED" | "EXPIRED";
export type PatternDir = "bull" | "bear";
export type PatternTf = "D" | "W";

export interface PatternSummary {
  timeframe: PatternTf; type: string; label: string; family: string; familyLabel: string; subLabel: string | null;
  dir: PatternDir; role: "reversal" | "continuation" | string; degree: string; state: PatternState; stateLabel: string; score: number;
  startDate: string; endDate: string; width: number; heightPct: number; levelNow: number | null; distancePct: number | null;
  breakoutDate: string | null; confirmDate: string | null; breakoutVolRatio: number | null;
  failure: { date: string; reason: string } | null; targets: number[]; targetsHit: number[];
  plan: { confirmed: boolean; entry: number | null; stop: number | null; target: number | null; rr: number | null; rrOk: boolean | null } | null;
  checksOk: number; checksTotal: number; barWarn: string[]; barConfirm: string[];
  withTrend: boolean | null; counterTrend: boolean | null; divergence: boolean | null;
}
export interface PatternRow {
  ticker: string; name?: string | null; sector?: string | null; status: PatternState; dir: PatternDir; type: string; timeframe: PatternTf; date: string;
  metrics: { score: number; rank: number; patterns: number }; patterns: PatternSummary[]; partialWeek: boolean;
  liquidity?: { price: number; avgValue20: number } | null; priceBasis?: string | null; bars?: number;
}
export interface PatternStat { n: number; mean?: number; ci?: [number, number] | null; hit?: number }
export interface PatternValidation {
  version: string; prereg: string; engine: string; ranAt: string; period: { from: string; to: string; oosFrom: string; sessions: number; symbols: number };
  rules: string; label: "EXPERIMENTAL" | "VALIDATED"; conclusion: string;
  H1: Record<"G1" | "G2" | "G3" | "G4", { label: string; verdict: "PASS" | "FAIL" | "INSUFFICIENT"; is: PatternStat; oos: PatternStat; q: number | null; placeboP: number | null }>;
  H2: { verdict: string; is: PatternStat; oos: PatternStat };
  H3: { verdict: string; high: { is: PatternStat; oos: PatternStat }; low: { is: PatternStat; oos: PatternStat } };
  trades: { is: { n: number; profitFactor: number | null; winRate: number; expectancyR: number }; oos: { n: number; profitFactor: number | null; winRate: number; expectancyR: number }; ciOos: [number, number] | null };
  targets: Record<string, { n: number; t1: number; t2: number; t3: number; failed: number }>;
  falseBreakoutPct: number;
  weekly: { bull: { is: PatternStat; oos: PatternStat }; bear: { is: PatternStat; oos: PatternStat } };
}
export interface PatternsDoc {
  strategy: "patterns"; engine: string; evidence?: { label: string; reason: string; validation?: PatternValidation };
  market: { indexAsOf: string | null; up: boolean | null; rule: string };
  timeframes: PatternTf[]; counts: { byState: Record<string, number>; byFamily: Record<string, number>; byTimeframe: Record<PatternTf, number>; bull: number; bear: number };
  generatedAt: string; dataAsOf: string; source: string; criteria: TechnicalFilterCriteria;
  universeCount: number; scannedCount: number; resultCount: number; results: PatternRow[]; disclaimer: string; liveTracking?: LiveTracking;
}

// ------------------------------------------------------------------ chi tiết (bảng phụ)
export interface PatternPoint { name: string; i: number; date: string; price: number }
export interface PatternLine { name: string; i0: number; p0: number; i1: number; p1: number; d0: string; d1: string }
export interface PatternCheck { key: string; label: string; ok: boolean | null; value?: number | null }
export interface PatternFull {
  timeframe: PatternTf; type: string; label: string; family: string; familyLabel: string; subLabel: string | null; dir: PatternDir; role: string; degree: string;
  state: PatternState; stateLabel: string; score: number; startDate: string; endDate: string; width: number; heightPct: number;
  levelNow: number | null; levelAtBreakout: number | null; opposite: number | null; invalidation: number | null;
  breakout: { date: string; price: number; volRatio: number | null; confirmDate: string | null } | null; pullbackDate: string | null;
  failure: { date: string; reason: string } | null; failLevel: number | null; targets: number[]; targetsHit: { k: number; date: string }[];
  events: { kind: string; i: number; date: string; price: number }[]; points: PatternPoint[]; lines: PatternLine[];
  apexDate: string | null; apexBarsAhead: number | null; curve: { a: number; N: number; c0: number; b1: number; q: number; startDate: string } | null;
  checks: PatternCheck[]; barSignals: { warn: { kind: string; label: string; date: string; dir: PatternDir }[]; confirm: { kind: string; label: string; date: string; dir: PatternDir }[] };
  context: { majorTrend: number; withTrend: boolean; counterTrend: boolean; divergence: boolean | null; trianglePosition: number | null; priorMove: number | null; priorOk: boolean };
  plan: { entry: number; stop: number; target: number; target2?: number; target3?: number; rr: number | null; basis: string } | null;
  distancePct: number | null;
}
export type CompactBar = [date: string, open: number, high: number, low: number, close: number, volume: number, weekStart?: string];
export interface PatternDetailFull {
  symbol: string; engine: string; dataAsOf: string; priceBasis: string; warnings: string[]; partialWeek: boolean;
  daily: PatternFull[]; weekly: PatternFull[]; bars: { daily: CompactBar[]; weekly: CompactBar[] };
}

const fetcher = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || `Gateway trả HTTP ${response.status}`);
  }
  return response.json();
};

export function usePatterns() {
  const { data, error, isLoading, mutate } = useSWR<PatternsDoc>(marketUrl("/api/market/strategies/patterns"), fetcher,
    { refreshInterval: 5 * 60_000, revalidateOnFocus: false, dedupingInterval: 60_000 });
  return { data, error: error as Error | undefined, isLoading, refresh: mutate };
}

export function usePatternDetail(symbol: string | null) {
  const key = symbol ? marketUrl(`/api/market/strategies/patterns/${encodeURIComponent(symbol.toUpperCase())}`) : null;
  const { data, error, isLoading } = useSWR<PatternDetailFull>(key, fetcher, { revalidateOnFocus: false, dedupingInterval: 5 * 60_000 });
  return { data, error: error as Error | undefined, isLoading };
}

export const STATE_GROUP: Record<PatternState, "active" | "forming" | "target" | "failed"> = {
  BREAKOUT: "active", CONFIRMED: "active", PULLBACK: "active", FORMING: "forming", TARGET1: "target", TARGET2: "target", TARGET3: "target", FAILED: "failed", EXPIRED: "failed",
};
export const GROUP_OF_FAMILY: Record<string, "G1" | "G2" | "G3" | "G4"> = { double: "G1", hs: "G1", island: "G1", triangle: "G2", rect: "G2", wedge: "G3", broadening: "G3", flag: "G4", rounding: "G4" };
