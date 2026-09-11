/**
 * Kiểu dữ liệu cho Tab "Cycle Fingerprint & Phân cụm chu kỳ giá".
 *
 * GIAI ĐOẠN 1 (đã triển khai thật, backend quant-macro-scanner):
 * ticker/windowSize/timeframe/asOfDate/state/priceSeries/topMatches/
 * qualityScore/summary/atrSeries.
 *
 * GIAI ĐOẠN SAU (field optional - CHƯA có dữ liệu backend, panel tương ứng
 * chưa được dựng vào CycleFingerprintPanel cho tới khi có):
 * cluster (cần HDBSCAN), fanChart, explainability, timingForecast,
 * crossMarket, multiSignal, monteCarlo.
 *
 * QUY ƯỚC MINH BẠCH DỮ LIỆU (bắt buộc):
 * - `source: "HARD_DATA"` → tính trực tiếp từ giá lịch sử thật.
 * - `source: "ESTIMATED"` → suy ra từ mô hình/thống kê. UI PHẢI gắn badge
 *   "Ước tính" cạnh giá trị này — xem <SourceBadge />.
 */

export type DataSource = 'HARD_DATA' | 'ESTIMATED';

export interface QuantValue {
  value: number;
  source: DataSource;
}

// ---------------------------------------------------------------
// Giai đoạn 1 – MVP (đã có dữ liệu thật)
// ---------------------------------------------------------------

export interface CycleMatch {
  ticker: string;
  matchStartDate: string;
  matchEndDate: string;
  similarityPct: QuantValue;
  returns: {
    d10: QuantValue;
    d20: QuantValue;
    d30: QuantValue;
    d60: QuantValue;
  };
  alignedSeries: { sessionOffset: number; normalizedClose: QuantValue }[];
}

export interface PricePoint {
  date: string;
  close: QuantValue;
}

export type Timeframe = 'daily' | 'weekly' | 'monthly';

export interface CycleFingerprintParams {
  ticker: string;
  windowSize?: number;
  timeframe?: Timeframe;
}

export interface QualityScoreBreakdown {
  similarity: QuantValue;
  liquidity: QuantValue;
  regime: QuantValue;
  sampleSize: QuantValue;
  overall: QuantValue;
  warningThreshold: number;
}

export type AnalysisState = 'success' | 'insufficient' | 'error';

export type ExportFormat = 'pdf' | 'excel';

// ---------------------------------------------------------------
// Giai đoạn sau (optional - type sẵn sàng, backend/UI chưa dựng)
// ---------------------------------------------------------------

export type Language = 'vi' | 'en';
export type ThemeMode = 'light' | 'dark';

export interface ClusterInfo {
  clusterId: string;
  clusterLabel: string;
  probability: QuantValue;
  medoidTicker: string;
  memberCount: number;
  returnHistogram: { bucketLabel: string; count: number }[];
}

export interface ClusterGalleryMember {
  ticker: string;
  matchStartDate: string;
  matchEndDate: string;
  similarityPct: QuantValue;
  returnD30: QuantValue;
}

export interface FanChartBand {
  sessionOffset: number;
  p10: QuantValue;
  p25: QuantValue;
  p50: QuantValue;
  p75: QuantValue;
  p90: QuantValue;
}

export interface ExplainabilityBreakdown {
  factors: { name: string; contributionPct: QuantValue; description: string }[];
}

export interface TimingForecast {
  targetReturnPct: number;
  hittingProbability: { withinSessions: number; probabilityPct: QuantValue }[];
  daysToPeak: QuantValue;
  daysToTrough: QuantValue;
}

export interface PersonalizationSettings {
  qualityScoreThreshold: number;
  weights: { similarity: number; liquidity: number; regime: number; sampleSize: number };
}

export interface FeedbackPayload {
  ticker: string;
  matchTicker: string;
  matchStartDate: string;
  isAccurate: boolean;
  comment?: string;
}

export interface CycleFingerprintAlert {
  id: string;
  ticker: string;
  qualityScoreOverall: QuantValue;
  clusterLabel: string;
  createdAt: string;
}

export type CycleFingerprintWsMessage =
  | { type: 'alert'; alert: CycleFingerprintAlert }
  | { type: 'data-update'; ticker: string };

export interface CrossMarketComparison {
  relatedTicker: string;
  correlationPct: QuantValue;
  sameCluster: boolean;
}

export interface MultiSignalConfirmation {
  momentum: { label: string; alignedWithCycle: boolean; strengthPct: QuantValue };
  volumeOrderFlow: { label: string; alignedWithCycle: boolean; strengthPct: QuantValue };
  macro: { label: string; alignedWithCycle: boolean; strengthPct: QuantValue };
  agreementCount: number;
  agreementTotal: number;
}

export interface MonteCarloPath {
  pathId: string;
  points: { sessionOffset: number; normalizedClose: QuantValue }[];
}

export interface MonteCarloSimulation {
  paths: MonteCarloPath[];
  sampleCount: number;
}

export interface AtrPoint {
  sessionOffset: number;
  atr: QuantValue;
}

// ---------------------------------------------------------------
// Response tổng hợp từ API backend (quant-macro-scanner)
// ---------------------------------------------------------------

export interface CycleFingerprintResponse {
  ticker: string;
  windowSize: number;
  timeframe: Timeframe;
  asOfDate: string;
  state: AnalysisState;
  priceSeries: PricePoint[];
  topMatches: CycleMatch[];
  qualityScore: QualityScoreBreakdown;
  summary: {
    winRatePct: QuantValue;
    avgReturnPct: QuantValue;
    maxDrawdownPct: QuantValue;
    sampleCount: number;
  };
  atrSeries: AtrPoint[];

  // Giai đoạn sau - optional, backend CHƯA trả field này
  cluster?: ClusterInfo | null;
  fanChart?: FanChartBand[];
  explainability?: ExplainabilityBreakdown;
  timingForecast?: TimingForecast;
  crossMarket?: CrossMarketComparison[];
  multiSignal?: MultiSignalConfirmation;
  monteCarlo?: MonteCarloSimulation;
}
