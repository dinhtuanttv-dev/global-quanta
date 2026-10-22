// Trading Matrix M1 — đặc trưng thuần + service: mẫu số rõ ràng, ngày / trong phiên tách riêng, thiếu dữ liệu -> UNKNOWN / UNAVAILABLE
// (không giả trung tính), một nguồn lỗi không làm mất các khối khác, hysteresis, snapshot lưu bảng cục bộ (không Supabase).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { breadthTrend, createHysteresis, dailyBreadth, flowState, overallHealth, regimeDaily, sessionPhase, sourceHealth, volatilityDaily } from "../src/market/tradingMatrix/features.js";
import { createMatrixService, MATRIX_VERSION } from "../src/market/tradingMatrix/matrixService.js";
import { createLocalStore } from "../src/market/store/localStore.js";
import { tradingDatesBack } from "../src/market/scanner/scannerJobs.js";

const series = (dates, f, extra = {}) => dates.map((date, i) => { const c = f(i); return { date, open: c, high: c * 1.01, low: c * 0.99, close: c, closeAdj: c, refPrice: f(i - 1) ?? c, value: 1e9, ...extra }; });

test("độ rộng cuối phiên: mã tạm ngừng / thiếu lịch sử bị loại khỏi mẫu số và được đếm riêng", () => {
  const dates = tradingDatesBack("2026-10-21", 260);
  const by = new Map([
    ["UP", series(dates, (i) => 100 + i)],
    ["DN", series(dates, (i) => 400 - i)],
    ["SUSP", series(dates.slice(0, -3), (i) => 50)],
    ["NEW", series(dates.slice(-10), (i) => 20 + i)],
  ]);
  const b = dailyBreadth(by, "2026-10-21");
  assert.equal(b.eligibleCount, 2);
  assert.deepEqual(b.excluded, { suspended: 1, shortHistory: 1 });
  assert.equal(b.aboveMa20Pct, 50);
  assert.equal(b.advancers, 1); assert.equal(b.decliners, 1);
  assert.equal(b.newHighs, 1); assert.equal(b.newLows, 1);
  assert.equal(b.coverage, 0.5);
  const tr = breadthTrend(by, dates.slice(-3));
  assert.equal(tr.length, 3);
  assert.ok(tr.every((x) => x.n === 3 || x.n === 2));
});

test("regime: quy tắc công khai; TRANSITION khi xác suất HMM sát nhau; UNKNOWN khi thiếu dữ liệu (không giả SIDEWAY)", () => {
  const dates = tradingDatesBack("2026-10-21", 120);
  const up = series(dates, (i) => 1000 + i * 3);
  assert.equal(regimeDaily(up).label, "UPTREND");
  const r = regimeDaily(up, { hmm: { pBear: 0.3, pNeutral: 0.38, pBull: 0.32, date: "2026-10-21" } });
  assert.equal(r.label, "TRANSITION"); assert.equal(r.rule, "UPTREND"); assert.equal(r.probabilityGap, 0.06);
  assert.equal(regimeDaily(up.slice(0, 30)).label, "UNKNOWN");
});

test("biến động: phân vị ATR trong [0,100]; nến chỉ có giá đóng cửa -> không tính biên độ phiên", () => {
  const dates = tradingDatesBack("2026-10-21", 260);
  const v = volatilityDaily(series(dates, (i) => 1000 + Math.sin(i / 7) * 30));
  assert.ok(v.atrPercentile >= 0 && v.atrPercentile <= 100);
  assert.ok(Number.isFinite(v.rangeZ));
  const flat = volatilityDaily(dates.map((date, i) => ({ date, open: 1000 + i, high: 1000 + i, low: 1000 + i, close: 1000 + i })));
  assert.equal(flat.rangeZ, null); assert.match(flat.note, /giá đóng cửa/);
});

test("dòng tiền: nguồn tách riêng, thiếu một nguồn -> PARTIAL, ngược chiều -> MIXED, không có nguồn -> UNKNOWN", () => {
  const fb = [{ date: "d1", net: -2e9 }, { date: "d2", net: 3e9 }, { date: "d3", net: 4e9 }];
  const a = flowState({ foreignByDate: fb, footprint: { date: "d3", zLd5: -1.2 } });
  assert.equal(a.state, "MIXED"); assert.equal(a.partial, false); assert.equal(a.foreign.streak, 2); assert.equal(a.foreign.net5, 5e9);
  const b = flowState({ foreignByDate: fb });
  assert.equal(b.state, "ACCUMULATION"); assert.equal(b.partial, true); assert.deepEqual(b.sources, ["FOREIGN_EOD"]);
  assert.equal(flowState({}).state, "UNKNOWN");
  assert.equal(b.proprietary, null);
});

test("sức khoẻ nguồn + pha phiên + hysteresis", () => {
  const nowMs = Date.parse("2026-10-21T03:00:00Z");
  assert.equal(sourceHealth({ id: "x", kind: "intraday", asOf: "2026-10-21T02:59:30Z", live: true, nowMs }).status, "LIVE");
  assert.equal(sourceHealth({ id: "x", kind: "intraday", asOf: "2026-10-21T02:50:00Z", live: true, nowMs }).status, "DELAYED");
  assert.equal(sourceHealth({ id: "x", kind: "intraday", asOf: "2026-10-21T01:00:00Z", live: true, nowMs }).status, "STALE");
  assert.equal(sourceHealth({ id: "d", kind: "daily", asOf: "2026-10-20", expectedDate: "2026-10-21" }).status, "STALE");
  assert.equal(sourceHealth({ id: "d", kind: "daily", error: "lỗi" }).status, "UNAVAILABLE");
  assert.equal(overallHealth([{ id: "daily", status: "UNAVAILABLE" }, { id: "index", status: "UNAVAILABLE" }], ["daily", "index"]), "UNAVAILABLE");
  assert.equal(overallHealth([{ id: "daily", status: "LIVE" }, { id: "research", status: "UNAVAILABLE" }], ["daily"]), "PARTIAL");
  assert.deepEqual(sessionPhase("LO", 10 * 60), { phase: "CONTINUOUS_AM", label: "Khớp liên tục sáng" });
  assert.equal(sessionPhase("LO", 13 * 60 + 30).phase, "CONTINUOUS_PM");
  const h = createHysteresis(2);
  assert.equal(h("k", "UP"), "UP"); assert.equal(h("k", "DOWN"), "UP"); assert.equal(h("k", "UP"), "UP");
  assert.equal(h("k", "DOWN"), "UP"); assert.equal(h("k", "DOWN"), "DOWN");
});

test("service: một nguồn lỗi (SSI trong phiên) không làm mất khối khác; phạm vi VN30; snapshot lưu bảng cục bộ và đọc lại lịch sử", async () => {
  const store = createLocalStore({ dir: fs.mkdtempSync(path.join(os.tmpdir(), "gq-mx-")), log: { warn() {} } });
  const dates = tradingDatesBack("2026-10-21", 80);
  const syms = ["AAA", "BBB", "CCC", "DDD"];
  for (const [k, date] of dates.entries()) {
    await store.upsertMarketDaily(syms.map((symbol, j) => {
      const c = 100 + (j % 2 ? -k * 0.2 : k * 0.3);
      return { symbol, date, exchange: j < 3 ? "HOSE" : "HNX", open: c, high: c * 1.01, low: c * 0.99, close: c, closeAdj: c, refPrice: c - (j % 2 ? -0.2 : 0.3), volume: 1, value: 1, foreignBuyVal: j === 0 ? 5e9 : 0, foreignSellVal: 1e9 };
    }));
  }
  const idx = dates.map((date, i) => ({ date, open: 1000 + i, high: 1005 + i, low: 995 + i, close: 1000 + i, volume: 1 }));
  const service = {
    cache: { wrap: (_k, _t, fn) => fn() },
    getIndexComponents: async () => ({ symbols: ["AAA", "BBB"] }),
    getBreadth: async () => { throw new Error("SSI timeout"); },
    getOhlcv: async () => ({ bars: idx }),
  };
  const mx = createMatrixService({ service, store, now: () => Date.parse("2026-10-21T10:00:00Z"), log: { warn() {} } });
  const o = await mx.overview({ scope: "VNINDEX" });
  assert.equal(o.version, MATRIX_VERSION);
  assert.equal(o.scope.eligible, 3, "toàn sàn HOSE = 3 mã (DDD là HNX)");
  assert.ok(o.breadth.daily.aboveMa20Pct != null);
  assert.equal(o.breadth.intraday, null);
  assert.equal(o.dataHealth.sources.find((s) => s.id === "intraday").status, "UNAVAILABLE");
  assert.equal(o.dataHealth.status, "PARTIAL");
  assert.equal(o.regime.label, "UPTREND");
  assert.equal(o.flow.foreign.net > 0, true);
  assert.equal(o.flow.partial, true, "chưa có dấu chân lệnh (research) -> PARTIAL");
  assert.ok(o.volatility.atrPercentile >= 0);
  const v = await mx.overview({ scope: "VN30" });
  assert.equal(v.scope.eligible, 2);
  const snap = await mx.snapshot();
  assert.equal(snap.saved.length, 3);
  const hist = await mx.history({ scope: "VN30" });
  assert.equal(hist.length, 1); assert.equal(hist[0].date, "2026-10-21"); assert.equal(hist[0].regime, "UPTREND");
});
