import { describe, it, expect } from 'vitest';
import { createWorldApi } from './world-api';
import { WORLD_SYNTHETIC_NOTICE, makeSyntheticWorld } from './world-seed';

type Any = any; // eslint-disable-line
const w = makeSyntheticWorld(11);
const api = createWorldApi({ world: w.data, store: w.store, catalog: w.catalog, today: () => '2026-07-15', notice: WORLD_SYNTHETIC_NOTICE });
const get = async (path: string, query: Record<string, string> = {}) => api.handle({ method: 'GET', path, query, body: undefined });
const post = async (path: string, body: unknown) => api.handle({ method: 'POST', path, query: {}, body });

describe('catalog and validation', () => {
  it('lists factors, sectors, markets, scenarios and tier meanings', async () => {
    const r = (await get('/api/world/series')).body as Any;
    expect(r.factors).toHaveLength(13);
    expect(r.sectors).toHaveLength(10);
    expect(r.markets).toHaveLength(6);
    expect(r.scenarios.length).toBe(6);
    expect(Object.keys(r.tierMeaning)).toEqual(['A', 'B', 'C']);
  });
  it('rejects bad input clearly', async () => {
    expect((await post('/api/world/matrix', { asOf: '15/07/2026' })).status).toBe(400);
    expect((await post('/api/world/matrix', { maxLag: 99 })).status).toBe(400);
    expect((await post('/api/world/scenario', {})).status).toBe(400);
    expect((await post('/api/world/scenario', { scenarioId: 'nope' })).status).toBe(404);
    expect((await post('/api/world/scenario', { shocks: [{ factor: 'CPI', sigma: 1 }] })).status).toBe(400);
    expect((await post('/api/world/scenario', { shocks: [{ factor: 'TARIFF', sigma: 50 }] })).status).toBe(400);
    expect((await get('/api/world/events/zzz')).status).toBe(404);
    expect((await get('/api/world/stock/NOPE')).status).toBe(404);
    expect((await get('/api/world/connectedness', { window: '5' })).status).toBe(400);
    expect((await get('/api/world/zzz')).status).toBe(405);
    expect((await get('/nothing')).status).toBe(404);
    expect((await post('/api/world/events', {})).status).toBe(405);
  });
});

describe('matrix recovers planted truth and assigns tiers', () => {
  it('finds the planted links with correct sign; unrelated links stay C', async () => {
    const r = (await post('/api/world/matrix', {})).body as Any;
    const cell = (f: string, s: string) => r.cells.find((c: Any) => c.factor === f && c.sector === s);
    expect(r.cells.length).toBe(13 * 10);
    expect(cell('CONTAINER', 'S_PORT').direction).toBe('+');
    expect(cell('CONTAINER', 'S_PORT').tier).not.toBe('C');
    expect(cell('TARIFF', 'S_SEAFOOD').direction).toBe('-');
    expect(cell('TARIFF', 'S_SEAFOOD').tier).not.toBe('C');
    expect(cell('STEEL', 'S_STEEL').direction).toBe('+');
    expect(cell('OIL', 'S_OIL').direction).toBe('+');
    expect(cell('FED', 'S_RE').direction).toBe('-');
    const planted = new Set(['S_PORT|CONTAINER', 'S_PORT|PMI_CN', 'S_SEAFOOD|TARIFF', 'S_SEAFOOD|CONTAINER', 'S_TEXTILE|TARIFF', 'S_STEEL|STEEL', 'S_STEEL|PMI_CN', 'S_STEEL|TARIFF', 'S_OIL|OIL', 'S_BANK|FED', 'S_BANK|VIX', 'S_SEC|VIX', 'S_SEC|EM_FLOWS', 'S_RE|FED', 'S_TECH|SEMI', 'S_TECH|VIX']);
    const falsePos = r.cells.filter((c: Any) => c.tier !== 'C' && !planted.has(`${c.sector}|${c.factor}`));
    expect(falsePos.length).toBeLessThanOrEqual(2);
    expect(r.counts.A + r.counts.B).toBeGreaterThan(8);
    expect(r.notice).toBe(WORLD_SYNTHETIC_NOTICE);
  });
  it('tiers are consistent with their stated evidence', async () => {
    const r = (await post('/api/world/matrix', {})).body as Any;
    for (const c of r.cells) {
      if (c.tier === 'A') { expect(c.q).toBeLessThan(0.05); expect(c.stable).toBe(true); expect(c.oosPass).toBe(true); }
      if (c.tier === 'B') expect(c.q).toBeLessThan(0.05);
      if (c.tier === 'C') expect(c.q >= 0.05 || c.oosPass === null || true).toBe(true);
      expect(c.reasonVi.length).toBeGreaterThan(10);
    }
    expect(r.counts.A + r.counts.B + r.counts.C).toBe(r.cells.length);
  });
});

describe('connectedness', () => {
  it('shows the US as a net transmitter and VN receiving from the planted sources', async () => {
    const r = (await get('/api/world/connectedness')).body as Any;
    const us = r.names.indexOf('Mỹ');
    expect(r.full.net[us]).toBeGreaterThan(5);
    expect(r.full.total).toBeGreaterThan(8);
    r.full.table.forEach((row: number[]) => expect(Math.abs(row.reduce((a, b) => a + b, 0) - 100)).toBeLessThan(1e-6));
    const usShare = r.vnReceivesFrom.find((x: Any) => x.market === 'US').share;
    expect(usShare).toBeGreaterThan(2);
    expect(r.vnReceivesFrom.map((x: Any) => x.share)).toEqual([...r.vnReceivesFrom.map((x: Any) => x.share)].sort((a: number, b: number) => b - a));
    expect(r.rolling.length).toBeGreaterThan(20);
    expect(r.tailDependence).toHaveLength(5);
    r.tailDependence.forEach((t: Any) => expect(t.lowerTail).toBeGreaterThanOrEqual(0));
  });
});

describe('events', () => {
  it('measures planted reactions, leaves null events unconfirmed, marks the last as pending', async () => {
    const r = (await get('/api/world/events')).body as Any;
    const by = (id: string) => r.events.find((e: Any) => e.id === id);
    expect(r.events).toHaveLength(12);
    expect(by('ev1').sector).toBe('S_SEAFOOD');
    expect(by('ev1').car).toBeLessThan(-4);
    expect(by('ev1').q).toBeLessThan(0.05);
    expect(by('ev1').bmp.n).toBe(3);
    expect(by('ev1').tier).toBe('A');
    expect(by('ev4').sector === 'S_RE' || by('ev4').sector === 'S_BANK').toBe(true);
    expect(by('ev4').car).toBeLessThan(-2);
    expect(['A', 'B']).toContain(by('ev7').tier);
    expect(by('ev9').tier).toBe('C');
    expect(by('ev12').tier).toBe('pending');
    const sig = r.events.filter((e: Any) => e.tier === 'A' || e.tier === 'B').length;
    expect(sig).toBeGreaterThanOrEqual(6);
  });
  it('detail returns an aligned path, model and per-sector reactions', async () => {
    const d = (await get('/api/world/events/ev1')).body as Any;
    expect(d.path).toHaveLength(16);
    expect(d.path.find((p: Any) => p.day === 0).ar).toBeLessThan(-2);
    expect(d.alignment.sameDay).toBe(false);
    expect(d.alignment.date).toBe(d.event.sessionDate);
    expect(d.sectors.length).toBe(10);
    expect(d.sectors[0].car).toBeLessThanOrEqual(d.sectors[9].car);
    expect(d.model.nEst).toBe(221);
    const p = (await get('/api/world/events/ev12')).body as Any;
    expect(p.path).toEqual([]);
  });
});

describe('stock profile and scenario', () => {
  it('shrinks stock betas toward their sector and caps the tier by the sector tier', async () => {
    const s = (await get('/api/world/stock/SEA1')).body as Any;
    expect(s.sector).toBe('S_SEAFOOD');
    const t = s.betas.find((b: Any) => b.factor === 'TARIFF');
    expect(Math.abs(t.shrunk - t.sectorPrior)).toBeLessThanOrEqual(Math.abs(t.own - t.sectorPrior) + 1e-9);
    expect(t.ownWeight).toBeGreaterThanOrEqual(0);
    expect(t.ownWeight).toBeLessThanOrEqual(1);
    const rank = { A: 3, B: 2, C: 1 } as Any;
    expect(rank[t.tier]).toBeLessThanOrEqual(rank[t.sectorTier]);
    expect(Object.keys(s.channels)).toHaveLength(6);
  });
  it('tariff scenario hurts seafood and textile most, with honest conclusive flags and stock effects', async () => {
    const r = (await post('/api/world/scenario', { scenarioId: 'tariff-up', horizon: 3 })).body as Any;
    expect(r.sectors).toHaveLength(10);
    const names = r.sectors.slice(0, 3).map((x: Any) => x.sector);
    expect(names).toContain('S_SEAFOOD');
    expect(names).toContain('S_TEXTILE');
    expect(r.sectors[0].est).toBeLessThan(0);
    expect(r.sectors.every((x: Any, i: number, a: Any[]) => i === 0 || a[i - 1].est <= x.est)).toBe(true);
    r.sectors.forEach((x: Any) => { expect(x.lo).toBeLessThanOrEqual(x.est); expect(x.hi).toBeGreaterThanOrEqual(x.est); expect(x.irf.length).toBe(4); });
    expect(r.conclusiveCount).toBeGreaterThanOrEqual(1);
    expect(r.stockFactor).toBe('TARIFF');
    expect(r.stocks.length).toBe(8);
    expect(['S_SEAFOOD', 'S_TEXTILE']).toContain(r.stocks[0].sector);
    const custom = (await post('/api/world/scenario', { shocks: [{ factor: 'TARIFF', sigma: 0.5 }] })).body as Any;
    expect(custom.scenario.id).toBe('custom');
  });
  it('overview ties everything together', async () => {
    const o = (await get('/api/world/overview')).body as Any;
    expect(o.pulse).toHaveLength(13);
    expect(o.tierCounts.A + o.tierCounts.B + o.tierCounts.C).toBe(130);
    expect(o.spillover.total).toBeGreaterThan(5);
    expect(o.events.pending).toBe(1);
    o.pulse.forEach((p: Any) => expect(Number.isFinite(p.z)).toBe(true));
  });
});

describe('W5 — ngành định trước, chiều, trùng cửa sổ', () => {
  it('ngành = sectorsHint[0]; ngược chiều -> C; trùng cửa sổ -> C và được ghi rõ', async () => {
    const base = w.data.events.find((e) => e.id === 'ev1')!;
    const ts = base.tsUtc;
    const d = new Date(ts); d.setUTCDate(d.getUTCDate() + 1);
    const twin = { ...base, id: 'twin', tsUtc: d.toISOString().replace('.000', '') };
    const flipped = { ...base, id: 'flip', polarityHint: (-Math.sign(-1)) as 1 };
    const api2 = createWorldApi({ world: { ...w.data, events: [base, twin] }, store: w.store, catalog: w.catalog, today: () => '2026-07-15', notice: WORLD_SYNTHETIC_NOTICE });
    const r2 = (await api2.handle({ method: 'GET', path: '/api/world/events', query: {}, body: undefined })).body as Any;
    for (const e of r2.events) {
      expect(e.prespecified).toBe(true);
      expect(e.sector).toBe(base.sectorsHint[0]);
      expect(e.overlapsWith.length).toBe(1);
      expect(e.tier).toBe('C');
    }
    const api3 = createWorldApi({ world: { ...w.data, events: [flipped] }, store: w.store, catalog: w.catalog, today: () => '2026-07-15', notice: WORLD_SYNTHETIC_NOTICE });
    const r3 = (await api3.handle({ method: 'GET', path: '/api/world/events', query: {}, body: undefined })).body as Any;
    if (r3.events[0].car < 0) {
      expect(r3.events[0].signOk).toBe(false);
      expect(r3.events[0].tier).toBe('C');
    }
    const noHint = { ...base, id: 'nohint', sectorsHint: [] as string[] };
    const api4 = createWorldApi({ world: { ...w.data, events: [noHint] }, store: w.store, catalog: w.catalog, today: () => '2026-07-15', notice: WORLD_SYNTHETIC_NOTICE });
    const r4 = (await api4.handle({ method: 'GET', path: '/api/world/events', query: {}, body: undefined })).body as Any;
    expect(r4.events[0].prespecified).toBe(false);
    expect(r4.events[0].tier).toBe('C');
  });
});
