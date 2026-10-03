process.env.MARKET_ALERTS_ENABLED = "false";

import test from "node:test";
import assert from "node:assert/strict";
import { getUserChartState, normalizeChartSymbol, sanitizeChartPrimitives, saveUserChartState, MAX_PRIMITIVES } from "../src/market/watchlists/userChartState.js";
import { createMemoryStore } from "../src/market/store/memoryStore.js";

const line = (id) => ({ id, toolType: "trendline", p1: { date: "2026-09-01", price: 60000 }, p2: { date: "2026-09-20", price: 62000 }, createdAt: 1 });

test("sanitizeChartPrimitives: giữ hình hợp lệ, bỏ sai dạng, giới hạn 100, Elliott đủ 6 điểm", () => {
  const out = sanitizeChartPrimitives([
    line("a"),
    { id: "b", toolType: "laser", p1: {}, p2: {} },
    { id: "c", toolType: "rectangle", p1: { date: "bad", price: 1 }, p2: { date: "2026-01-01", price: 2 } },
    { id: "d", toolType: "elliott", points: [1, 2, 3].map((i) => ({ date: `2026-01-0${i}`, price: i })) },
    { id: "e", toolType: "fibTimeZone", anchor: { date: "2026-02-03T00:00:00Z", price: 5 } },
    { id: "f", toolType: "fibonacci", p1: { date: "2026-01-01", price: 10 }, p2: { date: "2026-01-09", price: 20 }, levels: [{ ratio: 0.5, price: 15 }, { ratio: "x" }] },
  ]);
  assert.deepEqual(out.map((p) => p.id), ["a", "e", "f"]);
  assert.equal(out[1].anchor.date, "2026-02-03");
  assert.deepEqual(out[2].levels, [{ ratio: 0.5, price: 15 }]);
  assert.equal(sanitizeChartPrimitives(Array.from({ length: 150 }, (_, i) => line(`l${i}`))).length, MAX_PRIMITIVES);
  assert.throws(() => sanitizeChartPrimitives("x"), /mảng/);
  assert.throws(() => normalizeChartSymbol("vn index"), /symbol/);
  assert.equal(normalizeChartSymbol("vnindex"), "VNINDEX");
});

test("lưu/đọc theo tài khoản + mã; người dùng khác / mã khác không thấy", async () => {
  const store = createMemoryStore();
  const saved = await saveUserChartState(store, "u1", "FPT", { primitives: [line("a")] }, new Date("2026-10-03T12:00:00Z"));
  assert.equal(saved.updatedAt, "2026-10-03T12:00:00.000Z");
  assert.equal((await getUserChartState(store, "u1", "FPT")).primitives.length, 1);
  assert.equal((await getUserChartState(store, "u1", "VNM")).primitives.length, 0);
  assert.equal((await getUserChartState(store, "u2", "FPT")).primitives.length, 0);
  await saveUserChartState(store, "u1", "FPT", { primitives: [] });
  assert.equal((await getUserChartState(store, "u1", "FPT")).primitives.length, 0, "xoá hết hình vẽ được lưu");
});
