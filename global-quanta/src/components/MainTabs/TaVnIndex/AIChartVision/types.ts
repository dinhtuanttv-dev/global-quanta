/**
 * TypeScript type definitions for AI Chart Vision module
 * Schema khớp với api/scan.js (chế độ "structured" — mặc định, duy nhất
 * được deploy công khai).
 *
 * ĐÃ VIẾT LẠI: bản cũ khớp schema chế độ "vision" (macro_layer/
 * tactical_layer 4 khung thời gian/quant_layer) — gây crash thật
 * ("Cannot read properties of undefined (reading '1h')") vì response thật
 * của chế độ structured không có các field đó.
 */

/** Giữ lại cho ControlPanel — chế độ structured không dùng ai_model, nhưng
 * dropdown UI vẫn có thể hiển thị (không ảnh hưởng kết quả quét). */
export type AiModel = "gemini-2.5-flash" | "claude-sonnet-4-6";

export interface ScanParams {
  symbol: string;
  timeframes: string[];
  aiModel?: AiModel;
}

/**
 * TECHNICAL LAYER — RSI/MACD/ADX tính thật (không qua ảnh)
 */
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

/**
 * PATTERN LAYER — backtest mẫu hình thật, mảng theo từng loại mẫu hình
 */
export interface PatternStat {
  patternType: string;
  sampleSize: number;
  timeoutCount: number;
  successRatePct: number | null;
  avgBarsToOutcome: number | null;
  avgReturnPct: number | null;
  lowSampleWarning: boolean;
}

/**
 * CONSENSUS VERDICT
 */
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

/**
 * RISK MANAGEMENT
 */
export interface RiskManagement {
  suggested_position_size_pct: number;
  regime: string;
}

/**
 * AI SYNTHESIS
 */
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

/**
 * FULL SCAN RESULT (Output) — khớp đúng api/scan.js
 */
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
}

export interface PreviewPanelProps {
  scanResult: ScanResult | null;
  timeframes?: string[];
}

export interface ReportPanelProps {
  scanResult: ScanResult | null;
}

export interface AIChartVisionPanelProps {
  // This component doesn't need external props for now
}
