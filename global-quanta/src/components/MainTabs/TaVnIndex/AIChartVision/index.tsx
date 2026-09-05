/**
 * AI Chart Vision Tab - Entry Point
 * Module độc lập cho AI Chart Vision trong TA VN-Index
 */

/**
 * Export the main component as default
 */
export { default } from "./AIChartVisionPanel";

/**
 * Export types for external use
 */
export type {
  ScanParams,
  ScanResult,
  TacticalLayer,
  TimeframeBlock,
  MacroLayer,
  QuantLayer,
  ConsensusVerdict,
  RiskManagement,
  AiSynthesis,
  ControlPanelProps,
  PreviewPanelProps,
  ReportPanelProps,
} from "./types";