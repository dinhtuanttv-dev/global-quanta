import { useMemo } from 'react';
import useSWR from 'swr';
import type { SWRConfiguration } from 'swr';
import type { CyclePathsV3 } from '../lib/cotuc/timing-types';
import { withConcurrencyLimit } from '../lib/cotuc/concurrency-limiter';
import {
  CyclePathsError,
  buildCyclePathsUrl,
  defaultBaseUrl,
  fetchCyclePaths,
  isPathsStale,
  isRetryable,
  normalizeTicker,
} from '../lib/cotuc/cycle-paths.api';

export type CyclePathsStatus =
  | 'idle' // chưa có mã hợp lệ (hoặc enabled = false), không gọi mạng
  | 'loading' // đang tải lần đầu
  | 'ready' // có dữ liệu (có thể kèm `error` nếu lần làm mới gần nhất thất bại)
  | 'empty' // backend chưa có dữ liệu cho mã này (404/204)
  | 'error'; // lỗi và không có dữ liệu cũ để hiển thị

export interface UseCyclePathsOptions {
  /** Mặc định VITE_COTUC_API_BASE. */
  baseUrl?: string;
  /** Mặc định 36 giờ, khớp EngineConfig.staleAfterHours. */
  staleAfterHours?: number;
  /** false để tạm không tải (ví dụ khi modal đóng). */
  enabled?: boolean;
}

export interface UseCyclePathsResult {
  /** null khi chưa có (idle/loading/empty/error). Truyền thẳng vào <CycleTimeline paths={data} />. */
  data: CyclePathsV3 | null;
  status: CyclePathsStatus;
  error: CyclePathsError | null;
  isValidating: boolean;
  /** asOf cũ hơn staleAfterHours. UI nên hiện cảnh báo, không ẩn dữ liệu. */
  isStale: boolean;
  refresh: () => Promise<unknown>;
}

const MAX_RETRIES = 2;

/**
 * Đường CAR là dữ liệu precompute theo lô (hằng đêm), nên không polling và không làm mới khi focus.
 * Lỗi tạm thời (mạng, timeout, 5xx, 429) thử lại tối đa 2 lần với backoff; lỗi xác định thì dừng ngay.
 */
export const CYCLE_PATHS_SWR_CONFIG: SWRConfiguration<CyclePathsV3 | null, CyclePathsError> = {
  revalidateOnFocus: false,
  revalidateOnReconnect: true,
  dedupingInterval: 10 * 60 * 1000,
  keepPreviousData: false, // đổi mã không được hiện đường CAR của mã trước
  onErrorRetry: (err, _key, _config, revalidate, { retryCount }) => {
    if (!isRetryable(err) || retryCount >= MAX_RETRIES) return;
    setTimeout(() => void revalidate({ retryCount }), 1000 * 2 ** retryCount);
  },
};

export function useCyclePaths(
  ticker: string | null | undefined,
  options: UseCyclePathsOptions = {},
): UseCyclePathsResult {
  const { baseUrl = defaultBaseUrl(), staleAfterHours = 36, enabled = true } = options;
  const t = normalizeTicker(ticker);
  // Key là URL đầy đủ: đổi mã hoặc đổi host đều tạo cache riêng.
  const key = enabled && t ? buildCyclePathsUrl(t, baseUrl) : null;

  const { data, error, isValidating, mutate } = useSWR<CyclePathsV3 | null, CyclePathsError>(
    key,
    // Xem giai thich chi tiet trong useCycleStatsV3.ts (cung fix,
    // cung ly do: timeout mac dinh 15s cua goi qua ngan so voi thoi
    // gian xu ly THAT cua server cho mot so ma).
    () => withConcurrencyLimit(() => fetchCyclePaths(t as string, { baseUrl, timeoutMs: 45_000 })),
    CYCLE_PATHS_SWR_CONFIG,
  );

  const typedError = useMemo<CyclePathsError | null>(() => {
    if (!error) return null;
    return error instanceof CyclePathsError
      ? error
      : new CyclePathsError('NETWORK', (error as unknown) instanceof Error ? (error as Error).message : 'Lỗi không xác định');
  }, [error]);

  const paths = data ?? null;
  const isStale = useMemo(
    () => (paths ? isPathsStale(paths, Date.now(), staleAfterHours) : false),
    [paths, staleAfterHours],
  );

  let status: CyclePathsStatus;
  if (key === null) status = 'idle';
  else if (data === undefined) status = typedError ? 'error' : 'loading';
  else if (data === null) status = 'empty';
  else status = 'ready';

  return {
    data: paths,
    status,
    error: typedError,
    isValidating,
    isStale,
    refresh: () => mutate(),
  };
}
