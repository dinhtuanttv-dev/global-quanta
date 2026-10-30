process.env.MARKET_ALERTS_ENABLED = "false";

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createQmsJobs, qmsJobsConfig, routeToJob, runInWorker, QMS_JOBS_BUNDLE } from "../src/market/cotuc/qmsJobs.js";
import { createCotucScanner, cotucScanConfig } from "../src/market/cotuc/cotucScanner.js";

const config = { ...qmsJobsConfig({ PROJECT_A_CRON_SECRET: "s3cret", PORT: "4321" }), base: "https://pa.test" };

test("qmsJobsConfig: mặc định chạy tại Gateway, vòng lại cổng của chính Gateway; MARKET_QMS_JOBS_LOCAL=false -> Vercel", () => {
  assert.equal(config.local, true);
  assert.equal(config.selfUrl, "http://127.0.0.1:4321");
  assert.equal(qmsJobsConfig({ MARKET_QMS_JOBS_LOCAL: "false" }).local, false);
});

test("routeToJob: đường dẫn cron cũ -> hàm trong gói + tham số", () => {
  assert.deepEqual(routeToJob("/api/cron/timing-signals-scan?offset=25&limit=25"), { fn: "runTimingSignalsScan", params: { offset: 25, limit: 25 } });
  assert.deepEqual(routeToJob("/api/cron/earnings-seasonality-scan?phase=collect&offset=3&limit=3"), { fn: "runEarningsSeasonalityScan", params: { phase: "collect", offset: 3, limit: 3 } });
  assert.deepEqual(routeToJob("/api/cron/earnings-seasonality-scan?phase=finalize"), { fn: "runEarningsSeasonalityScan", params: { phase: "finalize", offset: undefined, limit: undefined } });
  assert.deepEqual(routeToJob("/api/cron/sector-timing-scan"), { fn: "runSectorTimingScan", params: {} });
  assert.equal(routeToJob("/api/cron/dividend-events-scan"), null);
});

test("createQmsJobs.call: chạy tại chỗ, lỗi >= 400 -> 'HTTP <status>: <error>' như gọi HTTP cũ", async () => {
  const seen = [];
  const run = async ({ fn, params, config: c }) => {
    seen.push({ fn, params, selfUrl: c.selfUrl });
    return fn === "runSectorTimingScan" ? { status: 500, body: { error: "Gateway /api/market/sectors/rrg HTTP 502" } } : { status: 200, body: { nextOffset: 0 } };
  };
  const q = createQmsJobs({ config, run, log: { warn() {} } });
  assert.deepEqual(await q.call("/api/cron/timing-signals-scan?offset=0&limit=25"), { nextOffset: 0 });
  await assert.rejects(q.call("/api/cron/sector-timing-scan"), /^Error: HTTP 500: Gateway \/api\/market\/sectors\/rrg HTTP 502$/);
  assert.equal(seen[0].selfUrl, "http://127.0.0.1:4321");
  assert.equal(q.stats().runs, 2);
  assert.equal(q.stats().failures, 1);
});

test("createQmsJobs.call: chế độ vercel (hoặc job không hỗ trợ) -> gọi HTTP Project A với Bearer secret", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, auth: init.headers.authorization }); return new Response(JSON.stringify({ ok: 1 })); };
  const run = async () => assert.fail("không được chạy tại chỗ");
  const q = createQmsJobs({ config: { ...config, local: false }, fetchImpl, run });
  assert.deepEqual(await q.call("/api/cron/timing-signals-scan?offset=0&limit=25"), { ok: 1 });
  assert.equal(calls[0].url, "https://pa.test/api/cron/timing-signals-scan?offset=0&limit=25");
  assert.equal(calls[0].auth, "Bearer s3cret");
  await createQmsJobs({ config, fetchImpl, run }).call("/api/cron/dividend-events-scan");
  assert.equal(calls[1].url, "https://pa.test/api/cron/dividend-events-scan");
});

test("runInWorker: chạy hàm của gói trong luồng riêng với env vòng lại; lỗi / hết giờ -> reject", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qmsjobs-"));
  const mod = path.join(dir, "fake.mjs");
  fs.writeFileSync(mod, `
    export async function ok(p) { return { status: 200, body: { p, store: process.env.COTUC_STORE_URL, gw: process.env.MARKET_GATEWAY_URL, secret: process.env.CRON_SECRET } }; }
    export async function boom() { throw new Error("vỡ"); }
    export async function slow() { await new Promise((r) => setTimeout(r, 5000)); return { status: 200, body: {} }; }
  `);
  const c = { ...config, timeoutMs: 1500 };
  const r = await runInWorker({ fn: "ok", params: { offset: 3 }, config: c, modulePath: mod });
  assert.deepEqual(r, { status: 200, body: { p: { offset: 3 }, store: "http://127.0.0.1:4321", gw: "http://127.0.0.1:4321", secret: "s3cret" } });
  await assert.rejects(runInWorker({ fn: "boom", params: {}, config: c, modulePath: mod }), /vỡ/);
  await assert.rejects(runInWorker({ fn: "missing", params: {}, config: c, modulePath: mod }), /không có hàm missing/);
  await assert.rejects(runInWorker({ fn: "slow", params: {}, config: c, modulePath: mod }), /Hết thời gian/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("gói vendor/qmsJobs.mjs: có đủ 3 hàm job, không kéo next/* hay Prisma", async () => {
  const src = fs.readFileSync(QMS_JOBS_BUNDLE, "utf8");
  assert.match(src.slice(0, 200), /FILE SINH TỰ ĐỘNG/);
  assert.ok(!/node_modules[\\/](next|@prisma)[\\/]/.test(src), "gói kéo theo next/* hoặc @prisma/*");
  const exported = /export \{([^}]*)\};\s*$/.exec(src)?.[1].split(",").map((s) => s.trim()) ?? [];
  assert.deepEqual(exported.sort(), ["runEarningsSeasonalityScan", "runSectorTimingScan", "runTimingSignalsScan"]);
});

test("cotucScanner + callJob: lô timing chạy qua callJob, không gọi fetch", async () => {
  const paths = [];
  const fetchImpl = async () => assert.fail("không được gọi HTTP");
  const callJob = async (p) => { paths.push(p); return { offset: 0, nextOffset: 0, totalTickers: 25, processedInThisCall: 25, decisionCount: 25, errors: [] }; };
  const s = createCotucScanner({ config: { ...cotucScanConfig({ PROJECT_A_CRON_SECRET: "s3cret" }) }, fetchImpl, callJob, now: () => Date.parse("2026-10-02T10:00:00+07:00") });
  assert.equal(await s.tick(), "timing");
  assert.deepEqual(paths, ["/api/cron/timing-signals-scan?offset=0&limit=25"]);
  assert.equal(s.status().timing.passes, 1);
});
