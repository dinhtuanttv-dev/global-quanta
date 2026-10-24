// R6 — điểm vào đóng gói (esbuild) cho kiểm định tín hiệu chart phía Node: ĐÚNG mã nguồn chart đang dùng
// (chỉ báo của technicalOscillators.ts, cấu trúc / Order Flow của quant-core, gộp tuần của TimeframeController).
export { calculateADX, calculateMACD, calculateRSI } from "../detectors/technicalOscillators";
export { computeStructure } from "../../quant-core/structure";
export { buildFlowBars, detectCvdDivergence } from "../../quant-core/orderFlow";
export { aggregateToWeekly } from "../TimeframeController";
