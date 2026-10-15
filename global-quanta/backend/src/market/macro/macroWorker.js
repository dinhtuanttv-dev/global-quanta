// Worker thread: các phép tính vĩ mô (OLS-HAC, HMM, FDR, backtest) tốn ~2 s CPU khi chưa có cache — chạy ở đây để không chặn
// vòng lặp sự kiện của Gateway (SSE giá, job EOD...). Giao thức: { id, op, args } -> { id, ok, value | error }.
import { parentPort } from "node:worker_threads";
import { createMacroCore } from "./macroCore.js";

const core = createMacroCore();

const ops = {
  setReal: ([list]) => core.setReal(list),
  source: () => core.source(),
  handle: ([req]) => core.handle(req),
  runTool: ([name, args]) => core.runTool(name, args),
  toolSpecs: () => core.toolSpecs(),
};

parentPort.on("message", async ({ id, op, args }) => {
  try {
    const fn = ops[op];
    if (!fn) throw new Error(`op không hợp lệ: ${op}`);
    parentPort.postMessage({ id, ok: true, value: await fn(args ?? []) });
  } catch (e) {
    parentPort.postMessage({ id, ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});
