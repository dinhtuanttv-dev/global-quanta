// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { createMacroApi } from './macro-api';
import { SYNTHETIC_NOTICE, makeSyntheticStore } from './macro-seed';

const store = makeSyntheticStore(2024);
const api = createMacroApi({ store, today: () => '2026-07-15', notice: SYNTHETIC_NOTICE });
const post = (path: string, body: unknown) => api.handle({ method: 'POST', path, query: {}, body });
const get = (path: string, query: Record<string, string> = {}) => api.handle({ method: 'GET', path, query, body: undefined });
type Any = any; // eslint-disable-line

describe('basic routes and validation', () => {
  it('health, series catalogue and notice', async () => {
    const h = await get('/api/macro/health');
    expect(h.status).toBe(200);
    const s = (await get('/api/macro/series')).body as Any;
    expect(s.series).toHaveLength(18);
    expect(s.notice).toBe(SYNTHETIC_NOTICE);
    expect(s.scenarios.length).toBeGreaterThan(3);
    expect(s.series.find((x: Any) => x.id === 'CPI').n).toBeGreaterThan(200);
  });
  it('rejects bad input with a clear 400 and unknown routes with 404/405', async () => {
    expect((await post('/api/macro/impact', { adjust: 'magic' })).status).toBe(400);
    expect((await post('/api/macro/impact', { factors: ['NOPE'] })).status).toBe(400);
    expect((await post('/api/macro/impact', { factors: ['VNINDEX'] })).status).toBe(400);
    expect((await post('/api/macro/impact', { asOf: '15/07/2026' })).status).toBe(400);
    expect((await post('/api/macro/impact', { maxLag: 99 })).status).toBe(400);
    expect((await get('/api/macro/impact')).status).toBe(405);
    expect((await get('/nothing')).status).toBe(404);
    expect(((await post('/api/macro/scenario', {})).body as Any).error).toContain('scenarioId');
    expect((await post('/api/macro/scenario', { scenarioId: 'x' })).status).toBe(404);
    expect((await post('/api/macro/impact', { asOf: '2010-01-01' })).status).toBe(422);
  });
});

describe('impact matrix against planted truth', () => {
  it('finds the planted lag-1 effects with the right sign and ignores unrelated factors', async () => {
    const r = await post('/api/macro/impact', {});
    expect(r.status).toBe(200);
    const b = r.body as Any;
    expect(b.cells.length).toBe(b.factors.length * b.targets.length * 7);
    const best = (f: string, t: string) => b.best.find((c: Any) => c.factor === f && c.target === t);
    const cpi = best('CPI', 'VNINDEX');
    expect(cpi.significant).toBe(true);
    expect(cpi.direction).toBe('-');
    expect(cpi.lag).toBe(1);
    const m2 = best('M2', 'VNSMALLCAP');
    expect(m2.significant).toBe(true);
    expect(m2.direction).toBe('+');
    expect(Math.abs(best('CPI', 'VNSMALLCAP').beta)).toBeGreaterThan(Math.abs(best('CPI', 'VN30').beta));
    const planted = new Set(['CPI', 'IR', 'M2', 'PMI', 'DXY']);
    const falsePos = b.best.filter((c: Any) => !planted.has(c.factor) && c.significant);
    expect(falsePos.length).toBeLessThanOrEqual(2);
    expect(b.diagnostics.find((d: Any) => d.id === 'VNINDEX').transform).toBe('logdiff');
    expect(b.warnings.some((w: string) => w.includes('Multiple testing'))).toBe(true);
    expect(b.notice).toBe(SYNTHETIC_NOTICE);
  });
  it('is cached per data version and invalidated by a write', async () => {
    await post('/api/macro/impact', {});
    const before = api.cacheStats();
    await post('/api/macro/impact', {});
    expect(api.cacheStats().hits).toBeGreaterThan(before.hits);
    const v0 = ((await get('/api/macro/health')).body as Any).dataVersion;
    store.upsert([{ seriesId: 'OIL', period: '2008-01', value: 81, asOf: '2008-02-01' }]);
    const v1 = ((await get('/api/macro/health')).body as Any).dataVersion;
    expect(v1).not.toBe(v0);
    const m = api.cacheStats().misses;
    await post('/api/macro/impact', {});
    expect(api.cacheStats().misses).toBeGreaterThan(m);
  });
  it('as-of queries hide later data (no look-ahead through the API)', async () => {
    const early = (await post('/api/macro/impact', { asOf: '2020-01-15' })).body as Any;
    const late = (await post('/api/macro/impact', {})).body as Any;
    expect(early.lastPeriod < late.lastPeriod).toBe(true);
    expect(early.lastPeriod <= '2019-12').toBe(true);
  });
});

describe('cell detail, scenario, score, regime, alerts, calendar', () => {
  it('cell detail returns aligned rolling arrays and a bootstrap CI around beta', async () => {
    const r = (await post('/api/macro/cell', { factor: 'CPI', target: 'VNINDEX', lag: 1, arLags: 1 })).body as Any;
    expect(r.rolling.dates.length).toBe(r.rolling.beta.length);
    expect(r.rolling.beta.length).toBe(r.rolling.t.length);
    expect(r.rolling.beta.length).toBeGreaterThan(50);
    expect(r.bootstrapCI[0]).toBeLessThan(r.beta);
    expect(r.bootstrapCI[1]).toBeGreaterThan(r.beta);
    expect(r.beta).toBeLessThan(0);
    expect((await post('/api/macro/cell', { factor: 'CPI' })).status).toBe(400);
    expect((await post('/api/macro/cell', { factor: 'NOPE', target: 'VNINDEX' })).status).toBe(400);
    expect((await post('/api/macro/cell', { factor: 'VNINDEX', target: 'CPI' })).status).toBe(400);
  });
  it('easing scenario helps small caps more than VN30 and is ranked accordingly', async () => {
    const r = (await post('/api/macro/scenario', { scenarioId: 'easing', horizon: 3 })).body as Any;
    expect(r.ranking.length).toBe(6);
    const est = (t: string) => r.ranking.find((x: Any) => x.target === t).est;
    expect(est('VNSMALLCAP')).toBeGreaterThan(est('VN30'));
    expect(est('VNSMALLCAP')).toBeGreaterThan(0);
    const sorted = [...r.ranking].map((x: Any) => x.est);
    expect(sorted).toEqual([...sorted].sort((a, b) => b - a));
    expect(r.scenario.nameVi).toBe('Nới lỏng tiền tệ');
    const custom = (await post('/api/macro/scenario', { shocks: [{ factor: 'CPI', amount: 1, unit: 'pp' }], horizon: 3 })).body as Any;
    expect(custom.ranking.every((x: Any) => x.est < 0)).toBe(true);
    const bad = (await post('/api/macro/scenario', { shocks: [{ factor: 'CPI', amount: 1, unit: 'pct' }] })).body as Any;
    expect(bad.warnings.length).toBeGreaterThan(0);
  });
  it('score route: thermometer, out-of-sample backtest and an explicit usability verdict', async () => {
    const r = (await post('/api/macro/score', {})).body as Any;
    expect(r.thermometer.value).toBeGreaterThan(-1);
    expect(r.thermometer.value).toBeLessThan(1);
    expect(typeof r.thermometer.bandVi).toBe('string');
    expect(r.series.length).toBe(36);
    expect(r.backtest.ic).toBeGreaterThan(0.1);
    expect(r.backtest.gate.pass).toBe(true);
    expect(r.usableForDecisions).toBe(true);
    expect(r.factors).toEqual(['CPI', 'IR', 'M2', 'EX', 'IO', 'FDI']);
  });
  it('regime route returns valid filtered probabilities', async () => {
    const r = (await get('/api/macro/regime')).body as Any;
    expect(r.K).toBeGreaterThanOrEqual(1);
    expect(Math.abs(r.current.probs.reduce((a: number, b: number) => a + b, 0) - 1)).toBeLessThan(1e-9);
    expect(r.history.length).toBe(60);
    expect(r.summary.length).toBe(r.K);
  });
  it('alerts and calendar', async () => {
    const a = (await get('/api/macro/alerts')).body as Any;
    expect(Array.isArray(a.alerts)).toBe(true);
    expect(Object.keys(a.factorZ).length).toBeGreaterThan(5);
    const c = (await get('/api/macro/calendar')).body as Any;
    expect(c.releases.length).toBeGreaterThan(5);
    expect(c.releases.every((x: Any) => x.estimated === true)).toBe(true);
    expect(c.caveat).toContain('ƯỚC TÍNH');
  });
});
