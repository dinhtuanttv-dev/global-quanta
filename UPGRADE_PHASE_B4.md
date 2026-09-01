# 🚀 PHASE B4: PATTERN & MACRO

**Effort:** 20 giờ | **Priority:** MEDIUM

---

## 1. PatternBadge Component
```tsx
// PatternBadge.tsx
interface PatternMatch {
  ticker: string;
  pattern: string;
  confidenceScore: number;
  breakout: boolean;
}

interface Props {
  patterns: PatternMatch[];
}

export default function PatternBadge({ patterns }: Props) {
  if (!patterns || patterns.length === 0) return null;

  const getConfidenceClass = (score: number) => {
    if (score >= 80) return 'high';
    if (score >= 60) return 'medium';
    return 'low';
  };

  return (
    <div className="pattern-badges">
      {patterns.slice(0, 2).map((p, i) => (
        <span 
          key={i} 
          className={`pattern-badge ${getConfidenceClass(p.confidenceScore)}`}
          title={`Confidence: ${p.confidenceScore}%`}
        >
          {p.pattern}
          {p.breakout && <span className="breakout-icon">🚀</span>}
        </span>
      ))}
    </div>
  );
}
```

---

## 2. ConvergenceScore Component
```tsx
// ConvergenceScore.tsx
interface ConvergenceResult {
  ticker: string;
  compositeScore: number;
  faScore: number;
  techScore: number;
  macroScore: number;
  catalystScore: number;
}

interface Props {
  ticker: string;
}

export default function ConvergenceScore({ ticker }: Props) {
  const [convergence, setConvergence] = useState<ConvergenceResult | null>(null);

  useEffect(() => {
    fetch('/api/convergence-scan')
      .then(r => r.json())
      .then(data => {
        const result = data.results?.find((r: any) => r.ticker === ticker);
        setConvergence(result || null);
      });
  }, [ticker]);

  if (!convergence) return null;

  return (
    <div className="convergence-score">
      <div className="convergence-ring">
        <svg viewBox="0 0 36 36">
          <path
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            fill="none"
            stroke="var(--bg-surface-2)"
            strokeWidth="3"
          />
          <path
            d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            fill="none"
            stroke="var(--gold-bright)"
            strokeWidth="3"
            strokeDasharray={`${convergence.compositeScore}, 100`}
          />
        </svg>
        <span className="score-value">{convergence.compositeScore}</span>
      </div>
      <div className="score-breakdown">
        <span title="Fundamental Analysis">FA: {convergence.faScore}</span>
        <span title="Technical Analysis">Tech: {convergence.techScore}</span>
        <span title="Macro">Macro: {convergence.macroScore}</span>
      </div>
    </div>
  );
}
```

---

## 3. CatalystBanner Component
```tsx
// CatalystBanner.tsx
interface CatalystEvent {
  id: string;
  title: string;
  executionDate: string;
  daysRemaining: number;
  direction: "benefit" | "harm";
  category: string;
  impactedTickers: string[];
}

export default function CatalystBanner() {
  const [catalysts, setCatalysts] = useState<CatalystEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/catalysts/latest')
      .then(r => r.json())
      .then(data => {
        setCatalysts(data.events || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <CatalystSkeleton />;
  if (catalysts.length === 0) return null;

  const upcoming = catalysts.filter(c => c.daysRemaining <= 7);

  return (
    <div className="catalyst-banner">
      <h4>📢 Sự kiện sắp tới</h4>
      <div className="catalyst-list">
        {upcoming.slice(0, 5).map(event => (
          <div key={event.id} className={`catalyst-item ${event.direction}`}>
            <span className="catalyst-icon">
              {event.direction === 'benefit' ? '📈' : '📉'}
            </span>
            <div className="catalyst-info">
              <span className="catalyst-title">{event.title}</span>
              <span className="catalyst-date">
                Còn {event.daysRemaining} ngày
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## 4. CSS cần thêm
```css
/* Pattern Badges */
.pattern-badges { display: flex; gap: 4px; flex-wrap: wrap; }
.pattern-badge { 
  font-size: 9px; 
  padding: 2px 6px; 
  border-radius: 4px; 
}
.pattern-badge.high { background: rgba(76, 175, 80, 0.2); color: var(--positive); }
.pattern-badge.medium { background: rgba(255, 193, 7, 0.2); color: #FFC107; }
.pattern-badge.low { background: var(--bg-surface-2); color: var(--text-secondary); }
.breakout-icon { margin-left: 2px; }

/* Convergence Score */
.convergence-score { display: flex; align-items: center; gap: 8px; }
.convergence-ring { position: relative; width: 40px; height: 40px; }
.convergence-ring svg { width: 100%; height: 100%; }
.score-value { 
  position: absolute; 
  top: 50%; 
  left: 50%; 
  transform: translate(-50%, -50%); 
  font-size: 10px; 
  font-weight: 700; 
}
.score-breakdown { font-size: 9px; color: var(--text-tertiary); display: flex; gap: 4px; }

/* Catalyst Banner */
.catalyst-banner { 
  background: var(--bg-surface); 
  border: 1px solid var(--border); 
  border-radius: 8px; 
  padding: 12px; 
}
.catalyst-banner h4 { font-size: 12px; margin-bottom: 8px; }
.catalyst-item { 
  display: flex; 
  gap: 8px; 
  padding: 6px; 
  border-radius: 6px; 
  margin-bottom: 4px; 
}
.catalyst-item.benefit { background: rgba(76, 175, 80, 0.1); }
.catalyst-item.harm { background: rgba(244, 67, 54, 0.1); }
.catalyst-icon { font-size: 14px; }
.catalyst-title { display: block; font-size: 11px; }
.catalyst-date { font-size: 9px; color: var(--text-tertiary); }
```

---

## Timeline
```
Day 23-26: Pattern Scan Integration (4h)
Day 27-30: Convergence Scoring (4h)
Day 31-33: Catalyst Banner (3h)
Day 34-36: Macro Events Display (3h)

TOTAL: 20 hours
```
