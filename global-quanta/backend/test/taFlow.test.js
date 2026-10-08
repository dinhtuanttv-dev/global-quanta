process.env.MARKET_ALERTS_ENABLED = "false";

import test from "node:test";
import assert from "node:assert/strict";
import { createTaFlow, largePrintThreshold, normalizeFlowMinutes } from "../src/market/adjusted/taFlow.js";
import { createMemoryStore } from "../src/market/store/memoryStore.js";

test("normalizeFlowMinutes: phút ATO (09:15) và ATC (≥ 14:45) chuyển sang auction, không còn bên chủ động", () => {
  const { minutes } = normalizeFlowMinutes([
    { date: "2026-10-08", minute: 555, buy: 1000, sell: 0, unknown: 0, prints: 1, sizes: { 1000: 1 } },
    { date: "2026-10-08", minute: 600, buy: 300, sell: 200, unknown: 0, prints: 5, sizes: { 100: 5 } },
    { date: "2026-10-08", minute: 885, buy: 0, sell: 338900, unknown: 0, prints: 1, sizes: { 338900: 1 } },
  ]);
  assert.deepEqual(minutes.map((m) => [m.minute, m.buy, m.sell, m.auction]), [[555, 0, 0, 1000], [600, 300, 200, 0], [885, 0, 0, 338900]]);
  const idx = normalizeFlowMinutes([{ date: "d", minute: 555, buy: 5, sell: 0, unknown: 0, prints: 1, sizes: {} }], { isIndex: true });
  assert.equal(idx.minutes[0].auction, 0, "chỉ số không có ATO riêng");
});

test("largePrintThreshold: phân vị 99 theo số lệnh; lệnh lớn cộng dồn KL", () => {
  const minutes = [{ sizes: { 100: 98, 200: 1, 50000: 1 } }];
  assert.equal(largePrintThreshold(minutes, 0.99), 200);
  assert.equal(largePrintThreshold(minutes, 0.995), 50000);
  assert.equal(largePrintThreshold([{ sizes: {} }]), null);
  const { threshold, minutes: out } = normalizeFlowMinutes([
    { date: "d", minute: 600, buy: 0, sell: 0, unknown: 0, prints: 100, sizes: { 100: 98, 200: 1, 50000: 1 } },
  ]);
  assert.equal(threshold, 200);
  assert.equal(out[0].large, 200 + 50000);
});

test("createTaFlow: ghép lịch sử kho + phút hôm nay trong bộ nhớ, kèm khối ngoại theo ngày", async () => {
  const store = createMemoryStore();
  await store.upsertTickFlow([{ symbol: "FPT", date: "2026-10-07", minute: 600, buy: 500, sell: 100, unknown: 0, prints: 3, sizes: { 200: 3 } }]);
  await store.upsertMarketDaily?.([{ symbol: "FPT", date: "2026-10-07", close: 59700, foreignBuyVal: 4.9e10, foreignSellVal: 1.09e11, foreignRoom: 3.5e8 }]);
  const hub = { getTickFlow: () => ({ date: "2026-10-08", minutes: [{ minute: 601, buy: 10, sell: 20, unknown: 0, prints: 2, sizes: { 10: 1, 20: 1 } }] }) };
  const flow = createTaFlow({ store, hub, now: () => Date.parse("2026-10-08T04:00:00Z") });
  const r = await flow.get({ symbol: "fpt", days: 5 });
  assert.equal(r.symbol, "FPT");
  assert.deepEqual(r.minutes.map((m) => [m.date, m.minute, m.buy, m.sell]), [["2026-10-07", 600, 500, 100], ["2026-10-08", 601, 10, 20]]);
  assert.equal(r.coverage.tickSessions, 2);
  if (store.upsertMarketDaily) assert.equal(r.foreign[0]?.netVal, 4.9e10 - 1.09e11);
  const idx = await flow.get({ symbol: "VNINDEX" });
  assert.deepEqual(idx.minutes, []);
});
