import useSWR from "swr";
import { fetchMarketJson } from "../services/marketDataClient";
import { useResearchUi } from "./useResearchUi";

export type Regime = "UPTREND" | "DOWNTREND" | "SIDEWAY";

export interface PerformanceRow {
  signal: string; regime: string; horizon: number; n: number; long: number; short: number;
  hitRate: number; hitLow: number; hitHigh: number; baseline: number;
  avgSignedExcess: number | null; tStat: number | null; zHit?: number | null; pValue: number | null;
  /** Kiểm định có tính tín hiệu chồng lấn (sai số cụm hai chiều ngày × mã) — dùng cho phán định. */
  zHitClustered?: number | null; tStatClustered?: number | null; effectiveN?: number;
  clusters?: { dates: number; symbols: number };
  verdict: "edge" | "negative" | "none" | "insufficient";
}

export interface HoldoutMetrics {
  n: number; from?: string; to?: string; baseRate: number; logLoss: number; brier: number; brierSkill: number;
  auc: number | null; decileSpread: number | null; activeShare: number; activeHitRate: number | null;
  calibration: { predicted: number; observed: number; n: number }[];
  bootstrap?: { days: number; iters: number; brierSkill90: [number, number]; auc90: [number, number] | null } | null;
}

export interface ModelSummary {
  model: string; version: string; status: string; trainFrom: string; trainTo: string;
  holdout: HoldoutMetrics | null; heuristic: { auc: number | null; decileSpread: number | null } | null;
  byRegime: Partial<Record<Regime, HoldoutMetrics>> | null; lambda: number | null;
  weights: { name: string; weight: number }[]; regimeModels: string[];
}

export interface ForwardStats { n: number; nEff: number; pUp: number | null; lo: number | null; hi: number | null; meanRet: number | null }

/** Phân tích AI cấp VN-Index (panel cột trái). */
export interface IndexAnalysis {
  from: string; to: string;
  current: {
    date: string; close: number; regime: Regime; streak: number; impulseScore: number | null; impulseZone: "LOW" | "MID" | "HIGH" | null;
    breadthPct: number | null; ma20: number | null; ma50: number | null; ma200: number | null;
  };
  history: { date: string; regime: Regime; impulseScore: number | null; breadthPct: number | null; close: number }[];
  base: Record<string, ForwardStats>;
  byRegime: Record<Regime, { sessions: number; share: number; avgRun: number | null; horizons: Record<string, ForwardStats> }>;
  byImpulse: Record<"LOW" | "MID" | "HIGH", { label: string; sessions: number; horizons: Record<string, ForwardStats> }>;
  note: string;
}

/** Một ngày của Market Intelligence (mọi giá trị chỉ dùng dữ liệu ≤ ngày đó). */
export interface IntelDay {
  date: string; close: number; regime: Regime | null; impulse: number | null; impulse2: number | null; breadth: number | null;
  zLd5: number | null; zFr5: number | null; dist25: number; distPct: number | null; acc25: number; isDist: boolean; effortNoResult: boolean;
  pBear: number | null; pNeutral: number | null; pBull: number | null; div: number; risk: number | null;
}
export interface BetaPost { n: number; nEff: number; ups: number; mean: number | null; lo: number | null; hi: number | null; raw: number | null }
export interface MarketIntel {
  generatedAt?: string; asOf: string;
  current: IntelDay & { hmmState: number | null; divergences: { window: number; indicator: string; priceRank: number | null; indRank: number | null; type: "bullish" | "bearish" | null }[] };
  hmm: { states: { label: string; ret5: number | null; vol20: number | null; stay: number | null }[]; trainedThrough: string | null } | null;
  series: IntelDay[];
  bayes: Record<string, { base: { n: number; p: number | null }; rows: (BetaPost & { id: string; label: string; value: string })[] }>;
  models: Record<string, {
    samples: number; passed: boolean; prob: number | null; baseRate: number | null;
    oos: { n: number; nEff: number | null; skill: number | null; lo: number | null; hi: number | null; hitRate: number | null };
    weights: { name: string; label: string; coef: number | null; lo: number | null; hi: number | null }[];
  }>;
  coverage: { indexDays: number; footprintDays: number; from: string; to: string };
  modelFeatures: { name: string; label: string }[];
  notes: string;
}

export interface ResearchOverview {
  generatedAt: string | null;
  index?: IndexAnalysis | null;
  intel?: MarketIntel | null;
  currentRegime: { date: string; regime: Regime; impulseScore: number | null; breadthPct: number | null } | null;
  baseline: Record<string, number>;
  performance: PerformanceRow[];
  counts: { signals: number; outcomes: number } | null;
  models: { horizon: number; active: ModelSummary | null }[];
  lastTraining: {
    trainedAt: string;
    horizons: Record<string, { status: string; reason: string; samples: number }>;
  } | null;
  signalLabels: Record<string, string>;
  featureLabels: Record<string, string>;
  disclaimer: string;
}

export interface AdaptiveScore {
  horizon: number; ready: boolean; version?: string; prob?: number; regimeModel?: boolean;
  contributions?: { name: string; label: string; value: number; weight: number; contribution: number }[];
  holdout?: { brierSkill: number; auc: number | null; activeHitRate: number | null; n: number } | null;
}

export interface ResearchSignal {
  date: string; signal: string; label: string; direction: number; score: number | null; regime: string | null;
  outcomes: Record<string, { excess: number | null; hit: boolean | null }>;
  trackRecord?: PerformanceRow[];
}

export interface ResearchSymbol {
  symbol: string; asOf: string | null; regime: Regime | null; method: string | null;
  features: { name: string; label: string; value: number | null }[];
  profile: { date: string; poc: number; vaLow: number; vaHigh: number; vwap: number } | null;
  adaptive: AdaptiveScore[];
  todaySignals: ResearchSignal[];
  recentSignals: ResearchSignal[];
  disclaimer: string;
}

export const REGIME_LABEL: Record<string, string> = {
  UPTREND: "Uptrend", DOWNTREND: "Downtrend", SIDEWAY: "Sideway", ALL: "Mọi trạng thái", UNKNOWN: "Chưa rõ",
};

const swrOpts = { refreshInterval: 5 * 60_000, revalidateOnFocus: false, dedupingInterval: 60_000 };

/** Kết quả tự học: hiệu suất tín hiệu T+3/5/10 theo trạng thái thị trường + mô hình trọng số đang chạy. */
// Chỉ gọi API khi công tắc "AI nghiên cứu" đang bật (mặc định tắt -> không có request nào).
export function useResearchOverview() {
  const [enabled] = useResearchUi();
  const { data, error, isLoading } = useSWR<ResearchOverview>(
    enabled ? "research-overview" : null,
    () => fetchMarketJson<ResearchOverview>("/api/market/research/overview"),
    swrOpts,
  );
  return { data, error, isLoading, enabled };
}

/** Điểm thích ứng + tín hiệu đang bật + lịch sử chấm điểm của một mã. */
export function useResearchSymbol(symbol: string | null) {
  const [enabled] = useResearchUi();
  const { data, error, isLoading } = useSWR<ResearchSymbol>(
    enabled && symbol ? ["research-symbol", symbol] : null,
    () => fetchMarketJson<ResearchSymbol>(`/api/market/research/${encodeURIComponent(symbol!)}`),
    swrOpts,
  );
  return { data, error, isLoading, enabled };
}
