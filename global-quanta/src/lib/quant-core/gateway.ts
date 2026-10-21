// Điểm vào đóng gói quant-core cho Gateway (Node thuần, không biên dịch TS):
//   npm run bundle:gateway  ->  backend/src/market/vendor/quantCore.mjs (file sinh, có test chống lệch).
export { convergenceAt, clusterLevels, CONVERGENCE, CONVERGENCE_VERSION } from "./convergence";
export type { ConvergenceResultV2, ConvergenceComponent, ConvergenceZone, ConvergenceLevel } from "./convergence";
export { ENGINE_VERSION, WYCKOFF_DEFAULT_ENGINE } from "./index";
export { analyzeStructureMtf, analyzeTf as analyzeStructureTf, analyzeTfSeries as analyzeStructureTfSeries, closedHtfIndex, alignMatrix, recentBuy, patternStatusAt, minutesToH1, toWeekly, compactTf as compactStructureTf, compactStructure, MTF_STRUCTURE_VERSION, STAGE_LABEL, STAGE_TEXT, PATTERN_NAME, SIGNAL_TEXT } from "./mtf";
export type { MtfStructure, TfAnalysis as StructureTfAnalysis, Annotation as StructureAnnotation, Scenario as StructureScenario } from "./mtf";
