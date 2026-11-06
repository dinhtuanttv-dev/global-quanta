import test from "node:test";
import assert from "node:assert/strict";
import { computeTickerData, priceTrendOf } from "../src/market/scanner/scanEngine.js";

test("BL0 xu hướng giá MA50 / MA200 trên giá điều chỉnh", () => {
  assert.equal(priceTrendOf(110, 100, 90), "UP");
  assert.equal(priceTrendOf(80, 90, 100), "DOWN");
  assert.equal(priceTrendOf(95, 90, 100), "RECOVERING");
  assert.equal(priceTrendOf(85, 90, 80), "WEAKENING");
  assert.equal(priceTrendOf(100, 90, null), null);
  // 220 phiên tăng đều: giá điều chỉnh phiên cuối > MA50 > MA200
  const bars = Array.from({ length: 220 }, (_, i) => ({ date: `d${i}`, close: 100 + i, closeAdj: 100 + i, volume: 1000, value: 1e9 }));
  const t = computeTickerData("AAA", bars, null).data;
  assert.equal(t.priceTrend, "UP");
  assert.equal(computeTickerData("BBB", bars.slice(0, 120), null).data.priceTrend, null); // chưa đủ 200 phiên
});
