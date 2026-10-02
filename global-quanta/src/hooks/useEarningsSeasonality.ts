import { useMemo } from 'react';
import useSWR from 'swr';
import type { SWRConfiguration } from 'swr';
import type { AnnualEarningsCalendarV3, CyclePathsV3, EarningsCycleStatsV3, Quarter } from '../lib/cotuc/timing-types';
import { defaultBaseUrl, normalizeTicker } from '../lib/cotuc/cycle-paths.api';
import { SeasonalityFetchError, isRetryableSeasonality } from '../lib/cotuc/http-json';
import {
  buildAnnualCalendarUrl,
  buildEarningsCyclePathsUrl,
  buildEarningsCycleStatsUrl,
  fetchAnnualEarningsCalendar,
  fetchEarningsCyclePaths,
  fetchEarningsCycleStats,
} from '../lib/cotuc/seasonality.api';

export type SeasonalityStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

export interface SeasonalityResult<T> {
  data: T | null;
  status: SeasonalityStatus;
  error: SeasonalityFetchError | null;
  isValidating: boolean;
  refresh: () => Promise<unknown>;
}

export interface SeasonalityHookOptions {
  baseUrl?: string;
  enabled?: boolean;
}

const MAX_RETRIES = 2;

/** Cùng chính sách với useCyclePaths/useCycleStats: dữ liệu precompute theo lô, không polling. */
const SWR_CONFIG: SWRConfiguration<unknown, SeasonalityFetchError> = {
  revalidateOnFocus: false,
  revalidateOnReconnect: true,
  dedupingInterval: 30 * 60 * 1000, // mùa vụ theo quý đổi rất chậm: dedupe 30 phút
  keepPreviousData: false,
  onErrorRetry: (err, _k, _c, revalidate, { retryCount }) => {
    if (!isRetryableSeasonality(err) || retryCount >= MAX_RETRIES) return;
    setTimeout(() => void revalidate({ retryCount }), 1000 * 2 ** retryCount);
  },
};

function useSeasonalFetch<T>(key: string | null, fetcher: () => Promise<T | null>): SeasonalityResult<T> {
  const { data, error, isValidating, mutate } = useSWR<T | null, SeasonalityFetchError>(key, fetcher, SWR_CONFIG as SWRConfiguration<T | null, SeasonalityFetchError>);
  const typedError = useMemo<SeasonalityFetchError | null>(() => {
    if (!error) return null;
    const e: unknown = error; // SWR có thể trả lỗi bất kỳ (không chỉ SeasonalityFetchError)
    return e instanceof SeasonalityFetchError ? e : new SeasonalityFetchError('NETWORK', e instanceof Error ? e.message : 'Lỗi không xác định');
  }, [error]);
  let status: SeasonalityStatus;
  if (key === null) status = 'idle';
  else if (data === undefined) status = typedError ? 'error' : 'loading';
  else if (data === null) status = 'empty';
  else status = 'ready';
  return { data: data ?? null, status, error: typedError, isValidating, refresh: () => mutate() };
}

export function useEarningsCycleStats(ticker: string | null | undefined, quarter: Quarter, o: SeasonalityHookOptions = {}): SeasonalityResult<EarningsCycleStatsV3> {
  const { baseUrl = defaultBaseUrl(), enabled = true } = o;
  const t = normalizeTicker(ticker);
  return useSeasonalFetch(enabled && t ? buildEarningsCycleStatsUrl(t, quarter, baseUrl) : null, () => fetchEarningsCycleStats(t as string, quarter, { baseUrl }));
}

export function useEarningsCyclePaths(ticker: string | null | undefined, quarter: Quarter, o: SeasonalityHookOptions = {}): SeasonalityResult<CyclePathsV3> {
  const { baseUrl = defaultBaseUrl(), enabled = true } = o;
  const t = normalizeTicker(ticker);
  return useSeasonalFetch(enabled && t ? buildEarningsCyclePathsUrl(t, quarter, baseUrl) : null, () => fetchEarningsCyclePaths(t as string, quarter, { baseUrl }));
}

export function useAnnualEarningsCalendar(ticker: string | null | undefined, o: SeasonalityHookOptions = {}): SeasonalityResult<AnnualEarningsCalendarV3> {
  const { baseUrl = defaultBaseUrl(), enabled = true } = o;
  const t = normalizeTicker(ticker);
  return useSeasonalFetch(enabled && t ? buildAnnualCalendarUrl(t, baseUrl) : null, () => fetchAnnualEarningsCalendar(t as string, { baseUrl }));
}
