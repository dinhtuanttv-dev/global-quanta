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
 * ĐÃ SỬA: cập nhật theo types.ts mới (khớp response chế độ "structured") —
 * bỏ TacticalLayer/TimeframeBlock/MacroLayer/QuantLayer (chế độ vision cũ,
 * không còn dùng), thêm TechnicalLayer/PatternStat/ChecklistItem.
 */
export type {
  ScanParams,
  ScanResult,
  TechnicalLayer,
  MacdBlock,
  AdxBlock,
  PatternStat,
  ConsensusVerdict,
  RiskManagement,
  AiSynthesis,
  ChecklistItem,
  ControlPanelProps,
  PreviewPanelProps,
  ReportPanelProps,
} from "./types";
