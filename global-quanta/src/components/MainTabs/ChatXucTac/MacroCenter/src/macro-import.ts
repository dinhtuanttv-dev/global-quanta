/** macro-import.ts — load a CSV into a store and report data-quality problems in one call. */
import { checkQuality, importSeriesCsv, type QualityIssue, type SeriesMeta, type VintageStore } from './macro-data';

export interface ImportReport {
  seriesId: string;
  inserted: number;
  rejectedRows: number;
  firstPeriod: string | null;
  lastPeriod: string | null;
  issues: QualityIssue[];
  hasErrors: boolean;
}

export function importCsvInto(
  store: VintageStore,
  csv: string,
  meta: SeriesMeta,
  opts: { locale?: 'vi' | 'en' | 'auto'; delimiter?: string; hasHeader?: boolean; monthly?: 'last' | 'mean'; asOf?: string; today?: string } = {},
): ImportReport {
  const { observations, rejectedRows } = importSeriesCsv({ csv, meta, locale: opts.locale, delimiter: opts.delimiter, hasHeader: opts.hasHeader, monthly: opts.monthly, asOfOverride: opts.asOf });
  if (observations.length) store.upsert(observations);
  const all = store.getSeries(meta.id);
  const issues = checkQuality(meta.id, all, meta, opts.today?.slice(0, 7));
  return {
    seriesId: meta.id, inserted: observations.length, rejectedRows,
    firstPeriod: all[0]?.period ?? null, lastPeriod: all[all.length - 1]?.period ?? null,
    issues, hasErrors: issues.some((i) => i.severity === 'error'),
  };
}

/** Tiny argv parser: `--key value` pairs and bare `--flag`s. */
export function parseArgs(argv: string[]): { values: Record<string, string>; flags: Set<string> } {
  const values: Record<string, string> = {};
  const flags = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      values[key] = next;
      i++;
    } else flags.add(key);
  }
  return { values, flags };
}
