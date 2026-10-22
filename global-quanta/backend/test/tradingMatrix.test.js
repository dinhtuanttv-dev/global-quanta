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
  const mx = createMatrixService({ service, store, fetchShares: async () => new Map(), now: () => Date.parse("2026-10-21T10:00:00Z"), log: { warn() {} } });
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

test("M2 heatmap ngành: cùng phân ngành với bảng, RS so VN-Index, độ rộng ngành, ngành < 3 mã bị ẩn, Smart Score chỉ ghép khi CÙNG phiên", async () => {
  const { sectorStats, notableMovers } = await import("../src/market/tradingMatrix/sectorMatrix.js");
  const dates = tradingDatesBack("2026-10-21", 60);
  const mk = (f, extra = {}) => series(dates, f, { volume: 1e5, value: 2e9, foreignBuyVal: 1e9, foreignSellVal: 0, ...extra });
  const bySymbol = new Map([
    ["BK1", mk((i) => 100 + i)], ["BK2", mk((i) => 50 + i * 0.6)], ["BK3", mk((i) => 30 + i * 0.4)],
    ["RE1", mk((i) => 100 - i * 0.5)], ["RE2", mk((i) => 80 - i * 0.3)], ["RE3", mk((i) => 60 - i * 0.2)],
    ["XX1", mk((i) => 10)], ["ZZZ", mk((i) => 10)],
  ]);
  const idx = dates.map((date, i) => ({ date, open: 1000, high: 1001, low: 999, close: 1000 + i * 0.1 }));
  const taxonomy = { BK1: ["Tài chính", "Ngân hàng"], BK2: ["Tài chính", "Ngân hàng"], BK3: ["Tài chính", "Ngân hàng"], RE1: ["Bất động sản", "Bất động sản dân cư"], RE2: ["Bất động sản", "Bất động sản dân cư"], RE3: ["Bất động sản", "Bất động sản dân cư"], XX1: ["Khác", "Ngành nhỏ"] };
  const s = sectorStats({ bySymbol, asOf: "2026-10-21", indexBars: idx, taxonomy, smart: new Map([["BK1", 80], ["BK2", 60]]) });
  assert.deepEqual(s.sectors.map((x) => x.industry).sort(), ["Bất động sản dân cư", "Ngân hàng"], "ngành < 3 mã (Ngành nhỏ) bị ẩn");
  assert.equal(s.unclassified, 1);
  const bank = s.sectors.find((x) => x.industry === "Ngân hàng"), re = s.sectors.find((x) => x.industry === "Bất động sản dân cư");
  assert.ok(bank.rs[20] > 0 && re.rs[20] < 0);
  assert.equal(bank.breadth, 100); assert.equal(re.breadth, 0);
  assert.equal(bank.avgSmart, 70); assert.equal(bank.smartCoverage, 0.67);
  assert.equal(bank.foreign5, 15e9);
  const m = notableMovers({ bySymbol, asOf: "2026-10-21", taxonomy });
  assert.match(m.note, /KHÔNG phải mức đóng góp/);
  assert.ok(m.gainers.every((x) => x.ret > 0) && m.losers.every((x) => x.ret < 0));
  assert.equal(m.gainers[0].industry, "Ngân hàng");
});

test("M2 service: sectors / movers theo phạm vi; Smart Score lần quét khác phiên không bị ghép", async () => {
  const store = createLocalStore({ dir: fs.mkdtempSync(path.join(os.tmpdir(), "gq-mx2-")), log: { warn() {} } });
  const dates = tradingDatesBack("2026-10-21", 60);
  const syms = ["A1", "A2", "A3", "B1"];
  for (const [k, date] of dates.entries()) await store.upsertMarketDaily(syms.map((symbol, j) => ({ symbol, date, exchange: "HOSE", open: 10 + k, high: 11 + k, low: 9 + k, close: 10 + k * (j + 1) * 0.1, closeAdj: 10 + k * (j + 1) * 0.1, refPrice: 10 + (k - 1) * (j + 1) * 0.1, volume: 1, value: 1e9 * (j + 1), foreignBuyVal: 0, foreignSellVal: 0 })));
  await store.setKv("scanner:taxonomy", { map: { A1: ["Tài chính", "Ngân hàng"], A2: ["Tài chính", "Ngân hàng"], A3: ["Tài chính", "Ngân hàng"], B1: ["Khác", "Khác"] } });
  await store.setKv("scanner:latest", { dataAsOf: "2026-10-20", items: [{ ticker: "A1", smartScore: 90 }] });
  const idx = dates.map((date, i) => ({ date, open: 1000 + i, high: 1001 + i, low: 999 + i, close: 1000 + i }));
  const service = { cache: { wrap: (_k, _t, fn) => fn() }, getIndexComponents: async () => ({ symbols: ["A1", "A2"] }), getOhlcv: async () => ({ bars: idx }) };
  const mx = createMatrixService({ service, store, fetchShares: async () => new Map(), now: () => Date.parse("2026-10-21T10:00:00Z"), log: { warn() {} } });
  const s = await mx.sectors({ scope: "VNINDEX" });
  assert.equal(s.sectors.length, 1); assert.equal(s.sectors[0].industry, "Ngân hàng");
  assert.equal(s.smartMatched, false); assert.equal(s.sectors[0].avgSmart, null);
  const m = await mx.movers({ scope: "VN30" });
  assert.equal(m.eligible, 2); assert.equal(m.label, "Mã biến động đáng chú ý");
});

test("M3 service: kịch bản + cờ rủi ro trong overview (THỰC NGHIỆM, không gọi 'Xác nhận' khi chưa đạt); snapshot ghi sổ tín hiệu và chấm kết quả", async () => {
  const store = createLocalStore({ dir: fs.mkdtempSync(path.join(os.tmpdir(), "gq-mx3-")), log: { warn() {} } });
  const dates = tradingDatesBack("2026-10-21", 320);
  const syms = Array.from({ length: 12 }, (_, i) => `S${i}`);
  for (const [k, date] of dates.entries()) await store.upsertMarketDaily(syms.map((symbol, j) => {
    const c = 100 + k * 0.3 + Math.sin((k + j) / 9) * 3;
    return { symbol, date, exchange: "HOSE", open: c, high: c * 1.01, low: c * 0.99, close: c, closeAdj: c, refPrice: c - 0.2, volume: 1, value: 1e9, foreignBuyVal: 2e9, foreignSellVal: 0 };
  }));
  const idx = dates.map((date, i) => ({ date, open: 1000 + i, high: 1000 + i, low: 1000 + i, close: 1000 + i * 2 + Math.sin(i / 7) * 5, volume: 1 }));
  const service = { cache: { wrap: (_k, _t, fn) => fn() }, getIndexComponents: async () => ({ symbols: syms }), getBreadth: async () => { throw new Error("x"); }, getOhlcv: async () => ({ bars: idx }) };
  const mx = createMatrixService({ service, store, fetchShares: async () => new Map(), now: () => Date.parse("2026-10-21T10:00:00Z"), log: { warn() {} } });
  const o = await mx.overview({ scope: "VNINDEX" });
  assert.deepEqual(o.scenarios.map((s) => s.id), ["SC1", "SC2", "SC3"]);
  for (const s of o.scenarios) { assert.equal(s.validation.label, "THỰC NGHIỆM"); assert.notEqual(s.displayState, "Xác nhận"); assert.ok(s.validation.summary.length > 10); }
  assert.ok(o.stateVector && "b" in o.stateVector);
  assert.deepEqual(o.riskFlags.map((f) => f.id), ["RF3", "RF4", "RF2", "RF1", "RF5"]);
  assert.equal(o.riskFlags.find((f) => f.id === "RF1").status, "UNAVAILABLE");
  const sn = await mx.snapshot();
  assert.ok(sn.scoring && !sn.scoring.error);
  const sig = await mx.signals({ scope: "VNINDEX" });
  assert.ok(sig.recent.every((r) => ["WATCH", "CONFIRMED", "INVALIDATED"].includes(r.state)), "sổ không ghi chuyển về INACTIVE / COOLDOWN");
  assert.equal(sig.ruleVersion, "M3-r1");
  assert.ok(sig.validation.summary.SC2.includes("ngược với kỳ vọng"));
});

test("M5/M6: dự báo có kỳ hạn + tỷ lệ nền + phiên bản + nhãn MÔ TẢ (champion chưa thăng hạng); ghi sổ dự báo, chấm, phát lại không ghi đè sổ, quay lui mô hình, báo cáo vận hành", async () => {
  const { opsReport, DRILLS } = await import("../src/market/tradingMatrix/matrixOps.js");
  const store = createLocalStore({ dir: fs.mkdtempSync(path.join(os.tmpdir(), "gq-mx5-")), log: { warn() {} } });
  const dates = tradingDatesBack("2026-10-21", 320);
  const syms = Array.from({ length: 12 }, (_, i) => `S${i}`);
  for (const [k, date] of dates.entries()) await store.upsertMarketDaily(syms.map((symbol, j) => {
    const c = 100 + k * 0.3 + Math.sin((k + j) / 9) * 3;
    return { symbol, date, exchange: "HOSE", open: c, high: c, low: c, close: c, closeAdj: c, refPrice: c - 0.2, volume: 1, value: 1e9, foreignBuyVal: 0, foreignSellVal: 0 };
  }));
  const idx = dates.map((date, i) => ({ date, open: 1, high: 1, low: 1, close: 1000 + i * 2 + Math.sin(i / 7) * 5, volume: 1 }));
  const service = { cache: { wrap: (_k, _t, fn) => fn() }, getIndexComponents: async () => ({ symbols: syms }), getBreadth: async () => { throw new Error("x"); }, getOhlcv: async () => ({ bars: idx }) };
  const mx = createMatrixService({ service, store, fetchShares: async () => new Map(), now: () => Date.parse("2026-10-21T10:00:00Z"), log: { warn() {} } });
  const o = await mx.overview({ scope: "VNINDEX" });
  assert.ok(o.forecast.p >= 0 && o.forecast.p <= 1);
  assert.equal(o.forecast.horizon, 10); assert.equal(o.forecast.modelId, "B0-breadth"); assert.equal(o.forecast.label, "MÔ TẢ");
  assert.ok(o.forecast.baseRate > 0 && o.forecast.holdout.n > 0);
  await mx.snapshot();
  assert.equal((await store.selectRows("market_matrix_forecast", { eq: { scope: "VNINDEX" } })).length, 1);
  const rp = await mx.replay({ scope: "VNINDEX", from: "2026-10-14", to: "2026-10-17" });
  assert.equal(rp.replayed, 3, "14–16/10 (17/10/2026 là thứ Bảy)");
  assert.ok((await store.selectRows("market_matrix_replay", {})).every((r) => r.recomputed === true));
  assert.equal((await store.selectRows("market_matrix_forecast", { eq: { scope: "VNINDEX" } })).length, 1, "phát lại không ghi vào sổ dự báo");
  await assert.rejects(() => mx.setActiveModel("không-có"));
  assert.equal((await mx.setActiveModel("B1-base")).active, "B1-base");
  assert.equal((await mx.overview({ scope: "VNINDEX" })).forecast.modelId, "B1-base");
  const ops = await opsReport({ store, matrix: mx, now: () => Date.parse("2026-10-21T10:00:00Z") });
  assert.equal(ops.dataGaps.missing, 0);
  assert.equal(ops.model.active, "B1-base");
  assert.equal(ops.ruleChangelog[0].version, "M3-r1");
  assert.ok(DRILLS.length >= 6 && ops.drills.every((d) => d.test));
});
