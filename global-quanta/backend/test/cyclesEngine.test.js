// Cycle Fingerprint v2 (CF2/CF3) — lõi số học, thư viện theo thời điểm, ràng buộc láng giềng, kiểm định đặt trước.
import test from "node:test";
import assert from "node:assert/strict";
import { dtwBand, paa, spearman, zLogWindow } from "../src/market/cycles/core.js";
import { buildCalendar, buildLibrary, eligiblePrefix, prepareSeries, windowFeatures } from "../src/market/cycles/library.js";
import { absoluteSimilarity, candidatePool, effectiveN, ENGINE_DEFAULTS, forecastFromPool, placeboForecast } from "../src/market/cycles/engine.js";
import { blockBootstrap, hashConfig, holm } from "../src/market/cycles/validate.js";

const DATES = (() => { const out = []; const d = new Date(Date.UTC(2021, 0, 4)); while (out.length < 900) { const w = d.getUTCDay(); if (w >= 1 && w <= 5) out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); } return out; })();
function walk(seed, drift = 0) { let a = seed >>> 0; const r = () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 2 ** 32 - 0.5; }; let p = 100; return DATES.map((date) => { p *= Math.exp(drift + 0.02 * r()); return { date, close: p, volume: 1e6, value: 2e10 }; }); }

function fixture(nTickers = 12) {
  const seriesOf = new Map(), sectorOf = new Map();
  for (let k = 0; k < nTickers; k++) { const t = `T${String(k).padStart(2, "0")}`; seriesOf.set(t, walk(k + 1)); sectorOf.set(t, k % 2 ? "S1" : "S2"); }
  const cal = buildCalendar(walk(999));
  const prep = prepareSeries({ seriesOf, sectorOf, cal });
  const lib = buildLibrary(prep, cal, { W: 30, M: 10, stride: 3, minValue: 1e9 });
  return { cal, prep, lib };
}

test("z-log: bất biến theo mức giá và biên độ; chuỗi phẳng -> 0", () => {
  const a = Array.from({ length: 30 }, (_, i) => 100 * Math.exp(0.01 * Math.sin(i / 3)));
  const b = a.map((x) => x * 7.3);
  const za = zLogWindow(a, 0, 29), zb = zLogWindow(b, 0, 29);
  for (let i = 0; i < 30; i++) assert.ok(Math.abs(za[i] - zb[i]) < 1e-9);
  assert.ok(zLogWindow(new Array(30).fill(50), 0, 29).every((v) => v === 0));
  assert.equal(paa(za, 10).length, 10);
});

test("DTW dải Sakoe-Chiba: d(a,a)=0, đối xứng, lệch pha nhỏ rẻ hơn Euclid; r=0 bằng Euclid RMS; cutoff cắt sớm", () => {
  const a = Float64Array.from({ length: 30 }, (_, i) => Math.sin(i / 4)), b = Float64Array.from({ length: 30 }, (_, i) => Math.sin((i - 2) / 4));
  assert.equal(dtwBand(a, a, 3), 0);
  assert.ok(Math.abs(dtwBand(a, b, 3) - dtwBand(b, a, 3)) < 1e-12);
  const eu = Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0) / 30);
  assert.ok(Math.abs(dtwBand(a, b, 0) - eu) < 1e-12);
  assert.ok(dtwBand(a, b, 3) < eu);
  assert.equal(dtwBand(a, b.map((v) => v + 5), 3, 0.5), Infinity);
});

test("thư viện theo thời điểm: sắp theo fwdEndCal; tiền tố tại ngày c chỉ gồm cửa sổ đã có đủ 60 phiên sau TRƯỚC c", () => {
  const { lib } = fixture();
  assert.ok(lib.N > 500);
  for (let i = 1; i < lib.N; i++) assert.ok(lib.fwdEndCal[i] >= lib.fwdEndCal[i - 1]);
  for (const c of [400, 600, 850]) {
    const L = eligiblePrefix(lib, c);
    for (let i = 0; i < L; i++) assert.ok(lib.fwdEndCal[i] < c);
    if (L < lib.N) assert.ok(lib.fwdEndCal[L] >= c);
    for (let i = 0; i < L; i++) assert.ok(lib.endCal[i] + 61 <= c);
  }
});

test("láng giềng: cùng mã cách ≥ 60 phiên, ≤ 3 / tháng, đúng K, n_eff ≤ K; placebo cùng ràng buộc", () => {
  const { lib, prep, cal } = fixture();
  const s = prep.prepared[0], e = 850;
  const f = windowFeatures(s, e, { W: 30, M: 10, cal, sectorMedian: prep.sectorMedian });
  const L = eligiblePrefix(lib, s.cal[e]);
  const pool = candidatePool(lib, { ...f, sid: 0 }, L, { ctxSd: [1, 1, 1, 1, 1] });
  const fc = forecastFromPool(lib, L, pool, { lambda: 0.25, hMult: 1, h0: 0.8 });
  assert.equal(fc.neighbors.length, ENGINE_DEFAULTS.K);
  const check = (idx) => {
    const byT = new Map(), byM = new Map();
    for (const i of idx) {
      const t = lib.tid[i]; for (const c of byT.get(t) ?? []) assert.ok(Math.abs(c - lib.endCal[i]) >= 60);
      byT.set(t, [...(byT.get(t) ?? []), lib.endCal[i]]); byM.set(lib.month[i], (byM.get(lib.month[i]) ?? 0) + 1);
      assert.ok(lib.fwdEndCal[i] < s.cal[e]);
    }
    for (const v of byM.values()) assert.ok(v <= 3);
  };
  check(fc.neighbors);
  assert.ok(fc.nEff > 0 && fc.nEff <= ENGINE_DEFAULTS.K + 1e-9);
  assert.ok(fc.shrink > 0 && fc.shrink < 1);
  // dự báo co về μ0: |pred − μ0| ≤ |raw − μ0|
  for (let h = 0; h < 4; h++) assert.ok(Math.abs(fc.pred[h] - fc.mu0[h]) <= Math.abs(fc.raw[h] - fc.mu0[h]) + 1e-12);
  const pl = placeboForecast(lib, L, fc.ws, 42);
  assert.equal(pl.pred.length, 4);
});

test("n_eff: trọng số đều độc lập = K; dồn vào 1 tháng -> 1", () => {
  assert.ok(Math.abs(effectiveN([1, 1, 1, 1], [1, 2, 3, 4]) - 4) < 1e-9);
  assert.ok(Math.abs(effectiveN([1, 1, 1, 1], [5, 5, 5, 5]) - 1) < 1e-9);
});

test("độ tương đồng tuyệt đối: đơn điệu giảm theo khoảng cách, không còn 'luôn 100%'", () => {
  const nullSorted = Array.from({ length: 201 }, (_, k) => k / 100);
  assert.ok(absoluteSimilarity(0.1, nullSorted) > absoluteSimilarity(1, nullSorted));
  assert.ok(absoluteSimilarity(1, nullSorted) < 0.6 && absoluteSimilarity(1, nullSorted) > 0.4);
  assert.equal(absoluteSimilarity(-1, nullSorted), 1);
});

test("kiểm định: hash phát hiện cấu hình bị sửa; bootstrap khối; Holm dừng ở giả thuyết đầu tiên không bác bỏ", () => {
  const cfg = { a: 1, lambda: 0.25 }; cfg.sha256 = hashConfig(cfg);
  assert.equal(hashConfig(cfg), cfg.sha256);
  assert.notEqual(hashConfig({ ...cfg, lambda: 1 }), cfg.sha256);
  const pos = blockBootstrap(Array.from({ length: 60 }, (_, i) => 0.05 + 0.01 * Math.sin(i)));
  assert.ok(pos.lo > 0 && pos.pOneSided === 0);
  const h = holm([{ name: "a", p: 0.001 }, { name: "b", p: 0.04 }, { name: "c", p: 0.01 }]);
  assert.deepEqual(h.map((x) => [x.name, x.reject]), [["a", true], ["c", true], ["b", true]]);
  // c (0,001 ≤ 0,05/3) bác bỏ; a (0,03 > 0,05/2) không -> dừng, b cũng không
  assert.deepEqual(holm([{ name: "a", p: 0.03 }, { name: "b", p: 0.04 }, { name: "c", p: 0.001 }]).map((x) => [x.name, x.reject]), [["c", true], ["a", false], ["b", false]]);
  assert.ok(spearman([1, 2, 3, 4], [10, 20, 30, 40]) > 0.999);
});
