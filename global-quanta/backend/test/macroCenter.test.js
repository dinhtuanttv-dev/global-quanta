import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createMacroService, monthlyCloses, MACRO_KV_KEY } from "../src/market/macro/macroService.js";
import { mergeObservations, SYNTHETIC_NOTICE } from "../src/market/macro/macroCore.js";
import { createMacroRouter, createRateLimiter } from "../src/routes/macro.js";

const memKv = () => {
  const m = new Map();
  return { m, getKv: async (k) => (m.has(k) ? structuredClone(m.get(k)) : null), setKv: async (k, v) => void m.set(k, structuredClone(v)) };
};
const NOW = Date.parse("2026-10-16T03:00:00Z");
// nhiễu tất định (sin thuần thỏa hồi quy tuyến tính chính xác -> ma trận suy biến trong ADF)
const noise = (seed) => {
  let x = seed >>> 0;
  return () => ((x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 2 ** 32) - 0.5;
};

// chuỗi tháng giả lập "thật" (không phải seed mô phỏng) để kiểm tra chuyển chế độ
function monthlyCsv(months, f) {
  const rows = ["period,value"];
  for (let i = 0; i < months; i++) {
    const y = 2015 + Math.floor(i / 12);
    const m = String((i % 12) + 1).padStart(2, "0");
    rows.push(`${y}-${m},${f(i)}`);
  }
  return rows.join("\n");
}
const dailyBars = (months, f) => {
  const bars = [];
  for (let i = 0; i < months; i++) {
    const y = 2015 + Math.floor(i / 12);
    const m = String((i % 12) + 1).padStart(2, "0");
    bars.push({ date: `${y}-${m}-10`, close: f(i) * 0.98 }, { date: `${y}-${m}-27`, close: f(i) });
  }
  return bars;
};

test("monthlyCloses: chỉ tháng đã đóng, lấy phiên cuối tháng, asOf = đầu tháng sau", () => {
  const out = monthlyCloses([{ date: "2026-08-05", close: 1 }, { date: "2026-08-29", close: 2 }, { date: "2026-09-30", close: 3 }, { date: "2026-10-15", close: 9 }, { date: "2026-09-02", close: -1 }], "2026-10-16");
  assert.deepEqual(out, [{ period: "2026-08", value: 2, asOf: "2026-09-01" }, { period: "2026-09", value: 3, asOf: "2026-10-01" }]);
  assert.deepEqual(monthlyCloses([{ date: "2025-12-31", close: 5 }], "2026-10-16")[0].asOf, "2026-01-01");
});

test("mergeObservations: chỉ-thêm theo (series, kỳ, asOf); bản sửa cùng asOf thay giá trị; trùng thì bỏ qua", () => {
  const a = [{ seriesId: "CPI", period: "2020-01", value: 1, asOf: "2020-02-06" }];
  const r = mergeObservations(a, [
    { seriesId: "CPI", period: "2020-01", value: 1, asOf: "2020-02-06" },
    { seriesId: "CPI", period: "2020-01", value: 1.1, asOf: "2020-03-06" },
    { seriesId: "CPI", period: "2020-02", value: 2, asOf: "2020-03-06" },
  ]);
  assert.equal(r.added, 2);
  assert.equal(r.changed, 0);
  assert.equal(r.list.length, 3);
  const r2 = mergeObservations(r.list, [{ seriesId: "CPI", period: "2020-02", value: 2.5, asOf: "2020-03-06" }]);
  assert.equal(r2.changed, 1);
  assert.equal(r2.list.find((o) => o.period === "2020-02").value, 2.5);
});

test("Chưa có số liệu thật -> chế độ MÔ PHỎNG, mọi phản hồi mang biểu ngữ; công cụ chat cũng vậy", async () => {
  const svc = createMacroService({ store: memKv(), inline: true, now: () => NOW });
  const src = await svc.source();
  assert.equal(src.mode, "synthetic");
  assert.equal(src.notice, SYNTHETIC_NOTICE);
  const score = await svc.handle({ method: "POST", path: "/api/macro/score", query: {}, body: { target: "VNINDEX" } });
  assert.equal(score.status, 200);
  assert.equal(score.body.notice, SYNTHETIC_NOTICE);
  const tool = await svc.runTool("macro_overview", { target: "VN30" });
  assert.equal(tool.ok, true);
  assert.equal(tool.notice, SYNTHETIC_NOTICE);
  const bad = await svc.runTool("khong_co", {});
  assert.equal(bad.ok, false);
});

test("Chỉ có chỉ số thật (chưa có biến vĩ mô thật) -> vẫn MÔ PHỎNG, KHÔNG trộn chỉ số thật với biến mô phỏng", async () => {
  const kv = memKv();
  const history = { get: async () => ({ bars: dailyBars(100, (i) => 600 + i * 3 + 20 * Math.sin(i)) }) };
  const svc = createMacroService({ store: kv, history, inline: true, now: () => NOW });
  const r = await svc.refreshHoseTargets({ force: true });
  assert.equal(r.report.VNINDEX, 100);
  const src = await svc.source();
  assert.equal(src.mode, "synthetic");
  assert.deepEqual(src.usableTargets.sort(), ["VN100", "VN30", "VNALLSHARE", "VNINDEX", "VNMIDCAP", "VNSMALLCAP"]);
  assert.equal(src.usableFactors.length, 0);
  assert.equal(src.bySource["gateway-hose"], 600);
  assert.equal(kv.m.get(MACRO_KV_KEY).observations.length, 600);
  // mô phỏng: chuỗi VNINDEX trả về là seed (bắt đầu 2008), không phải chuỗi thật (2015)
  const series = await svc.handle({ method: "GET", path: "/api/macro/series", query: {}, body: undefined });
  assert.equal(series.body.series.find((s) => s.id === "VNINDEX").first, "2008-01");
});

test("Nạp CSV biến vĩ mô thật đủ 60 tháng -> chế độ THẬT, không biểu ngữ; dữ liệu bền qua khởi động lại (KV)", async () => {
  const kv = memKv();
  const rn = noise(7);
  const px = [600];
  for (let i = 1; i < 100; i++) px.push(px[i - 1] * Math.exp(0.008 + 0.06 * rn()));
  const history = { get: async () => ({ bars: dailyBars(100, (i) => px[i]) }) };
  const svc = createMacroService({ store: kv, history, inline: true, now: () => NOW });
  await svc.refreshHoseTargets({ force: true });
  const rc = noise(11);
  const cpi = [3];
  for (let i = 1; i < 100; i++) cpi.push(3 + 0.9 * (cpi[i - 1] - 3) + 0.8 * rc());
  const csv = monthlyCsv(100, (i) => cpi[i].toFixed(3));
  const dry = await svc.importCsv({ seriesId: "CPI", csv, dryRun: true });
  assert.equal(dry.written, false);
  assert.equal(dry.rows, 100);
  assert.equal((await svc.source()).mode, "synthetic");
  const w = await svc.importCsv({ seriesId: "CPI", csv, source: "GSO" });
  assert.equal(w.written, true, JSON.stringify(w));
  assert.equal(w.added, 100);
  assert.equal(w.source.mode, "real");
  const again = await svc.importCsv({ seriesId: "CPI", csv, source: "GSO" });
  assert.equal(again.added, 0);
  const score = await svc.handle({ method: "POST", path: "/api/macro/score", query: {}, body: { target: "VNINDEX" } });
  assert.equal(score.status, 200, JSON.stringify(score.body));
  assert.equal(score.body.notice, undefined);
  // khởi động lại: đọc từ KV
  const svc2 = createMacroService({ store: kv, inline: true, now: () => NOW });
  const s2 = await svc2.source();
  assert.equal(s2.mode, "real");
  assert.equal(s2.bySource["csv:GSO"], 100);
});

test("importCsv: mã sai -> 400; CSV rỗng -> 400", async () => {
  const svc = createMacroService({ store: memKv(), inline: true, now: () => NOW });
  await assert.rejects(svc.importCsv({ seriesId: "XXX", csv: "a,b" }), (e) => e.statusCode === 400);
  await assert.rejects(svc.importCsv({ seriesId: "CPI", csv: "  " }), (e) => e.statusCode === 400);
});

test("Worker thread: kết quả giống hệt chạy trực tiếp", async () => {
  const w = createMacroService({ store: memKv(), now: () => NOW });
  const i = createMacroService({ store: memKv(), inline: true, now: () => NOW });
  try {
    const req = { method: "GET", path: "/api/macro/regime", query: { asOf: "2025-06-30" }, body: undefined };
    const [a, b] = await Promise.all([w.handle(req), i.handle(req)]);
    assert.equal(a.status, 200);
    assert.deepEqual(a, b);
  } finally {
    await w.close();
  }
});

test("rate limiter: vượt hạn mức -> 429 + Retry-After; cửa sổ mới thì mở lại", () => {
  let t = 0;
  const rl = createRateLimiter({ limit: 2, windowMs: 1000, now: () => t });
  const req = { get: () => "1.2.3.4", ip: "x" };
  const run = () => {
    let code = 200;
    const res = { set() {}, status(c) { code = c; return this; }, json() {} };
    rl(req, res, () => {});
    return code;
  };
  assert.deepEqual([run(), run(), run()], [200, 200, 429]);
  t = 1000;
  assert.equal(run(), 200);
});

test("router: route engine, nguồn, công cụ, admin cần token", async () => {
  const svc = createMacroService({ store: memKv(), inline: true, now: () => NOW });
  const app = express();
  app.use(express.json({ limit: "5mb" }));
  app.use("/api/macro", createMacroRouter({ getService: () => svc, adminToken: () => "secret-token" }));
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api/macro`;
  try {
    const cal = await fetch(`${base}/calendar`);
    assert.equal(cal.status, 200);
    assert.equal((await cal.json()).notice, SYNTHETIC_NOTICE);
    assert.equal((await fetch(`${base}/khong-co`)).status, 404);
    const src = await (await fetch(`${base}/source`)).json();
    assert.equal(src.mode, "synthetic");
    const tools = await (await fetch(`${base}/tools`)).json();
    assert.equal(tools.anthropic.length, tools.specs.length);
    const run = await (await fetch(`${base}/tools/macro_calendar_alerts`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).json();
    assert.equal(run.ok, true, JSON.stringify(run));
    const sc = await fetch(`${base}/score`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ target: "VN30" }) });
    assert.equal(sc.status, 200);
    const noAuth = await fetch(`${base}/admin/import`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    assert.equal(noAuth.status, 401);
    const bad = await fetch(`${base}/admin/import`, { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer secret-token" }, body: JSON.stringify({ seriesId: "NOPE", csv: "x" }) });
    assert.equal(bad.status, 400);
  } finally {
    server.close();
  }
});
