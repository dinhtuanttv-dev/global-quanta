import { useMemo } from 'react';
import useSWR from 'swr';
import { isRetryableSeasonality, type SeasonalityFetchError } from '../lib/cotuc/http-json';
import {
  buildDecisionStatesUrl, buildSignalTrackingUrl, fetchDecisionStates, fetchSignalTracking,
  type DecisionSnapshot, type DecisionStates, type SignalTracking,
} from '../lib/cotuc/decision';

// Bộ máy quyết định 3 trạng thái: MỘT request cho cả danh mục (SWR khử trùng giữa StockModal và sub-tab v3).
const SWR_OPTS = {
  revalidateOnFocus: false,
  dedupingInterval: 10 * 60_000,
  shouldRetryOnError: (err: unknown) => isRetryableSeasonality(err as SeasonalityFetchError),
  errorRetryCount: 2,
};

const errText = (e: unknown) => (e ? String((e as Error).message ?? e) : null);

export function useDecisionStates() {
  const { data, error, isLoading } = useSWR<DecisionStates | null>(buildDecisionStatesUrl(), () => fetchDecisionStates(), SWR_OPTS);
  const byTicker = useMemo(() => new Map<string, DecisionSnapshot>((data?.states ?? []).map((s) => [s.ticker, s])), [data]);
  return { states: data?.states ?? [], byTicker, asOf: data?.asOf ?? null, loading: isLoading, error: errText(error) };
}

/** Ảnh chụp quyết định của một mã (null nếu mã chưa có trong danh mục tính). */
export function useDecisionState(ticker: string | null | undefined) {
  const all = useDecisionStates();
  return { state: ticker ? all.byTicker.get(ticker.toUpperCase()) ?? null : null, asOf: all.asOf, loading: all.loading, error: all.error };
}

export function useSignalTracking() {
  const { data, error, isLoading } = useSWR<SignalTracking | null>(buildSignalTrackingUrl(), () => fetchSignalTracking(), SWR_OPTS);
  return { data: data ?? null, loading: isLoading, error: errText(error) };
}
