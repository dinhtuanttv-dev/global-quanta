import type { AnnualEarningsCalendarV3, CyclePathsV3, EarningsCycleStatsV3, Quarter } from './timing-types';
import { defaultBaseUrl, normalizeTicker } from './cycle-paths.api';
import { parseCyclePaths } from './cycle-paths.schema';
import { SeasonalityFetchError, fetchValidatedJson } from './http-json';
import type { FetchJsonOptions } from './http-json';
import { parseAnnualEarningsCalendar, parseEarningsCycleStats } from './seasonality.schema';

export interface SeasonalityApiOptions extends FetchJsonOptions {
  baseUrl?: string;
}

const join = (base: string, path: string) => `${base.replace(/\/+$/, '')}${path}`;

export function isQuarter(q: unknown): q is Quarter {
  return q === 1 || q === 2 || q === 3 || q === 4;
}

export const buildEarningsCycleStatsUrl = (ticker: string, quarter: Quarter, base = defaultBaseUrl()) =>
  join(base, `/api/cotuc/earnings-cycle-stats?ticker=${encodeURIComponent(ticker)}&quarter=${quarter}`);
export const buildEarningsCyclePathsUrl = (ticker: string, quarter: Quarter, base = defaultBaseUrl()) =>
  join(base, `/api/cotuc/earnings-cycle-paths?ticker=${encodeURIComponent(ticker)}&quarter=${quarter}`);
export const buildAnnualCalendarUrl = (ticker: string, base = defaultBaseUrl()) =>
  join(base, `/api/cotuc/annual-earnings-calendar?ticker=${encodeURIComponent(ticker)}`);

function checkInput(ticker: string, quarter?: unknown): { t: string; q?: Quarter } {
  const t = normalizeTicker(ticker);
  if (!t) throw new SeasonalityFetchError('INVALID_INPUT', `Mã không hợp lệ: "${ticker}"`);
  if (quarter === undefined) return { t };
  if (!isQuarter(quarter)) throw new SeasonalityFetchError('INVALID_INPUT', `Quý không hợp lệ: ${String(quarter)} (phải là 1..4)`);
  return { t, q: quarter };
}

export async function fetchEarningsCycleStats(ticker: string, quarter: Quarter, opts: SeasonalityApiOptions = {}): Promise<EarningsCycleStatsV3 | null> {
  const { t, q } = checkInput(ticker, quarter);
  const data = await fetchValidatedJson(buildEarningsCycleStatsUrl(t, q as Quarter, opts.baseUrl), parseEarningsCycleStats, 'earnings-cycle-stats', opts);
  if (data && (data.ticker !== t || data.quarter !== q)) {
    throw new SeasonalityFetchError('MISMATCH', `Yêu cầu ${t}/Q${q} nhưng nhận ${data.ticker}/Q${data.quarter}`);
  }
  return data;
}

export async function fetchEarningsCyclePaths(ticker: string, quarter: Quarter, opts: SeasonalityApiOptions = {}): Promise<CyclePathsV3 | null> {
  const { t, q } = checkInput(ticker, quarter);
  const data = await fetchValidatedJson(buildEarningsCyclePathsUrl(t, q as Quarter, opts.baseUrl), parseCyclePaths, 'earnings-cycle-paths', opts);
  if (data && data.ticker !== t) throw new SeasonalityFetchError('MISMATCH', `Yêu cầu ${t} nhưng nhận ${data.ticker}`);
  return data;
}

export async function fetchAnnualEarningsCalendar(ticker: string, opts: SeasonalityApiOptions = {}): Promise<AnnualEarningsCalendarV3 | null> {
  const { t } = checkInput(ticker);
  const data = await fetchValidatedJson(buildAnnualCalendarUrl(t, opts.baseUrl), parseAnnualEarningsCalendar, 'annual-earnings-calendar', opts);
  if (data && data.ticker !== t) throw new SeasonalityFetchError('MISMATCH', `Yêu cầu ${t} nhưng nhận ${data.ticker}`);
  return data;
}
