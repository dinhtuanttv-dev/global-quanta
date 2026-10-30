// Luồng phụ chạy MỘT job nền của Project A (vendor/qmsJobs.mjs) rồi thoát — Vercel CPU giai đoạn 2 (30/10/2026).
// Chạy trong worker_thread riêng: heap riêng có trần (không đẩy heap chính tới OOM như 23/10), không chặn vòng sự kiện của
// Gateway khi tính backtest, và bộ nhớ của gói 1,2 MB + giá 10 năm được giải phóng ngay khi lô xong.
import { parentPort, workerData } from "node:worker_threads";
import { pathToFileURL } from "node:url";

const { modulePath, fn, params } = workerData;
try {
  const mod = await import(pathToFileURL(modulePath).href);
  if (typeof mod[fn] !== "function") throw new Error(`Gói job không có hàm ${fn}`);
  const r = await mod[fn](params ?? {});
  parentPort.postMessage({ ok: true, status: r?.status ?? 500, body: r?.body ?? null });
} catch (e) {
  parentPort.postMessage({ ok: false, error: String(e?.message ?? e).slice(0, 500) });
}
