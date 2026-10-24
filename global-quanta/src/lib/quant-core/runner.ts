// Điều phối chạy quant-core: Web Worker khi trình duyệt hỗ trợ, ngược lại chạy đồng bộ (test/jsdom, môi trường cũ).
// 750 nến ≈ 2–4 ms -> chuyển dữ liệu bằng structured clone là đủ; Float64Array/Transferable dành cho chuỗi tick (P4/P5).
import { analyze, type Analysis, type AnalyzeOptions, type Bar } from "./index";

type Callback = (result: Analysis) => void;
type ErrorCallback = (message: string) => void;
interface Pending { cb: Callback; onError?: ErrorCallback; bars: Bar[]; opts: AnalyzeOptions }

let worker: Worker | null | undefined;
let nextId = 0;
const pending = new Map<number, Pending>();

/** Chạy đồng bộ trên luồng chính; lỗi -> onError (không nuốt lỗi). */
function runSync(p: Pending): void {
  let result: Analysis;
  try { result = analyze(p.bars, p.opts); } catch (e) { p.onError?.(e instanceof Error ? e.message : String(e)); return; }
  p.cb(result);
}

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = typeof Worker === "undefined" ? null : new Worker(new URL("./analysis.worker.ts", import.meta.url), { type: "module" });
    worker?.addEventListener("message", (e: MessageEvent<{ id: number; result?: Analysis; error?: string }>) => {
      const p = pending.get(e.data.id);
      pending.delete(e.data.id);
      if (!p) return; // đã huỷ (dữ liệu / khung đổi)
      if (e.data.result) p.cb(e.data.result);
      else p.onError?.(e.data.error ?? "Lỗi không rõ trong Worker phân tích");
    });
    worker?.addEventListener("error", (e) => {
      // A1 (Q-05): Worker hỏng (CSP, lỗi nạp, lỗi ngoài try) -> chuyển hẳn sang luồng chính VÀ hoàn tất mọi yêu cầu đang chờ
      // (chạy lại đồng bộ) — không để yêu cầu treo khiến giao diện giữ kết quả cũ như kết quả mới.
      console.warn("[quant-core worker] lỗi, chuyển sang chạy trên luồng chính:", e.message);
      worker = null;
      const waiting = [...pending.values()];
      pending.clear();
      for (const p of waiting) runSync(p);
    });
  } catch {
    worker = null;
  }
  return worker;
}

/**
 * Chạy analyze(); kết quả qua `cb`, lỗi qua `onError`. Không có Worker -> chạy ĐỒNG BỘ ngay (giữ hành vi cũ cho test).
 * @returns hàm huỷ (bỏ qua kết quả nếu dữ liệu đã đổi trước khi Worker trả về)
 */
export function runAnalysis(bars: Bar[], opts: AnalyzeOptions, cb: Callback, onError?: ErrorCallback): () => void {
  const job: Pending = { cb, onError, bars, opts };
  const w = getWorker();
  if (!w) {
    runSync(job);
    return () => {};
  }
  const id = ++nextId;
  pending.set(id, job);
  try {
    w.postMessage({ id, bars, opts });
  } catch {
    pending.delete(id);
    runSync(job);
  }
  return () => { pending.delete(id); };
}

/** Chỉ cho test: số yêu cầu đang chờ Worker. */
export const pendingCount = () => pending.size;
