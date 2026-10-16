import { describe, it, expect } from 'vitest';
import { connectedness, fitVar, generalizedFevd, maCoefficients, rollingConnectedness, selectVarLag, standardizeColumns, tailDependence } from './world-connectedness';
import { mulberry32, randn } from './quant-macro';

type Mat = number[][];
function simVar(T: number, A: Mat, sd: number[], seed: number, rho = 0): Mat {
  const rng = mulberry32(seed);
  const K = A.length;
  const Y: Mat = [new Array<number>(K).fill(0)];
  for (let t = 1; t < T; t++) {
    const common = randn(rng);
    const e = sd.map((s) => s * (Math.sqrt(1 - rho) * randn(rng) + Math.sqrt(rho) * common));
    Y.push(Y[t - 1].map((_, i) => A[i].reduce((s, a, j) => s + a * Y[t - 1][j], 0) + e[i]));
  }
  return Y;
}
const names = ['X', 'Y', 'Z'];

describe('VAR and GFEVD', () => {
  it('recovers VAR(1) coefficients', () => {
    const A = [[0.5, 0, 0], [0.4, 0.3, 0], [0, 0, 0.2]];
    const fit = fitVar(simVar(4000, A, [1, 1, 1], 1), 1);
    A.forEach((row, i) => row.forEach((v, j) => expect(Math.abs(fit.A[0][i][j] - v)).toBeLessThan(0.06)));
  });
  it('MA coefficients follow Φ_h = A Φ_{h-1} for VAR(1)', () => {
    const A = [[0.5, 0.1], [0.2, 0.4]];
    const Phi = maCoefficients([A], 4);
    expect(Phi[0]).toEqual([[1, 0], [0, 1]]);
    expect(Phi[1][0][0]).toBeCloseTo(0.5, 12);
    expect(Phi[2][1][0]).toBeCloseTo(0.2 * 0.5 + 0.4 * 0.2, 12);
  });
  it('H = 1 matches the closed form (σ_ij² / σ_jj / σ_ii, then row-normalised)', () => {
    const fit = { K: 2, p: 1, nobs: 100, A: [[[0, 0], [0, 0]]], intercept: [0, 0], Sigma: [[1, 0.6], [0.6, 2]] };
    const th = generalizedFevd(fit, 1);
    const raw12 = (0.6 * 0.6) / 2 / 1;
    const raw11 = 1 / 1 / 1;
    expect(th[0][1]).toBeCloseTo(raw12 / (raw11 + raw12), 12);
    const raw21 = (0.6 * 0.6) / 1 / 2;
    const raw22 = 2 * 2 / 2 / 2;
    expect(th[1][0]).toBeCloseTo(raw21 / (raw21 + raw22), 12);
  });
  it('rows sum to 1 and no ordering dependence (permuting variables permutes the table)', () => {
    const A = [[0.4, 0.1, 0], [0.3, 0.3, 0.1], [0, 0.2, 0.4]];
    const Y = simVar(2000, A, [1, 1.5, 0.8], 2, 0.3);
    const c1 = connectedness(Y, names, { p: 1, H: 10 });
    c1.table.forEach((r) => expect(Math.abs(r.reduce((a, b) => a + b, 0) - 100)).toBeLessThan(1e-9));
    const perm = [2, 0, 1];
    const c2 = connectedness(Y.map((r) => perm.map((k) => r[k])), perm.map((k) => names[k]), { p: 1, H: 10 });
    perm.forEach((pi, a) => perm.forEach((pj, b) => expect(c2.table[a][b]).toBeCloseTo(c1.table[pi][pj], 8)));
    expect(c2.total).toBeCloseTo(c1.total, 8);
  });
  it('is scale-invariant', () => {
    const A = [[0.4, 0.2, 0], [0.3, 0.3, 0], [0, 0.1, 0.4]];
    const Y = simVar(1500, A, [1, 1, 1], 3);
    const a = connectedness(Y, names, { p: 1 });
    const b = connectedness(Y.map((r) => [r[0] * 100, r[1] * 0.01, r[2] * 7]), names, { p: 1 });
    expect(b.total).toBeCloseTo(a.total, 6);
  });
});

describe('connectedness measures', () => {
  it('independent markets → low total spillover', () => {
    const Y = simVar(3000, [[0.2, 0, 0], [0, 0.2, 0], [0, 0, 0.2]], [1, 1, 1], 4);
    expect(connectedness(Y, names, { p: 1 }).total).toBeLessThan(3);
  });
  it('a one-way transmitter has positive net spillover and the right pairwise sign', () => {
    const A = [[0.3, 0, 0], [0.6, 0.2, 0], [0.4, 0, 0.2]];
    const c = connectedness(simVar(4000, A, [1, 1, 1], 5), names, { p: 1, H: 10 });
    expect(c.net[0]).toBeGreaterThan(15);
    expect(c.net[1]).toBeLessThan(0);
    expect(c.to[0]).toBeGreaterThan(c.from[0]);
    expect(c.pairwiseNet[1][0]).toBeGreaterThan(10); // Y receives from X
    expect(c.pairwiseNet[0][1]).toBeLessThan(-10);
    expect(Math.abs(c.net.reduce((a, b) => a + b, 0))).toBeLessThan(1e-9);
  });
  it('stronger links raise the total index monotonically', () => {
    const tot = [0.1, 0.4, 0.7].map((g) => connectedness(simVar(4000, [[0.2, 0, 0], [g, 0.2, 0], [g, 0, 0.2]], [1, 1, 1], 6), names, { p: 1 }).total);
    expect(tot[0]).toBeLessThan(tot[1]);
    expect(tot[1]).toBeLessThan(tot[2]);
  });
  it('rolling window tracks a regime change in connectedness', () => {
    const calm = simVar(800, [[0.2, 0, 0], [0.05, 0.2, 0], [0.05, 0, 0.2]], [1, 1, 1], 7);
    const stress = simVar(800, [[0.2, 0, 0], [0.7, 0.2, 0], [0.6, 0, 0.2]], [1, 1, 1], 8);
    const roll = rollingConnectedness([...calm, ...stress], names, { window: 300, step: 100, p: 1 });
    expect(roll.length).toBeGreaterThan(8);
    expect(roll[0].total).toBeLessThan(roll[roll.length - 1].total - 8);
  });
  it('BIC picks the true lag for a VAR(2)', () => {
    const rng = mulberry32(9);
    const Y: Mat = [[0, 0], [0, 0]];
    for (let t = 2; t < 3000; t++) Y.push([0.3 * Y[t - 1][0] + 0.35 * Y[t - 2][0] + randn(rng), 0.2 * Y[t - 1][1] + 0.3 * Y[t - 2][0] + randn(rng)]);
    expect(selectVarLag(Y, 4)).toBe(2);
  });
});

describe('tail dependence and helpers', () => {
  it('comonotone ≈ 1, independent ≈ q, joint-crash structure > independent', () => {
    const rng = mulberry32(10);
    const x = Array.from({ length: 6000 }, () => randn(rng));
    expect(tailDependence(x, x.map((v) => 2 * v + 1), 0.05)).toBeCloseTo(1, 6);
    const ind = Array.from({ length: 6000 }, () => randn(rng));
    expect(Math.abs(tailDependence(x, ind, 0.05) - 0.05)).toBeLessThan(0.04);
    const crash = x.map((v, i) => (v < -1.6 ? v + 0.3 * randn(rng) : 0.2 * v + randn(rng) * (i % 2 ? 1 : 1)));
    expect(tailDependence(x, crash, 0.05)).toBeGreaterThan(0.4);
    expect(tailDependence(x, x.map((v) => -v), 0.05, 'upper')).toBeCloseTo(0, 6);
  });
  it('standardizeColumns gives unit variance', () => {
    const Y = simVar(500, [[0.2, 0], [0, 0.2]], [3, 0.1], 11);
    const S = standardizeColumns(Y);
    for (let j = 0; j < 2; j++) {
      const col = S.map((r) => r[j]);
      const m = col.reduce((a, b) => a + b, 0) / col.length;
      expect(Math.abs(Math.sqrt(col.reduce((a, b) => a + (b - m) ** 2, 0) / (col.length - 1)) - 1)).toBeLessThan(1e-9);
    }
  });
});
