// Chạy một bộ "op" tính toán nặng trong worker thread (không chặn vòng lặp sự kiện của Gateway) — dùng chung cho
// Trung tâm vĩ mô (macroWorker.js) và Kết nối thế giới (worldWorker.js). Giao thức: { id, op, args } -> { id, ok, value | error }.
import { Worker, parentPort } from "node:worker_threads";

/**
 * Proxy phía Gateway. `replayOp`: op nạp dữ liệu — lần gọi cuối được phát lại khi worker khởi động lại sau sự cố.
 * @returns {{ call: (op: string, ...args: unknown[]) => Promise<unknown>, close: () => Promise<void> }}
 */
export function createWorkerProxy({ url, label, replayOp = null, timeoutMs = 90_000 }) {
  let worker = null;
  let seq = 0;
  const pending = new Map();
  let lastReplay = null;
  const failAll = (msg) => {
    for (const { reject, timer } of pending.values()) {
      clearTimeout(timer);
      reject(new Error(msg));
    }
    pending.clear();
  };
  const spawn = () => {
    worker = new Worker(url);
    worker.unref();
    worker.on("message", ({ id, ok, value, error }) => {
      const p = pending.get(id);
      if (!p) return;
      pending.delete(id);
      clearTimeout(p.timer);
      ok ? p.resolve(value) : p.reject(new Error(error));
    });
    const dead = (why) => {
      worker = null;
      failAll(`Worker ${label} dừng (${why}).`);
    };
    worker.on("error", (e) => dead(e.message));
    worker.on("exit", (code) => dead(`mã ${code}`));
    if (lastReplay) send(replayOp, lastReplay).catch(() => {});
  };
  const send = (op, args) => {
    if (!worker) spawn();
    const id = ++seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Tính toán ${label} quá thời gian.`));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      worker.postMessage({ id, op, args });
    });
  };
  return {
    call: (op, ...args) => {
      if (op === replayOp) lastReplay = args;
      return send(op, args);
    },
    close: async () => {
      const w = worker;
      worker = null;
      if (w) await w.terminate();
    },
  };
}

/** Cùng giao diện nhưng chạy trực tiếp trong tiến trình (test). */
export function createInlineProxy(ops) {
  return {
    call: async (op, ...args) => {
      const fn = ops[op];
      if (!fn) throw new Error(`op không hợp lệ: ${op}`);
      return fn(args);
    },
    close: async () => {},
  };
}

/** Phía worker: phục vụ bộ op qua parentPort. */
export function serveWorkerOps(ops) {
  parentPort.on("message", async ({ id, op, args }) => {
    try {
      const fn = ops[op];
      if (!fn) throw new Error(`op không hợp lệ: ${op}`);
      parentPort.postMessage({ id, ok: true, value: await fn(args ?? []) });
    } catch (e) {
      parentPort.postMessage({ id, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  });
}
