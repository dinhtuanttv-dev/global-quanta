// Worker giữ thư viện Cycle Fingerprint ngoài luồng chính của Gateway: bộ nhớ của thư viện nằm trong isolate riêng,
// truy vấn nặng (DTW trên hàng trăm ứng viên) không chặn các yêu cầu khác. Nhận ngữ cảnh đã mã hoá (file trên Volume hoặc buffer).
import fs from "node:fs";
import { parentPort } from "node:worker_threads";
import v8 from "node:v8";
import { decodeCtx } from "./ctxCodec.js";
import { cycleOps } from "./cycleOps.js";

let ctx = null;
const handlers = {
  load({ file, buffer }) {
    const t0 = Date.now();
    const buf = buffer ? Buffer.from(buffer) : fs.readFileSync(file);
    const next = decodeCtx(buf);
    ctx = next.ctx;
    return { ...cycleOps.info(ctx), meta: next.meta, loadMs: Date.now() - t0 };
  },
  info() {
    const h = v8.getHeapStatistics();
    return { loaded: Boolean(ctx), ...(ctx ? cycleOps.info(ctx) : {}), heapMb: Math.round(h.used_heap_size / 1e6), externalMb: Math.round(process.memoryUsage().external / 1e6) };
  },
};
for (const op of ["query", "snapshotRows", "score"]) handlers[op] = (args) => { if (!ctx) throw new Error("Thư viện Cycle chưa nạp."); return cycleOps[op](ctx, args); };

parentPort.on("message", ({ id, op, args }) => {
  try {
    const h = handlers[op];
    if (!h) throw new Error(`Không có lệnh ${op}`);
    parentPort.postMessage({ id, ok: true, result: h(args ?? {}) });
  } catch (e) {
    parentPort.postMessage({ id, ok: false, error: e.message });
  }
});
