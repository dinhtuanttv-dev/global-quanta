import { useMemo } from 'react';
import useSWR from 'swr';
import type { SWRConfiguration } from 'swr';
import type { TimingSignal, TimingSignalsBulkV3 } from '../lib/cotuc/timing-types';
import {
  TimingSignalsError,
  buildTimingSignalsUrl,
  defaultBaseUrl,
  fetchTimingSignals,
  isRetryable,
  isSignalsStale,
} from '../lib/cotuc/timing-signals.api';
import { logObservabilityEvent } from '../lib/cotuc/observability';

export type TimingSignalsStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface UseTimingSignalsBulkOptions {
  baseUrl?: string;
  universe?: string;
  staleAfterHours?: number;
  enabled?: boolean;
}

export interface UseTimingSignalsBulkResult {
  /** Map ticker → TimingSignal, tiện tra cứu O(1) cho từng dòng Screener. Rỗng khi chưa có dữ liệu. */
  byTicker: ReadonlyMap<string, TimingSignal>;
  data: TimingSignalsBulkV3 | null;
  status: TimingSignalsStatus;
  error: TimingSignalsError | null;
  isValidating: boolean;
  isStale: boolean;
  refresh: () => Promise<unknown>;
}

const MAX_RETRIES = 2;
const EMPTY_MAP: ReadonlyMap<string, TimingSignal> = new Map();

export const TIMING_SIGNALS_SWR_CONFIG: SWRConfiguration<TimingSignalsBulkV3, TimingSignalsError> = {
  revalidateOnFocus: false,
  revalidateOnReconnect: true,
  // Bulk cho cả vũ trụ là dữ liệu "nặng" hơn một mã đơn lẻ — dedupe dài hơn cycle-stats/cycle-paths
  // (10 phút) để tránh Screener gọi lại khi người dùng chuyển tab qua lại nhanh.
  dedupingInterval: 15 * 60 * 1000,
  onErrorRetry: (err, _key, _config, revalidate, { retryCount }) => {
    if (!isRetryable(err) || retryCount >= MAX_RETRIES) return;
    setTimeout(() => void revalidate({ retryCount }), 1000 * 2 ** retryCount);
  },
  onError: (err) => {
    logObservabilityEvent({ name: 'timing_signals_fetch_error', level: 'error', fields: { kind: (err as TimingSignalsError).kind } });
  },
};

/**
 * Tải TimingSignal cho cả vũ trụ trong một request (mục 12.1 tài liệu v3), dùng cho Screener.
 * Không nhận `ticker` — khác useCycleStats/useCyclePaths (một mã, dùng trong StockModal).
 */
export function useTimingSignalsBulk(options: UseTimingSignalsBulkOptions = {}): UseTimingSignalsBulkResult {
  const { baseUrl = defaultBaseUrl(), universe, staleAfterHours = 36, enabled = true } = options;
  const key = enabled ? buildTimingSignalsUrl(baseUrl, universe) : null;

  const { data, error, isValidating, mutate } = useSWR<TimingSignalsBulkV3, TimingSignalsError>(
    key,
    () => fetchTimingSignals({ baseUrl, universe }),
    TIMING_SIGNALS_SWR_CONFIG,
  );

  const typedError = useMemo<TimingSignalsError | null>(() => {
    if (!error) return null;
    return error instanceof TimingSignalsError ? error : new TimingSignalsError('NETWORK', (error as unknown) instanceof Error ? (error as Error).message : 'Lỗi không xác định');
  }, [error]);

  const byTicker = useMemo<ReadonlyMap<string, TimingSignal>>(() => {
    if (!data) return EMPTY_MAP;
    return new Map(data.signals.map((s) => [s.ticker, s]));
  }, [data]);

  const isStale = useMemo(() => (data ? isSignalsStale(data, Date.now(), staleAfterHours) : false), [data, staleAfterHours]);

  let status: TimingSignalsStatus;
  if (key === null) status = 'idle';
  else if (data === undefined) status = typedError ? 'error' : 'loading';
  else status = 'ready';

  return { byTicker, data: data ?? null, status, error: typedError, isValidating, isStale, refresh: () => mutate() };
}
