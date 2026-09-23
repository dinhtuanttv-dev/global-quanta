import useSWR from 'swr';
import type { TickerListItem, WatchlistFilter } from '../../types/taVnIndex';
import { ApiError } from './useTaVnIndex';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'https://tuan-quant-scanner-psi.vercel.app';

// Elite 10 - "Danh sach ma" THAT (2026-09-23): noi voi /api/elite10/watchlist
// (hop nhat Pattern Scanner + Bo Loc Hop Luu Wyckoff/SMC/FVG + Dong Thuan
// TA Top 20, tat ca da chay that tu truoc) - thay the route mock cu
// /api/elite-score/watchlist (12 ma hardcode).
const WATCHLIST_ENDPOINT = `${API_BASE}/api/elite10/watchlist`;

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
  // dedupingInterval dai (15 phut): route nguon quet toan bo VN30/VN100
  // (fetch OHLCV that cho ~130 ma moi lan goi), tranh goi lai lien tuc
  // khi nguoi dung doi filter qua lai nhieu lan trong thoi gian ngan.
  const { data, error, isLoading } = useSWR<TickerListItem[], ApiError>(key, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 15 * 60 * 1000,
    refreshInterval: 20 * 60 * 1000,
  });

  return {
    tickers: data ?? [],
    isLoading,
    isError: Boolean(error),
    error,
  };
}
