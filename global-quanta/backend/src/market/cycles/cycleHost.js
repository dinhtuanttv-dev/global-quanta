// Nơi giữ thư viện Cycle cho Gateway: ưu tiên worker thread; worker không dùng được thì tự chạy trong tiến trình chính.
// Lưu ngữ cảnh đã dựng lên Railway Volume (một file mới nhất) để lần khởi động sau chỉ cần đọc file.
import fs from "node:fs";
import path from "node:path";
import { Worker } from "node:worker_threads";
import { decodeCtx, encodeCtx, readCtxMeta } from "./ctxCodec.js";
import { cycleOps } from "./cycleOps.js";

const WORKER_URL = new URL("./cycleWorker.js", import.meta.url);

/** Thư mục lưu thư viện: CYCLES_DIR hoặc <Railway Volume>/cycles; không có volume thì không lưu. */
export function cyclesDirFromEnv(env = process.env) {
  return env.CYCLES_DIR || (env.RAILWAY_VOLUME_MOUNT_PATH ? `${env.RAILWAY_VOLUME_MOUNT_PATH.replace(/\/+$/, "")}/cycles` : null);
}

export function createCycleHost({ dir = cyclesDirFromEnv(), useWorker = true, log = console, maxFileMb = 300 } = {}) {
  let worker = null, workerFailed = !useWorker, seq = 0, local = null, loadedInfo = null;
  const pending = new Map();
  const status = { mode: null, source: null, loadMs: null, fileMb: null, file: null, lastError: null, restarts: 0 };

  function spawn() {
    if (worker || workerFailed) return worker;
    try {
      worker = new Worker(WORKER_URL);
      worker.unref();
      worker.on("message", ({ id, ok, result, error }) => { const p = pending.get(id); if (!p) return; pending.delete(id); ok ? p.resolve(result) : p.reject(new Error(error)); });
      const dead = (e) => {
        status.lastError = e?.message ?? "worker dừng"; status.restarts++;
        for (const p of pending.values()) p.reject(new Error(`Worker Cycle dừng: ${status.lastError}`));
        pending.clear(); worker = null; loadedInfo = null;
      };
      worker.on("error", dead);
      worker.on("exit", (code) => { if (code !== 0) dead(new Error(`thoát mã ${code}`)); else worker = null; });
    } catch (e) {
      workerFailed = true; status.lastError = e.message;
      log.warn?.(`[cycles] không tạo được worker, chạy trong tiến trình chính: ${e.message}`);
    }
    return worker;
  }
  const call = (op, args, transfer) => new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, op, args }, transfer);
  });

  /** Nạp ngữ cảnh từ buffer đã mã hoá. Ở chế độ worker, buffer được chuyển hẳn sang worker (không sao chép). */
  async function loadBuffer(buf, source) {
    if (spawn()) {
      const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
      loadedInfo = await call("load", { buffer: ab }, [ab]);
      status.mode = "worker";
    } else {
      const t0 = Date.now(), d = decodeCtx(buf);
      local = d.ctx; loadedInfo = { ...cycleOps.info(local), meta: d.meta, loadMs: Date.now() - t0 };
      status.mode = "in-process";
    }
    status.source = source; status.loadMs = loadedInfo.loadMs;
    return loadedInfo;
  }

  const fileName = (meta) => `ctx-${meta.dataAsOf}-${String(meta.sha256).slice(0, 8)}.bin`;
  return {
    status: () => ({ ...status, loaded: Boolean(loadedInfo), info: loadedInfo ? { builtAt: loadedInfo.builtAt, dataAsOf: loadedInfo.dataAsOf, windows: loadedInfo.windows, tickers: loadedInfo.tickers } : null, dir }),
    loaded: () => loadedInfo,
    /** Đặt ngữ cảnh vừa dựng: mã hoá, lưu file (nếu có thư mục), rồi nạp vào worker. Ngữ cảnh trong luồng chính có thể bỏ sau đó. */
    async put(ctx, meta) {
      const buf = encodeCtx(ctx, meta);
      status.fileMb = Math.round((buf.length / 1e6) * 10) / 10;
      if (dir && buf.length <= maxFileMb * 1e6) {
        try {
          fs.mkdirSync(dir, { recursive: true });
          const name = fileName(meta), tmp = path.join(dir, `${name}.tmp`);
          fs.writeFileSync(tmp, buf); fs.renameSync(tmp, path.join(dir, name));
          for (const f of fs.readdirSync(dir)) if (f !== name && /^ctx-.*\.bin(\.tmp)?$/.test(f)) fs.rmSync(path.join(dir, f), { force: true });
          status.file = name;
        } catch (e) { status.lastError = `ghi file: ${e.message}`; log.warn?.(`[cycles] ${status.lastError}`); }
      }
      return loadBuffer(buf, "build");
    },
    /** Nạp file mới nhất khớp cấu hình. Trả null nếu không có file dùng được. */
    async loadFromDisk(sha256) {
      if (!dir || !fs.existsSync(dir)) return null;
      const files = fs.readdirSync(dir).filter((f) => /^ctx-\d{4}-\d{2}-\d{2}-[0-9a-f]{8}\.bin$/.test(f)).sort().reverse();
      for (const f of files) {
        try {
          const buf = fs.readFileSync(path.join(dir, f));
          const meta = readCtxMeta(buf);
          if (meta.sha256 !== sha256) continue;
          status.fileMb = Math.round((buf.length / 1e6) * 10) / 10; status.file = f;
          return await loadBuffer(buf, "disk");
        } catch (e) { status.lastError = `đọc ${f}: ${e.message}`; log.warn?.(`[cycles] ${status.lastError}`); }
      }
      return null;
    },
    async run(op, args = {}) {
      if (!loadedInfo) throw new Error("Thư viện Cycle chưa nạp.");
      if (status.mode === "worker") {
        if (!worker) throw new Error("Worker Cycle đã dừng; cần nạp lại.");
        return call(op, args);
      }
      return cycleOps[op](local, args);
    },
    async workerInfo() { return status.mode === "worker" && worker ? call("info", {}) : null; },
    close() { worker?.terminate(); worker = null; },
  };
}
