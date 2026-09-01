# 🚀 PHASE B3: MARKET SIGNALS

**Effort:** 16 giờ | **Priority:** CRITICAL

---

## 1. MarketStatusIndicator Component
```tsx
// MarketStatusIndicator.tsx
import { useEffect, useState } from "react";

interface MarketStatusData {
  level: "growth" | "cautious" | "defensive";
  label: string;
  fearGreedScore?: number;
}

export default function MarketStatusIndicator() {
  const [status, setStatus] = useState<MarketStatusData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/market/status')
      .then(r => r.json())
      .then(data => { setStatus(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="market-status skeleton" />;
  if (!status) return null;

  const config = {
    growth: { icon: "🐂", color: "positive", label: "Thị trường tăng" },
    cautious: { icon: "⚖️", color: "neutral", label: "Thị trường trung lập" },
    defensive: { icon: "🐻", color: "negative", label: "Thị trường giảm" }
  };

  const c = config[status.level];
  return (
    <div className={`market-status ${c.color}`}>
      <span className="status-icon">{c.icon}</span>
      <span className="status-label">{c.label}</span>
      {status.fearGreedScore && (
        <span className="fear-greed-score">{status.fearGreedScore}</span>
      )}
    </div>
  );
}
```

---

## 2. TASignalsPanel Component
```tsx
// TASignalsPanel.tsx
interface TASignal {
  breakout: boolean;
  volSpike: number;
  ma50Status: "safe" | "warning" | "broken";
  relativeStrength3m: number | null;
  volumeSpikeRatio: number | null;
}

interface Props {
  ticker: string;
}

export default function TASignalsPanel({ ticker }: Props) {
  const [taData, setTaData] = useState<Record<string, TASignal>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch('/api/market-data?limit=130')
      .then(r => r.json())
      .then(data => {
        const tickerData: Record<string, TASignal> = {};
        data.tickers?.forEach((t: any) => { tickerData[t.ticker] = t; });
        setTaData(tickerData);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [ticker]);

  const signal = taData[ticker];
  if (loading || !signal) return null;

  return (
    <div className="ta-signals-panel">
      <div className="ta-signal">
        <span className="ta-label">Breakout</span>
        <span className={`ta-value ${signal.breakout ? 'positive' : ''}`}>
          {signal.breakout ? '✅' : '❌'}
        </span>
      </div>
      <div className="ta-signal">
        <span className="ta-label">MA50</span>
        <span className={`ta-value ${signal.ma50Status}`}>
          {signal.ma50Status === 'safe' ? '🟢' : 
           signal.ma50Status === 'warning' ? '🟡' : '🔴'}
        </span>
      </div>
      <div className="ta-signal">
        <span className="ta-label">Vol Spike</span>
        <span className="ta-value">{signal.volumeSpikeRatio?.toFixed(1)}x</span>
      </div>
      <div className="ta-signal">
        <span className="ta-label">RS 3m</span>
        <span className={`ta-value ${(signal.relativeStrength3m ?? 0) > 0 ? 'positive' : 'negative'}`}>
          {signal.relativeStrength3m?.toFixed(1)}%
        </span>
      </div>
    </div>
  );
}
```

---

## 3. Price Data Integration
```typescript
// tang1.ts - Cập nhật interface
export interface Tang1StockEnhanced extends Tang1ScenarioStock {
  price?: number;
  changePct?: number;
  volume?: number;
  foreignNet?: number;
  taSignal?: TASignal;
}
```

---

## 4. CSS cần thêm
```css
/* Market Status */
.market-status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 8px;
}
.market-status.positive { background: rgba(76, 175, 80, 0.15); color: var(--positive); }
.market-status.negative { background: rgba(244, 67, 54, 0.15); color: var(--negative); }
.market-status.neutral { background: var(--bg-surface-2); color: var(--text-secondary); }
.status-icon { font-size: 16px; }
.fear-greed-score { font-weight: 700; margin-left: 4px; }

/* TA Signals Panel */
.ta-signals-panel { display: flex; gap: 12px; }
.ta-signal { text-align: center; }
.ta-label { display: block; font-size: 9px; color: var(--text-tertiary); }
.ta-value { font-size: 14px; font-weight: 600; }
.ta-value.positive { color: var(--positive); }
.ta-value.negative { color: var(--negative); }
.ta-value.safe { color: var(--positive); }
.ta-value.warning { color: #FFC107; }
.ta-value.broken { color: var(--negative); }

/* Price Display */
.t1-price { font-family: var(--font-mono); }
.t1-change-up { color: var(--positive); }
.t1-change-down { color: var(--negative); }
```

---

## Timeline
```
Day 11-14: MarketStatusIndicator Component (4h)
Day 15-17: TASignalsPanel Component (3h)
Day 18-20: Price Data Integration (3h)
Day 21-22: Market Regime Visualization (2h)

TOTAL: 16 hours
```
