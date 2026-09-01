import useSWR from 'swr';
import type { TickerListItem, WatchlistFilter } from '../../types/taVnIndex';
import { ApiError } from './useTaVnIndex';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

/** ⚠️ Xác nhận route thật ở Project A trước khi dùng. */
const WATCHLIST_ENDPOINT = `${API_BASE}/api/elite-score/watchlist`;

const fetcher = async (url: string): Promise<TickerListItem[]> => {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new ApiError(body || `Request failed with status ${res.status}`, res.status);
  }
  return res.json();
};

export function useTickerWatchlist(filter: WatchlistFilter) {
  const key = `${WATCHLIST_ENDPOINT}?filter=${filter}`;
  const { data, error, isLoading } = useSWR<TickerListItem[], ApiError>(key, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 15_000,
  });

  return {
    tickers: data ?? [],
    isLoading,
    isError: Boolean(error),
    error,
  };
}
