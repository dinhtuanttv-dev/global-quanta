import { describe, it, expect } from 'vitest';
import {
  InMemoryVintageStore, addMonths, buildDataset, checkQuality, estimateAsOf, importSeriesCsv, normalizePeriod,
  parseCsv, parseNumber, periodFromIndex, periodIndex, toMonthly, toMacroSeries, VN_CATALOG, MACRO_DDL,
} from './macro-data';
import { makeSyntheticStore } from './macro-seed';

describe('periods and dates', () => {
  it('period arithmetic round-trips and crosses years', () => {
    expect(addMonths('2024-11', 3)).toBe('2025-02');
    expect(addMonths('2024-01', -1)).toBe('2023-12');
    expect(periodFromIndex(periodIndex('2019-07'))).toBe('2019-07');
  });
  it('normalises Vietnamese and ISO spellings', () => {
    for (const s of ['2024-03', '2024/3', '03/2024', '3/2024', '15/03/2024', '2024-03-15', 'Tháng 3/2024', 'T3/2024', 'thang 3/2024'])
      expect(normalizePeriod(s)).toBe('2024-03');
    expect(normalizePeriod('13/2024')).toBe(null);
    expect(normalizePeriod('abc')).toBe(null);
  });
  it('estimated publication date applies lag and release day', () => {
    expect(estimateAsOf('2024-03', 1, 6)).toBe('2024-05-06');
    expect(estimateAsOf('2024-12', 0, 1)).toBe('2025-01-01');
  });
});

describe('number and CSV parsing', () => {
  it('handles vi / en / auto locales', () => {
    expect(parseNumber('1.234,56', 'vi')).toBeCloseTo(1234.56, 10);
    expect(parseNumber('1,234.56', 'en')).toBeCloseTo(1234.56, 10);
    expect(parseNumber('1.234,56')).toBeCloseTo(1234.56, 10);
    expect(parseNumber('1,234.56')).toBeCloseTo(1234.56, 10);
    expect(parseNumber('3,25%')).toBeCloseTo(3.25, 10);
    expect(parseNumber('1.234', 'vi')).toBe(1234);
    expect(parseNumber('(2,5)', 'vi')).toBeCloseTo(-2.5, 10);
  });
  it('blank markers become NaN', () => {
    for (const s of ['', '-', '..', 'N/A', ' ']) expect(parseNumber(s)).toBeNaN();
  });
  it('CSV parser handles quotes, embedded commas and CRLF', () => {
    const rows = parseCsv('a,b\r\n"x, y","he said ""hi"""\r\n\r\n3,4\r\n');
    expect(rows).toEqual([['a', 'b'], ['x, y', 'he said "hi"'], ['3', '4']]);
  });
  it('daily → monthly keeps the last observation of each month, or the mean', () => {
    const pts = [
      { date: '2024-01-02', value: 10 }, { date: '2024-01-31', value: 14 }, { date: '2024-01-15', value: 12 },
      { date: '15/02/2024', value: 20 }, { date: '28/02/2024', value: 22 },
    ];
    expect(toMonthly(pts, 'last').map((m) => m.value)).toEqual([14, 22]);
    expect(toMonthly(pts, 'mean')[0].value).toBeCloseTo(12, 10);
  });
  it('importSeriesCsv parses a Vietnamese CSV and counts rejected rows', () => {
    const meta = VN_CATALOG.find((m) => m.id === 'CPI')!;
    const csv = 'Kỳ,CPI\nTháng 1/2024,"3,37"\nTháng 2/2024,"3,98"\nTháng 3/2024,-\nrác,1\n';
    const r = importSeriesCsv({ csv, meta, locale: 'vi' });
    expect(r.observations.map((o) => [o.period, o.value])).toEqual([['2024-01', 3.37], ['2024-02', 3.98]]);
    expect(r.rejectedRows).toBe(2);
    expect(r.observations[0].asOf).toBe('2024-03-06');
  });
});

describe('vintage store', () => {
  it('returns the latest revision known as of a date and hides the future', () => {
    const s = new InMemoryVintageStore();
    s.upsert([
      { seriesId: 'X', period: '2024-01', value: 1, asOf: '2024-02-10' },
      { seriesId: 'X', period: '2024-01', value: 1.5, asOf: '2024-03-10' }, // revision
      { seriesId: 'X', period: '2024-02', value: 2, asOf: '2024-03-10' },
    ]);
    expect(s.getSeries('X', '2024-02-15')).toEqual([{ period: '2024-01', value: 1 }]);
    expect(s.getSeries('X', '2024-03-10')).toEqual([{ period: '2024-01', value: 1.5 }, { period: '2024-02', value: 2 }]);
    expect(s.getSeries('X', '2024-01-01')).toEqual([]);
    expect(s.getSeries('X')).toHaveLength(2);
  });
  it('dataVersion changes on every write and invalid input is rejected', () => {
    const s = new InMemoryVintageStore();
    const v0 = s.dataVersion();
    s.upsert([{ seriesId: 'X', period: '2024-01', value: 1, asOf: '2024-02-10' }]);
    expect(s.dataVersion()).not.toBe(v0);
    expect(() => s.upsert([{ seriesId: 'X', period: '2024-13', value: 1, asOf: '2024-02-10' }])).toThrow();
    expect(() => s.upsert([{ seriesId: 'X', period: '2024-01', value: 1, asOf: '10/02/2024' }])).toThrow();
  });
  it('buildDataset aligns on the intersection and marks gaps as NaN', () => {
    const s = new InMemoryVintageStore();
    s.upsert([
      { seriesId: 'A', period: '2024-01', value: 1, asOf: '2024-02-01' },
      { seriesId: 'A', period: '2024-02', value: 2, asOf: '2024-03-01' },
      { seriesId: 'A', period: '2024-04', value: 4, asOf: '2024-05-01' },
      { seriesId: 'B', period: '2024-02', value: 20, asOf: '2024-03-01' },
      { seriesId: 'B', period: '2024-03', value: 30, asOf: '2024-04-01' },
      { seriesId: 'B', period: '2024-04', value: 40, asOf: '2024-05-01' },
    ]);
    const ds = buildDataset(s, ['A', 'B']);
    expect(ds.dates).toEqual(['2024-02', '2024-03', '2024-04']);
    expect(ds.series.A[0]).toBe(2);
    expect(ds.series.A[1]).toBeNaN();
    expect(ds.series.B).toEqual([20, 30, 40]);
    expect(buildDataset(s, ['A', 'B'], '2024-03-15').dates).toEqual(['2024-02', '2024-02'].slice(0, 1));
  });
  it('toMacroSeries copies kind and publication lag from the catalog', () => {
    const store = makeSyntheticStore(1);
    const ds = buildDataset(store, ['CPI', 'VNINDEX']);
    const ms = toMacroSeries(ds, VN_CATALOG, ['CPI', 'VNINDEX']);
    expect(ms.find((m) => m.id === 'CPI')?.pubLagMonths).toBe(1);
    expect(ms.find((m) => m.id === 'VNINDEX')?.kind).toBe('index');
    expect(toMacroSeries(ds, VN_CATALOG, ['CPI'], { ignorePubLag: true })[0].pubLagMonths).toBe(0);
  });
});

describe('quality checks', () => {
  const mk = (n: number, f: (i: number) => number) => Array.from({ length: n }, (_, i) => ({ period: addMonths('2015-01', i), value: f(i) }));
  const idx = VN_CATALOG.find((m) => m.id === 'VNINDEX')!;
  it('flags short, gappy, outlier, stale and non-positive series', () => {
    expect(checkQuality('X', mk(20, (i) => 100 + i), idx).some((q) => q.code === 'too-short' && q.severity === 'error')).toBe(true);
    const gappy = mk(80, (i) => 100 + i).filter((_, i) => i !== 30 && i !== 31);
    expect(checkQuality('X', gappy, idx).some((q) => q.code === 'gap')).toBe(true);
    const spike = mk(80, (i) => 1000 + 5 * Math.sin(i)).map((p, i) => (i === 40 ? { ...p, value: p.value * 10 } : p));
    expect(checkQuality('X', spike, idx).filter((q) => q.code === 'outlier').length).toBeGreaterThan(0);
    expect(checkQuality('X', mk(80, (i) => 100 + i), idx, '2023-01').some((q) => q.code === 'stale')).toBe(true);
    expect(checkQuality('X', mk(80, (i) => i - 5), idx).some((q) => q.code === 'non-positive')).toBe(true);
  });
  it('step-like series (a policy rate held for months) do not trigger false outliers', () => {
    const fed = VN_CATALOG.find((m) => m.id === 'FED')!;
    const stepped = mk(100, (i) => (i < 40 ? 0.25 : i < 70 ? 1.5 : 4.5));
    expect(checkQuality('FED', stepped, fed, '2023-04').filter((q) => q.code === 'outlier')).toHaveLength(0);
  });
  it('a repeating pattern whose median deviation is zero is not flagged either', () => {
    const cpi = VN_CATALOG.find((m) => m.id === 'CPI')!;
    expect(checkQuality('CPI', mk(72, (i) => 3 + (i % 7) / 10), cpi, '2021-01').filter((q) => q.code === 'outlier')).toHaveLength(0);
  });
  it('a real spike is still caught in a smooth series', () => {
    const smooth = mk(100, (i) => 1000 * Math.exp(0.004 * i + 0.01 * Math.sin(i))).map((p, i) => (i === 60 ? { ...p, value: p.value * 8 } : p));
    expect(checkQuality('X', smooth, idx).filter((q) => q.code === 'outlier').length).toBeGreaterThan(0);
  });
  it('a clean series raises nothing serious', () => {
    const clean = mk(120, (i) => 100 * Math.exp(0.005 * i + 0.02 * Math.sin(i * 1.7)));
    expect(checkQuality('X', clean, idx, '2024-12').filter((q) => q.severity !== 'info')).toHaveLength(0);
  });
});

describe('schema and catalog', () => {
  it('catalog has unique ids, 6 HOSE targets and the paper\'s 6 factors', () => {
    const ids = VN_CATALOG.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(VN_CATALOG.filter((m) => m.role === 'target')).toHaveLength(6);
    for (const f of ['CPI', 'IR', 'M2', 'EX', 'IO', 'FDI']) expect(ids.includes(f)).toBe(true);
  });
  it('DDL keeps observations append-only keyed by as_of', () => {
    expect(MACRO_DDL.includes('PRIMARY KEY (series_id, period, as_of)')).toBe(true);
  });
});
