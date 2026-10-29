// B2/B3 — kho Cổ tức trên Gateway + Timeline tính trên Gateway khớp 1:1 với bản TypeScript của Project A.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createMemoryStore } from "../src/market/store/memoryStore.js";
import { createCotucStore, projectRow } from "../src/market/cotuc/cotucStore.js";
import { buildBuyTimeline, timelineBody, toDayNumber, dayNumberToIso } from "../src/market/cotuc/buyTimelineCore.js";
import { isTradingDay } from "../src/market/calendar.js";

const parity = JSON.parse(fs.readFileSync(new URL("./fixtures/buy-timeline-parity.json", import.meta.url), "utf8"));
const tradingSet = new Set(parity.tradingDays);
const fixtureCal = { isTradingDay: (n) => tradingSet.has(dayNumberToIso(n)) };

test("B3: buildBuyTimeline (Gateway JS) khớp TỪNG DÒNG với Project A TypeScript trên 6 ngày × 239 dòng", () => {
  let n = 0;
  for (const c of parity.cases) {
    const rows = buildBuyTimeline({ today: c.today, cal: fixtureCal, decisions: c.decisions, seasonality: c.seasonality, sectors: new Map(c.sectors) });
    assert.deepEqual(rows, c.output, `lệch ngày ${c.today}`);
    n += rows.length;
  }
  assert.ok(n > 200);
});

test("B3: lịch phiên của Gateway trùng lịch quy tắc của Project A 2025–2028 (ngày nghỉ lễ, Tết)", () => {
  const diff = [];
  for (let d = toDayNumber("2025-01-01"); d <= toDayNumber("2028-12-31"); d++) {
    const iso = dayNumberToIso(d);
    if (isTradingDay(new Date(`${iso}T03:00:00Z`)) !== tradingSet.has(iso)) diff.push(iso);
  }
  assert.deepEqual(diff, []);
});

test("B2: kho Cổ tức — gộp theo cột, cột nặng để riêng, lọc mã + chiếu trường, bền qua khởi động lại", async () => {
  const kv = createMemoryStore();
  const s = createCotucStore({ store: kv, now: () => Date.parse("2026-10-25T02:00:00Z") });
  await s.upsert("season", [{ ticker: "FPT", sector: "CN", samples: { 1: [1, 2] }, paths: { 1: "p" }, earningsSignal: { q: 1 }, collectedAt: "2026-10-25T01:00:00Z" }]);
  await s.upsert("season", [{ ticker: "FPT", stats: { 3: { w: 1 } }, finalizedAt: "2026-10-25T01:30:00Z" }]); // finalize: chỉ vài cột
  await s.upsert("season", [{ ticker: "VNM", sector: "TP", samples: {}, collectedAt: "2026-10-25T01:00:00Z" }]);
  const light = await s.list("season", { fields: ["ticker", "earningsSignal", "stats", "finalizedAt"] });
  assert.deepEqual(light, [{ ticker: "FPT", earningsSignal: { q: 1 }, stats: { 3: { w: 1 } }, finalizedAt: "2026-10-25T01:30:00Z" }, { ticker: "VNM" }]);
  const heavy = await s.list("season", { tickers: ["FPT"], fields: ["ticker", "samples", "sector"] });
  assert.deepEqual(heavy, [{ ticker: "FPT", samples: { 1: [1, 2] }, sector: "CN" }]);
  // phần nhẹ không chứa cột nặng (RAM nhỏ)
  assert.equal("samples" in (await kv.getKv("local:cotuc:t:season")).value.rows.FPT, false);
  // khởi động lại: đọc lại từ kho
  const s2 = createCotucStore({ store: kv });
  assert.equal((await s2.list("season")).length, 2);
  assert.deepEqual((await s2.status()).tables.season.rows, 2);
});

test("B2: khoá sai / bảng lạ bị từ chối; chiếu đường dẫn chấm", async () => {
  const s = createCotucStore({ store: createMemoryStore() });
  assert.throws(() => s.upsert("decision", [{ level: "WATCH" }]), /Khoá/);
  await assert.rejects(async () => s.list("nope"), /Bảng không hợp lệ/);
  await s.upsert("cycle", [{ ticker: "REE", exDate: "2026-05-10T00:00:00.000Z", wM1: 0.1 }]);
  assert.deepEqual((await s.list("cycle", { keys: ["REE:2026-05-10"] })).length, 1);
  assert.deepEqual(projectRow({ snapshot: { exDate: { v: 1 }, decision: { level: "A", x: 2 } } }, ["snapshot.exDate", "snapshot.decision.level", "snapshot.signals"]),
    { snapshot: { exDate: { v: 1 }, decision: { level: "A" } } });
});

test("B3: timelineBody đọc dòng kho đúng như route Project A (bỏ cửa sổ thiếu số, mức mặc định AVOID, xác suất cổ tức)", () => {
  const c = parity.cases[0];
  const decisionRows = c.decisions.map((d) => ({
    ticker: d.ticker, computedAt: "2026-10-24T08:00:00.000Z",
    snapshot: { exDate: d.exDate, decision: { level: d.decisionLevel }, signals: d.dividendProbability == null ? [] : [{ name: "Cổ tức", used: true, probability: d.dividendProbability }], backtest: [...d.windows, { id: "bad" }] },
  }));
  const seasonRows = c.seasonality.map((x) => ({ ticker: x.ticker, earningsSignal: x.earnings, stats: x.stats, finalizedAt: "2026-10-24T01:00:00.000Z" }));
  const body = timelineBody({ today: c.today, cal: fixtureCal, decisionRows, seasonRows, sectors: new Map(c.sectors), universeSize: 281 });
  assert.deepEqual(body.rows, c.output);
  assert.deepEqual(body.coverage, { decisions: 50, seasonality: 50, universe: 281 });
  assert.equal(body.asOf.decisions, "2026-10-24T08:00:00.000Z");
});

test("B2: route kho Cổ tức — đọc/ghi cần Bearer bí mật Project A; status công khai", async () => {
  const express = (await import("express")).default;
  const { createCotucStoreRouter } = await import("../src/routes/cotucStore.js");
  const s = createCotucStore({ store: createMemoryStore() });
  const app = express(); app.use(express.json());
  app.use("/x", createCotucStoreRouter({ getStore: () => s, getTimeline: async () => null, secret: () => "abc123" }));
  const srv = app.listen(0); const b = `http://127.0.0.1:${srv.address().port}/x`;
  try {
    const h = { "content-type": "application/json", authorization: "Bearer abc123" };
    assert.equal((await fetch(`${b}/decision`)).status, 401);
    assert.equal((await fetch(`${b}/decision`, { method: "POST", headers: { ...h, authorization: "Bearer abc124" }, body: "{}" })).status, 401);
    const w = await (await fetch(`${b}/decision`, { method: "POST", headers: h, body: JSON.stringify({ rows: [{ ticker: "FPT", level: "WATCH", snapshot: { exDate: { value: "2026-11-02" } } }] }) })).json();
    assert.equal(w.written, 1);
    const g = await (await fetch(`${b}/decision?tickers=FPT&fields=ticker,snapshot.exDate`, { headers: h })).json();
    assert.deepEqual(g.rows, [{ ticker: "FPT", snapshot: { exDate: { value: "2026-11-02" } } }]);
    assert.equal((await fetch(`${b}/bogus`, { headers: h })).status, 400);
    assert.equal((await fetch(`${b}/decision`, { method: "POST", headers: h, body: JSON.stringify({ rows: [{ level: "x" }] }) })).status, 400);
    assert.equal((await (await fetch(`${b}/status`)).json()).tables.decision.rows, 1);
  } finally { srv.close(); }
});

test("Elite 10 vùng tối ưu: không có cửa sổ đạt / gần đạt -> cửa sổ THĂM DÒ (cận dưới cao nhất, kỳ vọng > 0, ≥ 4 đợt); giữ vùng đã qua; Timeline mặc định không đổi", async () => {
  const { buildBuyTimeline: B, eliteZonesBody, bestExploratoryWindow } = await import("../src/market/cotuc/buyTimelineCore.js");
  const cal = { isTradingDay: (n) => { const d = new Date(n * 86_400_000).getUTCDay(); return d !== 0 && d !== 6; } };
  const w = (id, o) => ({ id, label: id.toUpperCase(), entryFrom: -25, entryTo: -15, exitOffset: 3, nEvents: 9, winRate: 0.55, netExpectancy: 0.01, netExpectancyLcb: -0.004, fdrQValue: 0.6, selected: false, oosMeanNet: null, ...o });
  const decisions = [
    { ticker: "IDC", exDate: { value: "2027-01-25", status: "ESTIMATED" }, decisionLevel: "AVOID", dividendProbability: null,
      windows: [w("w1", { netExpectancy: -0.01 }), w("w4", { entryFrom: 3, entryTo: 6, exitOffset: 10, netExpectancyLcb: -0.002, winRate: 0.45 }), w("w2", { nEvents: 3, netExpectancyLcb: 0.05 })] },
    { ticker: "OLD", exDate: { value: "2026-09-01", status: "CONFIRMED" }, decisionLevel: "AVOID", dividendProbability: null, windows: [w("w3", { netExpectancyLcb: 0.001, winRate: 0.6, fdrQValue: 0.15 })] },
  ];
  // mặc định (Timeline tab Cổ tức): IDC không có dòng (không đạt / gần đạt), OLD đã qua thoát -> bỏ
  assert.equal(B({ today: "2026-10-30", cal, decisions, seasonality: [], sectors: new Map() }).length, 0);
  const rows = B({ today: "2026-10-30", cal, decisions, seasonality: [], sectors: new Map(), optimal: true, keepPassed: true, horizonDays: 400 });
  const idc = rows.find((r) => r.ticker === "IDC");
  assert.equal(idc.tier, "EXPLORATORY");
  assert.equal(idc.windowId, "w4"); // w2 cận dưới cao hơn nhưng chỉ 3 đợt; w1 kỳ vọng âm
  assert.equal(idc.status, "UPCOMING");
  assert.equal(idc.entryFromDate, "2027-01-28"); // GDKHQ 25/01 + 3 phiên
  const old = rows.find((r) => r.ticker === "OLD");
  assert.equal(old.tier, "NEAR");
  assert.equal(old.status, "PASSED");
  assert.equal(bestExploratoryWindow([w("a", { netExpectancy: -0.01 })]), null); // không bịa vùng khi mọi cửa sổ kỳ vọng âm
  const body = eliteZonesBody({ today: "2026-10-30", cal, decisionRows: [{ ticker: "IDC", snapshot: { exDate: decisions[0].exDate, backtest: decisions[0].windows } }], seasonRows: [], sectors: new Map(), tickers: ["IDC", "XYZ"] });
  assert.deepEqual(body.notInUniverse, ["XYZ"]);
  assert.equal(body.rows[0].tier, "EXPLORATORY");
});
