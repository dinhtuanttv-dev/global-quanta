import { useMemo } from 'react';
import type { TickerListItem, WatchlistFilter } from '../../types/taVnIndex';
import { useSieuQuetScanner } from '../useSieuQuetScanner';
import { useWatchlists } from '../useWatchlists';

// Elite 10 E0 (2026-10-17): danh sách mã từ bảng Siêu quét AI trên Market Gateway (276 mã, Smart Score, RS, nhãn hội tụ) +
// danh mục ★ Radar của người dùng. Thay /api/elite10/watchlist của Project A: route đó đọc CSDL Neon (đang hết hạn mức -> 502)
// và ghép hai bộ lọc chưa kiểm định bằng công thức đặt tay (0,5·a + 0,5·b + 15).
const TOP_N = 40;

export const WATCHLIST_FILTER_LABEL: Record<WatchlistFilter, string> = {
  all: 'Tất cả',
  core: 'Smart Score ≥ 80',
  ring: 'Sức mạnh giá RS ≥ 90',
  pinned: '★ Danh mục Radar',
};

export function useTickerWatchlist(filter: WatchlistFilter) {
  const { items, isLoading, error } = useSieuQuetScanner();
  const { radar } = useWatchlists();

  const tickers = useMemo<TickerListItem[]>(() => {
    const by = new Map(items.map((it) => [it.ticker, it]));
    const toItem = (ticker: string): TickerListItem => {
      const it = by.get(ticker);
      const score = it?.smartScore ?? null;
      return {
        ticker,
        changePct: typeof it?.changePct === 'number' ? { value: it.changePct, source: 'HARD_DATA' } : { value: 0, source: 'MISSING' },
        status: score != null && score >= 80 ? 'core' : (it?.rsRating ?? 0) >= 90 ? 'ring' : 'watch',
        badge: it ? [score != null ? `Smart ${Math.round(score)}` : '', it.confluenceStatusLabel ?? ''].filter(Boolean).join(' · ') : 'Ngoài bảng Siêu quét',
      };
    };
    const ranked = [...items].sort((a, b) => (b.smartScore ?? -1) - (a.smartScore ?? -1));
    const radarTickers = radar?.tickers ?? [];
    let list: string[];
    if (filter === 'pinned') list = radarTickers;
    else if (filter === 'core') list = ranked.filter((it) => (it.smartScore ?? 0) >= 80).map((it) => it.ticker);
    else if (filter === 'ring') list = ranked.filter((it) => (it.rsRating ?? 0) >= 90).map((it) => it.ticker);
    else list = [...new Set([...radarTickers, ...ranked.slice(0, TOP_N).map((it) => it.ticker)])];
    return list.slice(0, 60).map(toItem);
  }, [items, radar, filter]);

  return { tickers, isLoading, isError: Boolean(error) && items.length === 0, error };
}
