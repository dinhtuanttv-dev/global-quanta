// Worker thread tính bằng chứng lịch sử Hợp lưu v2 (≈ vài phút CPU) — KHÔNG chạy trên event loop chính của Gateway.
// Sự cố 09/10/2026 03:32–03:41: chạy trên luồng chính (chỉ nhả event loop sau mỗi mã) làm Gateway không phản hồi ~10 phút.
import { parentPort, workerData } from "node:worker_threads";
import { buildConvergenceEvidence } from "./convergenceV2.js";

const { seriesList, indexBars, minAvgValue20 } = workerData;
try {
  // Trong worker không cần nhả event loop.
  const evidence = await buildConvergenceEvidence(seriesList, { indexBars, minAvgValue20, yieldFn: async () => {} });
  parentPort.postMessage({ ok: true, evidence });
} catch (error) {
  parentPort.postMessage({ ok: false, message: error instanceof Error ? error.message : String(error) });
}
