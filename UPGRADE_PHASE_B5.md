# 🚀 PHASE B5: ADVANCED FEATURES

**Effort:** 28 giờ | **Priority:** LOW-MEDIUM

---

## 1. WebSocket Streaming
```typescript
// hooks/useStockStream.ts
interface PriceData { ticker: string; price: number; changePct: number; }

export function useStockStream(tickers: string[]) {
  const [prices, setPrices] = useState<Record<string, PriceData>>({});
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const ws = new WebSocket(process.env.VITE_WS_ENDPOINT);
    ws.onopen = () => { setConnected(true); ws.send(JSON.stringify({ action: 'subscribe', tickers })); };
    ws.onmessage = (e) => { const d = JSON.parse(e.data); setPrices(p => ({ ...p, [d.ticker]: d })); };
    ws.onclose = () => { setConnected(false); setTimeout(() => connect(), 5000); };
    return () => ws.close();
  }, [tickers.join(',')]);

  return { prices, connected };
}
```

---

## 2. Advanced Filtering
```tsx
// AdvancedFilters.tsx
const defaultFilters = { minFaScore: 0, minEpsGrowth: -20, sectors: [], showOnlyBreakout: false };

export default function AdvancedFilters({ filters, onChange, availableSectors }) {
  return (
    <div className="advanced-filters">
      <div className="filter-section">
        <h5>📊 Điểm số</h5>
        <SliderFilter label="FA Score" min={0} max={100} value={filters.minFaScore}
          onChange={v => onChange({ ...filters, minFaScore: v })} />
        <SliderFilter label="EPS Growth" min={-20} max={50} value={filters.minEpsGrowth}
          onChange={v => onChange({ ...filters, minEpsGrowth: v })} />
      </div>
      <div className="filter-section">
        <h5>🏭 Ngành</h5>
        <SectorSelector selected={filters.sectors} options={availableSectors}
          onChange={s => onChange({ ...filters, sectors: s })} />
      </div>
      <div className="filter-section">
        <h5>🔧 Tín hiệu</h5>
        <CheckboxFilter label="Chỉ Breakout" checked={filters.showOnlyBreakout}
          onChange={v => onChange({ ...filters, showOnlyBreakout: v })} />
        <CheckboxFilter label="Khối ngoại mua ròng" checked={filters.showOnlyForeignNetPositive}
          onChange={v => onChange({ ...filters, showOnlyForeignNetPositive: v })} />
      </div>
      <button onClick={() => onChange(defaultFilters)}>Reset Filters</button>
    </div>
  );
}
```

---

## 3. Backtest Types
```typescript
interface BacktestConfig { startDate: string; endDate: string; initialCapital: number; scenario: Scenario; topN: number; }
interface Trade { ticker: string; entryDate: string; exitDate: string; entryPrice: number; exitPrice: number; pnlPct: number; }
interface BacktestResult { totalReturn: number; sharpeRatio: number; maxDrawdown: number; winRate: number; trades: Trade[]; }
```

---

## 4. CSS cần thêm
```css
.ws-status { display: flex; align-items: center; gap: 6px; }
.ws-indicator { width: 8px; height: 8px; border-radius: 50%; }
.ws-indicator.connected { background: var(--positive); }
.ws-indicator.disconnected { background: var(--negative); }

.advanced-filters { background: var(--bg-surface); border: 1px solid var(--border); border-radius: 10px; padding: 16px; }
.filter-section { margin-bottom: 16px; }
.filter-section h5 { font-size: 11px; color: var(--text-secondary); margin-bottom: 8px; }

.slider { flex: 1; height: 4px; background: var(--bg-surface-2); border-radius: 2px; -webkit-appearance: none; }
.slider::-webkit-slider-thumb { -webkit-appearance: none; width: 14px; height: 14px; background: var(--gold-bright); border-radius: 50%; }

.sector-tags { display: flex; flex-wrap: wrap; gap: 4px; }
.sector-tag { font-size: 10px; padding: 3px 8px; border-radius: 12px; background: var(--bg-surface-2); cursor: pointer; }
.sector-tag.selected { background: rgba(232,184,75,0.2); color: var(--gold-bright); }

.reset-filters-btn { width: 100%; padding: 8px; background: var(--bg-surface-2); border: 1px solid var(--border); border-radius: 6px; }
```

---

## Timeline
```
Day 37-41: WebSocket Streaming (5h)
Day 42-45: Advanced Filtering (4h)
Day 46-49: Backtesting Framework (4h)
Day 50-51: Performance Optimization (2h)
TOTAL: 28 hours
```
