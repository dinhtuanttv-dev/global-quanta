import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useSieuQuetScanner } from '../../hooks/useSieuQuetScanner';
import { describeFeedStatus, FEED_TONE_COLOR, isMarketGatewayEnabled } from '../../services/marketDataClient';

const TICKER_RE = /^[A-Z][A-Z0-9]{2,5}$/;

/**
 * Ô tìm mã trên thanh trên (thay ô tìm của cột "Danh sách mã" cũ). Phím tắt "/".
 * Chọn mã -> chọn mã cho toàn trang (Action Center, Radar…), mở tab Siêu Quét, cuộn tới dòng và mở
 * phân tích khối lượng; mã ngoài bảng được thêm vào ★ Danh mục để Siêu Quét chấm điểm.
 */
export function TickerSearch() {
  const focusTickerInScanner = useAppStore((s) => s.focusTickerInScanner);
  const { items } = useSieuQuetScanner();
  const [q, setQ] = useState('');
  const [focused, setFocused] = useState(false);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const needle = q.trim().toUpperCase();
  const matches = useMemo(() => {
    if (!needle) return [];
    const starts = items.filter((i) => i.ticker.startsWith(needle));
    const contains = items.filter((i) => !i.ticker.startsWith(needle) && (
      i.ticker.includes(needle) || (i.companyName ?? '').toUpperCase().includes(needle) || (i.industry ?? '').toUpperCase().includes(needle)));
    return [...starts, ...contains].slice(0, 8);
  }, [items, needle]);
  const exactOutside = TICKER_RE.test(needle) && !items.some((i) => i.ticker === needle);

  const go = (ticker: string) => {
    focusTickerInScanner(ticker);
    setQ('');
    setCursor(0);
    inputRef.current?.blur();
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const total = matches.length + (exactOutside ? 1 : 0);
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(total - 1, c + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)); }
    else if (e.key === 'Escape') { setQ(''); inputRef.current?.blur(); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const pick = matches[cursor]?.ticker ?? (exactOutside || TICKER_RE.test(needle) ? needle : null);
      if (pick) go(pick);
    }
  };

  return (
    <div className={`search-box ${focused ? 'is-focused' : ''}`} role="combobox" aria-expanded={focused && (matches.length > 0 || exactOutside)} aria-haspopup="listbox">
      <input
        ref={inputRef}
        className="search-input"
        value={q}
        onChange={(e) => { setQ(e.target.value); setCursor(0); }}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        onKeyDown={onKeyDown}
        placeholder="Tìm mã cổ phiếu…"
        aria-label="Tìm mã cổ phiếu"
        spellCheck={false}
      />
      {q ? <button type="button" className="search-clear" aria-label="Xoá" onClick={() => setQ('')}>✕</button> : <span className="search-kbd">/</span>}
      {focused && (matches.length > 0 || exactOutside) && (
        <div role="listbox" className="absolute left-0 top-full mt-1 z-50 w-72 rounded-md py-1 shadow-xl"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-strong)' }}>
          {matches.map((m, i) => (
            <div key={m.ticker} role="option" aria-selected={i === cursor} onMouseDown={(e) => { e.preventDefault(); go(m.ticker); }}
              onMouseEnter={() => setCursor(i)}
              className={`flex items-center gap-2 px-2.5 py-1 cursor-pointer text-[11px] ${i === cursor ? 'bg-white/10' : ''}`}>
              <b className="text-slate-100 w-12">{m.ticker}</b>
              <span className="text-slate-400 truncate flex-1">{m.companyName ?? m.industry ?? m.sector ?? ''}</span>
              <span className="text-amber-400 tabular-nums">{m.smartScore !== null ? m.smartScore.toFixed(1) : ''}</span>
            </div>
          ))}
          {exactOutside && (
            <div role="option" aria-selected={cursor === matches.length} onMouseDown={(e) => { e.preventDefault(); go(needle); }}
              className={`px-2.5 py-1 cursor-pointer text-[11px] text-violet-200 ${cursor === matches.length ? 'bg-white/10' : ''}`}>
              ＋ Mở {needle} (ngoài danh sách quét — thêm vào ★ Danh mục để chấm điểm)
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Đèn nguồn giá (chuyển từ cột "Danh sách mã" cũ). */
export function FeedStatusBadge() {
  const feed = useAppStore((s) => s.feed);
  if (isMarketGatewayEnabled()) {
    const b = describeFeedStatus(feed.gatewayStatus, feed.connectionLost);
    return <span role="status" aria-label={b.title} title={b.title} style={{ fontSize: 10, color: FEED_TONE_COLOR[b.tone], whiteSpace: 'nowrap' }}>{b.label}</span>;
  }
  return (
    <span role="status" title={feed.legacySsiConnected ? 'Đang nhận giá thời gian thực từ SSI FastConnect' : 'Đang dùng nguồn giá dự phòng'}
      style={{ fontSize: 10, color: feed.legacySsiConnected ? '#34d399' : 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
      {feed.legacySsiConnected ? '● SSI LIVE' : '○ SSI OFFLINE'}
    </span>
  );
}
