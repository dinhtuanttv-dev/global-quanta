import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryStore } from "../src/market/store/memoryStore.js";
import { liquidityGate, runTechnicalFilter, runTechnicalFilters, screenerCriteria, strategyKvKey } from "../src/market/strategies/technicalFilters.js";
import { createStrategyJobs, SCREENER_BACKFILL_KV } from "../src/market/strategies/strategyJobs.js";
import { createScreenerSeries } from "../src/market/strategies/screenerSeries.js";
import { ADJUSTED_TABLE } from "../src/market/adjusted/adjustedHistory.js";
import { repairUnexplainedGaps } from "../src/market/adjusted/corporateActions.js";

const criteria = screenerCriteria({});

function makeBars(count, { price = 20_000, volume = 500_000, endDate = "2026-10-07", value } = {}) {
  const end = Date.parse(`${endDate}T00:00:00Z`);
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(end - (count - 1 - i) * 86_400_000).toISOString().slice(0, 10);
    const close = price + i * 5;
    return { date, open: close - 20, high: close + 100, low: close - 100, close, volume, ...(value ? { value } : {}) };
  });
}

async function makeService(tickers) {
  const store = createMemoryStore();
  await store.setKv("scanner:universe", { tickers: tickers.map((ticker) => ({ ticker, sector: "Test", name: `${ticker} Corp` })) });
  return { store };
}

test("ngưỡng mặc định theo VND: giá ≥ 5.000đ, GTGD TB20 ≥ 5 tỷ; ưu tiên value của sàn", () => {
  assert.deepEqual([criteria.minPrice, criteria.minAvgValue20], [5_000, 5_000_000_000]);
  assert.equal(liquidityGate(makeBars(30, { price: 20_000, volume: 500_000 }), criteria).ok, true); // ~10 tỷ
  assert.equal(liquidityGate(makeBars(30, { price: 20_000, volume: 100_000 }), criteria).reason, "ILLIQUID"); // ~2 tỷ
  assert.equal(liquidityGate(makeBars(30, { price: 3_000, volume: 9_000_000 }), criteria).reason, "LOW_PRICE");
  // volume đã điều chỉnh có thể lệch; value (VND danh nghĩa) thắng
  assert.equal(liquidityGate(makeBars(30, { volume: 1, value: 6e9 }), criteria).ok, true);
  assert.deepEqual(screenerCriteria({ SCREENER_MIN_PRICE: "10000", SCREENER_MIN_AVG_VALUE: "1e10" }).minAvgValue20, 1e10);
});

test("một lần tải chuỗi điều chỉnh cho cả hai bộ lọc; bỏ nến partial; lý do bỏ qua rõ ràng", async () => {
  const service = await makeService(["AAA", "BBB", "CCC", "DDD", "EEE", "FFF"]);
  const series = {
    AAA: [...makeBars(700), { ...makeBars(1, { endDate: "2026-10-08" })[0], partial: true }],
    BBB: makeBars(120), // niêm yết mới
    CCC: makeBars(700, { volume: 50_000 }), // kém thanh khoản
    DDD: makeBars(700, { endDate: "2026-09-20" }), // tạm ngừng giao dịch
    EEE: makeBars(700),
  };
  const calls = [];
  const loadSeries = async (symbol) => {
    calls.push(symbol);
    if (symbol === "FFF") throw new Error("SSI timeout");
    return { bars: series[symbol], priceBasis: "ADJUSTED_CUMULATIVE" };
  };
  const docs = await runTechnicalFilters(service, { loadSeries, criteria });
  assert.equal(calls.length, 6, "mỗi mã tải đúng một lần cho cả hai chiến lược");
  for (const id of ["camslim", "base-breakout", "sepa"]) {
    const d = docs[id];
    assert.equal(d.dataAsOf, "2026-10-07", "nến partial hôm nay bị loại");
    assert.equal(d.scannedCount, 2);
    assert.equal(d.universeCount, 6);
    assert.deepEqual(d.priceBasis, { ADJUSTED_CUMULATIVE: 5 });
    assert.deepEqual(d.skipped.map((s) => `${s.ticker}:${s.reason}`), ["BBB:INSUFFICIENT_BARS", "CCC:ILLIQUID", "DDD:STALE", "FFF:LOAD_FAILED"]);
    assert.equal(d.criteria.minAvgValue20, 5e9);
    assert.match(d.disclaimer, /không phải khuyến nghị đầu tư/);
    for (const r of d.results) assert.ok(r.liquidity.avgValue20 >= 5e9 && r.name && r.priceBasis);
  }
});

test("lỗi cấu hình: chiến lược lạ 404, thiếu universe / nguồn chuỗi 503", async () => {
  const loadSeries = async () => ({ bars: makeBars(300) });
  const service = await makeService(["AAA"]);
  await assert.rejects(() => runTechnicalFilter(service, "unknown", { loadSeries }), { statusCode: 404 });
  await assert.rejects(() => runTechnicalFilter({ store: createMemoryStore() }, "camslim", { loadSeries }), { statusCode: 503 });
  await assert.rejects(() => runTechnicalFilter(service, "camslim", {}), { statusCode: 503 });
});

test("screenerSeries: kho nến SSI -> danh nghĩa, market_daily ghi đè phiên gần đây, rồi điều chỉnh cộng dồn — không gọi SSI", async () => {
  const store = createMemoryStore();
  // SSI DailyOhlc đã chia hệ số 1,3 của đợt quyền gần nhất (cổ tức CP 30%) cho toàn lịch sử trước GDKHQ 2026-10-06
  const hist = makeBars(10, { endDate: "2026-10-06", price: 10_000 });
  await store.upsertBars("AAA", hist.map((b) => ({ ...b, open: Math.round(b.open / 1.3), high: Math.round(b.high / 1.3), low: Math.round(b.low / 1.3), close: Math.round(b.close / 1.3) })), "SSI");
  await store.upsertRows(ADJUSTED_TABLE, [{ symbol: "AAA", from_date: hist[0].date, to_date: "2026-10-05", bars: hist.slice(0, -1).map((b) => [b.date, b.close, null, null, b.volume]) }], "symbol");
  await store.upsertMarketDaily([
    { symbol: "AAA", date: "2026-10-06", open: 7_700, high: 7_800, low: 7_650, close: 7_750, volume: 1_000, value: 7_750_000 },
    { symbol: "AAA", date: "2026-10-07", open: 7_750, high: 7_900, low: 7_700, close: 7_850, volume: 1_000, value: 7_850_000 },
  ]);
  const corporateActions = { get: async () => ({ covered: true, events: [{ exDate: "2026-10-06", type: "STOCK_DIVIDEND", cash: 0, ratio: 0.3, label: "Cổ tức CP 30%" }] }) };
  const loadSeries = await createScreenerSeries({ store, corporateActions }).prepare(["AAA"]);
  const s = await loadSeries("AAA");
  assert.equal(s.bars.at(-1).date, "2026-10-07");
  assert.equal(s.bars.at(-1).close, 7_850, "phiên cuối = giá danh nghĩa của sàn");
  assert.equal(s.bars.at(-2).close, 7_750, "market_daily thắng nến kho cùng ngày");
  assert.deepEqual(s.gapRepairs, [], "sự kiện có trong nguồn -> không cần tự điều chỉnh");
  assert.equal(s.priceBasis, "ADJUSTED_CUMULATIVE");
  assert.equal(s.events, 1);
  assert.ok(Math.abs(s.bars[0].close - hist[0].close / 1.3) <= 5, `trước GDKHQ: danh nghĩa 10.000 -> điều chỉnh ~7.692 (được ${s.bars[0].close})`);
});

test("job scanStrategies lưu KV từng chiến lược", async () => {
  const service = await makeService(["AAA"]);
  const bars = makeBars(700);
  await service.store.upsertBars("AAA", bars, "SSI");
  await service.store.upsertMarketDaily(bars.slice(-5).map((b) => ({ symbol: "AAA", ...b, value: b.close * b.volume })));
  const corporateActions = { get: async () => ({ covered: true, events: [] }) };
  const r = await createStrategyJobs({ service, corporateActions }).scanStrategies();
  assert.equal(r.dataAsOf, "2026-10-07");
  assert.equal(r.scanned, 1);
  for (const id of ["camslim", "base-breakout"]) assert.equal((await service.store.getKv(strategyKvKey(id))).value.strategy, id);
  const results = ["camslim", "base-breakout", "convergence"].reduce((n, id) => n + r.results[id], 0);
  assert.equal(r.ledger, results, "mọi tín hiệu của phiên được ghi vào sổ cái theo dõi thực tế");
});

test("job backfillScreenerHistory chỉ nạp mã thiếu lịch sử 3 năm, ghi nhận mã niêm yết mới để không gọi lại", async () => {
  const now = () => Date.parse("2026-10-08T20:00:00Z");
  const service = await makeService(["OLD", "NEW", "YNG"]);
  await service.store.upsertBars("OLD", makeBars(1100), "SSI");
  await service.store.upsertBars("NEW", makeBars(200), "SSI");
  const calls = [];
  service.getOhlcv = async ({ symbol, range }) => {
    calls.push(`${symbol}:${range}`);
    return { bars: symbol === "YNG" ? makeBars(150) : makeBars(1100) };
  };
  const jobs = createStrategyJobs({ service, corporateActions: null, now, pauseMs: 0 });
  const r1 = await jobs.backfillScreenerHistory();
  assert.deepEqual(calls.sort(), ["NEW:3y", "YNG:3y"]);
  assert.deepEqual([r1.covered, r1.todo, r1.loaded], [1, 2, 2]);
  const state = (await service.store.getKv(SCREENER_BACKFILL_KV)).value;
  assert.ok(state.young.YNG && !state.young.NEW);
  calls.length = 0;
  await jobs.backfillScreenerHistory();
  assert.deepEqual(calls, ["NEW:3y"], "YNG niêm yết < 3 năm: 30 ngày mới thử lại; NEW vẫn thiếu trong kho giả lập");
});

test("repairUnexplainedGaps: tách 1:4 thiếu trong nguồn sự kiện -> điều chỉnh lùi theo khoảng cách; biến động thường không đụng tới", () => {
  const bars = [
    { date: "2026-09-10", open: 82_600, high: 83_500, low: 82_000, close: 83_100, volume: 100 },
    { date: "2026-09-14", open: 82_000, high: 82_400, low: 80_500, close: 80_600, volume: 100 },
    { date: "2026-09-15", open: 21_550, high: 21_550, low: 21_100, close: 21_550, volume: 400 },
    { date: "2026-09-16", open: 21_600, high: 22_600, low: 21_550, close: 22_400, volume: 400 },
  ];
  const r = repairUnexplainedGaps(bars);
  assert.equal(r.repaired.length, 1);
  assert.equal(r.repaired[0].date, "2026-09-15");
  assert.ok(Math.abs(r.bars[1].close - 21_550) < 1, "phiên trước GDKHQ về cùng thang giá");
  assert.equal(r.bars[1].volume, Math.round(100 / (21_550 / 80_600)));
  assert.deepEqual(r.bars.slice(2), bars.slice(2), "phiên sau không đổi");
  // trần UPCoM +15% hai phiên liền: không phải sự kiện
  const normal = [{ date: "a", open: 100, high: 100, low: 100, close: 100 }, { date: "b", open: 115, high: 115, low: 115, close: 115 }, { date: "c", open: 132, high: 132, low: 132, close: 132 }];
  assert.deepEqual(repairUnexplainedGaps(normal).repaired, []);
});
