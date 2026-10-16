import { describe, it, expect } from 'vitest';
import { dlTau2, hierarchicalShrink, shrinkGroup } from './world-shrinkage';
import { assignTier, stockTier, summarizeTiers } from './world-evidence';
import { channelExposure, rankStocks, scenarioEffect } from './world-transmission';
import { validateStockExposure, validateWorldEvent, WORLD_DDL, WORLD_FACTOR_IDS, WORLD_FACTOR_INFO, WORLD_EXTRA_FACTORS, VN_SECTORS, SECTOR_TARGETS, type StockExposure } from './world-types';
import { VN_CATALOG } from './macro-data';
import { mulberry32, randn } from './quant-macro';

describe('hierarchical shrinkage', () => {
  it('weights follow precision: noisy → toward the group mean, precise → kept', () => {
    const items = [
      { id: 'precise', beta: 2, se: 0.05 }, { id: 'noisy', beta: 4, se: 3 },
      { id: 'c', beta: 1, se: 0.4 }, { id: 'd', beta: 1.4, se: 0.4 }, { id: 'e', beta: 0.8, se: 0.4 },
    ];
    const r = shrinkGroup(items);
    const by = Object.fromEntries(r.items.map((i) => [i.id, i]));
    expect(by.precise.weight).toBeGreaterThan(by.noisy.weight);
    expect(Math.abs(by.precise.shrunk - 2)).toBeLessThan(0.1);
    expect(Math.abs(by.noisy.shrunk - r.mu)).toBeLessThan(Math.abs(4 - r.mu));
    r.items.forEach((i) => { expect(i.weight).toBeGreaterThanOrEqual(0); expect(i.weight).toBeLessThanOrEqual(1); });
  });
  it('homogeneous group (τ² = 0) collapses to the pooled mean; huge τ² keeps the raw estimates', () => {
    const same = [1, 1.05, 0.95, 1.02].map((b, i) => ({ id: String(i), beta: b, se: 0.5 }));
    expect(dlTau2(same)).toBe(0);
    const r = shrinkGroup(same);
    r.items.forEach((i) => expect(Math.abs(i.shrunk - r.mu)).toBeLessThan(1e-9));
    const wide = shrinkGroup(same, { tau2: 1e6 });
    wide.items.forEach((i) => expect(Math.abs(i.shrunk - i.beta)).toBeLessThan(1e-3));
  });
  it('lowers mean squared error versus raw estimates (simulation)', () => {
    const rng = mulberry32(5);
    let rawErr = 0;
    let shErr = 0;
    for (let rep = 0; rep < 200; rep++) {
      const truth = Array.from({ length: 12 }, () => 1.5 + 0.5 * randn(rng));
      const items = truth.map((b, i) => ({ id: String(i), beta: b + (0.3 + (i % 4) * 0.4) * randn(rng), se: 0.3 + (i % 4) * 0.4 }));
      const r = shrinkGroup(items);
      items.forEach((it, i) => { rawErr += (it.beta - truth[i]) ** 2; shErr += (r.items[i].shrunk - truth[i]) ** 2; });
    }
    expect(shErr).toBeLessThan(0.85 * rawErr);
  });
  it('two-level: a thin sector borrows strength from the market and from other sectors τ²', () => {
    const rng = mulberry32(6);
    const mk = (mu: number, n: number, pre: string) => Array.from({ length: n }, (_, i) => ({ id: pre + i, beta: mu + 0.4 * randn(rng), se: 0.5 }));
    const res = hierarchicalShrink({ A: mk(2, 8, 'a'), B: mk(-1, 8, 'b'), C: [{ id: 'c0', beta: 5, se: 1.5 }] });
    expect(res.groups.A.tau2).toBeGreaterThanOrEqual(0);
    expect(res.groups.C.items).toHaveLength(1);
    const c = res.groups.C.items[0];
    expect(Math.abs(c.shrunk)).toBeLessThan(5);
    expect(res.groups.C.tau2).toBeCloseTo((res.groups.A.tau2 + res.groups.B.tau2) / 2, 12);
  });
});

describe('evidence tiers', () => {
  it('follows the A/B/C rules', () => {
    expect(assignTier({ q: 0.001, stable: true, oosPass: true }).tier).toBe('A');
    expect(assignTier({ q: 0.001, stable: true, oosPass: false }).tier).toBe('B');
    expect(assignTier({ q: 0.001, stable: false, oosPass: true }).tier).toBe('B');
    expect(assignTier({ q: 0.001 }).tier).toBe('B');
    expect(assignTier({ q: 0.2, stable: true, oosPass: true }).tier).toBe('C');
    expect(assignTier({ q: 0.001, stable: true, oosPass: true, isHypothesis: true }).tier).toBe('C');
    expect(assignTier({ q: 0.04, alpha: 0.01, stable: true, oosPass: true }).tier).toBe('C');
  });
  it('explains why a B is not an A', () => {
    expect(assignTier({ q: 0.001, stable: false, oosPass: null }).reasonVi).toContain('không ổn định');
    expect(assignTier({ q: 0.001, stable: true, oosPass: false }).reasonVi).toContain('ngoài mẫu');
  });
  it('a stock never outranks its sector', () => {
    expect(stockTier('A', true)).toBe('A');
    expect(stockTier('A', false)).toBe('B');
    expect(stockTier('B', true)).toBe('B');
    expect(stockTier('B', false)).toBe('C');
    expect(stockTier('C', true)).toBe('C');
    expect(summarizeTiers(['A', 'B', 'B', 'C'])).toEqual({ A: 1, B: 2, C: 1 });
  });
});

const exposure = (over: Partial<StockExposure> = {}): StockExposure => ({
  code: 'X', sectorId: 'S_SEAFOOD', revenueByRegion: { VN: 50, US: 30, EU: 15, CN: 5 }, commodityCostShare: 0.3, fxRevenueShare: 0.5, fxDebtShare: 0.2,
  asOfPeriod: '2026-03', sourceRef: 'BCTC [kỳ]', ...over,
});

describe('transmission by exposure', () => {
  it('derives channel exposures from reported facts', () => {
    const c = channelExposure(exposure());
    expect(c.export_demand).toBeCloseTo(0.5, 12);
    expect(c.policy_trade).toBeCloseTo(0.3, 12);
    expect(c.fx_rates).toBeCloseTo(0.3, 12);
    expect(c.commodity).toBeCloseTo(0.3, 12);
  });
  it('more US revenue → larger loss under a trade-policy shock; ranking is ascending by score', () => {
    const lo = exposure({ code: 'LO', revenueByRegion: { VN: 90, US: 5, EU: 5 } });
    const hi = exposure({ code: 'HI', revenueByRegion: { VN: 40, US: 50, EU: 10 } });
    const shocks = { policy_trade: 1.5 };
    expect(scenarioEffect(hi, shocks).score).toBeLessThan(scenarioEffect(lo, shocks).score);
    expect(rankStocks([lo, hi], shocks).map((r) => r.code)).toEqual(['HI', 'LO']);
  });
  it('natural hedge: foreign-currency earners benefit from a stronger USD, net foreign-currency borrowers lose', () => {
    const earner = exposure({ code: 'E', fxRevenueShare: 0.6, fxDebtShare: 0.1 });
    const borrower = exposure({ code: 'B', fxRevenueShare: 0.05, fxDebtShare: 0.5 });
    expect(scenarioEffect(earner, { fx_rates: 1 }).score).toBeGreaterThan(0);
    expect(scenarioEffect(borrower, { fx_rates: 1 }).score).toBeLessThan(0);
  });
  it('is always labelled tier C and ignores channels without a shock', () => {
    const r = scenarioEffect(exposure(), { commodity: 1 });
    expect(r.tier).toBe('C');
    expect(Object.keys(r.byChannel)).toEqual(['commodity']);
  });
});

describe('data specification', () => {
  const okEvent = { id: 'e1', kind: 'surprise', type: 'trade_policy', titleVi: 'Thuế quan mới', tsUtc: '2026-03-05T09:30:00Z', region: 'US', sectorsHint: ['S_SEAFOOD'], polarityHint: -1, source: { name: 'Nguồn' } };
  it('validates events and explains each problem', () => {
    expect(validateWorldEvent(okEvent)).toEqual([]);
    expect(validateWorldEvent({ ...okEvent, tsUtc: '05/03/2026' })).toHaveLength(1);
    expect(validateWorldEvent({ ...okEvent, type: 'x', sectorsHint: ['NOPE'] }).length).toBe(2);
    expect(validateWorldEvent({ ...okEvent, extraction: { method: 'llm', confidence: 0.5, reviewed: false } })[0]).toContain('kiểm duyệt');
    expect(validateWorldEvent({ ...okEvent, extraction: { method: 'llm', confidence: 0.5, reviewed: true } })).toEqual([]);
    expect(validateWorldEvent('x')).toHaveLength(1);
  });
  it('validates stock exposures (shares must add up, sources are required)', () => {
    expect(validateStockExposure(exposure())).toEqual([]);
    expect(validateStockExposure(exposure({ revenueByRegion: { VN: 50, US: 20 } }))[0]).toContain('100%');
    expect(validateStockExposure(exposure({ fxDebtShare: 1.5 }))).toHaveLength(1);
    expect(validateStockExposure(exposure({ sourceRef: '' }))).toHaveLength(1);
    expect(validateStockExposure(exposure({ asOfPeriod: '2026-3' }))).toHaveLength(1);
  });
  it('catalogs are consistent with the macro catalog', () => {
    const ids = new Set(VN_CATALOG.map((m) => m.id));
    WORLD_EXTRA_FACTORS.forEach((m) => expect(ids.has(m.id)).toBe(false));
    WORLD_FACTOR_IDS.forEach((id) => expect(ids.has(id) || WORLD_EXTRA_FACTORS.some((m) => m.id === id)).toBe(true));
    expect(Object.keys(WORLD_FACTOR_INFO).length).toBe(13);
    expect(SECTOR_TARGETS).toHaveLength(VN_SECTORS.length);
    expect(WORLD_DDL).toContain('event_reaction');
    expect(WORLD_DDL).toContain('evidence_link');
  });
});
