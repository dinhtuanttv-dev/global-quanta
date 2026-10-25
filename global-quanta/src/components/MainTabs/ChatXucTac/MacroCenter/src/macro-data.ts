/**
 * macro-data.ts — P0 data layer for the macro center.
 *
 *  - SERIES CATALOG with kind (how to transform) and default publication lags
 *  - VINTAGE STORE: every observation carries the date it became known (`asOf`), so revisions are
 *    kept and any backtest can ask "what did we know on date D?" (no look-ahead, no silent restatement)
 *  - ETL helpers for Vietnamese-formatted sources (decimal comma, "Tháng 3/2024", dd/mm/yyyy)
 *  - data-quality checks (gaps, robust outliers, staleness, non-positive values for log series)
 *  - SQL DDL (PostgreSQL; also valid on SQLite except the COMMENT lines are plain SQL comments)
 */

import { isFiniteNum, type MacroSeries, type SeriesKind } from './quant-macro';

// ───────────────────────────── Catalog ─────────────────────────────

export interface SeriesMeta {
  id: string;
  nameVi: string;
  role: 'factor' | 'target';
  kind: SeriesKind;
  unit: string;
  source: string;
  /** default months between the reference month and publication — CONFIRM against each source */
  pubLagMonths: number;
  /** approximate day of month of the release (estimate used only for the calendar) */
  typicalReleaseDay: number;
  group: 'prices' | 'money' | 'external' | 'activity' | 'global' | 'market';
  capGroup?: 'broad' | 'large' | 'mid' | 'small';
}

export const VN_CATALOG: SeriesMeta[] = [
  { id: 'CPI', nameVi: 'Lạm phát (CPI, so cùng kỳ)', role: 'factor', kind: 'rate', unit: '%', source: 'GSO', pubLagMonths: 1, typicalReleaseDay: 6, group: 'prices' },
  { id: 'IR', nameVi: 'Lãi suất liên ngân hàng 1 tháng', role: 'factor', kind: 'rate', unit: '%/năm', source: 'NHNN', pubLagMonths: 0, typicalReleaseDay: 1, group: 'money' },
  { id: 'M2', nameVi: 'Cung tiền M2', role: 'factor', kind: 'level', unit: 'tỷ VND', source: 'NHNN', pubLagMonths: 2, typicalReleaseDay: 15, group: 'money' },
  { id: 'CREDIT', nameVi: 'Dư nợ tín dụng', role: 'factor', kind: 'level', unit: 'tỷ VND', source: 'NHNN', pubLagMonths: 1, typicalReleaseDay: 10, group: 'money' },
  { id: 'EX', nameVi: 'Tỷ giá USD/VND (liên ngân hàng)', role: 'factor', kind: 'level', unit: 'VND', source: 'NHNN', pubLagMonths: 0, typicalReleaseDay: 1, group: 'external' },
  { id: 'FDI', nameVi: 'FDI giải ngân', role: 'factor', kind: 'level', unit: 'triệu USD', source: 'GSO', pubLagMonths: 1, typicalReleaseDay: 6, group: 'external' },
  { id: 'EXPORT', nameVi: 'Kim ngạch xuất khẩu', role: 'factor', kind: 'level', unit: 'triệu USD', source: 'GSO', pubLagMonths: 1, typicalReleaseDay: 6, group: 'external' },
  { id: 'IO', nameVi: 'Chỉ số sản xuất công nghiệp (IIP)', role: 'factor', kind: 'level', unit: 'chỉ số', source: 'GSO', pubLagMonths: 1, typicalReleaseDay: 6, group: 'activity' },
  { id: 'PMI', nameVi: 'PMI sản xuất', role: 'factor', kind: 'rate', unit: 'điểm', source: 'S&P Global', pubLagMonths: 1, typicalReleaseDay: 1, group: 'activity' },
  { id: 'DXY', nameVi: 'Chỉ số USD (DXY)', role: 'factor', kind: 'level', unit: 'điểm', source: 'thị trường', pubLagMonths: 0, typicalReleaseDay: 1, group: 'global' },
  { id: 'FED', nameVi: 'Lãi suất điều hành Fed', role: 'factor', kind: 'rate', unit: '%/năm', source: 'Fed', pubLagMonths: 0, typicalReleaseDay: 1, group: 'global' },
  { id: 'OIL', nameVi: 'Giá dầu Brent', role: 'factor', kind: 'level', unit: 'USD/thùng', source: 'thị trường', pubLagMonths: 0, typicalReleaseDay: 1, group: 'global' },
  { id: 'VNINDEX', nameVi: 'VN-Index', role: 'target', kind: 'index', unit: 'điểm', source: 'HOSE', pubLagMonths: 0, typicalReleaseDay: 1, group: 'market', capGroup: 'broad' },
  { id: 'VN30', nameVi: 'VN30', role: 'target', kind: 'index', unit: 'điểm', source: 'HOSE', pubLagMonths: 0, typicalReleaseDay: 1, group: 'market', capGroup: 'large' },
  { id: 'VNMIDCAP', nameVi: 'VNMidcap', role: 'target', kind: 'index', unit: 'điểm', source: 'HOSE', pubLagMonths: 0, typicalReleaseDay: 1, group: 'market', capGroup: 'mid' },
  { id: 'VN100', nameVi: 'VN100', role: 'target', kind: 'index', unit: 'điểm', source: 'HOSE', pubLagMonths: 0, typicalReleaseDay: 1, group: 'market', capGroup: 'broad' },
  { id: 'VNSMALLCAP', nameVi: 'VNSmallcap', role: 'target', kind: 'index', unit: 'điểm', source: 'HOSE', pubLagMonths: 0, typicalReleaseDay: 1, group: 'market', capGroup: 'small' },
  { id: 'VNALLSHARE', nameVi: 'VNAllshare', role: 'target', kind: 'index', unit: 'điểm', source: 'HOSE', pubLagMonths: 0, typicalReleaseDay: 1, group: 'market', capGroup: 'broad' },
];

export const catalogById = (c: SeriesMeta[] = VN_CATALOG): Record<string, SeriesMeta> =>
  Object.fromEntries(c.map((m) => [m.id, m]));

// ───────────────────────────── Periods ─────────────────────────────

/** 'YYYY-MM' helpers (monthly data only). */
export const isPeriod = (s: string): boolean => /^\d{4}-(0[1-9]|1[0-2])$/.test(s);

export function periodIndex(p: string): number {
  const [y, m] = p.split('-').map(Number);
  return y * 12 + (m - 1);
}

export function periodFromIndex(i: number): string {
  const y = Math.floor(i / 12);
  const m = (i % 12) + 1;
  return `${y}-${String(m).padStart(2, '0')}`;
}

export const addMonths = (p: string, k: number): string => periodFromIndex(periodIndex(p) + k);

/** Estimated publication date (ISO) of a period given its lag and typical release day. */
export function estimateAsOf(period: string, pubLagMonths: number, releaseDay = 1): string {
  const p = addMonths(period, pubLagMonths + 1);
  return `${p}-${String(Math.min(Math.max(releaseDay, 1), 28)).padStart(2, '0')}`;
}

/**
 * Normalise many Vietnamese / ISO date spellings to 'YYYY-MM':
 * 2024-03, 2024/3, 03/2024, 3/2024, 15/03/2024, 2024-03-15, "Tháng 3/2024", "T3/2024".
 */
export function normalizePeriod(input: string): string | null {
  const s = input.trim();
  let m: RegExpMatchArray | null;
  const ok = (y: number, mo: number) => (mo >= 1 && mo <= 12 && y >= 1900 && y <= 2200 ? `${y}-${String(mo).padStart(2, '0')}` : null);
  if ((m = s.match(/^(\d{4})[-/](\d{1,2})(?:[-/]\d{1,2})?$/))) return ok(+m[1], +m[2]);
  if ((m = s.match(/^\d{1,2}[/-](\d{1,2})[/-](\d{4})$/))) return ok(+m[2], +m[1]);
  if ((m = s.match(/^(\d{1,2})[/-](\d{4})$/))) return ok(+m[2], +m[1]);
  if ((m = s.match(/^(?:th[áa]ng|t)\s*(\d{1,2})\s*[/-]\s*(\d{4})$/i))) return ok(+m[2], +m[1]);
  return null;
}

// ───────────────────────────── ETL parsing ─────────────────────────────

/** Minimal RFC-4180 CSV parser (quotes, escaped quotes, CRLF). */
export function parseCsv(text: string, delimiter = ','): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') inQ = false;
      else cell += c;
    } else if (c === '"') inQ = true;
    else if (c === delimiter) {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
}

/**
 * Number parser for Vietnamese and English formats.
 *  locale 'vi': '.' groups thousands, ',' is decimal  ("1.234,56")
 *  locale 'en': ',' groups thousands, '.' is decimal  ("1,234.56")
 *  locale 'auto': if both separators appear the LAST one is the decimal mark; a lone separator
 *  is read as decimal (so "1.234" → 1.234 — pass an explicit locale for thousands-only data).
 * Returns NaN for blanks, '-', 'n/a', '..'.
 */
export function parseNumber(raw: string, locale: 'vi' | 'en' | 'auto' = 'auto'): number {
  let s = raw.trim().replace(/[%\s\u00a0]/g, '');
  if (s === '' || /^(-|–|—|\.\.|n\/?a|nan|null)$/i.test(s)) return NaN;
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  const hasDot = s.includes('.');
  const hasComma = s.includes(',');
  let dec: '.' | ',' | null = null;
  if (locale === 'vi') dec = ',';
  else if (locale === 'en') dec = '.';
  else if (hasDot && hasComma) dec = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ',';
  else dec = hasComma ? ',' : hasDot ? '.' : null;
  if (dec === ',') s = s.replace(/\./g, '').replace(',', '.');
  else if (dec === '.') s = s.replace(/,/g, '');
  const v = Number(s);
  if (!Number.isFinite(v)) return NaN;
  return neg ? -v : v;
}

export interface RawPoint {
  date: string;
  value: number;
}

/** Collapse daily/irregular observations to month-end ('last') or monthly average ('mean'). */
export function toMonthly(points: RawPoint[], method: 'last' | 'mean' = 'last'): { period: string; value: number }[] {
  const byP = new Map<string, { last: { d: string; v: number }; sum: number; n: number }>();
  for (const pt of points) {
    if (!isFiniteNum(pt.value)) continue;
    const p = normalizePeriod(pt.date);
    if (!p) continue;
    const full = pt.date.trim();
    const cur = byP.get(p);
    if (!cur) byP.set(p, { last: { d: full, v: pt.value }, sum: pt.value, n: 1 });
    else {
      cur.sum += pt.value;
      cur.n++;
      if (isoOrder(full) >= isoOrder(cur.last.d)) cur.last = { d: full, v: pt.value };
    }
  }
  return [...byP.entries()]
    .sort((a, b) => periodIndex(a[0]) - periodIndex(b[0]))
    .map(([period, c]) => ({ period, value: method === 'last' ? c.last.v : c.sum / c.n }));
}

/** Sortable key for a date string in ISO or dd/mm/yyyy. */
function isoOrder(d: string): string {
  const m = d.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return d.padEnd(10, '0');
}

/** Parse a two-column CSV (period, value) into observations with estimated publication dates. */
export function importSeriesCsv(args: {
  csv: string;
  meta: SeriesMeta;
  locale?: 'vi' | 'en' | 'auto';
  delimiter?: string;
  hasHeader?: boolean;
  monthly?: 'last' | 'mean';
  /** when the source gives real release dates provide them; otherwise they are estimated */
  asOfOverride?: string;
}): { observations: Observation[]; rejectedRows: number } {
  const rows = parseCsv(args.csv, args.delimiter ?? ',');
  const body = args.hasHeader === false ? rows : rows.slice(1);
  const pts: RawPoint[] = [];
  let rejected = 0;
  for (const r of body) {
    const v = parseNumber(r[1] ?? '', args.locale ?? 'auto');
    if (!r[0] || !normalizePeriod(r[0]) || !Number.isFinite(v)) {
      rejected++;
      continue;
    }
    pts.push({ date: r[0], value: v });
  }
  const monthly = toMonthly(pts, args.monthly ?? 'last');
  const observations = monthly.map((m) => ({
    seriesId: args.meta.id,
    period: m.period,
    value: m.value,
    asOf: args.asOfOverride ?? estimateAsOf(m.period, args.meta.pubLagMonths, args.meta.typicalReleaseDay),
  }));
  return { observations, rejectedRows: rejected };
}

// ───────────────────────────── Vintage store ─────────────────────────────

export interface Observation {
  seriesId: string;
  period: string;
  value: number;
  /** ISO date (YYYY-MM-DD) on which this value became known */
  asOf: string;
}

export interface VintageStore {
  upsert(obs: Observation[]): void;
  /** values for each period as known on `asOf` (latest revision with asOf <= date) */
  getSeries(seriesId: string, asOf?: string): { period: string; value: number }[];
  seriesIds(): string[];
  /** changes whenever any observation is added or revised — use it as a cache key */
  dataVersion(): string;
}

export class InMemoryVintageStore implements VintageStore {
  private data = new Map<string, Map<string, Observation[]>>();
  private version = 0;

  upsert(obs: Observation[]): void {
    for (const o of obs) {
      if (!isPeriod(o.period)) throw new Error(`invalid period ${o.period}`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(o.asOf)) throw new Error(`invalid asOf ${o.asOf}`);
      if (!Number.isFinite(o.value)) continue;
      let s = this.data.get(o.seriesId);
      if (!s) this.data.set(o.seriesId, (s = new Map()));
      const list = s.get(o.period) ?? [];
      const same = list.findIndex((x) => x.asOf === o.asOf);
      if (same >= 0) list[same] = o;
      else list.push(o);
      s.set(o.period, list);
    }
    this.version++;
  }

  getSeries(seriesId: string, asOf = '9999-12-31'): { period: string; value: number }[] {
    const s = this.data.get(seriesId);
    if (!s) return [];
    const out: { period: string; value: number }[] = [];
    for (const [period, list] of s) {
      let best: Observation | null = null;
      for (const o of list) if (o.asOf <= asOf && (!best || o.asOf > best.asOf)) best = o;
      if (best) out.push({ period, value: best.value });
    }
    return out.sort((a, b) => periodIndex(a.period) - periodIndex(b.period));
  }

  seriesIds(): string[] {
    return [...this.data.keys()];
  }

  dataVersion(): string {
    return `v${this.version}`;
  }
}

export interface Dataset {
  dates: string[];
  series: Record<string, number[]>;
  asOf: string;
}

/**
 * Align series on a common monthly grid. Missing months inside the range become NaN (the engine
 * drops rows with NaN). The range runs from the latest first-period to the earliest last-period
 * of the requested series unless `fill` is 'union'.
 */
export function buildDataset(store: VintageStore, ids: string[], asOf = '9999-12-31', range: 'intersection' | 'union' = 'intersection'): Dataset {
  const raw = ids.map((id) => ({ id, pts: store.getSeries(id, asOf) })).filter((r) => r.pts.length > 0);
  if (raw.length === 0) return { dates: [], series: {}, asOf };
  const firsts = raw.map((r) => periodIndex(r.pts[0].period));
  const lasts = raw.map((r) => periodIndex(r.pts[r.pts.length - 1].period));
  const lo = range === 'intersection' ? Math.max(...firsts) : Math.min(...firsts);
  const hi = range === 'intersection' ? Math.min(...lasts) : Math.max(...lasts);
  if (hi < lo) return { dates: [], series: {}, asOf };
  const dates: string[] = [];
  for (let i = lo; i <= hi; i++) dates.push(periodFromIndex(i));
  const series: Record<string, number[]> = {};
  for (const r of raw) {
    const m = new Map(r.pts.map((p) => [p.period, p.value]));
    series[r.id] = dates.map((d) => m.get(d) ?? NaN);
  }
  return { dates, series, asOf };
}

/** Turn a dataset + catalog into inputs for analyzeMacro. */
export function toMacroSeries(ds: Dataset, catalog: SeriesMeta[], ids: string[], opts: { ignorePubLag?: boolean } = {}): MacroSeries[] {
  const by = catalogById(catalog);
  return ids
    .filter((id) => ds.series[id] && by[id])
    .map((id) => ({
      id,
      name: by[id].nameVi,
      values: ds.series[id],
      kind: by[id].kind,
      pubLagMonths: opts.ignorePubLag ? 0 : by[id].pubLagMonths,
    }));
}

// ───────────────────────────── Quality checks ─────────────────────────────

export type IssueCode = 'too-short' | 'gap' | 'outlier' | 'stale' | 'non-positive' | 'flat' | 'duplicate-period';

export interface QualityIssue {
  seriesId: string;
  code: IssueCode;
  severity: 'info' | 'warn' | 'error';
  message: string;
  period?: string;
}

/**
 * Robust z-score: (v - median) / (MAD / 0.6745). When more than half of the values equal the
 * median (MAD = 0) fall back to 1.2533 × mean absolute deviation; all-equal input gives zeros.
 */
function robustZ(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const med = sorted[Math.floor(sorted.length / 2)];
  const dev = values.map((v) => Math.abs(v - med));
  const mad = [...dev].sort((a, b) => a - b)[Math.floor(dev.length / 2)];
  let scale = mad / 0.6745;
  if (scale < 1e-12) scale = 1.2533 * (dev.reduce((s, d) => s + d, 0) / dev.length);
  if (scale < 1e-12) return values.map(() => 0);
  return values.map((v) => (v - med) / scale);
}

export function checkQuality(seriesId: string, pts: { period: string; value: number }[], meta?: SeriesMeta, nowPeriod?: string): QualityIssue[] {
  const issues: QualityIssue[] = [];
  if (pts.length < 60) issues.push({ seriesId, code: 'too-short', severity: pts.length < 36 ? 'error' : 'warn', message: `Chỉ có ${pts.length} quan sát tháng; nên có tối thiểu 60.` });
  const seen = new Set<string>();
  for (const p of pts) {
    if (seen.has(p.period)) issues.push({ seriesId, code: 'duplicate-period', severity: 'error', message: `Trùng kỳ ${p.period}.`, period: p.period });
    seen.add(p.period);
  }
  for (let i = 1; i < pts.length; i++) {
    const g = periodIndex(pts[i].period) - periodIndex(pts[i - 1].period);
    if (g > 1) issues.push({ seriesId, code: 'gap', severity: g > 3 ? 'error' : 'warn', message: `Thiếu ${g - 1} tháng giữa ${pts[i - 1].period} và ${pts[i].period}.`, period: pts[i].period });
  }
  if (pts.length >= 12) {
    const vals = pts.map((p) => p.value);
    const base = meta && meta.kind !== 'rate' && vals.every((v) => v > 0) ? vals.map(Math.log) : vals;
    // outliers are judged on first differences (levels trend, so a level z-score is meaningless)
    const diffs = base.slice(1).map((v, i) => v - base[i]);
    // step-like series (e.g. a policy rate held for months) have no meaningful "outlier" notion
    const stepwise = diffs.filter((d) => Math.abs(d) < 1e-12).length / diffs.length > 0.4;
    const z = stepwise ? diffs.map(() => 0) : robustZ(diffs);
    z.forEach((v, i) => {
      if (Math.abs(v) > 8) issues.push({ seriesId, code: 'outlier', severity: 'warn', message: `Biến động bất thường tại ${pts[i + 1].period} (robust z = ${v.toFixed(1)}); kiểm tra lỗi nhập hoặc đơn vị.`, period: pts[i + 1].period });
    });
    if (new Set(vals).size <= 2) issues.push({ seriesId, code: 'flat', severity: 'error', message: 'Chuỗi gần như không đổi.' });
  }
  if (meta && meta.kind !== 'rate' && pts.some((p) => p.value <= 0)) issues.push({ seriesId, code: 'non-positive', severity: 'warn', message: 'Có giá trị ≤ 0 trong chuỗi cần lấy log; engine sẽ dùng sai phân thường.' });
  if (nowPeriod && pts.length) {
    const lag = periodIndex(nowPeriod) - periodIndex(pts[pts.length - 1].period);
    const allowed = (meta?.pubLagMonths ?? 1) + 1;
    if (lag > allowed) issues.push({ seriesId, code: 'stale', severity: 'warn', message: `Dữ liệu mới nhất là ${pts[pts.length - 1].period}, đã chậm ${lag - allowed} tháng so với lịch công bố dự kiến.` });
  }
  return issues;
}

// ───────────────────────────── SQL schema ─────────────────────────────

export const MACRO_DDL = `-- Macro center storage (PostgreSQL). Observations are append-only: a revision is a new row
-- with a later as_of, never an UPDATE, so every past decision can be reproduced.
CREATE TABLE IF NOT EXISTS macro_series (
  id               text PRIMARY KEY,
  name_vi          text NOT NULL,
  role             text NOT NULL CHECK (role IN ('factor','target')),
  kind             text NOT NULL CHECK (kind IN ('index','level','rate')),
  unit             text NOT NULL,
  source           text NOT NULL,
  pub_lag_months   integer NOT NULL DEFAULT 1,
  typical_release_day integer NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS macro_observation (
  series_id  text NOT NULL REFERENCES macro_series(id),
  period     char(7) NOT NULL CHECK (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  value      double precision NOT NULL,
  as_of      date NOT NULL,
  source_ref text,
  PRIMARY KEY (series_id, period, as_of)
);
CREATE INDEX IF NOT EXISTS macro_observation_asof ON macro_observation (series_id, as_of);

-- value of each period as known on :as_of
CREATE OR REPLACE VIEW macro_known_on AS
SELECT DISTINCT ON (series_id, period) series_id, period, value, as_of
FROM macro_observation
ORDER BY series_id, period, as_of DESC;
-- usage: replace the view by a query with WHERE as_of <= :as_of before DISTINCT ON.
`;
