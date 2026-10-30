import { describe, it, expect } from 'vitest';
import {
  buildThermometer, expandingZ, generateAlerts, localProjectionIRF, NAMED_SCENARIOS, resolveShocks, runScenario,
  surpriseReaction, surpriseZ, upcomingReleases,
} from './macro-scenario';
import { backtestMacroScore, spearman } from './macro-backtest';
import { VN_CATALOG } from './macro-data';
import { mulberry32, randn } from './quant-macro';

const noise = (n: number, rng: () => number, sd = 1) => Array.from({ length: n }, () => sd * randn(rng));

describe('local projections', () => {
  it('recovers a dynamic cumulative response (0.5 now, +0.3 next month, then flat)', () => {
    const rng = mulberry32(1);
    const n = 600;
    const x = noise(n, rng);
    const y = x.map((_, t) => 0.5 * x[t] + (t > 0 ? 0.3 * x[t - 1] : 0) + noise(1, rng, 0.8)[0]);
    const irf = localProjectionIRF({ y, xs: [x], shock: [1], horizon: 4, arLags: 1 });
    expect(irf).toHaveLength(5);
    expect(Math.abs(irf[0].est - 0.5)).toBeLessThan(0.15);
    expect(Math.abs(irf[1].est - 0.8)).toBeLessThan(0.2);
    expect(Math.abs(irf[4].est - 0.8)).toBeLessThan(0.35);
    irf.forEach((p) => {
      expect(p.lo).toBeLessThan(p.est);
      expect(p.hi).toBeGreaterThan(p.est);
    });
    expect(irf[0].lo).toBeGreaterThan(0);
  });
  it('shock scaling is linear', () => {
    const rng = mulberry32(2);
    const x = noise(300, rng);
    const y = x.map((v) => v + noise(1, rng)[0]);
    const a = localProjectionIRF({ y, xs: [x], shock: [1], horizon: 2 });
    const b = localProjectionIRF({ y, xs: [x], shock: [3], horizon: 2 });
    expect(b[1].est).toBeCloseTo(3 * a[1].est, 8);
  });
});

describe('scenarios', () => {
  it('resolveShocks checks units against the transform and skips unknown factors', () => {
    const r = resolveShocks(
      [{ factor: 'M2', amount: 2, unit: 'pct' }, { factor: 'IR', amount: 1, unit: 'pct' }, { factor: 'XYZ', amount: 1, unit: 'pp' }],
      { M2: 'logdiff', IR: 'diff' },
    );
    expect(r.vector).toEqual({ M2: 2 });
    expect(r.warnings).toHaveLength(2);
  });
  it('named scenarios have unique ids and non-empty shocks', () => {
    expect(new Set(NAMED_SCENARIOS.map((s) => s.id)).size).toBe(NAMED_SCENARIOS.length);
    NAMED_SCENARIOS.forEach((s) => expect(s.shocks.length).toBeGreaterThan(0));
  });
  it('ranks winners and losers with confidence flags', () => {
    const rng = mulberry32(3);
    const n = 500;
    const x = noise(n, rng);
    const mk = (b: number) => x.map((v) => b * v + noise(1, rng, 0.8)[0]);
    const out = runScenario({
      targets: { WIN: mk(1), LOSE: mk(-1), FLAT: mk(0) },
      factors: { IR: x }, transforms: { IR: 'diff' }, shocks: [{ factor: 'IR', amount: 1, unit: 'pp' }], horizon: 3,
    });
    expect(out.ranking.map((r) => r.target)).toEqual(['WIN', 'FLAT', 'LOSE']);
    expect(out.ranking[0].significant).toBe(true);
    expect(out.ranking[2].significant).toBe(true);
    expect(out.ranking[1].significant).toBe(false);
  });
  it('reports a warning when no shock is usable', () => {
    const out = runScenario({ targets: { A: [1, 2, 3] }, factors: { X: [1, 2, 3] }, transforms: { X: 'diff' }, shocks: [{ factor: 'NOPE', amount: 1, unit: 'pp' }] });
    expect(out.results).toHaveLength(0);
    expect(out.warnings.length).toBeGreaterThan(0);
  });
});

describe('alerts', () => {
  it('expanding z has no look-ahead', () => {
    const rng = mulberry32(4);
    const x = noise(120, rng);
    const z1 = expandingZ(x);
    const z2 = expandingZ(x.map((v, t) => (t >= 100 ? v + 50 : v)));
    for (let t = 0; t < 100; t++) expect(Object.is(z1[t], z2[t])).toBe(true);
    expect(z1[10]).toBeNaN();
  });
  it('raises factor, regime and instability alerts, most severe first', () => {
    const alerts = generateAlerts({
      factorZ: { CPI: 3.1, M2: 1.7, IR: 0.2 },
      regime: { previous: [0.9, 0.1], current: [0.2, 0.8], labels: ['Thấp', 'Cao'] },
      best: [{ factor: 'M2', target: 'VN30', significant: true } as never],
      stability: { 'M2|VN30': { shareSameSign: 0.55, shareSignificant: 0.1, signFlips: 6, windows: 100, stable: false } },
    });
    expect(alerts.map((a) => a.kind)).toEqual(['factor-extreme', 'regime-change', 'factor-extreme', 'unstable-effect']);
    expect(alerts[0].level).toBe('high');
    expect(alerts.find((a) => a.id === 'z:IR')).toBe(undefined);
  });
  it('a weak regime shift (< 60%) does not alert', () => {
    expect(generateAlerts({ factorZ: {}, regime: { previous: [0.6, 0.4], current: [0.45, 0.55], labels: ['a', 'b'] } })).toHaveLength(0);
  });
});

describe('calendar, surprises, thermometer', () => {
  it('estimates next releases and marks overdue ones', () => {
    const rel = upcomingReleases(VN_CATALOG, { CPI: '2024-03', M2: '2023-12' }, '2024-05-01');
    const cpi = rel.find((r) => r.seriesId === 'CPI')!;
    expect(cpi.period).toBe('2024-04');
    expect(cpi.expectedDate).toBe('2024-06-06');
    expect(cpi.status).toBe('upcoming');
    expect(rel.find((r) => r.seriesId === 'M2')?.status).toBe('overdue');
    expect(rel.every((r) => r.estimated)).toBe(true);
    expect(rel.map((r) => r.expectedDate)).toEqual([...rel.map((r) => r.expectedDate)].sort());
  });
  it('surprise z and reaction regression', () => {
    expect(surpriseZ(4.0, 3.5, [0.1, -0.2, 0.3, -0.1, 0.2, -0.3, 0.1])).toBeGreaterThan(2);
    expect(surpriseZ(4.0, 3.5, [0.1])).toBeNaN();
    const rng = mulberry32(6);
    const s = noise(80, rng);
    const r = s.map((v) => -1.5 * v + noise(1, rng)[0]);
    const out = surpriseReaction(s, r)!;
    expect(out.beta).toBeLessThan(-1);
    expect(out.p).toBeLessThan(0.001);
    expect(surpriseReaction(s.slice(0, 5), r.slice(0, 5))).toBe(null);
  });
  it('thermometer maps scores to bands and ranks contributors', () => {
    const mk = (score: number) => [{ row: 9, origin: 8, score, z: score, expectedReturn: score, contributions: { A: 0.1, B: -0.9, C: 0.4, D: 0 } }];
    expect(buildThermometer(mk(-0.7))?.band).toBe('strong-negative');
    expect(buildThermometer(mk(0))?.band).toBe('neutral');
    expect(buildThermometer(mk(0.3))?.bandVi).toBe('Thuận lợi nhẹ');
    expect(buildThermometer(mk(0.9))?.band).toBe('strong-positive');
    expect(buildThermometer(mk(0.3))?.topContributors.map((c) => c.factor)).toEqual(['B', 'C', 'A']);
    expect(buildThermometer([])).toBe(null);
  });
});

describe('backtest gate', () => {
  const gen = (seed: number, effect: number) => {
    const rng = mulberry32(seed);
    const n = 300;
    const x = noise(n, rng);
    const y = x.map((_, t) => (t >= 1 ? effect * x[t - 1] : 0) + noise(1, rng)[0]);
    return { x, y };
  };
  it('spearman handles ties and monotone relations', () => {
    expect(spearman([1, 2, 3, 4], [10, 20, 30, 40])).toBeCloseTo(1, 12);
    expect(spearman([1, 2, 3, 4], [4, 3, 2, 1])).toBeCloseTo(-1, 12);
    expect(spearman([1, 1, 2, 2], [1, 2, 1, 2])).toBeCloseTo(0, 12);
  });
  it('passes a genuinely predictive factor', () => {
    const { x, y } = gen(11, 0.6);
    const r = backtestMacroScore({ y, factors: { X: x }, lag: 1, B: 299 })!;
    expect(r.ic).toBeGreaterThan(0.2);
    expect(r.icP).toBeLessThan(0.05);
    expect(r.hitRate).toBeGreaterThan(0.55);
    expect(r.gate.pass).toBe(true);
    expect(r.strategy.sharpe).toBeGreaterThan(r.buyHold.sharpe);
  });
  it('refuses pure noise most of the time (false-pass rate stays low)', () => {
    let pass = 0;
    const N = 24;
    for (let s = 0; s < N; s++) {
      const { x, y } = gen(100 + s, 0);
      const r = backtestMacroScore({ y, factors: { X: x }, lag: 1, B: 199, seed: s + 1 })!;
      if (r.gate.pass) pass++;
    }
    expect(pass / N).toBeLessThan(0.15);
  });
  it('returns null when the sample is too short', () => {
    const { x, y } = gen(12, 0.5);
    expect(backtestMacroScore({ y: y.slice(0, 80), factors: { X: x.slice(0, 80) }, lag: 1 })).toBe(null);
  });
});

describe('resolveShocks — chuỗi tỷ lệ giữ nguyên mức', () => {
  it("pp hợp lệ với 'level' (CPI so cùng kỳ); pct với 'level' vẫn bị bỏ", () => {
    expect(resolveShocks([{ factor: 'CPI', amount: 1, unit: 'pp' }], { CPI: 'level' })).toEqual({ vector: { CPI: 1 }, warnings: [] });
    const r = resolveShocks([{ factor: 'DXY', amount: 1, unit: 'pct' }], { DXY: 'level' });
    expect(r.vector).toEqual({});
    expect(r.warnings).toHaveLength(1);
  });
});
