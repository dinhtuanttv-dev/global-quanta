import { useMemo } from 'react';
import useSWR from 'swr';
import type { SWRConfiguration } from 'swr';
import type { CycleStatsV3 } from '../lib/cotuc/timing-types';
import {
  CycleStatsError,
  buildCycleStatsUrl,
  defaultBaseUrl,
  fetchCycleStats,
  isRetryable,
  isStatsStale,
  normalizeTicker,
} from '../lib/cotuc/cycle-stats.api';

export type CycleStatsStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

export interface UseCycleStatsV3Options {
  baseUrl?: string;
  staleAfterHours?: number;
  enabled?: boolean;
}

export interface UseCycleStatsV3Result {
  data: CycleStatsV3 | null;
  status: CycleStatsStatus;
  error: CycleStatsError | null;
  isValidating: boolean;
  isStale: boolean;
  refresh: () => Promise<unknown>;
}

const MAX_RETRIES = 2;

/** Cùng chính sách với useCyclePaths: dữ liệu precompute theo lô, không polling, thử lại lỗi tạm thời. */
export const CYCLE_STATS_V3_SWR_CONFIG: SWRConfiguration<CycleStatsV3 | null, CycleStatsError> = {
  revalidateOnFocus: false,
  revalidateOnReconnect: true,
  dedupingInterval: 10 * 60 * 1000,
  keepPreviousData: false,
  onErrorRetry: (err, _key, _config, revalidate, { retryCount }) => {
    if (!isRetryable(err) || retryCount >= MAX_RETRIES) return;
    setTimeout(() => void revalidate({ retryCount }), 1000 * 2 ** retryCount);
  },
};

/**
 * Tải và validate CycleStatsV3 cho một mã. Dùng cùng với useCyclePaths: `stats` quyết định
 * vùng mua/trạng thái, `paths` (từ useCyclePaths) chỉ để vẽ đường CAR — component vẫn hoạt
 * động (ở dạng bảng, không có biểu đồ) nếu chỉ có `stats`.
 */
export function useCycleStatsV3(ticker: string | null | undefined, options: UseCycleStatsV3Options = {}): UseCycleStatsV3Result {
  const { baseUrl = defaultBaseUrl(), staleAfterHours = 36, enabled = true } = options;
  const t = normalizeTicker(ticker);
  const key = enabled && t ? buildCycleStatsUrl(t, baseUrl) : null;

  const { data, error, isValidating, mutate } = useSWR<CycleStatsV3 | null, CycleStatsError>(
    key,
    // FIX (2026-09-26, xac nhan qua do thuc te): timeout mac dinh 15s
    // cua goi qua ngan - server (da qua fix Prisma connection) hoan
    // thanh THAT SU nhung co the mat toi ~30s cho mot so ma (VD MWG,
    // do so luong su kien lich su/thoi gian tinh bootstrap). Tang len
    // 45s, du du so voi 30.7s da do, van an toan duoi 60s maxDuration
    // cua server.
    () => fetchCycleStats(t as string, { baseUrl, timeoutMs: 45_000 }),
    CYCLE_STATS_V3_SWR_CONFIG,
  );

  const typedError = useMemo<CycleStatsError | null>(() => {
    if (!error) return null;
    return error instanceof CycleStatsError ? error : new CycleStatsError('NETWORK', (error as unknown) instanceof Error ? (error as Error).message : 'Lỗi không xác định');
  }, [error]);

  const stats = data ?? null;
  const isStale = useMemo(() => (stats ? isStatsStale(stats, Date.now(), staleAfterHours) : false), [stats, staleAfterHours]);

  let status: CycleStatsStatus;
  if (key === null) status = 'idle';
  else if (data === undefined) status = typedError ? 'error' : 'loading';
  else if (data === null) status = 'empty';
  else status = 'ready';

  return { data: stats, status, error: typedError, isValidating, isStale, refresh: () => mutate() };
}
