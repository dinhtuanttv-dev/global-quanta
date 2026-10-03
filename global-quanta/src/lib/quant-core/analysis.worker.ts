/// <reference lib="webworker" />
// Web Worker chạy quant-core ngoài luồng giao diện (TA_VNINDEX_UPGRADE_SPEC §1.3 · C6: Render ≠ Compute).
import { analyze, type AnalyzeOptions, type Bar } from "./index";

self.onmessage = (e: MessageEvent<{ id: number; bars: Bar[]; opts: AnalyzeOptions }>) => {
  const { id, bars, opts } = e.data;
  try {
    const t0 = performance.now();
    const result = analyze(bars, opts);
    (self as unknown as Worker).postMessage({ id, result, ms: performance.now() - t0 });
  } catch (error) {
    (self as unknown as Worker).postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};
