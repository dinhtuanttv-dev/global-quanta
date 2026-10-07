import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryStore } from "../src/market/store/memoryStore.js";
import { runTechnicalFilter } from "../src/market/strategies/technicalFilters.js";

function makeBars(count) {
  const start = new Date("2025-01-01T00:00:00Z");
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(start.getTime() + i * 86_400_000).toISOString().slice(0, 10);
    const close = 20_000 + i * 10;
    return {
      symbol: "AAA",
      date,
      open: close - 20,
      high: close + 100,
      low: close - 100,
      close,
      closeAdj: close * 0.9,
      volume: 250_000,
    };
  });
}

async function makeService(count = 260) {
  const store = createMemoryStore();
  await store.setKv("scanner:universe", {
    tickers: [{ ticker: "AAA", sector: "Test", name: "Test Corp" }],
  });
  await store.upsertMarketDaily(makeBars(count));
  return { store };
}

test("technical filters return isolated strategy metadata and use Gateway-adjusted daily history", async () => {
  const service = await makeService();
  const camSlim = await runTechnicalFilter(service, "camslim");
  const baseBreakout = await runTechnicalFilter(service, "base-breakout");

  assert.equal(camSlim.strategy, "camslim");
  assert.equal(baseBreakout.strategy, "base-breakout");
  assert.equal(camSlim.dataAsOf, "2025-09-17");
  assert.equal(camSlim.scannedCount, 1);
  assert.equal(baseBreakout.scannedCount, 1);
  assert.equal(camSlim.resultCount, camSlim.results.length);
  assert.equal(baseBreakout.resultCount, baseBreakout.results.length);
  assert.match(camSlim.disclaimer, /không phải khuyến nghị đầu tư/);
});

test("technical filters report insufficient history and reject unavailable universes", async () => {
  const shortService = await makeService(100);
  const result = await runTechnicalFilter(shortService, "base-breakout");
  assert.equal(result.scannedCount, 0);
  assert.deepEqual(result.skipped, [{ ticker: "AAA", reason: "INSUFFICIENT_BARS", bars: 100 }]);

  await assert.rejects(() => runTechnicalFilter({ store: createMemoryStore() }, "camslim"), {
    statusCode: 503,
  });
  await assert.rejects(() => runTechnicalFilter(shortService, "unknown"), {
    statusCode: 404,
  });
});
