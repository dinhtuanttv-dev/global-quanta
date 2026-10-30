// Vercel CPU giai đoạn 2 (30/10/2026): các job nặng của Project A (QMS) chạy NGAY TRÊN Gateway thay vì gọi /api/cron/* trên Vercel.
// Mỗi lô timing-signals-scan / earnings-seasonality-scan tốn tới 300 giây Fluid Active CPU của Vercel (gói miễn phí 4 giờ/tháng) —
// làn quét Cổ tức gọi hàng chục lô mỗi ngày nên vượt hạn mức. Nay: cùng mã nguồn (lib/jobs của QMS, đóng gói esbuild thành
// vendor/qmsJobs.mjs — KHÔNG sao chép thuật toán), chạy trong worker_thread, ghi vào cùng kho Cổ tức (gọi vòng lại chính Gateway).
// Công thức, dữ liệu ghi, giao diện tab Cổ tức / Lọc ngành: không đổi.
//
// MARKET_QMS_JOBS_LOCAL=false -> quay về gọi HTTP Project A như cũ (phương án lùi, không cần build lại).
import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";

export const QMS_JOBS_BUNDLE = fileURLToPath(new URL("../vendor/qmsJobs.mjs", import.meta.url));
const WORKER = new URL("./qmsJobWorker.mjs", import.meta.url);

export function qmsJobsConfig(env = process.env) {
  const num = (k, d) => (Number(env[k]) > 0 ? Number(env[k]) : d);
  return {
    local: String(env.MARKET_QMS_JOBS_LOCAL ?? "true").toLowerCase() !== "false",
    base: (env.LEGACY_MARKET_API_BASE || "https://tuan-quant-scanner-psi.vercel.app").replace(/\/+$/, ""),
    // Job đọc giá / ghi kho qua HTTP của chính Gateway -> vòng lại nội bộ (không ra Internet).
    selfUrl: (env.MARKET_QMS_JOBS_SELF_URL || `http://127.0.0.1:${env.PORT || 4000}`).replace(/\/+$/, ""),
    secret: env.PROJECT_A_CRON_SECRET || "",
    timeoutMs: num("MARKET_COTUC_TIMEOUT_MS", 290_000),
    heapMb: num("MARKET_QMS_JOBS_HEAP_MB", 384),
  };
}

/** Đường dẫn cron cũ (kèm query) -> hàm trong gói + tham số. null = không hỗ trợ chạy tại chỗ. */
export function routeToJob(path) {
  const u = new URL(path, "http://x");
  const q = (k) => u.searchParams.get(k);
  const n = (k) => (q(k) == null ? undefined : Number(q(k)));
  switch (u.pathname) {
    case "/api/cron/timing-signals-scan": return { fn: "runTimingSignalsScan", params: { offset: n("offset"), limit: n("limit") } };
    case "/api/cron/earnings-seasonality-scan": {
      const phase = q("phase") === "collect" || q("phase") === "finalize" ? q("phase") : null;
      return { fn: "runEarningsSeasonalityScan", params: { phase, offset: n("offset"), limit: n("limit") } };
    }
    case "/api/cron/sector-timing-scan": return { fn: "runSectorTimingScan", params: {} };
    default: return null;
  }
}

/** Chạy một hàm của gói trong worker_thread; trả { status, body }. */
export function runInWorker({ fn, params, config, modulePath = QMS_JOBS_BUNDLE, workerUrl = WORKER }) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerUrl, {
      workerData: { modulePath, fn, params },
      env: { ...process.env, MARKET_GATEWAY_URL: config.selfUrl, COTUC_STORE_URL: config.selfUrl, CRON_SECRET: config.secret },
      resourceLimits: { maxOldGenerationSizeMb: config.heapMb },
    });
    let settled = false;
    const done = (fnc, v) => { if (settled) return; settled = true; clearTimeout(timer); fnc(v); };
    const timer = setTimeout(() => { void worker.terminate(); done(reject, new Error(`Hết thời gian ${Math.round(config.timeoutMs / 1000)} giây (${fn})`)); }, config.timeoutMs);
    timer.unref?.();
    worker.once("message", (m) => {
      if (m?.ok) done(resolve, { status: m.status, body: m.body });
      else done(reject, new Error(m?.error ?? "Job lỗi không rõ"));
    });
    worker.once("error", (e) => done(reject, e));
    worker.once("exit", (code) => done(reject, new Error(`Luồng job thoát (mã ${code}) trước khi trả kết quả (${fn})`)));
  });
}

/**
 * call(path) cùng hợp đồng với gọi HTTP cũ: trả body JSON, lỗi (status >= 400) -> ném "HTTP <status>: <error>"
 * (ngắt mạch của làn quét Cổ tức nhận diện lỗi như trước).
 */
export function createQmsJobs({ config = qmsJobsConfig(), fetchImpl = globalThis.fetch, run = runInWorker, log = console } = {}) {
  const stats = { runs: 0, failures: 0, last: null };

  async function viaHttp(path) {
    const res = await fetchImpl(`${config.base}${path}`, {
      headers: { authorization: `Bearer ${config.secret}`, accept: "application/json" },
      signal: AbortSignal.timeout(config.timeoutMs),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`HTTP ${res.status}${body?.error ? `: ${body.error}` : ""}`);
    return body ?? {};
  }

  async function call(path) {
    const job = config.local ? routeToJob(path) : null;
    if (!job) return viaHttp(path);
    const t0 = Date.now();
    stats.runs += 1;
    try {
      const r = await run({ ...job, config });
      stats.last = { fn: job.fn, at: new Date(t0).toISOString(), ms: Date.now() - t0, status: r.status };
      if (r.status >= 400) throw new Error(`HTTP ${r.status}${r.body?.error ? `: ${r.body.error}` : ""}`);
      return r.body ?? {};
    } catch (e) {
      stats.failures += 1;
      stats.last = { fn: job.fn, at: new Date(t0).toISOString(), ms: Date.now() - t0, error: String(e?.message ?? e).slice(0, 200) };
      log.warn?.(`[qms-jobs] ${job.fn} lỗi: ${stats.last.error}`);
      throw e;
    }
  }

  return { call, mode: config.local ? "gateway" : "vercel", stats: () => ({ mode: config.local ? "gateway" : "vercel", ...stats }) };
}
