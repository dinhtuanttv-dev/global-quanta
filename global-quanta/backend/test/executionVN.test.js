import test from "node:test";
import assert from "node:assert/strict";
import { realisticEntry, summarizeRealistic, tickSize, VN_EXEC } from "../src/market/elite/executionVN.js";

const cal = Array.from({ length: 40 }, (_, k) => `2026-01-${String(k + 1).padStart(2, "0")}`);
/** Chuỗi giá phẳng (σ nhỏ) với GTGD cố định; bước nhảy tại các phiên chỉ định. */
function series(price, value, jumps = {}) {
  let p = price;
  return cal.map((date, k) => { p = jumps[k] != null ? p * (1 + jumps[k]) : p * (1 + (k % 2 ? 0.004 : -0.004)); return { date, closeAdj: p, value }; });
}

test("R3: bước giá theo sàn và vùng giá", () => {
  assert.equal(tickSize(9_500, "HOSE"), 10);
  assert.equal(tickSize(25_000, "HOSE"), 50);
  assert.equal(tickSize(80_000, "HOSE"), 100);
  assert.equal(tickSize(25_000, "HNX"), 100);
  assert.equal(tickSize(25_000, "UPCOM"), 100);
});

test("R3: giá đứng yên -> lợi suất thực tế = −(phí + thuế + chênh lệch + tác động); vốn lớn chịu tác động lớn hơn", () => {
  const s = new Map([["AAA", series(20_000, 50e9)]]);
  const entry = { date: cal[24], holdings: [{ ticker: "AAA", weight: 1 }] };
  const small = realisticEntry(entry, 5, 1e9, { series: s, cal, universeNet: 0 });
  const big = realisticEntry(entry, 5, 10e9, { series: s, cal, universeNet: 0 });
  const floorCost = VN_EXEC.buyFee + VN_EXEC.sellFee + VN_EXEC.sellTax; // 0,4%
  assert.ok(small.net < -floorCost * 0.9, `net ${small.net}`);
  assert.ok(big.impactBpsAvg > small.impactBpsAvg * 2.5, "√10 ≈ 3,16 lần");
  assert.ok(big.net < small.net);
  assert.equal(small.fillRate, 1);
  assert.equal(small.excess, small.net);
});

test("R3: trần ở phiên vào lệnh -> không khớp mua (tiền mặt); sàn ở phiên ra -> dời bán", () => {
  const ceilingIn = new Map([["CEIL", series(20_000, 50e9, { 25: 0.069 })]]);
  const e = { date: cal[24], holdings: [{ ticker: "CEIL", weight: 1 }] };
  const r = realisticEntry(e, 5, 1e9, { series: ceilingIn, cal, universeNet: 0 });
  assert.deepEqual(r.unfilled, ["CEIL"]);
  assert.equal(r.investedPct, 0);
  assert.equal(r.net, 0);
  const hnxNotCeiling = realisticEntry({ date: cal[24], holdings: [{ ticker: "CEIL", weight: 1 }] }, 5, 1e9, { series: ceilingIn, cal, exchangeOf: () => "HNX", universeNet: 0 });
  assert.deepEqual(hnxNotCeiling.unfilled, [], "+6,9% chưa phải trần HNX (±10%)");
  const floorOut = new Map([["FLR", series(20_000, 50e9, { 30: -0.069, 31: -0.069 })]]);
  const f = realisticEntry({ date: cal[24], holdings: [{ ticker: "FLR", weight: 1 }] }, 5, 1e9, { series: floorOut, cal, universeNet: 0 });
  assert.equal(f.delayedExits, 1);
});

test("R3: lô 100 — vốn nhỏ không mua nổi một lô thì để tiền mặt; tổng hợp theo kỳ hạn và quy mô vốn", () => {
  const s = new Map([["BIG", series(2_000_000, 50e9)]]);
  const e = { date: cal[24], holdings: [{ ticker: "BIG", weight: 0.1 }] };
  const r = realisticEntry(e, 5, 1e9, { series: s, cal, universeNet: 0 }); // 100 tr / (2 tr × 100) < 1 lô
  assert.equal(r.investedPct, 0);
  assert.ok(Math.abs(r.lotCashPct - 0.1) < 1e-12);
  const sum = summarizeRealistic([{ results: { 5: { excess: 0.01, realistic: { 1000000000: { excess: 0.004, impactBpsAvg: 3, fillRate: 1, delayedExits: 0, investedPct: 1 } } } } }], [5]);
  assert.equal(sum.horizons[5]["1000000000"].n, 1);
  assert.equal(sum.horizons[5]["1000000000"].meanOfficialExcess, 0.01);
  assert.equal(sum.horizons[5]["1000000000"].meanExcess, 0.004);
});
