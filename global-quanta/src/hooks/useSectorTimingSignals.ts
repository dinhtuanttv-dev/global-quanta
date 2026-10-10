// Port từ locnganh-timing-engine (hooks/useSectorTimingSignals.ts).
import { useMemo } from 'react';
import useSWR from 'swr';
import type { SWRConfiguration } from 'swr';
import type { SectorTimingSignal, SectorTimingSignalsBulkV3 } from '../lib/locnganh/types';
import { SectorFetchError, isRetryableSector } from '../lib/locnganh/http-json';
import { buildSectorTimingSignalsUrl, defaultBaseUrl, fetchSectorTimingSignals } from '../lib/locnganh/sector-timing-signals.api';

export type SectorTimingSignalsStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface UseSectorTimingSignalsOptions {
  baseUrl?: string;
  staleAfterHours?: number;
  enabled?: boolean;
}

export interface UseSectorTimingSignalsResult {
  /** Map sectorKey → SectorTimingSignal, tra cứu O(1) cho mỗi dòng LocNganhPanel/Top 20. */
  bySector: ReadonlyMap<string, SectorTimingSignal>;
  data: SectorTimingSignalsBulkV3 | null;
  status: SectorTimingSignalsStatus;
  error: SectorFetchError | null;
  isValidating: boolean;
  isStale: boolean;
  refresh: () => Promise<unknown>;
}

const MAX_RETRIES = 2;
const EMPTY_MAP: ReadonlyMap<string, SectorTimingSignal> = new Map();

function isStaleBulk(bulk: Pick<SectorTimingSignalsBulkV3, 'asOf'>, nowMs: number, staleAfterHours: number): boolean {
  const t = Date.parse(bulk.asOf);
  if (Number.isNaN(t)) return true;
  return nowMs - t > staleAfterHours * 3_600_000;
}

/** RRG/Confluence đổi theo phiên, nhanh hơn mùa vụ KQKD — dedupe ngắn hơn (5 phút) để bảng không quá cũ. */
const SWR_CONFIG: SWRConfiguration<SectorTimingSignalsBulkV3 | null, SectorFetchError> = {
  revalidateOnFocus: false,
  revalidateOnReconnect: true,
  dedupingInterval: 5 * 60 * 1000,
  onErrorRetry: (err, _k, _c, revalidate, { retryCount }) => {
    if (!isRetryableSector(err) || retryCount >= MAX_RETRIES) return;
    setTimeout(() => void revalidate({ retryCount }), 1000 * 2 ** retryCount);
  },
};

export function useSectorTimingSignals(options: UseSectorTimingSignalsOptions = {}): UseSectorTimingSignalsResult {
  const { baseUrl = defaultBaseUrl(), staleAfterHours = 6, enabled = true } = options;
  const key = enabled ? buildSectorTimingSignalsUrl(baseUrl) : null;

  const { data, error, isValidating, mutate } = useSWR<SectorTimingSignalsBulkV3 | null, SectorFetchError>(
    key,
    () => fetchSectorTimingSignals({ baseUrl }),
    SWR_CONFIG,
  );

  const typedError = useMemo<SectorFetchError | null>(() => {
    if (!error) return null;
    return error instanceof SectorFetchError ? error : new SectorFetchError('NETWORK', (error as unknown) instanceof Error ? (error as unknown as Error).message : 'Lỗi không xác định');
  }, [error]);

  const bySector = useMemo<ReadonlyMap<string, SectorTimingSignal>>(() => {
    if (!data) return EMPTY_MAP;
    return new Map(data.signals.map((s) => [s.sectorKey, s]));
  }, [data]);

  const isStale = useMemo(() => (data ? isStaleBulk(data, Date.now(), staleAfterHours) : false), [data, staleAfterHours]);

  let status: SectorTimingSignalsStatus;
  if (key === null) status = 'idle';
  else if (data === undefined) status = typedError ? 'error' : 'loading';
  else status = 'ready';

  return { bySector, data: data ?? null, status, error: typedError, isValidating, isStale, refresh: () => mutate() };
}
