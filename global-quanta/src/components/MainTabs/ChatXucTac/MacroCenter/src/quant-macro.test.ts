import { describe, it, expect } from 'vitest';
import {
  adfCriticalValues, adfTest, adjustPValues, analyzeMacro, applyTransform, betaInc, bestLagCells, buildDesign,
  chowTest, crossCorrelation, determineIntegrationOrder, diagnoseIntegration, engleGranger, erfc, estimateImpactMatrix,
  fSurvival, grangerCausality, kpssTest, lgamma, linearCombination, macroScoreSeries, mackinnonP, mulberry32,
  normCdf, olsFit, randn, recommendTransform, rollingBeta, shiftForPublicationLag, stationaryBootstrapCI,
  studentTCdf, studentTTwoSidedP, summarizeStability, zivotAndrewsTest,
} from './quant-macro';

// ───────── data generators (seeded) ─────────
const cumsum = (e: number[]) => e.reduce<number[]>((a, v) => (a.push((a.length ? a[a.length - 1] : 0) + v), a), []);
const noise = (n: number, rng: () => number, sd = 1) => Array.from({ length: n }, () => sd * randn(rng));
const randomWalk = (n: number, rng: () => number) => cumsum(noise(n, rng));
const ar1 = (n: number, phi: number, rng: () => number) => {
  const y = [0];
  for (let i = 1; i < n; i++) y.push(phi * y[i - 1] + randn(rng));
  return y;
};
const rate = (hits: number, n: number) => hits / n;

describe('special functions', () => {
  it('normal CDF / erfc match reference values', () => {
    expect(normCdf(1.96)).toBeCloseTo(0.9750021048517795, 10);
    expect(normCdf(0)).toBeCloseTo(0.5, 12);
    expect(normCdf(-3)).toBeCloseTo(0.0013498980316301, 10);
    expect(erfc(4)).toBeCloseTo(1.5417257900280019e-8, 15);
  });
  it('lgamma and incomplete beta', () => {
    expect(lgamma(5)).toBeCloseTo(Math.log(24), 10);
    expect(lgamma(0.5)).toBeCloseTo(0.5 * Math.log(Math.PI), 10);
    expect(betaInc(2, 3, 0.5)).toBeCloseTo(0.6875, 10);
  });
  it('Student t and F distributions', () => {
    expect(studentTCdf(2.2281388519649385, 10)).toBeCloseTo(0.975, 8);
    expect(studentTTwoSidedP(2.2281388519649385, 10)).toBeCloseTo(0.05, 8);
    expect(1 - fSurvival(4.102821015130394, 2, 10)).toBeCloseTo(0.95, 8);
  });
});

describe('OLS (QR) + HAC', () => {
  it('recovers exact coefficients on noiseless data', () => {
    const rng = mulberry32(1);
    const X = Array.from({ length: 50 }, () => [1, randn(rng), randn(rng)]);
    const y = X.map((r) => 1 + 2 * r[1] - 3 * r[2]);
    const r = olsFit(X, y);
    expect(r.beta[0]).toBeCloseTo(1, 9);
    expect(r.beta[1]).toBeCloseTo(2, 9);
    expect(r.beta[2]).toBeCloseTo(-3, 9);
    expect(r.r2).toBeCloseTo(1, 9);
  });
  it('classical SE matches the closed-form simple-regression formula', () => {
    const rng = mulberry32(2);
    const x = noise(120, rng);
    const y = x.map((v) => 0.5 + 1.5 * v + randn(rng));
    const r = olsFit(x.map((v) => [1, v]), y);
    const mx = x.reduce((a, b) => a + b) / x.length;
    const sxx = x.reduce((a, v) => a + (v - mx) ** 2, 0);
    expect(r.se[1]).toBeCloseTo(Math.sqrt(r.sigma2 / sxx), 10);
  });
  it('HAC SE is much larger than classical SE under autocorrelated errors and regressors', () => {
    const rng = mulberry32(3);
    const n = 400;
    const x = ar1(n, 0.8, rng);
    const e = ar1(n, 0.8, rng);
    const y = x.map((v, i) => v + e[i]);
    const r = olsFit(x.map((v) => [1, v]), y);
    expect(r.seHac[1]).toBeGreaterThan(1.3 * r.se[1]);
  });
  it('rejects a collinear design instead of returning garbage', () => {
    const X = Array.from({ length: 30 }, (_, i) => [1, i, 2 * i]);
    expect(() => olsFit(X, X.map((r) => r[1]))).toThrow();
  });
  it('linear combination test works with the HAC covariance', () => {
    const rng = mulberry32(4);
    const X = Array.from({ length: 200 }, () => [1, randn(rng), randn(rng)]);
    const y = X.map((r) => r[1] + r[2] + randn(rng));
    const lc = linearCombination(olsFit(X, y), [0, 1, 1]);
    expect(lc.est).toBeGreaterThan(1.6);
    expect(lc.est).toBeLessThan(2.4);
    expect(lc.p).toBeLessThan(1e-6);
  });
});

describe('multiple-testing correction', () => {
  const p = [0.01, 0.04, 0.03, 0.005];
  it('Benjamini-Hochberg matches the hand calculation', () => {
    const q = adjustPValues(p, 'bh');
    [0.02, 0.04, 0.04, 0.02].forEach((v, i) => expect(q[i]).toBeCloseTo(v, 12));
  });
  it('Holm matches the hand calculation and Bonferroni is the most conservative', () => {
    const h = adjustPValues(p, 'holm');
    [0.03, 0.06, 0.06, 0.02].forEach((v, i) => expect(h[i]).toBeCloseTo(v, 12));
    const b = adjustPValues(p, 'bonferroni');
    [0.04, 0.16, 0.12, 0.02].forEach((v, i) => expect(b[i]).toBeCloseTo(v, 12));
  });
  it('Benjamini-Yekutieli is never less conservative than BH', () => {
    const bh = adjustPValues(p, 'bh');
    const by = adjustPValues(p, 'by');
    by.forEach((v, i) => expect(v).toBeGreaterThanOrEqual(bh[i]));
  });
});

describe('unit-root and stationarity tests', () => {
  it('p-value surface agrees with the critical values (5% and 1%)', () => {
    expect(mackinnonP(-2.8616, 'c')).toBeCloseTo(0.05, 3);
    expect(mackinnonP(-3.4105, 'ct')).toBeCloseTo(0.05, 3);
    expect(mackinnonP(-1.941, 'n')).toBeCloseTo(0.05, 3);
    expect(mackinnonP(-3.4304, 'c')).toBeCloseTo(0.01, 3);
    expect(adfCriticalValues('c', 200)['5']).toBeCloseTo(-2.876, 2);
  });
  it('ADF has correct size on random walks (T=200, 5% level)', () => {
    const rng = mulberry32(21);
    let rej = 0;
    const N = 300;
    for (let s = 0; s < N; s++) if (adfTest(randomWalk(200, rng), { det: 'c' }).rejectUnitRoot5) rej++;
    expect(rate(rej, N)).toBeGreaterThan(0.02);
    expect(rate(rej, N)).toBeLessThan(0.09);
  });
  it('ADF has high power on a stationary AR(0.5)', () => {
    const rng = mulberry32(22);
    let rej = 0;
    const N = 200;
    for (let s = 0; s < N; s++) if (adfTest(ar1(200, 0.5, rng), { det: 'c' }).rejectUnitRoot5) rej++;
    expect(rate(rej, N)).toBeGreaterThan(0.95);
  });
  it('the paper-style t = -2.83 with ~35 obs is NOT a rejection (critical ≈ -2.95)', () => {
    expect(adfCriticalValues('c', 35)['5']).toBeLessThan(-2.9);
  });
  it('KPSS: stationary → not rejected; random walk → rejected', () => {
    const rng = mulberry32(23);
    let sizeRej = 0;
    let powRej = 0;
    const N = 200;
    for (let s = 0; s < N; s++) {
      if (kpssTest(ar1(200, 0.3, rng)).rejectStationarity5) sizeRej++;
      if (kpssTest(randomWalk(200, rng)).rejectStationarity5) powRej++;
    }
    expect(rate(sizeRej, N)).toBeLessThan(0.12);
    expect(rate(powRej, N)).toBeGreaterThan(0.9);
  });
  it('joint ADF+KPSS classifies I(0) and I(1) correctly most of the time', () => {
    const rng = mulberry32(24);
    let okRw = 0;
    let okAr = 0;
    const N = 80;
    for (let s = 0; s < N; s++) {
      if (diagnoseIntegration(randomWalk(200, rng)).klass === 'I(1)') okRw++;
      if (diagnoseIntegration(ar1(200, 0.4, rng)).klass === 'I(0)') okAr++;
    }
    expect(rate(okRw, N)).toBeGreaterThan(0.8);
    expect(rate(okAr, N)).toBeGreaterThan(0.8);
  });
  it('integration order: RW → 1, double-integrated → 2, AR → 0', () => {
    const rng = mulberry32(25);
    let o0 = 0;
    let o1 = 0;
    let o2 = 0;
    const N = 40;
    for (let s = 0; s < N; s++) {
      if (determineIntegrationOrder(ar1(200, 0.4, rng)).order === 0) o0++;
      if (determineIntegrationOrder(randomWalk(200, rng)).order === 1) o1++;
      if (determineIntegrationOrder(cumsum(randomWalk(200, rng))).order === 2) o2++;
    }
    expect(rate(o0, N)).toBeGreaterThan(0.8);
    expect(rate(o1, N)).toBeGreaterThan(0.8);
    expect(rate(o2, N)).toBeGreaterThan(0.8);
  });
  it('Zivot-Andrews has controlled size on drifting random walks', () => {
    const rng = mulberry32(26);
    let rej = 0;
    const N = 100;
    for (let s = 0; s < N; s++) {
      const y = cumsum(noise(200, rng).map((e) => e + 0.1));
      if (zivotAndrewsTest(y, { model: 'intercept', lag: 2 }).rejectUnitRoot5) rej++;
    }
    expect(rate(rej, N)).toBeLessThan(0.13);
  });
  it('Zivot-Andrews detects stationarity around a level break that ADF misses', () => {
    const rng = mulberry32(27);
    let adfRej = 0;
    let zaRej = 0;
    const N = 60;
    for (let s = 0; s < N; s++) {
      const base = ar1(200, 0.6, rng);
      const y = base.map((v, t) => v + (t > 100 ? 12 : 0));
      if (adfTest(y, { det: 'c' }).rejectUnitRoot5) adfRej++;
      if (zivotAndrewsTest(y, { model: 'intercept', lag: 1 }).rejectUnitRoot5) zaRej++;
    }
    expect(rate(zaRej, N)).toBeGreaterThan(rate(adfRej, N) + 0.3);
  });
  it('Engle-Granger: independent walks are not cointegrated, a true pair is', () => {
    const rng = mulberry32(28);
    let falsePos = 0;
    let power = 0;
    const N = 100;
    for (let s = 0; s < N; s++) {
      const x = randomWalk(150, rng);
      if (engleGranger(randomWalk(150, rng), x).cointegrated5) falsePos++;
      if (engleGranger(x.map((v) => 2 * v + randn(rng)), x).cointegrated5) power++;
    }
    expect(rate(falsePos, N)).toBeLessThan(0.1);
    expect(rate(power, N)).toBeGreaterThan(0.95);
  });
});

describe('transforms and publication lag', () => {
  it('logdiff, diff, yoy', () => {
    expect(applyTransform([100, 110], 'logdiff')[1]).toBeCloseTo(100 * Math.log(1.1), 10);
    expect(applyTransform([1, 4, 9], 'diff2')[2]).toBeCloseTo(2, 12);
    const v = Array.from({ length: 14 }, (_, i) => 100 * 1.01 ** i);
    expect(applyTransform(v, 'yoy')[13]).toBeCloseTo(100 * 12 * Math.log(1.01), 8);
    expect(applyTransform([1, -2, 3], 'logdiff')[1]).toBeNaN();
  });
  it('recommendTransform follows order and kind', () => {
    expect(recommendTransform('index', 1, [1, 2])).toBe('logdiff');
    expect(recommendTransform('rate', 1)).toBe('diff');
    expect(recommendTransform('rate', 0)).toBe('level');
    expect(recommendTransform('level', 1, [1, -1])).toBe('diff');
  });
  it('publication lag shifts values forward and blanks the head', () => {
    const s = shiftForPublicationLag([1, 2, 3, 4], 2);
    expect(s[0]).toBeNaN();
    expect(s[1]).toBeNaN();
    expect(s[2]).toBe(1);
    expect(s[3]).toBe(2);
  });
});

describe('impact matrix', () => {
  const make = (n: number, seed: number) => {
    const rng = mulberry32(seed);
    const x1 = noise(n, rng);
    const x2 = noise(n, rng);
    const y = x1.map((_, t) => (t >= 1 ? 0.8 * x1[t - 1] : 0) + randn(rng));
    return { x1, x2, y };
  };
  it('recovers a lag-1 effect and flags nothing spurious', () => {
    const { x1, x2, y } = make(360, 31);
    const cells = estimateImpactMatrix({ targets: { RET: y }, factors: { X1: x1, X2: x2 } });
    expect(cells).toHaveLength(14);
    const hit = cells.find((c) => c.factor === 'X1' && c.lag === 1);
    expect(hit?.significant).toBe(true);
    expect(hit?.direction).toBe('+');
    expect(Math.abs((hit?.beta ?? 0) - 0.8)).toBeLessThan(0.25);
    expect(cells.filter((c) => c.factor === 'X2' && c.significant)).toHaveLength(0);
    const best = bestLagCells(cells);
    expect(best).toHaveLength(2);
    expect(best.find((c) => c.factor === 'X1')?.lag).toBe(1);
  });
  it('bootstrap CI (stationary bootstrap) covers the truth and is reproducible', () => {
    const { x1, y } = make(300, 32);
    const d = buildDesign({ y, xs: [x1], names: ['X1'], lag: 1, arLags: 0 });
    const a = stationaryBootstrapCI(d.X, d.y, 1, { B: 400, seed: 5 });
    const b = stationaryBootstrapCI(d.X, d.y, 1, { B: 400, seed: 5 });
    expect(a.lo).toBeLessThan(0.8);
    expect(a.hi).toBeGreaterThan(0.8);
    expect(a.lo).toBe(b.lo);
    expect(a.hi).toBe(b.hi);
  });
  it('Granger and cross-correlation find the leading variable', () => {
    const { x1, y } = make(400, 33);
    expect(grangerCausality(y, x1, 2).p).toBeLessThan(1e-6);
    expect(grangerCausality(x1, y, 2).p).toBeGreaterThan(0.01);
    const cc = crossCorrelation(x1, y, 4);
    const top = cc.reduce((a, c) => (Math.abs(c.r) > Math.abs(a.r) ? c : a));
    expect(top.lag).toBe(1);
    expect(top.significant).toBe(true);
  });
});

describe('stability and breaks', () => {
  it('rolling beta: constant effect is stable, sign-flipping effect is not', () => {
    const rng = mulberry32(41);
    const n = 300;
    const x = noise(n, rng);
    const yStable = x.map((v) => v + 0.7 * randn(rng));
    const yFlip = x.map((v, t) => (t < 150 ? v : -v) + 0.7 * randn(rng));
    const dS = buildDesign({ y: yStable, xs: [x], names: ['X'], lag: 0, arLags: 0 });
    const dF = buildDesign({ y: yFlip, xs: [x], names: ['X'], lag: 0, arLags: 0 });
    expect(summarizeStability(rollingBeta(dS, 1, 48), 1).stable).toBe(true);
    const flip = summarizeStability(rollingBeta(dF, 1, 48), 1);
    expect(flip.stable).toBe(false);
    expect(flip.shareSameSign).toBeLessThan(0.7);
  });
  it('Chow test detects a slope break and not a stable slope', () => {
    const rng = mulberry32(42);
    const n = 240;
    const x = noise(n, rng);
    const X = x.map((v) => [1, v]);
    const yBreak = x.map((v, t) => (t < 120 ? 1 : -1) * v + randn(rng));
    const yOk = x.map((v) => v + randn(rng));
    expect(chowTest(X, yBreak, 120).p).toBeLessThan(1e-6);
    expect(chowTest(X, yOk, 120).p).toBeGreaterThan(0.01);
  });
});

describe('spurious-regression guard (the paper\'s main weakness)', () => {
  it('levels regression of independent walks looks "significant"; the pipeline does not', () => {
    const rng = mulberry32(51);
    const n = 300;
    const factor = randomWalk(n, rng).map((v) => 5 + 0.3 * v);
    const idx = cumsum(noise(n, rng, 0.02)).map((v) => 1000 * Math.exp(v));
    const naive = olsFit(factor.map((v) => [1, v]), idx, { hac: false });
    expect(Math.abs(naive.t[1])).toBeGreaterThan(3);
    const dates = Array.from({ length: n }, (_, i) => `m${i}`);
    const out = analyzeMacro({
      dates,
      factors: [{ id: 'CPI', values: factor, kind: 'rate' }],
      targets: [{ id: 'VNINDEX', values: idx, kind: 'index' }],
    });
    expect(out.diagnostics.find((d) => d.id === 'VNINDEX')?.transform).toBe('logdiff');
    expect(out.diagnostics.find((d) => d.id === 'CPI')?.transform).toBe('diff');
    expect(out.cells.filter((c) => c.significant)).toHaveLength(0);
    expect(out.warnings.some((w) => w.includes('Multiple testing'))).toBe(true);
  });
  it('end-to-end: recovers a real lagged macro effect and respects the publication lag', () => {
    const rng = mulberry32(52);
    const n = 320;
    const dx = noise(n, rng); // true stationary driver (innovation of the factor)
    const factorLevel = cumsum(dx).map((v) => 100 + v);
    // index return reacts 2 months after the REFERENCE month of the factor
    const ret = dx.map((_, t) => (t >= 2 ? -0.6 * dx[t - 2] : 0) + 0.8 * randn(rng));
    const idx = cumsum(ret.map((r) => r / 100)).map((v) => 1000 * Math.exp(v));
    const dates = Array.from({ length: n }, (_, i) => `m${i}`);
    const out = analyzeMacro({
      dates,
      factors: [{ id: 'CPI', values: factorLevel, kind: 'rate', pubLagMonths: 1 }],
      targets: [{ id: 'VNINDEX', values: idx, kind: 'index' }],
      options: { maxLag: 4 },
    });
    const best = out.best.find((c) => c.factor === 'CPI');
    expect(best?.significant).toBe(true);
    expect(best?.direction).toBe('-');
    // reference-month lag 2 minus publication lag 1 ⇒ effective lag 1 in the shifted series
    expect(best?.lag).toBe(1);
  });
});

describe('trend-stationary guard', () => {
  it('a series stationary only around a trend is differenced, not used in levels', () => {
    const rng = mulberry32(71);
    const n = 240;
    const trendy = Array.from({ length: n }, (_, i) => 1000 * Math.exp(0.004 * i + 0.05 * randn(rng)));
    const idx = cumsum(noise(n, rng, 0.02)).map((v) => 1000 * Math.exp(v));
    const out = analyzeMacro({
      dates: Array.from({ length: n }, (_, i) => `m${i}`),
      factors: [{ id: 'FDI', values: trendy, kind: 'level' }],
      targets: [{ id: 'IDX', values: idx, kind: 'index' }],
      options: { maxLag: 2 },
    });
    expect(out.diagnostics.find((d) => d.id === 'FDI')?.transform).toBe('logdiff');
    expect(out.warnings.some((w) => w.includes('deterministic trend'))).toBe(true);
  });
});

describe('MacroScore (point-in-time)', () => {
  const build = () => {
    const rng = mulberry32(61);
    const n = 260;
    const x = noise(n, rng);
    const x2 = noise(n, rng);
    const y = x.map((_, t) => (t >= 1 ? 0.7 * x[t - 1] : 0) + randn(rng));
    return { x, x2, y, n };
  };
  it('is bounded in (-1, 1) and tracks the sign of the driver', () => {
    const { x, x2, y } = build();
    const s = macroScoreSeries({ y, factors: { X: x, NOISE: x2 }, lag: 1, minTrain: 80 });
    expect(s.length).toBeGreaterThan(100);
    s.forEach((p) => {
      expect(p.score).toBeGreaterThan(-1);
      expect(p.score).toBeLessThan(1);
    });
    let agree = 0;
    let cnt = 0;
    for (const p of s) {
      const prev = x[p.row - 1];
      if (Math.abs(prev) > 0.5) {
        cnt++;
        if (Math.sign(p.score) === Math.sign(prev)) agree++;
      }
    }
    expect(rate(agree, cnt)).toBeGreaterThan(0.8);
  });
  it('has NO look-ahead: changing future data never changes past scores', () => {
    const { x, x2, y, n } = build();
    const base = macroScoreSeries({ y, factors: { X: x, NOISE: x2 }, lag: 1, minTrain: 80 });
    const cut = n - 40;
    const rng = mulberry32(99);
    const y2 = y.map((v, t) => (t >= cut ? v + 10 * randn(rng) : v));
    const x3 = x.map((v, t) => (t >= cut ? v + 10 * randn(rng) : v));
    const alt = macroScoreSeries({ y: y2, factors: { X: x3, NOISE: x2 }, lag: 1, minTrain: 80 });
    const past = base.filter((p) => p.row < cut);
    expect(past.length).toBeGreaterThan(50);
    past.forEach((p, i) => {
      expect(alt[i].row).toBe(p.row);
      expect(alt[i].score).toBe(p.score);
    });
  });
  it('is out-of-sample: an outlier response at month t cannot influence the score of month t', () => {
    const { x, x2, y } = build();
    const base = macroScoreSeries({ y, factors: { X: x, NOISE: x2 }, lag: 1, minTrain: 80 });
    const k = 150;
    const y2 = y.map((v, t) => (t === k ? v + 1000 : v));
    const alt = macroScoreSeries({ y: y2, factors: { X: x, NOISE: x2 }, lag: 1, minTrain: 80 });
    const a = base.find((p) => p.row === k);
    const b = alt.find((p) => p.row === k);
    expect(a?.score).toBe(b?.score);
    expect(a?.origin).toBe(k - 1);
  });
  it('shrinks the pure-noise factor contribution toward zero', () => {
    const { x, x2, y } = build();
    const s = macroScoreSeries({ y, factors: { X: x, NOISE: x2 }, lag: 1, minTrain: 80 });
    const mag = (k: string) => s.reduce((a, p) => a + Math.abs(p.contributions[k]), 0) / s.length;
    expect(mag('NOISE')).toBeLessThan(0.5 * mag('X'));
  });
});
