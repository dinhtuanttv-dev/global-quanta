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
  assert.equal(absoluteSimilarity(5, nullSorted), 0);
  assert.ok(Math.abs(absoluteSimilarity(0.005, nullSorted) - 0.9975) < 1e-9); // nội suy giữa phân vị 0 và 0,5%
});

test("kiểm định: hash phát hiện cấu hình bị sửa; bootstrap khối; Holm dừng ở giả thuyết đầu tiên không bác bỏ", () => {
  const cfg = { a: 1, lambda: 0.25 }; cfg.sha256 = hashConfig(cfg);
  assert.equal(hashConfig(cfg), cfg.sha256);
  assert.notEqual(hashConfig({ ...cfg, lambda: 1 }), cfg.sha256);
  const pos = blockBootstrap(Array.from({ length: 60 }, (_, i) => 0.05 + 0.01 * Math.sin(i)));
  assert.ok(pos.lo > 0 && pos.pOneSided === 0);
  const tiny = blockBootstrap([0.1, 0.2, 0.3, 0.4]);
  assert.equal(tiny.insufficient, true); assert.equal(tiny.pOneSided, null);
  const h = holm([{ name: "a", p: 0.001 }, { name: "b", p: 0.04 }, { name: "c", p: 0.01 }]);
  assert.deepEqual(h.map((x) => [x.name, x.reject]), [["a", true], ["c", true], ["b", true]]);
  // c (0,001 ≤ 0,05/3) bác bỏ; a (0,03 > 0,05/2) không -> dừng, b cũng không
  assert.deepEqual(holm([{ name: "a", p: 0.03 }, { name: "b", p: 0.04 }, { name: "c", p: 0.001 }]).map((x) => [x.name, x.reject]), [["c", true], ["a", false], ["b", false]]);
  assert.ok(spearman([1, 2, 3, 4], [10, 20, 30, 40]) > 0.999);
});

test("phục vụ trực tuyến: queryCycles trả 30 giai đoạn có ngày + đường mẫu/diễn biến sau, dự báo theo 4 kỳ hạn, nhãn CF3; mã lạ -> null", async () => {
  const { buildCycleContext, queryCycles, CYCLE_CONFIG } = await import("../src/market/cycles/cycleService.js");
  const seriesOf = new Map(), sectorOf = new Map();
  for (let k = 0; k < 14; k++) { const t = `Q${String(k).padStart(2, "0")}`; seriesOf.set(t, walk(k + 11)); sectorOf.set(t, k % 3 ? "S1" : "S2"); }
  const ctx = buildCycleContext({ seriesOf, benchBars: walk(999), sectorOf });
  const r = queryCycles(ctx, "Q00");
  assert.equal(r.window, CYCLE_CONFIG.W);
  assert.equal(r.neighbors.length, 30);
  for (const n of r.neighbors) {
    assert.ok(n.start < n.end && n.end < r.asOf);
    assert.equal(n.pattern.length, 30); assert.equal(n.pattern[0], 100);
    assert.ok(n.forward.length === 61 && n.forward[0] === 100);
    assert.ok(n.similarity >= 0 && n.similarity <= 1);
  }
  assert.deepEqual(r.forecast.horizons.map((h) => h.h), [10, 20, 40, 60]);
  assert.equal(r.forecast.interval80.calibrated, false); // CF3: độ phủ ngoài mẫu 73% < 75%
  assert.equal(queryCycles(ctx, "ZZZ"), null);
  const { CYCLE_VALIDATION } = await import("../src/market/cycles/validation.js");
  assert.equal(CYCLE_VALIDATION.verdict, "FAIL"); assert.equal(CYCLE_VALIDATION.label, "EXPERIMENTAL");
});

test("sổ theo dõi: ghi một lần / ngày; chưa đủ 21 phiên -> chờ; đủ -> chấm IC, đúng hướng, Brier, độ phủ; lịch sử từng mã", async () => {
  const { buildCycleContext, queryCycles } = await import("../src/market/cycles/cycleService.js");
  const { recordSnapshot, scoreLedger, snapshotRow, LEDGER_INDEX_KV, ledgerKv } = await import("../src/market/cycles/ledger.js");
  const seriesOf = new Map(), sectorOf = new Map();
  for (let k = 0; k < 24; k++) { const t = `L${String(k).padStart(2, "0")}`; seriesOf.set(t, walk(k + 31)); sectorOf.set(t, k % 2 ? "S1" : "S2"); }
  const full = buildCycleContext({ seriesOf, benchBars: walk(999), sectorOf });
  // bản chụp cũ: dựng ngữ cảnh với dữ liệu cắt tới 40 phiên trước -> có 21 phiên sau để chấm
  const cut = (bars) => bars.slice(0, -40);
  const past = buildCycleContext({ seriesOf: new Map([...seriesOf].map(([t, b]) => [t, cut(b)])), benchBars: cut(walk(999)), sectorOf });
  const kv = new Map();
  const store = { getKv: async (k) => (kv.has(k) ? { value: kv.get(k) } : null), setKv: async (k, v) => { kv.set(k, v); } };
  const rows = past.lib.tickers.map((t) => snapshotRow(t, queryCycles(past, t)));
  assert.equal((await recordSnapshot(store, { date: past.dataAsOf, engine: "x", sha256: "y", rows })).written, true);
  assert.equal((await recordSnapshot(store, { date: past.dataAsOf, engine: "x", sha256: "y", rows })).written, false);
  const todayRows = full.lib.tickers.map((t) => snapshotRow(t, queryCycles(full, t)));
  await recordSnapshot(store, { date: full.dataAsOf, engine: "x", sha256: "y", rows: todayRows });
  assert.deepEqual(kv.get(LEDGER_INDEX_KV).dates, [past.dataAsOf, full.dataAsOf]);
  const docs = kv.get(LEDGER_INDEX_KV).dates.map((d) => kv.get(ledgerKv(d)));
  const sc = scoreLedger(full, docs, { symbol: "L03" });
  assert.equal(sc.maturedDates, 1);
  assert.equal(sc.scoredRows, rows.length);
  assert.equal(sc.pendingRows, todayRows.length); // bản chụp hôm nay chưa đủ 21 phiên
  assert.ok(sc.hitRate >= 0 && sc.hitRate <= 1 && sc.brier >= 0 && sc.coverage80 >= 0 && sc.coverage80 <= 1);
  assert.ok(sc.meanIc >= -1 && sc.meanIc <= 1);
  assert.equal(sc.mine.length, 2); assert.ok(sc.mine[0].realizedPct != null); assert.equal(sc.mine[1].realizedPct, null);
});
