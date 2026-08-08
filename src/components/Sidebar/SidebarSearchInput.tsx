import { useEffect, useState } from 'react';
import * as api from '../../services/api';
import type { AddableStock } from '../../types';

interface Props {
  searchText: string;
  onSearchChange: (t: string) => void;
  onAddStock: (stock: AddableStock) => void;
}

export default function SidebarSearchInput({ searchText, onSearchChange, onAddStock }: Props) {
  const [suggestion, setSuggestion] = useState<AddableStock | null>(null);

  useEffect(() => {
    if (!searchText) { setSuggestion(null); return; }
    let cancelled = false;
    api.searchAddableStocks(searchText).then((results) => {
      if (!cancelled) setSuggestion(results[0] ?? null);
    });
    return () => { cancelled = true; };
  }, [searchText]);

  return (
    <>
      <input
        className="sb-search"
        placeholder="🔍 Tìm hoặc thêm mã cổ phiếu..."
        autoComplete="off"
        value={searchText}
        onChange={(e) => onSearchChange(e.target.value)}
      />
      {suggestion && (
        <div
          className="sb-add-suggestion show"
          onClick={() => { onAddStock(suggestion); onSearchChange(''); }}
        >
          + Thêm {suggestion.ticker} ({suggestion.sector}) vào danh sách
        </div>
      )}
    </>
  );
}
