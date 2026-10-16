// Worker thread cho Kết nối thế giới: VAR/GFEVD cuốn chiếu, event study, ma trận + kiểm định ngoài mẫu tốn CPU — không chặn Gateway.
import { serveWorkerOps } from "../macro/workerProxy.js";
import { createWorldCore } from "./worldCore.js";
import { worldOps } from "./worldService.js";

serveWorkerOps(worldOps(createWorldCore()));
