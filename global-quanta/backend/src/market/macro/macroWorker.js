// Worker thread: các phép tính vĩ mô (OLS-HAC, HMM, FDR, backtest) tốn ~2 s CPU khi chưa có cache — chạy ở đây để không chặn
// vòng lặp sự kiện của Gateway (SSE giá, job EOD...).
import { createMacroCore } from "./macroCore.js";
import { macroOps } from "./macroService.js";
import { serveWorkerOps } from "./workerProxy.js";

serveWorkerOps(macroOps(createMacroCore()));
