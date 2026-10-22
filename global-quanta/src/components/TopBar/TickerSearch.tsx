import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useSieuQuetScanner } from '../../hooks/useSieuQuetScanner';
import { describeFeedStatus, FEED_TONE_COLOR, isMarketGatewayEnabled } from '../../services/marketDataClient';

const TICKER_RE = /^[A-Z][A-Z0-9]{2,5}$/;

/**
 * Ô tìm mã trên thanh trên. Phím tắt "/" (không chiếm phím khi đang gõ ở ô khác).
 * Chọn mã trong bảng -> chọn mã cho toàn trang, mở tab Siêu Quét, cuộn tới dòng và mở phân tích khối lượng.
 * Mã ngoài bảng (TOPBAR T3, spec §6.8): CHỈ chọn mã (không tự sửa danh mục); thêm vào ★ Danh mục là một lựa chọn riêng.
 * ARIA combobox 1.2: input role=combobox, aria-controls / aria-activedescendant, listbox có option id; 0 kết quả có thông báo.
 */
export function TickerSearch() {
  const focusTickerInScanner = useAppStore((s) => s.focusTickerInScanner);
  const selectTicker = useAppStore((s) => s.selectTicker);
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
  // Danh sách lựa chọn hợp lệ (Enter chỉ chọn lựa chọn đang active).
  type Opt = { id: string; kind: 'in' | 'select' | 'add'; ticker: string };
  const options: Opt[] = [
    ...matches.map((m) => ({ id: `tbs-${m.ticker}`, kind: 'in' as const, ticker: m.ticker })),
    ...(exactOutside ? [{ id: `tbs-sel-${needle}`, kind: 'select' as const, ticker: needle }, { id: `tbs-add-${needle}`, kind: 'add' as const, ticker: needle }] : []),
  ];
  const open = focused && needle.length > 0;
  const active = options[Math.min(cursor, options.length - 1)];
  const [announce, setAnnounce] = useState('');

  const run = (o: Opt) => {
    if (o.kind === 'select') { selectTicker(o.ticker); setAnnounce(`Đã chọn ${o.ticker} (ngoài danh sách quét)`); }
    else { focusTickerInScanner(o.ticker, { addToWatchlist: o.kind === 'add' }); setAnnounce(o.kind === 'add' ? `Đã thêm ${o.ticker} vào danh mục` : `Đã chọn ${o.ticker}`); }
    setQ('');
    setCursor(0);
    inputRef.current?.blur();
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(options.length - 1, c + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)); }
    else if (e.key === 'Escape') { e.preventDefault(); if (q) setQ(''); else inputRef.current?.blur(); }
    else if (e.key === 'Enter') { e.preventDefault(); if (active) run(active); }
  };

  return (
    <div className={`search-box ${focused ? 'is-focused' : ''}`}>
      <input
        ref={inputRef}
        className="search-input"
        role="combobox"
        aria-expanded={open}
        aria-controls="tb-search-list"
        aria-autocomplete="list"
        aria-activedescendant={open && active ? active.id : undefined}
        value={q}
        onChange={(e) => { setQ(e.target.value); setCursor(0); }}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        onKeyDown={onKeyDown}
        placeholder="Tìm mã cổ phiếu…"
        aria-label="Tìm mã cổ phiếu (phím tắt /)"
        spellCheck={false}
      />
      {q ? <button type="button" className="search-clear" aria-label="Xoá ô tìm" onClick={() => setQ('')}>✕</button> : <span className="search-kbd" aria-hidden>/</span>}
      <span className="sr-only" role="status" aria-live="polite">{announce}</span>
      {open && (
        <div id="tb-search-list" role="listbox" aria-label="Kết quả tìm mã" className="absolute left-0 top-full mt-1 z-50 w-72 rounded-md py-1 shadow-xl"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-strong)' }}>
          {options.length === 0 && <div className="px-2.5 py-1.5 text-[11px] text-slate-400" role="option" aria-disabled="true" aria-selected={false}>Không tìm thấy mã “{needle}” trong {items.length} mã của Siêu Quét.</div>}
          {options.map((o, i) => {
            const m = o.kind === 'in' ? matches.find((x) => x.ticker === o.ticker) : null;
            return (
              <div key={o.id} id={o.id} role="option" aria-selected={i === cursor} onMouseDown={(e) => { e.preventDefault(); run(o); }}
                onMouseEnter={() => setCursor(i)}
                className={`flex items-center gap-2 px-2.5 py-1 cursor-pointer text-[11px] ${i === cursor ? 'bg-white/10' : ''} ${o.kind !== 'in' ? 'text-violet-200' : ''}`}>
                {m ? (
                  <>
                    <b className="text-slate-100 w-12">{m.ticker}</b>
                    <span className="text-slate-400 truncate flex-1">{m.companyName ?? m.industry ?? m.sector ?? ''}</span>
                    <span className="text-amber-400 tabular-nums">{m.smartScore !== null ? m.smartScore.toFixed(1) : ''}</span>
                  </>
                ) : o.kind === 'select' ? <span>Chọn {o.ticker} <span className="text-slate-400">(ngoài danh sách quét — không đổi danh mục)</span></span>
                  : <span>＋ Thêm {o.ticker} vào ★ Danh mục để Siêu Quét chấm điểm</span>}
              </div>
            );
          })}
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
