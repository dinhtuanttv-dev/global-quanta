// Điều phối chạy quant-core: Web Worker khi trình duyệt hỗ trợ, ngược lại chạy đồng bộ (test/jsdom, môi trường cũ).
// 750 nến ≈ 2–4 ms -> chuyển dữ liệu bằng structured clone là đủ; Float64Array/Transferable dành cho chuỗi tick (P4/P5).
import { analyze, type Analysis, type AnalyzeOptions, type Bar } from "./index";

type Callback = (result: Analysis) => void;

let worker: Worker | null | undefined;
let nextId = 0;
const pending = new Map<number, Callback>();

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = typeof Worker === "undefined" ? null : new Worker(new URL("./analysis.worker.ts", import.meta.url), { type: "module" });
    worker?.addEventListener("message", (e: MessageEvent<{ id: number; result?: Analysis; error?: string }>) => {
      const cb = pending.get(e.data.id);
      pending.delete(e.data.id);
      if (cb && e.data.result) cb(e.data.result);
      else if (e.data.error) console.warn("[quant-core worker]", e.data.error);
    });
    worker?.addEventListener("error", (e) => {
      // Worker hỏng (CSP, lỗi nạp) -> chuyển hẳn sang chạy đồng bộ, chạy lại các yêu cầu đang chờ không được.
      console.warn("[quant-core worker] lỗi, chuyển sang chạy trên luồng chính:", e.message);
      worker = null;
    });
  } catch {
    worker = null;
  }
  return worker;
}

/**
 * Chạy analyze(); kết quả qua callback. Không có Worker -> gọi callback ĐỒNG BỘ ngay (giữ hành vi cũ cho test).
 * @returns hàm huỷ (bỏ qua kết quả nếu dữ liệu đã đổi trước khi Worker trả về)
 */
export function runAnalysis(bars: Bar[], opts: AnalyzeOptions, cb: Callback): () => void {
  const w = getWorker();
  if (!w) {
    cb(analyze(bars, opts));
    return () => {};
  }
  const id = ++nextId;
  pending.set(id, cb);
  try {
    w.postMessage({ id, bars, opts });
  } catch {
    pending.delete(id);
    cb(analyze(bars, opts));
  }
  return () => { pending.delete(id); };
}
