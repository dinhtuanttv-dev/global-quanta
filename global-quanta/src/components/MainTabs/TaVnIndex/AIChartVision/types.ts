/**
 * TypeScript type definitions for AI Chart Vision module
 * Schema khớp với api/scan.js (chế độ "structured" — mặc định, duy nhất
 * được deploy công khai).
 */

export type AiModel = "gemini-2.5-flash" | "claude-sonnet-4-6";

export interface ScanParams {
  symbol: string;
  timeframes: string[];
  aiModel?: AiModel;
}

export interface MacdBlock {
  value: number;
  signal: number;
  histogram: number;
  label: string;
}

export interface AdxBlock {
  value: number;
  signal: string;
}

export interface TechnicalLayer {
  rsi: number | null;
  macd: MacdBlock | null;
  adx: AdxBlock | null;
}

export interface PatternStat {
  patternType: string;
  sampleSize: number;
  timeoutCount: number;
  successRatePct: number | null;
  avgBarsToOutcome: number | null;
  avgReturnPct: number | null;
  lowSampleWarning: boolean;
}

export type ConfidenceTier = "Thấp" | "Trung bình" | "Cao";

export interface ConsensusVerdict {
  macro_aligned: boolean;
  final_bias: string;
  confidence_score_bayesian: number;
  confidence_tier: ConfidenceTier;
  prior_source: string;
  ensemble_agreement: number;
  ensemble_agreement_is_real: boolean;
  synthesis_disagreement: boolean;
  invalidation_level: number | null;
}

export interface RiskManagement {
  suggested_position_size_pct: number;
  regime: string;
}

export interface ChecklistItem {
  label: string;
  passed: boolean;
  detail: string;
}

export interface AiSynthesis {
  models_used: string[];
  main_thesis: string;
  supporting_evidence_fields: string[];
  conflicting_factors: string[];
  conditional_conclusion: string;
  checklist: ChecklistItem[];
}

export interface ScanResult {
  mode: "structured";
  scan_timestamp: string;
  target: string;
  timeframe: string;
  is_historical_data_mock: boolean;
  historical_data_source: string;
  technical_layer: TechnicalLayer;
  pattern_layer: PatternStat[];
  consensus_verdict: ConsensusVerdict;
  risk_management: RiskManagement;
  ai_synthesis: AiSynthesis;
  actionable_insight: string;
  served_from_cache?: boolean;
}

/**
 * COMPONENT PROPS
 */
export interface ControlPanelProps {
  onRun: (params: ScanParams) => void;
  isRunning: boolean;
  /** ĐÃ THÊM — Tái cấu trúc TA VN-Index: mã đang xem ở tab Biểu đồ kỹ
   * thuật, dùng để điền sẵn Symbol khi chuyển sang AI Chart Vision. */
  initialSymbol?: string;
  /** ĐÃ THÊM — gọi khi trader tự sửa Symbol tại đây (blur/Enter), để đồng
   * bộ ngược lại mã đang xem ở tab Biểu đồ kỹ thuật. */
  onSymbolChange?: (symbol: string) => void;
}

export interface PreviewPanelProps {
  scanResult: ScanResult | null;
  timeframes?: string[];
}

export interface ReportPanelProps {
  scanResult: ScanResult | null;
}

export interface AIChartVisionPanelProps {
  /** ĐÃ THÊM — xem ControlPanelProps.initialSymbol */
  ticker?: string;
  /** ĐÃ THÊM — xem ControlPanelProps.onSymbolChange */
  onRequestTickerChange?: (ticker: string) => void;
}
