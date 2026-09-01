import { useState } from 'react';
import { useTickerWatchlist } from '../../../hooks/ta-vn-index/useTickerWatchlist';
import type { WatchlistFilter } from '../../../types/taVnIndex';

interface TickerWatchlistProps {
  selectedTicker: string;
  onSelectTicker: (ticker: string) => void;
}

const FILTERS: { key: WatchlistFilter; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'core', label: 'Core' },
  { key: 'ring', label: 'Ring' },
  { key: 'pinned', label: 'Đã ghim' },
];

export function TickerWatchlist({ selectedTicker, onSelectTicker }: TickerWatchlistProps) {
  const [filter, setFilter] = useState<WatchlistFilter>('all');
  const { tickers, isLoading, isError } = useTickerWatchlist(filter);

  return (
    <div className="rounded-md border border-cyan-400/30 bg-gradient-to-b from-slate-900 to-slate-950 p-3 shadow-[0_0_18px_rgba(34,232,255,0.06)]">
      <div className="mb-2 text-[11px] font-bold tracking-wide text-cyan-300">DANH SÁCH MÃ</div>
      <div className="mb-2.5 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            aria-pressed={filter === f.key}
            onClick={() => setFilter(f.key)}
            className={
              filter === f.key
                ? 'rounded border border-cyan-400 bg-cyan-400/10 px-2.5 py-1 text-[11px] text-cyan-300'
                : 'rounded border border-cyan-400/25 px-2.5 py-1 text-[11px] text-slate-400'
            }
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading && <p className="text-[11px] text-slate-500">Đang tải danh sách…</p>}
      {isError && <p className="text-[11px] text-rose-400">Không tải được danh sách mã.</p>}

      {!isLoading && !isError && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {tickers.map((t) => (
            <button
              key={t.ticker}
              type="button"
              onClick={() => onSelectTicker(t.ticker)}
              className={
                t.ticker === selectedTicker
                  ? 'min-w-[78px] flex-none rounded-md border border-cyan-400 bg-cyan-400/10 p-2 text-left shadow-[0_0_10px_rgba(34,232,255,0.15)]'
                  : 'min-w-[78px] flex-none rounded-md border border-white/10 bg-white/[0.02] p-2 text-left'
              }
            >
              <div className="text-xs font-bold text-slate-100">{t.ticker}</div>
              <div className={t.changePct.value >= 0 ? 'mt-0.5 text-[10px] text-emerald-400' : 'mt-0.5 text-[10px] text-rose-400'}>
                {t.changePct.value > 0 ? '+' : ''}
                {t.changePct.value.toFixed(1)}%
              </div>
              <div className="mt-0.5 text-[8px] text-slate-500">{t.badge}</div>
            </button>
          ))}
          {tickers.length === 0 && <p className="text-[11px] text-slate-500">Không có mã nào phù hợp bộ lọc.</p>}
        </div>
      )}
    </div>
  );
}
