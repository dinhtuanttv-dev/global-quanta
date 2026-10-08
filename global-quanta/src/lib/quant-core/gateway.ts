// Điểm vào đóng gói quant-core cho Gateway (Node thuần, không biên dịch TS):
//   npm run bundle:gateway  ->  backend/src/market/vendor/quantCore.mjs (file sinh, có test chống lệch).
export { convergenceAt, clusterLevels, CONVERGENCE, CONVERGENCE_VERSION } from "./convergence";
export type { ConvergenceResultV2, ConvergenceComponent, ConvergenceZone, ConvergenceLevel } from "./convergence";
export { ENGINE_VERSION, WYCKOFF_DEFAULT_ENGINE } from "./index";
