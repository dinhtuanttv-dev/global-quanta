// Luồng phụ chạy MỘT job nền của Project A (vendor/qmsJobs.mjs) rồi thoát — Vercel CPU giai đoạn 2 (30/10/2026).
// Chạy trong worker_thread riêng: heap riêng có trần (không đẩy heap chính tới OOM như 23/10), không chặn vòng sự kiện của
// Gateway khi tính backtest, và bộ nhớ của gói 1,2 MB + giá 10 năm được giải phóng ngay khi lô xong.
import { parentPort, workerData } from "node:worker_threads";
import { pathToFileURL } from "node:url";

const { modulePath, fn, params } = workerData;
// 27/11/2026 (b4): gói Project A trên Gateway dùng "prisma" giả luôn ném lỗi (không có Neon) và client Upstash không có khoá — mã gọi
// đã bắt lỗi và dùng giá trị rỗng (tính năng không đổi), nhưng mỗi lượt in kèm stack trace. Chỉ lọc ĐÚNG hai thông báo đó.
const BENIGN = [/^\[marketSignals\] Loi doc hose_foreign_net_buy/, /^\[Upstash Redis\] The '(url|token)' property is missing/];
for (const level of ["error", "warn"]) {
  const orig = console[level].bind(console);
  console[level] = (...args) => { if (typeof args[0] === "string" && BENIGN.some((re) => re.test(args[0]))) return; orig(...args); };
}
try {
  const mod = await import(pathToFileURL(modulePath).href);
  if (typeof mod[fn] !== "function") throw new Error(`Gói job không có hàm ${fn}`);
  const r = await mod[fn](params ?? {});
  parentPort.postMessage({ ok: true, status: r?.status ?? 500, body: r?.body ?? null });
} catch (e) {
  parentPort.postMessage({ ok: false, error: String(e?.message ?? e).slice(0, 500) });
}
