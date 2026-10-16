import { test } from "node:test";
import assert from "node:assert/strict";
import { adjustBY, aggregateZ, bootstrapP, lastIdx, nwMean, prepare, runWs, spearman, zShortAt } from "../src/market/worldSectors/wsValidate.js";

const days = (n, start = Date.UTC(2021, 6, 1)) => Array.from({ length: n }, (_, i) => new Date(start + i * 86_400_000).toISOString().slice(0, 10));
const rnd = (seed) => { let a = seed; return () => { a = (a * 16807) % 2147483647; return a / 2147483647 - 0.5; }; };
const level = (d, rets) => { let p = 100; return d.map((x, i) => [x, (p *= Math.exp(rets[i]))]); };

test("tiện ích: spearman, BY, Newey–West, lastIdx chặt, σ cuộn, z chặn", () => {
  assert.equal(spearman([1, 2, 3], [1, 2, 3]), 1);
  const q = adjustBY([0.001, 0.04, 0.5]);
  assert.ok(q[0] < q[1] && q[1] <= q[2] && q[2] <= 1);
  assert.ok(nwMean([1, 1.2, 0.8, 1.1, 0.9, 1, 1.05], 2).p < 0.01);
  assert.equal(lastIdx(["a", "b", "c"], "c", true), 1);
  assert.equal(lastIdx(["a", "b", "c"], "c", false), 2);
  const d = days(300), r = rnd(3);
  const p = prepare(level(d, d.map(() => r() * 0.02)));
  assert.ok(Number.isNaN(p.sigma[100]) && p.sigma[260] > 0);
  const big = prepare(level(d, d.map((_, i) => (i === 299 ? 1 : r() * 0.001))));
  assert.equal(zShortAt(big, "2099-01-01"), 3);
  assert.equal(aggregateZ([{ region: "US", match: "exact", z: 1 }, { region: "EU", match: "close", z: -1 }]), 0);
});

function synth(signal) {
  const d = days(1100), r = rnd(signal ? 7 : 9);
  const sectors = {}, instruments = {}, vnR = d.map(() => r() * 0.01);
  for (let s = 0; s < 12; s++) {
    const f = d.map(() => r() * 0.02);
    // VN ngành s ngày i theo nước ngoài ngày i-1 (tín hiệu tương đối) khi signal=true
    const own = d.map((_, i) => vnR[i] + (signal && i > 0 ? 0.4 * f[i - 1] : 0) + r() * 0.01);
    const icb = String(1000 + s);
    sectors[icb] = level(d, own);
    instruments[icb] = [{ region: "US", match: "close", p: prepare(level(d, f)) }];
  }
  return { vnIndex: level(d, vnR), sectors, instruments, dailyDrivers: {}, monthlyDrivers: {} };
}

test("runWs: tín hiệu cài sẵn -> H2 đạt nhiều ngành + H3 đạt; nhiễu -> không đạt", () => {
  const cfg = { start: "2022-06-01", sigmaWindow: 250, block: 5, B: 300, seed: 1, alpha: 0.05, nwShort: 5, nwMedium: 2, h3p: 0.025, h4p: 0.05, minCross: 10 };
  const on = runWs(synth(true), cfg);
  assert.ok(on.H2.filter((x) => x.pass).length >= 10, JSON.stringify(on.H2.map((x) => x.q)));
  assert.equal(on.H3.pass, true);
  const off = runWs(synth(false), cfg);
  assert.ok(off.H2.filter((x) => x.pass).length <= 1);
  assert.equal(off.H3.pass, false);
  assert.ok(off.H4.months > 10);
});

test("bootstrapP: tất định theo seed", () => {
  const x = Array.from({ length: 200 }, (_, i) => Math.sin(i)), y = x.map((v, i) => v + Math.cos(i * 3));
  assert.deepEqual(bootstrapP(x, y, { B: 200, block: 5, seed: 4 }), bootstrapP(x, y, { B: 200, block: 5, seed: 4 }));
});
