import { useMemo } from 'react';
import useSWR from 'swr';
import type { EarningsSignal } from '../lib/cotuc/timing-types';
import { isRetryableSeasonality, type SeasonalityFetchError } from '../lib/cotuc/http-json';
import {
  buildEarningsSignalsUrl, buildSeasonalOpportunitiesUrl, fetchEarningsSignalsBulk, fetchSeasonalOpportunities,
  type EarningsSignalsBulk, type SeasonalOpportunitiesV3,
} from '../lib/cotuc/seasonal-bulk';

// Dữ liệu tổng hợp toàn danh mục cho tab Cổ tức (MỘT request cho cả danh mục, SWR khử trùng giữa các nơi dùng).
const SWR_OPTS = {
  revalidateOnFocus: false,
  dedupingInterval: 10 * 60_000,
  shouldRetryOnError: (err: unknown) => isRetryableSeasonality(err as SeasonalityFetchError),
  errorRetryCount: 2,
};

/** EarningsSignal cả danh mục: `byTicker` để tra kỳ KQKD tới của từng mã; `signals` cho mục "Sắp KQKD". */
export function useEarningsSignalsBulk() {
  const { data, error, isLoading } = useSWR<EarningsSignalsBulk | null>(buildEarningsSignalsUrl(), () => fetchEarningsSignalsBulk(), SWR_OPTS);
  const byTicker = useMemo(() => new Map<string, EarningsSignal>((data?.signals ?? []).map((s) => [s.ticker, s])), [data]);
  return { signals: data?.signals ?? [], byTicker, generatedAt: data?.generatedAt ?? null, loading: isLoading, error: error ? String((error as Error).message ?? error) : null };
}

/** Cơ hội mùa vụ KQKD toàn danh mục (đã đạt kiểm định) + ứng viên gần đạt. */
export function useSeasonalOpportunities() {
  const { data, error, isLoading } = useSWR<SeasonalOpportunitiesV3 | null>(buildSeasonalOpportunitiesUrl(), () => fetchSeasonalOpportunities(), SWR_OPTS);
  return { data: data ?? null, loading: isLoading, error: error ? String((error as Error).message ?? error) : null };
}
