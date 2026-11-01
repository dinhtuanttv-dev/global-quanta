import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, estimate, hamiltonFilter, historicalBands, logReturns, longRunVar, nelderMead, seedOf, simulate } from "../src/market/volatility/msGarch.js";
import { MsGarchBusyError, createMsGarchService } from "../src/market/volatility/msGarchService.js";

function series(n, seed = 7) {
  let a = seed, p = 100; const out = [p];
  const r = () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
  for (let i = 0; i < n; i++) {
    const vol = Math.floor(i / 120) % 2 === 0 ? 0.008 : 0.03;
    p *= Math.exp(vol * Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()));
    out.push(p);
  }
  return out;
}
const PARAMS = { mu: 0, regimes: [{ omega: 0.05, alpha: 0.05, beta: 0.9 }, { omega: 1, alpha: 0.1, beta: 0.8 }], p11: 0.97, p22: 0.9 };

test("Nelder-Mead tìm được cực tiểu và báo hội tụ thật", () => {
  const ok = nelderMead(([x, y]) => (x - 3) ** 2 + (y + 1) ** 2, [0, 0]);
  assert.ok(Math.abs(ok.x[0] - 3) < 1e-3 && Math.abs(ok.x[1] + 1) < 1e-3);
  assert.equal(ok.converged, true);
  assert.equal(nelderMead(([x, y]) => (x - 3) ** 2 + (y + 1) ** 2, [0, 0], { maxIterations: 3 }).converged, false);
});

test("bộ lọc: xác suất cộng lại bằng 1, chuỗi biến động mạnh nghiêng về chế độ biến động", () => {
  const quiet = hamiltonFilter(Array.from({ length: 80 }, (_, i) => (i % 2 ? 0.1 : -0.1)), PARAMS);
  const loud = hamiltonFilter(Array.from({ length: 80 }, (_, i) => (i % 2 ? 4 : -4)), PARAMS);
  assert.ok(Math.abs(quiet.prob[0] + quiet.prob[1] - 1) < 1e-9);
  assert.ok(quiet.prob[0] > 0.8);
  assert.ok(loud.prob[1] > quiet.prob[1]);
  assert.ok(Number.isFinite(loud.logLikelihood));
});

test("mô phỏng: cùng seed ra cùng số, đúng thứ tự phân vị, dải rộng dần", () => {
  const inp = { params: PARAMS, prob: [0.5, 0.5], hAgg: 1, eps2: 1, horizon: 20, nSims: 1000 };
  const a = simulate({ ...inp, seed: 11 }), b = simulate({ ...inp, seed: 11 }), c = simulate({ ...inp, seed: 12 });
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  for (const d of a) assert.ok(d.p10 < d.p50 && d.p50 < d.p90);
  assert.ok(a[19].p90 - a[19].p10 > a[0].p90 - a[0].p10);
});

test("mô phỏng hội tụ đúng phương sai đã biết (không drift, không GARCH)", () => {
  // omega = 1 nghĩa là độ lệch chuẩn 1%/ngày ở cả hai chế độ: P90 sau 25 ngày ≈ exp(1,2816 · 5%).
  const flat = { mu: 0, regimes: [{ omega: 1, alpha: 0, beta: 0 }, { omega: 1, alpha: 0, beta: 0 }], p11: 0.9, p22: 0.9 };
  const last = simulate({ params: flat, prob: [1, 0], hAgg: 1, eps2: 1, horizon: 25, nSims: 20000, seed: 3 }).at(-1);
  assert.ok(Math.abs(last.p90 - Math.exp(1.2816 * 0.05)) < 0.003, String(last.p90));
  assert.ok(Math.abs(last.p10 - Math.exp(-1.2816 * 0.05)) < 0.003, String(last.p10));
  assert.ok(Math.abs(last.p50 - 1) < 0.002);
});

test("không drift: P50 quanh giá hiện tại dù mu dương", () => {
  const last = simulate({ params: { ...PARAMS, mu: 0.5 }, prob: [1, 0], hAgg: 0.5, eps2: 0.5, horizon: 20, nSims: 5000, seed: 2 }).at(-1);
  assert.ok(Math.abs(last.p50 - 1) < 0.01, String(last.p50));
});

test("mô hình so sánh đúng công thức; chế độ gọi tên theo phương sai dài hạn", () => {
  const ret = Array.from({ length: 250 }, (_, i) => (i % 2 ? 1 : -1));
  const b = historicalBands(ret, 4);
  assert.ok(Math.abs(b[3].p90 - Math.exp(1.2815515655 * 0.01002 * 2)) < 1e-3);
  assert.equal(b[0].p50, 1);
  assert.ok(longRunVar({ omega: 0.1, alpha: 0.1, beta: 0.85 }) > longRunVar({ omega: 0.2, alpha: 0.1, beta: 0.1 }));
});

test("phân tích chuỗi giả lập: tách hai chế độ, phân vị dải hợp lệ; thiếu dữ liệu trả null", () => {
  const closes = series(500);
  const est = estimate(logReturns(closes));
  const [v1, v2] = est.params.regimes.map(longRunVar);
  assert.ok(Math.max(v1, v2) / Math.min(v1, v2) > 2);
  const a = analyze(closes, { nSims: 500, seed: 5 });
  assert.equal(a.bands.length, 20);
  assert.ok(Math.abs(a.regime.probCalm + a.regime.probVolatile - 1) < 1e-9);
  assert.ok(a.volAnnualPct > 0);
  assert.equal(analyze([100, 101, 102]), null);
  assert.equal(analyze(new Array(100).fill(100)), null);
});

test("dịch vụ: tính một lần mỗi phiên, gộp yêu cầu trùng, thiếu phiên thì báo rõ, chặn khi quá tải", async () => {
  const closes = series(400);
  let calls = 0, t = 1e12;
  const bars = closes.map((close, i) => ({ close, date: `2026-${String(i).padStart(4, "0")}` }));
  const svc = createMsGarchService({ getBars: async (s) => { calls++; return s === "NEW" ? bars.slice(0, 50) : bars; }, now: () => t });
  const [a, b] = await Promise.all([svc.get("AAA"), svc.get("AAA")]);
  assert.equal(a.available, true);
  assert.strictEqual(a, b);
  assert.equal(a.grade, "C");
  assert.equal(a.lastClose, closes.at(-1));
  assert.strictEqual(await svc.get("AAA"), a);
  assert.match((await svc.get("NEW")).reason, /260 phiên/);
  assert.ok(calls >= 2);
  const small = createMsGarchService({ getBars: async () => bars, now: () => t });
  for (let i = 0; i < 30; i++) await small.get(`S${i}`).catch(() => {});
  await assert.rejects(small.get("OVER"), MsGarchBusyError);
  t += 61_000;
  assert.equal((await small.get("OVER")).available, true);
  assert.equal(seedOf("a|b"), seedOf("a|b"));
});
