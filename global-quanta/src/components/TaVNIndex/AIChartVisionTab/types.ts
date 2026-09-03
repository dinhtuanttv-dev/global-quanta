/**
 * TypeScript type definitions for AI Chart Vision module
 * Schema khớp với backend/src/schema/scanOutputSchema.js (Zod)
 */

// ============================================================
// INPUT TYPES
// ============================================================

export type AiModel = "gemini-2.5-flash" | "claude-sonnet-4-6";

export interface ScanParams {
  symbol: string;
  timeframes: string[];
  aiModel: AiModel;
}

// ============================================================
// MACRO LAYER
// ============================================================

export interface MonthlyLayer {
  market_cycle_phase: string;
  major_structure: string;
  key_monthly_level: { support: number; resistance: number };
  cycle_position_pct: number;
}

export interface WeeklyLayer {
  structural_bias: string;
  distribution_accumulation_zone: [number, number];
  weekly_momentum: string;
  volume_profile_poc: number;
}

export interface MacroLayer {
  monthly: MonthlyLayer;
  weekly: WeeklyLayer;
}

// ============================================================
// TACTICAL LAYER
// ============================================================

export interface TimeframeBlock {
  trend: string;
  support: number;
  resistance: number;
  signal: string;
}

export interface TacticalLayer {
  daily: TimeframeBlock;
  "4h": TimeframeBlock;
  "1h": TimeframeBlock;
  "15m": TimeframeBlock;
}

// ============================================================
// QUANT LAYER
// ============================================================

export interface QuantLayer {
  order_flow_bias: string;
  liquidity_pools: number[];
  correlation_flag: string;
}

// ============================================================
// CONSENSUS VERDICT
// ============================================================

export type ConfidenceTier = "Thấp" | "Trung bình" | "Cao";
export type PriorSource = "market_baseline" | "internal_backtest";

export interface ConsensusVerdict {
  macro_aligned: boolean;
  final_bias: string;
  confidence_ceiling: number;
  confidence_score_bayesian: number;
  confidence_tier: ConfidenceTier;
  prior_source: PriorSource;
  ensemble_agreement: number;
  synthesis_disagreement: boolean;
  invalidation_level: number;
}

// ============================================================
// RISK MANAGEMENT
// ============================================================

export interface RiskManagement {
  suggested_position_size_pct: number;
  regime: string;
}

// ============================================================
// AI SYNTHESIS
// ============================================================

export interface AiSynthesis {
  models_used: string[];
  main_thesis: string;
  supporting_evidence_fields: string[];
  conflicting_factors: string[];
  conditional_conclusion: string;
  ai_synthesis_narrative: string;
}

// ============================================================
// FULL SCAN RESULT (Output)
// ============================================================

export interface ScanResult {
  scan_timestamp: string;
  target: string;
  data_completeness_flag: "FULL" | "DEGRADED_MODE";
  macro_layer: MacroLayer;
  tactical_layer: TacticalLayer;
  quant_layer: QuantLayer;
  consensus_verdict: ConsensusVerdict;
  risk_management: RiskManagement;
  ai_synthesis: AiSynthesis;
  actionable_insight: string;
}

// ============================================================
// COMPONENT PROPS
// ============================================================

export interface ControlPanelProps {
  onRun: (params: ScanParams) => void;
  isRunning: boolean;
}

export interface PreviewPanelProps {
  scanResult: ScanResult | null;
  timeframes: string[];
}

export interface ReportPanelProps {
  scanResult: ScanResult | null;
}
