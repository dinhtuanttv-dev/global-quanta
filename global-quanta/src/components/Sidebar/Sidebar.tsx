import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import WatchlistRow from './WatchlistRow';
import SidebarSearchInput from './SidebarSearchInput';
import SortToggleButton from './SortToggleButton';
import GroupChipList from './GroupChipList';
import ContextMenu from './ContextMenu';
import type { WatchlistStock } from '../../types';

export default function Sidebar() {
  const {
    watchlist, loadWatchlist, addStock, removeStock, togglePin, setReason,
    sortByConvergence, toggleSortByConvergence, activeGroup, setActiveGroup,
    searchText, setSearchText, selectedTicker, selectTicker, showToast,
  } = useAppStore();

  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; stock: WatchlistStock } | null>(null);

  useEffect(() => { loadWatchlist(); }, [loadWatchlist]);

  const filteredSorted = useMemo(() => {
    let list = watchlist.filter((s) => {
      if (activeGroup === 'all') return true;
      if (activeGroup === 'core') return s.tag === 'core';
      if (activeGroup === 'ring') return s.tag === 'ring';
      if (activeGroup === 'pinned') return s.pinned;
      if (activeGroup === 'similarCore') return !!s.similarTo;
      return s.groups.includes(activeGroup);
    });

    if (searchText) {
      const q = searchText.toLowerCase();
      list = list.filter((s) => s.ticker.toLowerCase().includes(q) || s.sector.toLowerCase().includes(q));
    }

    return [...list].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (sortByConvergence) return b.convScore - a.convScore;
      return 0;
    });
  }, [watchlist, activeGroup, searchText, sortByConvergence]);

  const handleEditReason = (ticker: string, current: string | null) => {
    const val = window.prompt(`Ghi chú / lý do theo dõi mã ${ticker}:`, current ?? '');
    if (val !== null) setReason(ticker, val.trim() || null);
  };

  const handleDelete = (ticker: string) => removeStock(ticker);

  return (
    <div className="sidebar">
      <SidebarSearchInput
        searchText={searchText}
        onSearchChange={setSearchText}
        onAddStock={(stock) => { addStock(stock.ticker, stock.sector); }}
      />

      <div className="sb-toolbar">
        <span style={{ fontSize: 9.5, color: 'var(--text-tertiary)', fontWeight: 600 }}>DANH SÁCH MÃ</span>
        <SortToggleButton active={sortByConvergence} onToggle={toggleSortByConvergence} />
      </div>

      <GroupChipList activeGroup={activeGroup} onChange={setActiveGroup} />

      <div className="sb-list">
        {filteredSorted.map((stock) => (
          <WatchlistRow
            key={stock.ticker}
            stock={stock}
            isActive={stock.ticker === selectedTicker}
            onSelect={(s) => selectTicker(s.ticker)}
            onTogglePin={togglePin}
            onEditReason={handleEditReason}
            onDelete={handleDelete}
            onContextMenu={(e, s) => setCtxMenu({ x: e.clientX, y: e.clientY, stock: s })}
          />
        ))}
      </div>

      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          stock={ctxMenu.stock}
          onClose={() => setCtxMenu(null)}
          onAlert={(t) => showToast(`Đã đặt cảnh báo giá cho ${t} (demo).`)}
          onEditNote={(t) => handleEditReason(t, ctxMenu.stock.reason)}
          onViewOnRadar={(t) => {
            selectTicker(t);
            document.querySelector('.radar-block')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
          onTogglePin={togglePin}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
