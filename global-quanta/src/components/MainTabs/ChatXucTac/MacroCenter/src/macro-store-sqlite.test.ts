// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SqliteVintageStore } from './macro-store-sqlite';
import { InMemoryVintageStore, VN_CATALOG, addMonths, type Observation } from './macro-data';
import { importCsvInto, parseArgs } from './macro-import';
import { createMacroApi } from './macro-api';
import { makeSyntheticStore } from './macro-seed';
import { mulberry32 } from './quant-macro';

type Any = any; // eslint-disable-line

describe('SQLite vintage store', () => {
  it('behaves exactly like the in-memory store under random writes, revisions and as-of reads', () => {
    const rng = mulberry32(5);
    const a = new InMemoryVintageStore();
    const b = new SqliteVintageStore();
    const obs: Observation[] = [];
    for (let i = 0; i < 400; i++) {
      const period = addMonths('2018-01', Math.floor(rng() * 40));
      const asOf = `${addMonths('2018-01', Math.floor(rng() * 50)).slice(0, 7)}-${String(1 + Math.floor(rng() * 27)).padStart(2, '0')}`;
      obs.push({ seriesId: rng() < 0.5 ? 'X' : 'Y', period, value: Math.round(rng() * 1000) / 10, asOf });
    }
    for (let i = 0; i < obs.length; i += 50) {
      a.upsert(obs.slice(i, i + 50));
      b.upsert(obs.slice(i, i + 50));
    }
    for (const id of ['X', 'Y', 'Z'])
      for (const asOf of ['2018-02-15', '2019-06-01', '2020-12-31', undefined]) expect(b.getSeries(id, asOf)).toEqual(a.getSeries(id, asOf));
    expect(b.seriesIds()).toEqual(['X', 'Y']);
    b.close();
  });
  it('persists across reopen and bumps the version on every write, including same-key corrections', () => {
    const dir = mkdtempSync(join(tmpdir(), 'macro-'));
    const path = join(dir, 'macro.db');
    const s1 = new SqliteVintageStore(path);
    const v0 = s1.dataVersion();
    s1.upsert([{ seriesId: 'X', period: '2024-01', value: 1, asOf: '2024-02-10' }]);
    const v1 = s1.dataVersion();
    s1.upsert([{ seriesId: 'X', period: '2024-01', value: 1.25, asOf: '2024-02-10' }]);
    const v2 = s1.dataVersion();
    expect(new Set([v0, v1, v2]).size).toBe(3);
    s1.close();
    const s2 = new SqliteVintageStore(path);
    expect(s2.getSeries('X')).toEqual([{ period: '2024-01', value: 1.25 }]);
    expect(s2.dataVersion()).toBe(v2);
    s2.close();
    rmSync(dir, { recursive: true, force: true });
  });
  it('validates input and rolls back a failing batch atomically', () => {
    const s = new SqliteVintageStore();
    expect(() => s.upsert([{ seriesId: 'X', period: '2024-13', value: 1, asOf: '2024-02-10' }])).toThrow();
    expect(() => s.upsert([{ seriesId: 'X', period: '2024-01', value: 1, asOf: '10/02/2024' }])).toThrow();
    expect(s.getSeries('X')).toEqual([]);
    const v = s.dataVersion();
    s.upsert([{ seriesId: 'X', period: '2024-01', value: NaN, asOf: '2024-02-10' }]);
    expect(s.getSeries('X')).toEqual([]);
    expect(s.dataVersion()).not.toBe(v);
    s.close();
  });
  it('drives the whole API with the same answers as the in-memory store', async () => {
    const mem = makeSyntheticStore(2024);
    const sql = new SqliteVintageStore();
    for (const m of VN_CATALOG) {
      const pts = mem.getSeries(m.id);
      sql.upsert(pts.map((p) => ({ seriesId: m.id, period: p.period, value: p.value, asOf: '2000-01-01' })));
    }
    const a = createMacroApi({ store: mem, today: () => '2026-07-15' });
    const b = createMacroApi({ store: sql, today: () => '2026-07-15' });
    const ra = (await a.handle({ method: 'POST', path: '/api/macro/scenario', query: {}, body: { scenarioId: 'easing', horizon: 3, asOf: '2030-01-01' } })).body as Any;
    const rb = (await b.handle({ method: 'POST', path: '/api/macro/scenario', query: {}, body: { scenarioId: 'easing', horizon: 3, asOf: '2030-01-01' } })).body as Any;
    expect(rb.ranking.map((x: Any) => x.target)).toEqual(ra.ranking.map((x: Any) => x.target));
    expect(rb.ranking[0].est).toBeCloseTo(ra.ranking[0].est, 8);
    sql.close();
  });
});

describe('CSV import and CLI helpers', () => {
  const cpi = VN_CATALOG.find((m) => m.id === 'CPI')!;
  it('imports a Vietnamese CSV, reports counts and quality issues', () => {
    const store = new InMemoryVintageStore();
    const csv = ['Kỳ,CPI', ...Array.from({ length: 30 }, (_, i) => `${addMonths('2022-01', i)},"${(3 + (i % 5) / 10).toFixed(2).replace('.', ',')}"`), 'rác,1'].join('\n');
    const r = importCsvInto(store, csv, cpi, { locale: 'vi', today: '2024-09-01' });
    expect(r.inserted).toBe(30);
    expect(r.rejectedRows).toBe(1);
    expect(r.firstPeriod).toBe('2022-01');
    expect(r.lastPeriod).toBe('2024-06');
    expect(r.issues.some((i) => i.code === 'too-short')).toBe(true);
    expect(r.hasErrors).toBe(true); // 30 months is below the 36-month hard minimum
    expect(store.getSeries('CPI')[0].value).toBeCloseTo(3, 10);
    const longCsv = ['Kỳ,CPI', ...Array.from({ length: 72 }, (_, i) => `${addMonths('2018-01', i)},"${(3 + (i % 7) / 10).toFixed(2).replace('.', ',')}"`)].join('\n');
    const ok = importCsvInto(new InMemoryVintageStore(), longCsv, cpi, { locale: 'vi', today: '2024-02-01' });
    expect(ok.hasErrors).toBe(false);
    expect(ok.issues.filter((i) => i.severity !== 'info')).toHaveLength(0);
  });
  it('re-importing a revised file keeps history (revisions are new rows only with a new as-of)', () => {
    const store = new InMemoryVintageStore();
    importCsvInto(store, 'p,v\n2024-01,3.0\n', cpi, { asOf: '2024-03-06' });
    importCsvInto(store, 'p,v\n2024-01,3.4\n', cpi, { asOf: '2024-04-06' });
    expect(store.getSeries('CPI', '2024-03-31')[0].value).toBe(3);
    expect(store.getSeries('CPI')[0].value).toBe(3.4);
  });
  it('parseArgs reads pairs and flags', () => {
    const a = parseArgs(['--db', 'x.db', '--demo', '--port', '9000', 'stray']);
    expect(a.values).toEqual({ db: 'x.db', port: '9000' });
    expect(a.flags.has('demo')).toBe(true);
  });
});
