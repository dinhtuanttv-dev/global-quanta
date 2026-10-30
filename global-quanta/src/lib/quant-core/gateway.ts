// Điểm vào đóng gói quant-core cho Gateway (Node thuần, không biên dịch TS):
//   npm run bundle:gateway  ->  backend/src/market/vendor/quantCore.mjs (file sinh, có test chống lệch).
export { convergenceAt, clusterLevels, CONVERGENCE, CONVERGENCE_VERSION } from "./convergence";
export type { ConvergenceResultV2, ConvergenceComponent, ConvergenceZone, ConvergenceLevel } from "./convergence";
export { ENGINE_VERSION, WYCKOFF_DEFAULT_ENGINE } from "./index";
export { analyzeStructureMtf, analyzeTf as analyzeStructureTf, analyzeTfSeries as analyzeStructureTfSeries, closedHtfIndex, alignMatrix, recentBuy, patternStatusAt, minutesToH1, toWeekly, compactTf as compactStructureTf, compactStructure, MTF_STRUCTURE_VERSION, STAGE_LABEL, STAGE_TEXT, PATTERN_NAME, PATTERN_CONTEXT_TEXT, SIGNAL_TEXT, rrNowAt as structureRrNowAt, VERDICT_DESCRIPTIVE, verdictLabel } from "./mtf";
export type { MtfStructure, TfAnalysis as StructureTfAnalysis, Annotation as StructureAnnotation, Scenario as StructureScenario } from "./mtf";
// EP2 (24/10/2026): Elliott Pro — cây sóng v3 + kịch bản có vòng đời cho sổ theo dõi trên Gateway.
export { buildWaveTree, WAVE_TREE_VERSION } from "./elliott/v3/waveTree";
export { scenariosFromTree, evaluateLifecycle, scoreLedger, randomWalkHitProb, EP2_PREREG, SCENARIO_ENGINE_VERSION, STATE_LABEL as EW_STATE_LABEL, TEMPLATE_TITLE as EW_TEMPLATE_TITLE } from "./elliott/v3/scenarios";
export type { EwScenario, ScenarioLifecycle, ScenarioState } from "./elliott/v3/scenarios";
// MTF v3 (30/10/2026): cấu trúc Ngày · Tuần · Tháng — S1 dải EMA21/50/100 + MA200, S2 sóng / Dow / giai đoạn S1–S4, S3 hợp lưu Elliott × EMA, S4 nền giá / VCP + mức hỗ trợ–kháng cự, S5 lớp quyết định (mô tả).
export { MTF3_VERSION, ribbon3, contextAt as ribbonContextAt, compactRibbon3, ribbonSeries, analyze3 as analyzeMtf3, context3At, compactStructure3, elliott3, compactBases3, decisionAt as decision3At, buildStructure3 } from "./mtf3";
