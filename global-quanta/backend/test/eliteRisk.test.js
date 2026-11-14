process.env.MARKET_ALERTS_ENABLED = "false";

import test from "node:test";
import assert from "node:assert/strict";
import { jacobiEigen, ledoitWolf, portfolioRisk, sampleCov, varSuite } from "../src/market/elite/riskCore.js";
import { alignReturns, createRiskService } from "../src/market/elite/riskService.js";
import { createMemoryStore } from "../src/market/store/memoryStore.js";

/** Bộ sinh số ngẫu nhiên có seed + Box–Muller. */
function rng(seed = 42) {
  let s = seed;
  const u = () => { s = (s * 1103515245 + 12345) % 2147483648; return (s + 0.5) / 2147483648; };
  return () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
}

/** T phiên, N mã: một nhân tố thị trường chung (beta 1) + nhiễu riêng. */
function market(T, N, seed = 7) {
  const g = rng(seed);
  const bench = [], R = [];
  for (let t = 0; t < T; t++) {
    const m = 0.012 * g();
    bench.push(m);
    R.push(Array.from({ length: N }, (_, i) => m * (0.8 + 0.05 * i) + 0.015 * g()));
  }
  return { bench, R };
}

test("E6 Jacobi: trị riêng/vectơ riêng của ma trận đối xứng", () => {
  const { values, vectors } = jacobiEigen([[2, 1], [1, 2]]);
  assert.deepEqual(values.map((v) => Math.round(v * 1e9) / 1e9).sort(), [1, 3]);
  const k = values[0] > values[1] ? 0 : 1;
  assert.ok(Math.abs(Math.abs(vectors[k][0]) - Math.SQRT1_2) < 1e-9);
  const A = [[4, 1, 0.5], [1, 3, 0.2], [0.5, 0.2, 2]];
  const e = jacobiEigen(A);
  for (let k2 = 0; k2 < 3; k2++) {
    const Av = A.map((row) => row.reduce((s, x, j) => s + x * e.vectors[k2][j], 0));
    Av.forEach((x, i) => assert.ok(Math.abs(x - e.values[k2] * e.vectors[k2][i]) < 1e-9));
  }
});

test("E6 Ledoit–Wolf: δ ∈ [0,1], co rút nhiều hơn khi mẫu ngắn, ma trận đối xứng", () => {
  const short = market(40, 8).R, long = market(2000, 8).R;
  const a = ledoitWolf(short), b = ledoitWolf(long);
  assert.ok(a.delta >= 0 && a.delta <= 1 && b.delta >= 0 && b.delta <= 1);
  assert.ok(a.delta > b.delta, `δ mẫu ngắn ${a.delta} phải lớn hơn mẫu dài ${b.delta}`);
  assert.ok(a.rBar > 0.2 && a.rBar < 0.9);
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) assert.ok(Math.abs(a.sigma[i][j] - a.sigma[j][i]) < 1e-15);
  const { S } = sampleCov(long);
  assert.ok(Math.abs(b.sigma[0][0] - S[0][0]) < 1e-15, "đường chéo giữ nguyên phương sai mẫu");
});

test("E6 rủi ro danh mục: tổng đóng góp rủi ro 100%, DR ≥ 1, 1 ≤ ENB ≤ N, beta ≈ hệ số nhân tố, VaR hợp lý", () => {
  const T = 250, N = 10;
  const { bench, R } = market(T, N);
  const dates = Array.from({ length: T }, (_, t) => `2026-${String(1 + Math.floor(t / 25)).padStart(2, "0")}-${String(1 + (t % 25)).padStart(2, "0")}`);
  const w = Array(N).fill(1 / N);
  const r = portfolioRisk({ tickers: Array.from({ length: N }, (_, i) => `T${i}`), weights: w, returns: R, dates, bench, sectors: ["A", "A", "B", "B", "B", "C", "C", "C", "C", "C"] });
  assert.ok(Math.abs(r.holdings.reduce((s, h) => s + h.riskContribution, 0) - 1) < 1e-9);
  assert.ok(r.diversification.ratio >= 1);
  assert.ok(r.diversification.enb >= 1 && r.diversification.enb <= N);
  assert.ok(Math.abs(r.diversification.effectiveN - 10) < 1e-9);
  assert.ok(Math.abs(r.beta - 1.025) < 0.1, `beta ${r.beta}`);
  assert.ok(r.corrWithVnIndex > 0.8);
  const v = r.var[0.95];
  assert.ok(v.historical.var > 0 && v.historical.cvar >= v.historical.var);
  assert.ok(r.var[0.99].historical.var >= v.historical.var);
  assert.ok(r.maxDrawdown.value < 0);
  assert.equal(r.stress.worstVnIndexDays.length, 5);
  assert.ok(r.stress.worstVnIndexDays[0].vnIndex <= r.stress.worstVnIndexDays[4].vnIndex);
  assert.deepEqual(r.sectors.map((s) => s.key), ["C", "B", "A"]);
  assert.ok(Math.abs(r.correlation.matrix[3][3] - 1) < 1e-12);
});

test("E6 VaR Gauss ≈ 1,645σ trên mẫu chuẩn lớn; Cornish–Fisher ≈ Gauss khi phân phối chuẩn", () => {
  const g = rng(3);
  const x = Array.from({ length: 20000 }, () => 0.01 * g());
  const v = varSuite(x, 0.95);
  assert.ok(Math.abs(v.gaussian.var - 0.01645) < 0.0005, `${v.gaussian.var}`);
  assert.ok(Math.abs(v.historical.var - 0.01645) < 0.0008);
  assert.ok(Math.abs(v.cornishFisher.var - v.gaussian.var) < 0.0005);
});

test("E6 căn chuỗi: chỉ giữ phiên mọi mã đều có giá; dịch vụ báo thiếu dữ liệu rõ ràng", async () => {
  const series = new Map([["A", [{ date: "d1", closeAdj: 10 }, { date: "d2", closeAdj: 11 }, { date: "d3", closeAdj: 12 }]], ["B", [{ date: "d1", closeAdj: 5 }, { date: "d3", closeAdj: 6 }]]]);
  const a = alignReturns(series, ["A", "B"], new Map([["d1", 100], ["d3", 110]]));
  assert.deepEqual(a.dates, ["d3"]);
  assert.ok(Math.abs(a.returns[0][0] - 0.2) < 1e-12 && Math.abs(a.bench[0] - 0.1) < 1e-12);
  const svc = createRiskService({
    store: createMemoryStore(), vnIndex: async () => [],
    decision: async () => ({ date: "2026-10-16", version: "E3-v2", portfolio: [{ ticker: "X", weight: 1, sectorKey: "8300" }] }),
  });
  const r = await svc.risk();
  assert.equal(r.available, false);
  assert.match(r.reasonVi, /cần ≥ 60/);
});

// F02 (13/11/2026): danh mục Elite HL có thể giữ tiền mặt hoặc 100% tiền mặt.
test("E6 + E4-HL: danh mục 100% tiền mặt -> không phải lỗi; có tiền mặt -> số mã hiệu dụng tính trong phần cổ phiếu", async () => {
  const svc = createRiskService({ store: createMemoryStore(), vnIndex: async () => [], decision: async () => ({ date: "2026-11-13", version: "E4-HL v1", hl: { cash: 1 }, portfolio: [] }) });
  const r = await svc.risk();
  assert.equal(r.available, false);
  assert.equal(r.empty, true);
  assert.equal(r.kind, "ELITE_HL");
  assert.equal(r.cash, 1);
  assert.match(r.reasonVi, /100% tiền mặt/);
  assert.equal(await createRiskService({ store: createMemoryStore(), vnIndex: async () => [], decision: async () => null }).risk(), null);

  // 3 mã × 10% (70% tiền mặt): N hiệu dụng phải là 3, HHI 1/3 — trước đây ra 33,3 và 0,03.
  let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 - 0.5; };
  const returns = Array.from({ length: 120 }, () => [rnd() * 0.04, rnd() * 0.04, rnd() * 0.04]);
  const dates = returns.map((_, i) => `d${String(i).padStart(3, "0")}`), bench = returns.map(() => rnd() * 0.02);
  const cash = portfolioRisk({ tickers: ["A", "B", "C"], weights: [0.1, 0.1, 0.1], returns, dates, bench });
  const full = portfolioRisk({ tickers: ["A", "B", "C"], weights: [1 / 3, 1 / 3, 1 / 3], returns, dates, bench });
  assert.ok(Math.abs(cash.diversification.effectiveN - 3) < 1e-9);
  assert.ok(Math.abs(cash.diversification.hhi - 1 / 3) < 1e-9);
  assert.ok(Math.abs(full.diversification.effectiveN - 3) < 1e-9);
  // Biến động của cả danh mục co theo tỷ lệ cổ phiếu (tiền mặt không biến động); đóng góp rủi ro vẫn cộng lại 100%.
  assert.ok(Math.abs(cash.volatility.daily - full.volatility.daily * 0.3) < 1e-12);
  assert.ok(Math.abs(cash.holdings.reduce((a, h) => a + h.riskContribution, 0) - 1) < 1e-9);
  assert.ok(Math.abs(cash.diversification.ratio - full.diversification.ratio) < 1e-9);
});
