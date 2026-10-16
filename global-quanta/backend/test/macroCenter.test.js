import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createMacroService, monthlyCloses, MACRO_KV_KEY } from "../src/market/macro/macroService.js";
import { mergeObservations, SYNTHETIC_NOTICE } from "../src/market/macro/macroCore.js";
import { createMacroRouter, createRateLimiter } from "../src/routes/macro.js";

// KV giả CÙNG hợp đồng với kho Gateway (memoryStore/supabaseStore): getKv trả { value, updatedAt }; m giữ giá trị thô để kiểm tra
const memKv = () => {
  const m = new Map();
  return { m, getKv: async (k) => (m.has(k) ? { value: structuredClone(m.get(k)), updatedAt: "t" } : null), setKv: async (k, v) => void m.set(k, structuredClone(v)) };
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
    const k = 2018 * 12 + 5 + i; // 100 tháng kết thúc 2026-09 (còn cập nhật tại NOW)
    const y = Math.floor(k / 12);
    const m = String((k % 12) + 1).padStart(2, "0");
    rows.push(`${y}-${m},${f(i)}`);
  }
  return rows.join("\n");
}
const dailyBars = (months, f) => {
  const bars = [];
  for (let i = 0; i < months; i++) {
    const k = 2018 * 12 + 5 + i; // 100 tháng kết thúc 2026-09 (còn cập nhật tại NOW)
    const y = Math.floor(k / 12);
    const m = String((k % 12) + 1).padStart(2, "0");
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
  const svc = createMacroService({ globalFeeds: null, store: memKv(), inline: true, now: () => NOW });
  const src = await svc.source();
  assert.equal(src.mode, "synthetic");
  assert.equal(src.notice, SYNTHETIC_NOTICE);
  const score = await svc.handle({ method: "POST", path: "/api/macro/score", query: {}, body: { target: "VNINDEX" } });
  assert.equal(score.status, 200);
  assert.equal(score.body.notice, SYNTHETIC_NOTICE);
  assert.equal(score.body.usableForDecisions, false);
  assert.equal(score.body.evidence, "SYNTHETIC");
  const tool = await svc.runTool("macro_overview", { target: "VN30" });
  assert.equal(tool.ok, true);
  assert.equal(tool.notice, SYNTHETIC_NOTICE);
  assert.equal(tool.data.usableForDecisions, false);
  assert.ok(tool.guidance.some((g) => /KHÔNG đưa khuyến nghị/.test(g)));
  const bad = await svc.runTool("khong_co", {});
  assert.equal(bad.ok, false);
});

test("Chỉ có chỉ số thật (chưa có biến vĩ mô thật) -> vẫn MÔ PHỎNG, KHÔNG trộn chỉ số thật với biến mô phỏng", async () => {
  const kv = memKv();
  const history = { get: async () => ({ bars: dailyBars(100, (i) => 600 + i * 3 + 20 * Math.sin(i)) }) };
  const svc = createMacroService({ globalFeeds: null, store: kv, history, inline: true, now: () => NOW });
  const r = await svc.refreshAutoFeeds({ force: true });
  assert.equal(r.report.VNINDEX.months, 100);
  const src = await svc.source();
  assert.equal(src.mode, "synthetic");
  assert.deepEqual(src.usableTargets.sort(), ["VN100", "VN30", "VNALLSHARE", "VNINDEX", "VNMIDCAP", "VNSMALLCAP"]);
  assert.equal(src.usableFactors.length, 0);
  assert.equal(src.bySource["gateway-hose"], 600);
  assert.equal(kv.m.get(MACRO_KV_KEY).observations.length, 600);
  // mô phỏng: chuỗi VNINDEX trả về là seed (bắt đầu 2008), không phải chuỗi thật (2018)
  const series = await svc.handle({ method: "GET", path: "/api/macro/series", query: {}, body: undefined });
  assert.equal(series.body.series.find((s) => s.id === "VNINDEX").first, "2008-01");
});

test("Nạp CSV biến vĩ mô thật đủ 60 tháng -> chế độ THẬT, không biểu ngữ; dữ liệu bền qua khởi động lại (KV)", async () => {
  const kv = memKv();
  const rn = noise(7);
  const px = [600];
  for (let i = 1; i < 100; i++) px.push(px[i - 1] * Math.exp(0.008 + 0.06 * rn()));
  const history = { get: async () => ({ bars: dailyBars(100, (i) => px[i]) }) };
  const svc = createMacroService({ globalFeeds: null, store: kv, history, inline: true, now: () => NOW });
  await svc.refreshAutoFeeds({ force: true });
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
  assert.equal(score.body.usableForDecisions, false);
  assert.equal(score.body.evidence, "REFERENCE_ONLY");
  // khởi động lại: đọc từ KV
  const svc2 = createMacroService({ globalFeeds: null, store: kv, inline: true, now: () => NOW });
  const s2 = await svc2.source();
  assert.equal(s2.mode, "real");
  assert.equal(s2.bySource["csv:GSO"], 100);
});

test("importCsv: mã sai -> 400; CSV rỗng -> 400", async () => {
  const svc = createMacroService({ globalFeeds: null, store: memKv(), inline: true, now: () => NOW });
  await assert.rejects(svc.importCsv({ seriesId: "XXX", csv: "a,b" }), (e) => e.statusCode === 400);
  await assert.rejects(svc.importCsv({ seriesId: "CPI", csv: "  " }), (e) => e.statusCode === 400);
});

test("Worker thread: kết quả giống hệt chạy trực tiếp", async () => {
  const w = createMacroService({ globalFeeds: null, store: memKv(), now: () => NOW });
  const i = createMacroService({ globalFeeds: null, store: memKv(), inline: true, now: () => NOW });
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
  const svc = createMacroService({ globalFeeds: null, store: memKv(), inline: true, now: () => NOW });
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

import { releaseSchedule, fomcEvents, analysisEvents } from "../src/market/macro/catalystEvents.js";

test("X3 lịch công bố: GSO tháng 9/2026 công bố ~06/10, gộp theo (ngày, cơ quan), trong cửa sổ", () => {
  const ev = releaseSchedule("2026-10-01", 40);
  const gso = ev.find((e) => e.id === "release:GSO:2026-10-06");
  assert.ok(!ev.some((e) => /IR|EXb/.test(e.series.map((s) => s.seriesId).join(" "))), "IR/EX là số liệu ngày");
  assert.ok(gso, JSON.stringify(ev.map((e) => e.id)));
  assert.match(gso.title, /tháng 9\/2026/);
  assert.ok(gso.series.some((s) => s.seriesId === "CPI"));
  assert.equal(gso.estimated, true);
  assert.equal(gso.daysRemaining, 5);
  assert.ok(ev.every((e) => e.date >= "2026-10-01" && e.date <= "2026-11-10"));
  assert.ok(!ev.some((e) => /HOSE|thị trường/.test(e.title)));
  assert.equal(new Set(ev.map((e) => e.id)).size, ev.length);
});

test("X3 FOMC: chỉ ngày tương lai trong cửa sổ; cảnh báo/chế độ KHÔNG phát ở chế độ mô phỏng", () => {
  assert.deepEqual(fomcEvents("2026-10-16", 60).map((e) => e.date), ["2026-10-28", "2026-12-09"]);
  const regime = { current: { label: "Thắt chặt", probs: [0.1, 0.9] }, history: [{ period: "2026-08", probs: [0.8, 0.2] }, { period: "2026-09", probs: [0.1, 0.9] }] };
  const alerts = { alerts: [{ id: "a", level: "warn", messageVi: "x" }] };
  assert.deepEqual(analysisEvents({ mode: "synthetic", alerts, regime, todayIso: "2026-10-16" }), []);
  const real = analysisEvents({ mode: "real", alerts, regime, todayIso: "2026-10-16" });
  assert.deepEqual(real.map((e) => e.kind), ["alert", "regime"]);
  assert.match(real[1].title, /Thắt chặt.*9\/2026.*90%/);
});

test("X3 dịch vụ: catalystEvents ở chế độ mô phỏng chỉ có lịch (không cảnh báo)", async () => {
  const svc = createMacroService({ globalFeeds: null, store: memKv(), inline: true, now: () => NOW });
  const r = await svc.catalystEvents({ horizonDays: 45 });
  assert.equal(r.mode, "synthetic");
  assert.equal(r.asOf, "2026-10-16");
  assert.ok(r.events.length > 0);
  assert.ok(r.events.every((e) => e.kind === "release" || e.kind === "fomc"));
});

import { parseFredCsv, parseYahooMonthly, toClosedMonths } from "../src/market/macro/macroGlobalFeeds.js";

test("Nguồn toàn cầu: FRED CSV + Yahoo nến tháng -> chỉ tháng đã đóng, asOf đầu tháng sau", () => {
  const fred = parseFredCsv(["observation_date,DCOILBRENTEU", "2026-08-28,70.1", "2026-08-31,71.2", "2026-09-01,.", "2026-09-30,73", "2026-10-14,126.5", ""].join(String.fromCharCode(10)));
  assert.equal(fred.length, 4);
  assert.deepEqual(toClosedMonths(fred, "2026-10-16"), [
    { period: "2026-08", value: 71.2, asOf: "2026-09-01" },
    { period: "2026-09", value: 73, asOf: "2026-10-01" },
  ]);
  const y = parseYahooMonthly({ chart: { result: [{ timestamp: [Date.UTC(2026, 7, 1) / 1000, Date.UTC(2026, 8, 1) / 1000, Date.UTC(2026, 9, 1) / 1000], indicators: { quote: [{ close: [25000.123456, null, 25872] }] } }] } });
  assert.deepEqual(y.map((x) => x.value), [25000.1235, 25872]);
  assert.deepEqual(toClosedMonths(y, "2026-10-16").map((x) => x.period), ["2026-08"]);
});

test("Nguồn tự động: biến toàn cầu thật + chỉ số HOSE thật -> chế độ THẬT; nguồn từng chuỗi được ghi; lỗi một nguồn không chặn", async () => {
  const rn = noise(5);
  const px = [600];
  for (let i = 1; i < 100; i++) px.push(px[i - 1] * Math.exp(0.006 + 0.05 * rn()));
  const history = { get: async () => ({ bars: dailyBars(100, (i) => px[i]) }) };
  const rf = noise(9);
  const fed = [2];
  for (let i = 1; i < 100; i++) fed.push(Math.max(0.05, fed[i - 1] + 0.15 * rf()));
  const globalFeeds = async () => ({
    observations: fed.map((v, i) => {
      const k = 2018 * 12 + 5 + i, y = Math.floor(k / 12), m = (k % 12) + 1;
      const period = `${y}-${String(m).padStart(2, "0")}`;
      const asOf = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
      return { seriesId: "FED", period, value: v, asOf, source: "FRED:FEDFUNDS" };
    }),
    report: { FED: { months: 100 }, DXY: { error: "HTTP 429" } },
  });
  const svc = createMacroService({ store: memKv(), history, globalFeeds, inline: true, now: () => NOW });
  const r = await svc.refreshAutoFeeds({ force: true });
  assert.equal(r.report.DXY.error, "HTTP 429");
  assert.equal(r.added, 700);
  const src = await svc.source();
  assert.equal(src.mode, "real");
  assert.equal(src.notice, null);
  assert.deepEqual(src.series.find((x) => x.id === "FED").sources, ["FRED:FEDFUNDS"]);
  assert.deepEqual(src.series.find((x) => x.id === "CPI").sources, []);
  const again = await svc.refreshAutoFeeds();
  assert.equal(again.skipped, "fresh");
});

import { coverageOf } from "../src/market/macro/macroCore.js";
import { InMemoryVintageStore } from "../src/market/macro/vendor/macroEngine.mjs";

test("Chuỗi ngừng cập nhật (VD chỉ số đổi mã) bị loại: không kéo cả phân tích về quá khứ", () => {
  const st = new InMemoryVintageStore();
  const obs = [];
  for (let i = 0; i < 100; i++) {
    const y = 2017 + Math.floor(i / 12), m = String((i % 12) + 1).padStart(2, "0");
    obs.push({ seriesId: "VNMIDCAP", period: `${y}-${m}`, value: 1000 + i, asOf: `${y}-${m}-28` });
  }
  st.upsert(obs); // kỳ cuối 2025-04
  const c = coverageOf(st, "2026-10-16");
  const mid = c.series.find((s) => s.id === "VNMIDCAP");
  assert.equal(mid.last, "2025-04");
  assert.equal(mid.stale, true);
  assert.deepEqual(c.staleSeries, ["VNMIDCAP"]);
  assert.ok(!c.usableTargets.includes("VNMIDCAP"));
  assert.equal(coverageOf(st, "2025-06-01").series.find((s) => s.id === "VNMIDCAP").stale, false);
});

test("Báo cáo tháng: câu kết luận cổng MacroScore luôn kèm lưu ý chỉ tham khảo / mô phỏng", async () => {
  const svc = createMacroService({ globalFeeds: null, store: memKv(), inline: true, now: () => NOW });
  const r = await svc.handle({ method: "GET", path: "/api/macro/report", query: {}, body: undefined });
  assert.equal(r.status, 200);
  assert.match(r.body.markdown, /vượt cổng kiểm định ngoài mẫu[^\n]*Lưu ý: dữ liệu MÔ PHỎNG/);
});
