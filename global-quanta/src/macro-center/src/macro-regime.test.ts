import { describe, it, expect } from 'vitest';
import { filterProbs, fitHmm, regimeConditionalBeta, selectHmm, smoothProbs, summarizeRegimes, viterbi } from './macro-regime';
import { mulberry32, randn } from './quant-macro';

function simulate(T: number, seed: number) {
  const rng = mulberry32(seed);
  const states: number[] = [];
  const obs: number[][] = [];
  let s = 0;
  for (let t = 0; t < T; t++) {
    if (t > 0 && rng() > 0.95) s = 1 - s;
    states.push(s);
    obs.push(s === 0 ? [-1 + 0.5 * randn(rng), 0.3 * randn(rng)] : [1.2 + 0.9 * randn(rng), 1 + 0.6 * randn(rng)]);
  }
  return { states, obs };
}

describe('Gaussian HMM', () => {
  const { states, obs } = simulate(700, 5);
  const fit = fitHmm(obs, 2);
  it('recovers means, persistence and the state path', () => {
    const sum = summarizeRegimes(fit.params);
    expect(Math.abs(sum[0].meanRaw[0] - -1)).toBeLessThan(0.25);
    expect(Math.abs(sum[1].meanRaw[0] - 1.2)).toBeLessThan(0.3);
    expect(fit.params.A[0][0]).toBeGreaterThan(0.88);
    expect(fit.params.A[1][1]).toBeGreaterThan(0.88);
    const path = viterbi(obs, fit.params);
    const acc = path.filter((p, i) => p === states[i]).length / path.length;
    expect(acc).toBeGreaterThan(0.9);
    expect(sum[0].expectedDurationMonths).toBeGreaterThan(8);
  });
  it('BIC prefers K=2 over K=1 on two-regime data', () => {
    const sel = selectHmm(obs, 3);
    expect(sel.best.params.K).toBe(2);
    expect(sel.all[0].bic).toBeGreaterThan(sel.best.bic);
  });
  it('probabilities are valid distributions', () => {
    for (const probs of [filterProbs(obs, fit.params), smoothProbs(obs, fit.params)])
      probs.forEach((r) => {
        expect(Math.abs(r.reduce((a, b) => a + b, 0) - 1)).toBeLessThan(1e-9);
        r.forEach((v) => expect(v).toBeGreaterThanOrEqual(0));
      });
  });
  it('filtered probabilities have no look-ahead; smoothed ones do', () => {
    const cut = 500;
    const alt = obs.map((r, t) => (t >= cut ? [r[0] + 5, r[1] - 5] : r));
    const f1 = filterProbs(obs, fit.params);
    const f2 = filterProbs(alt, fit.params);
    for (let t = 0; t < cut; t++) expect(f1[t][0]).toBe(f2[t][0]);
    const s1 = smoothProbs(obs, fit.params);
    const s2 = smoothProbs(alt, fit.params);
    let diff = 0;
    for (let t = cut - 5; t < cut; t++) diff += Math.abs(s1[t][0] - s2[t][0]);
    expect(diff).toBeGreaterThan(0);
  });
  it('is deterministic for a given seed and rejects too-short samples', () => {
    const a = fitHmm(obs, 2, { seed: 3 });
    const b = fitHmm(obs, 2, { seed: 3 });
    expect(a.logLik).toBe(b.logLik);
    expect(() => fitHmm(obs.slice(0, 15), 2)).toThrow();
  });
});

describe('regime-conditional sensitivity', () => {
  const build = (b0: number, b1: number, seed: number) => {
    const rng = mulberry32(seed);
    const n = 400;
    const regime = Array.from({ length: n }, (_, t) => (Math.floor(t / 50) % 2));
    const x = Array.from({ length: n }, () => randn(rng));
    const y = x.map((v, t) => (regime[t] === 0 ? b0 : b1) * v + randn(rng));
    return { X: x.map((v) => [1, v]), y, regime };
  };
  it('detects a sign flip across regimes and recovers each beta', () => {
    const { X, y, regime } = build(1, -1, 81);
    const r = regimeConditionalBeta({ X, y, coefIdx: 1, regimeOfRow: regime, K: 2 })!;
    expect(r.differs).toBe(true);
    expect(r.equalityP).toBeLessThan(1e-6);
    expect(Math.abs(r.perRegime[0].beta - 1)).toBeLessThan(0.25);
    expect(Math.abs(r.perRegime[1].beta - -1)).toBeLessThan(0.25);
  });
  it('does not flag a constant effect (false-positive rate stays low)', () => {
    let fp = 0;
    const N = 40;
    for (let s = 0; s < N; s++) {
      const { X, y, regime } = build(0.8, 0.8, 200 + s);
      if (regimeConditionalBeta({ X, y, coefIdx: 1, regimeOfRow: regime, K: 2 })!.differs) fp++;
    }
    expect(fp / N).toBeLessThan(0.15);
  });
  it('returns null when a regime is too thin, and ignores rows marked -1', () => {
    const { X, y } = build(1, 1, 82);
    const thin = X.map((_, i) => (i < 10 ? 1 : 0));
    expect(regimeConditionalBeta({ X, y, coefIdx: 1, regimeOfRow: thin, K: 2 })).toBe(null);
    const mixed = X.map((_, i) => (i % 2 === 0 ? -1 : Math.floor(i / 50) % 2));
    expect(regimeConditionalBeta({ X, y, coefIdx: 1, regimeOfRow: mixed, K: 2 })).not.toBe(null);
  });
});
