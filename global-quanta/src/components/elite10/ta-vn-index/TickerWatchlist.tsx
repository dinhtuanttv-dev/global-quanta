import { useState, useMemo } from 'react';
import { useTickerWatchlist } from '../../../hooks/ta-vn-index/useTickerWatchlist';
import type { WatchlistFilter } from '../../../types/taVnIndex';

interface TickerWatchlistProps {
  selectedTicker: string;
  onSelectTicker: (ticker: string) => void;
}

const FILTERS: { key: WatchlistFilter; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'core', label: 'Cốt lõi (Core)' },
  { key: 'ring', label: 'Vệ tinh (Ring)' },
  { key: 'pinned', label: 'Đã ghim ⭐' },
];

const QUICK_INDICES = [
  { ticker: 'VNINDEX', label: 'VN-Index' },
  { ticker: 'VN30', label: 'VN30' },
  { ticker: 'HNXINDEX', label: 'HNX' },
];

export function TickerWatchlist({ selectedTicker, onSelectTicker }: TickerWatchlistProps) {
  const [filter, setFilter] = useState<WatchlistFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const { tickers, isLoading, isError } = useTickerWatchlist(filter);

  const cleanQuery = searchQuery.trim().toUpperCase();

  // Lọc nhanh theo search input
  const displayedTickers = useMemo(() => {
    if (!cleanQuery) return tickers;
    return tickers.filter(
      (t) => t.ticker.toUpperCase().includes(cleanQuery) || (t.badge && t.badge.toUpperCase().includes(cleanQuery))
    );
  }, [tickers, cleanQuery]);

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (cleanQuery) {
      onSelectTicker(cleanQuery);
      setSearchQuery('');
    }
  };

  return (
    <div className="rounded-lg border border-cyan-500/25 bg-gradient-to-b from-slate-900/90 via-slate-900/70 to-slate-950/95 p-3 shadow-[0_4px_24px_rgba(34,232,255,0.08)] backdrop-blur-md">
      {/* HEADER & CONTROLS: Chỉ số + Bộ lọc + Tìm kiếm nhanh */}
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2.5 border-b border-white/5 pb-2.5">
        {/* Nhãn + Chỉ số thị trường chính */}
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="flex items-center gap-1.5 mr-2">
            <span className="inline-block h-2 w-2 rounded-full bg-cyan-400 shadow-[0_0_8px_#22e8ff]" />
            <span className="text-[11px] font-bold tracking-wider uppercase text-cyan-300">MÃ THEO DÕI</span>
          </div>

          <div className="flex items-center gap-1 bg-black/30 p-0.5 rounded-md border border-white/10">
            {QUICK_INDICES.map((idx) => {
              const isSelected = selectedTicker === idx.ticker;
              return (
                <button
                  key={idx.ticker}
                  type="button"
                  onClick={() => onSelectTicker(idx.ticker)}
                  aria-pressed={isSelected}
                  className={`rounded px-2 py-0.5 text-[10px] font-bold font-mono transition-all ${
                    isSelected
                      ? 'border border-cyan-400 bg-cyan-400/20 text-cyan-200 shadow-[0_0_10px_rgba(34,232,255,0.25)]'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                  }`}
                >
                  {idx.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Form tìm kiếm / gõ mã nhanh */}
        <form onSubmit={handleCustomSubmit} className="flex items-center gap-1.5">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm/Nhập mã (VNM, FPT...)"
              className="w-44 rounded-md border border-cyan-500/30 bg-slate-950/80 px-2.5 py-1 text-[11px] font-mono text-cyan-200 placeholder-slate-500 transition-colors focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400/50"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 hover:text-slate-200"
              >
                ✕
              </button>
            )}
          </div>
          {cleanQuery && !tickers.some((t) => t.ticker === cleanQuery) && (
            <button
              type="submit"
              className="rounded-md border border-cyan-400 bg-cyan-500/20 px-2.5 py-1 text-[10px] font-bold text-cyan-200 hover:bg-cyan-500/30 transition-all"
            >
              Xem {cleanQuery} ↵
            </button>
          )}
        </form>
      </div>

      {/* FILTER TABS */}
      <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] font-medium text-slate-400 mr-1">Bộ lọc:</span>
        {FILTERS.map((f) => {
          const isActive = filter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              aria-pressed={isActive}
              onClick={() => setFilter(f.key)}
              className={`rounded px-2.5 py-0.5 text-[10px] font-medium transition-all ${
                isActive
                  ? 'border border-cyan-400 bg-cyan-400/20 text-cyan-200 shadow-[0_0_8px_rgba(34,232,255,0.2)]'
                  : 'border border-white/10 text-slate-400 hover:border-cyan-400/30 hover:text-slate-300'
              }`}
            >
              {f.label}
            </button>
          );
        })}
        <span className="ml-auto text-[10px] text-slate-500">
          Hiển thị: <b className="text-cyan-400">{displayedTickers.length}</b> mã
        </span>
      </div>

      {/* DANH SÁCH CARDS CUỘN NGANG HIỆN ĐẠI */}
      {isLoading && (
        <div className="flex items-center gap-2 py-3 text-[11px] text-slate-400">
          <div className="h-3 w-3 animate-spin rounded-full border-2 border-white/10 border-t-cyan-400" />
          <span>Đang cập nhật danh mục mã lượng tử…</span>
        </div>
      )}

      {isError && (
        <p className="py-2 text-[11px] text-rose-400">
          Không tải được danh mục mã từ máy chủ. Bạn vẫn có thể nhập trực tiếp mã vào ô tìm kiếm ở trên.
        </p>
      )}

      {!isLoading && !isError && (
        <div className="flex gap-2 overflow-x-auto pb-1.5 pt-0.5 scrollbar-thin scrollbar-thumb-cyan-500/20 scrollbar-track-transparent">
          {displayedTickers.map((t) => {
            const isSelected = t.ticker === selectedTicker;
            const isUp = t.changePct.value > 0;
            const isDown = t.changePct.value < 0;

            return (
              <button
                key={t.ticker}
                type="button"
                onClick={() => onSelectTicker(t.ticker)}
                className={`group min-w-[84px] flex-none rounded-lg p-2 text-left transition-all duration-150 ${
                  isSelected
                    ? 'border-2 border-cyan-400 bg-cyan-400/15 shadow-[0_0_14px_rgba(34,232,255,0.25)] ring-1 ring-cyan-400'
                    : 'border border-white/10 bg-slate-900/60 hover:border-cyan-400/40 hover:bg-white/[0.04]'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className={`text-xs font-black tracking-wide ${isSelected ? 'text-cyan-200' : 'text-slate-100 group-hover:text-cyan-300'}`}>
                    {t.ticker}
                  </span>
                  {isSelected && <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_#22e8ff]" />}
                </div>

                {t.changePct.source === 'MISSING' ? (
                  <div className="mt-1 text-[9px] text-slate-500">— n/a</div>
                ) : (
                  <div
                    className={`mt-0.5 font-mono text-[10px] font-bold ${
                      isUp ? 'text-emerald-400' : isDown ? 'text-rose-400' : 'text-slate-400'
                    }`}
                  >
                    {isUp ? '+' : ''}
                    {t.changePct.value.toFixed(1)}%
                  </div>
                )}

                {t.badge && (
                  <div className="mt-1 truncate text-[8px] font-medium text-slate-400 group-hover:text-slate-300">
                    {t.badge}
                  </div>
                )}
              </button>
            );
          })}

          {displayedTickers.length === 0 && (
            <div className="py-2 text-[11px] text-slate-500">
              Không tìm thấy mã nào phù hợp với từ khóa "{cleanQuery}". Nhấn <b>Enter</b> hoặc nút "Xem {cleanQuery}" để phân tích mã này.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
