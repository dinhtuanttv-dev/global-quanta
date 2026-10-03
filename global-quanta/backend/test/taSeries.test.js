process.env.MARKET_ALERTS_ENABLED = "false";

import test from "node:test";
import assert from "node:assert/strict";
import { adjustOhlcSeries, createCorporateActions, normalizeCorporateEvent } from "../src/market/adjusted/corporateActions.js";
import { createTaSeries, nominalizeBars } from "../src/market/adjusted/taSeries.js";
import { createVndirectIndexProvider, vndirectIndexCode } from "../src/market/providers/vndirectIndexProvider.js";
import { createMarketDataService } from "../src/market/marketDataService.js";
import { createMemoryStore } from "../src/market/store/memoryStore.js";

const bar = (date, close, extra = {}) => ({ date, open: close, high: close * 1.01, low: close * 0.99, close, volume: 1000, ...extra });

test("normalizeCorporateEvent: tiền mặt, cổ phiếu thưởng/cổ tức CP; bỏ ESOP và dữ liệu sai", () => {
  assert.deepEqual(normalizeCorporateEvent({ eventType: "CASH", exrightDate: "2026-06-26", valuePerShare: 1850 }),
    { exDate: "2026-06-26", type: "CASH", cash: 1850, ratio: 0, label: "Cổ tức 1.850đ" });
  assert.equal(normalizeCorporateEvent({ eventType: "BONUS_ISSUE", exrightDate: "2026-09-21", exerciseRatio: 0.1 }).label, "Thưởng CP 10%");
  assert.equal(normalizeCorporateEvent({ eventType: "STOCK_DIVIDEND", exrightDate: "2026-09-21", exerciseRatio: 0.15 }).ratio, 0.15);
  assert.equal(normalizeCorporateEvent({ eventType: "ESOP", exrightDate: "2026-09-21", exerciseRatio: 0.01 }), null);
  assert.equal(normalizeCorporateEvent({ eventType: "CASH", exrightDate: null, valuePerShare: 1000 }), null);
  assert.equal(normalizeCorporateEvent({ eventType: "CASH", exrightDate: "2026-01-02", valuePerShare: 0 }), null);
});

test("adjustOhlcSeries: điều chỉnh lùi cộng dồn — xoá khoảng trống giả ngày GDKHQ, giá từ ngày GDKHQ giữ danh nghĩa", () => {
  // 100.000 -> GDKHQ thưởng 10% (giá ~90.909) -> 91.000 -> GDKHQ cổ tức 1.000đ -> 90.000
  const bars = [bar("2026-09-17", 100_000), bar("2026-09-18", 100_000), bar("2026-09-21", 91_000), bar("2026-09-22", 91_000), bar("2026-09-23", 90_000)];
  const events = [
    { exDate: "2026-09-19", type: "BONUS_ISSUE", cash: 0, ratio: 0.1, label: "Thưởng CP 10%" }, // thứ Bảy -> phiên 21/09
    { exDate: "2026-09-23", type: "CASH", cash: 1000, ratio: 0, label: "Cổ tức 1.000đ" },
    { exDate: "2020-01-01", type: "CASH", cash: 500, ratio: 0, label: "ngoài dữ liệu" },
  ];
  const r = adjustOhlcSeries(bars, events);
  assert.deepEqual(r.applied.map((a) => a.date), ["2026-09-21", "2026-09-23"]);
  assert.equal(r.skipped[0].reason, "OUT_OF_RANGE");
  const fCash = (91_000 - 1000) / 91_000;
  const fBonus = 1 / 1.1;
  assert.equal(r.bars[4].close, 90_000, "phiên cuối = giá danh nghĩa");
  assert.equal(r.bars[3].close, Math.round(91_000 * fCash * 100) / 100);
  assert.equal(r.bars[1].close, Math.round(100_000 * fCash * fBonus * 100) / 100, "cộng dồn hai đợt");
  assert.equal(r.bars[1].volume, 1100, "khối lượng trước đợt thưởng nhân (1+tỷ lệ)");
  assert.equal(r.bars[3].volume, 1000, "cổ tức tiền không đổi khối lượng");
  // khoảng trống −9% giả ngày 21/09 biến mất
  assert.ok(Math.abs(r.bars[2].close / r.bars[1].close - 1) < 0.01);
});

test("adjustOhlcSeries: gộp nhiều sự kiện cùng ngày GDKHQ; cổ tức tiền vô lý bị bỏ qua", () => {
  const bars = [bar("2025-10-15", 60_000), bar("2025-10-16", 57_150)];
  const r = adjustOhlcSeries(bars, [
    { exDate: "2025-10-16", type: "CASH", cash: 2500, ratio: 0, label: "Cổ tức 2.500đ" },
    { exDate: "2025-10-16", type: "CASH", cash: 350, ratio: 0, label: "Cổ tức 350đ" },
  ]);
  assert.equal(r.applied.length, 1);
  assert.equal(r.applied[0].label, "Cổ tức 2.500đ + Cổ tức 350đ");
  assert.equal(r.bars[0].close, 57_150);
  const bad = adjustOhlcSeries(bars, [{ exDate: "2025-10-16", type: "CASH", cash: 40_000, ratio: 0, label: "lỗi" }]);
  assert.equal(bad.applied.length, 0);
  assert.equal(bad.skipped[0].reason, "INVALID_CASH");
});

test("nominalizeBars: khôi phục OHLC danh nghĩa theo hệ số từng ngày; nến hôm nay giữ nguyên", () => {
  const ssi = [bar("2026-06-24", 56_450 * 0.9683), bar("2026-06-25", 58_000), { ...bar("2026-10-03", 57_000), partial: true }];
  const nominal = new Map([["2026-06-24", 56_450], ["2026-06-25", 58_000]]);
  const r = nominalizeBars(ssi, nominal);
  assert.equal(r.matched, 2);
  assert.equal(r.bars[0].close, 56_450);
  assert.equal(r.bars[0].high, Math.round(56_450 * 0.9683 * 1.01 * (56_450 / (56_450 * 0.9683))));
  assert.equal(r.bars[2].close, 57_000);
});

test("createCorporateActions: một lượt cho cả universe, giữ bản cũ khi Project A lỗi", async () => {
  let calls = 0;
  let fail = false;
  let t = 0;
  const fetchImpl = async () => {
    calls++;
    if (fail) return new Response("err", { status: 503 });
    return new Response(JSON.stringify({ generatedAt: "g", eventSource: "VNDIRECT", results: [
      { ticker: "FPT", available: true, lifecycleEvents: [{ eventType: "BONUS_ISSUE", exrightDate: "2026-09-21", exerciseRatio: 0.1 }] },
      { ticker: "XYZ", available: false, lifecycleEvents: [] },
    ] }));
  };
  const ca = createCorporateActions({ base: "http://pa", fetchImpl, now: () => t, ttlMs: 1000 });
  assert.equal((await ca.get("fpt")).events.length, 1);
  assert.equal((await ca.get("XYZ")).covered, false);
  assert.equal(calls, 1);
  t = 5000; fail = true;
  assert.equal((await ca.get("FPT")).events[0].ratio, 0.1, "Project A lỗi -> dùng bản cũ");
  assert.equal(calls, 2);
});

test("VNDirect: mã chỉ số, phân trang, bỏ dòng thiếu giá", async () => {
  assert.equal(vndirectIndexCode("HNXINDEX"), "HNX");
  assert.equal(vndirectIndexCode("FPT"), null);
  const urls = [];
  const p = createVndirectIndexProvider({ fetchImpl: async (url) => {
    urls.push(url);
    return new Response(JSON.stringify({ totalPages: 1, data: [
      { date: "2026-10-02", open: 1747.29, high: 1751.6, low: 1728.36, close: 1737.71 },
      { date: "2026-10-01", open: 0, high: 1, low: 1, close: 1 },
    ] }));
  } });
  const rows = await p.getIndexDaily("VNINDEX", "2026-09-01", "2026-10-02");
  assert.deepEqual(rows, [{ date: "2026-10-02", open: 1747.29, high: 1751.6, low: 1728.36, close: 1737.71 }]);
  assert.match(urls[0], /code:VNINDEX~date:gte:2026-09-01~date:lte:2026-10-02/);
  assert.deepEqual(await p.getIndexDaily("FPT", "2026-09-01", "2026-10-02"), []);
});

test("service: nến chỉ số dẹt đã nằm trong kho được bổ sung O/H/L từ VNDirect và ghi lại kho", async () => {
  const store = createMemoryStore();
  const dates = ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"];
  await store.upsertBars("VNINDEX", dates.map((d) => ({ date: d, open: 1750, high: 1750, low: 1750, close: 1750, volume: 5e8, value: null })), "SSI_FC_V2");
  let vndCalls = 0;
  const vndirectIndex = {
    source: "VNDIRECT_FINFO", isConfigured: () => true,
    getIndexDaily: async () => { vndCalls++; return dates.map((d) => ({ date: d, open: 1760, high: 1770, low: 1740, close: d === "2026-10-02" ? 1800 : 1750.5 })); },
  };
  const ssi = { source: "SSI_FC_V2", isConfigured: () => true, getIndexDaily: async () => { throw new Error("không được gọi khi kho đủ"); } };
  const service = createMarketDataService({ providers: { ssiFcV2: ssi, vndirectIndex }, store, now: () => Date.parse("2026-10-03T10:00:00Z") });
  const r = await service.getOhlcv({ symbol: "VNINDEX", from: "2026-09-28", to: "2026-10-02" });
  assert.equal(r.priceBasis, "INDEX_POINTS");
  assert.deepEqual([r.bars[0].open, r.bars[0].high, r.bars[0].low, r.bars[0].close], [1760, 1770, 1740, 1750]);
  assert.equal(r.bars.at(-1).high, 1750, "giá đóng cửa lệch > 0,2% -> không bổ sung");
  assert.equal(r.flatBars, 1);
  const stored = await store.getBars("VNINDEX", "2026-09-28", "2026-10-02");
  assert.equal(stored.filter((b) => b.high === 1770).length, 4, "đã ghi lại kho");
  assert.equal(vndCalls, 1);
});

test("taSeries: cổ phiếu -> ADJUSTED_CUMULATIVE; thiếu sự kiện quyền -> NOMINAL_UNADJUSTED có cảnh báo; thiếu danh nghĩa -> SSI", async () => {
  const ssiBars = [bar("2026-09-18", 91_000), bar("2026-09-21", 91_000)]; // SSI đã "điều chỉnh" sai: không thấy khoảng trống
  const service = { getOhlcv: async () => ({ bars: ssiBars, provenance: { source: "SSI_FC_V2" } }) };
  const nominalHistory = { get: async () => ({ bars: [{ date: "2026-09-18", close: 100_000 }, { date: "2026-09-21", close: 91_000 }] }) };
  const ok = { get: async () => ({ events: [{ exDate: "2026-09-21", type: "BONUS_ISSUE", cash: 0, ratio: 0.1, label: "Thưởng CP 10%" }], covered: true, source: "VNDIRECT", generatedAt: "g" }) };
  const r = await createTaSeries({ service, nominalHistory, corporateActions: ok }).get({ symbol: "FPT" });
  assert.equal(r.priceBasis, "ADJUSTED_CUMULATIVE");
  assert.equal(r.bars[0].close, Math.round((100_000 / 1.1) * 100) / 100);
  assert.equal(r.corporateActions[0].label, "Thưởng CP 10%");
  assert.equal(r.quality.nominalCoverage, 1);

  const down = { get: async () => { throw new Error("Project A 503"); } };
  const r2 = await createTaSeries({ service, nominalHistory, corporateActions: down }).get({ symbol: "FPT" });
  assert.equal(r2.priceBasis, "NOMINAL_UNADJUSTED");
  assert.match(r2.warnings[0], /CHƯA điều chỉnh/);

  const noNominal = { get: async () => { throw new Error("hết lượt tải"); } };
  const r3 = await createTaSeries({ service, nominalHistory: noNominal, corporateActions: ok }).get({ symbol: "FPT" });
  assert.equal(r3.priceBasis, "SSI_LATEST_EVENT_ADJUSTED");

  const idx = { getOhlcv: async () => ({ bars: ssiBars, flatBars: 3, provenance: {} }) };
  const r4 = await createTaSeries({ service: idx, nominalHistory, corporateActions: ok }).get({ symbol: "VNINDEX" });
  assert.equal(r4.priceBasis, "INDEX_POINTS");
  assert.match(r4.warnings[0], /3 nến/);
});
