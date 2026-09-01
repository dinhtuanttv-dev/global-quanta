# 🚀 PHASE B2.5: QUICK WINS

**Effort:** 10.5 giờ | **Priority:** HIGH

---

## 1. Type Definitions Sync
```typescript
// tang1.ts - Thêm interfaces
export interface Tang1EnhancedStock extends Tang1ScenarioStock {
  price?: number;
  changePct?: number;
  taSignal?: TASignal;
  patternMatches?: PatternMatch[];
}

export interface TASignal {
  breakout: boolean;
  volSpike: number;
  ma50Status: "safe" | "warning" | "broken";
  pattern?: string;
}

export interface PatternMatch {
  ticker: string;
  pattern: string;
  confidenceScore: number;
  breakout: boolean;
}
```

---

## 2. Error Handling Enhancement
```typescript
// tang1Api.ts
export async function fetchTang1(scenario: Scenario): Promise<Tang1ApiResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  
  try {
    const res = await fetch(`${API_BASE}/api/tang1?scenario=${scenario}`, {
      signal: controller.signal
    });
    clearTimeout(timeout);
    
    if (!res.ok) {
      const errorMessages: Record<number, string> = {
        400: 'Yêu cầu không hợp lệ',
        500: 'Lỗi server nội bộ',
        502: 'Gateway không phản hồi',
        503: 'Dịch vụ tạm thời không khả dụng'
      };
      throw new Error(errorMessages[res.status] || `API lỗi: ${res.status}`);
    }
    return res.json();
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Yêu cầu timeout - server quá chậm.');
    }
    throw err;
  }
}
```

---

## 3. Loading Skeleton
```tsx
// Tang1TableSkeleton.tsx
export function Tang1TableSkeleton() {
  return (
    <div className="tang1-table-wrap">
      <table className="tang1-table">
        <thead>
          <tr>
            <th>#</th><th>Mã CP</th><th>EPS</th><th>FA</th><th>Điểm T1</th>
          </tr>
        </thead>
        <tbody>
          {[...Array(5)].map((_, i) => (
            <tr key={i} className="skeleton-row">
              <td><div className="skeleton w28" /></td>
              <td><div className="skeleton w60" /></td>
              <td><div className="skeleton w50" /></td>
              <td><div className="skeleton w50" /></td>
              <td><div className="skeleton w70" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

---

## 4. Scenario Descriptions
```typescript
// scenarioConfig.ts
export const SCENARIO_METADATA = {
  growth: {
    title: "Tăng trưởng",
    icon: "📈",
    description: "Ưu tiên cổ phiếu có EPS tăng trưởng mạnh, momentum cao",
    recommendedFor: "Thị trường tăng, nhà đầu tư agresive",
    weights: { epsGrowthWeight: 0.25, rsWeight: 0.35, volumeSpikeWeight: 0.25, stabilityWeight: 0.15 }
  },
  cautious: {
    title: "Thận trọng",
    icon: "⚖️",
    description: "Cân bằng giữa tăng trưởng và bảo toàn vốn",
    recommendedFor: "Thị trường không rõ ràng",
    weights: { epsGrowthWeight: 0.25, rsWeight: 0.25, volumeSpikeWeight: 0.20, stabilityWeight: 0.30 }
  },
  defensive: {
    title: "Phòng thủ",
    icon: "🛡️",
    description: "Tập trung vào cổ phiếu ổn định, ít biến động",
    recommendedFor: "Thị trường giảm, nhà đầu tư bảo toàn",
    weights: { epsGrowthWeight: 0.20, rsWeight: 0.10, volumeSpikeWeight: 0.10, stabilityWeight: 0.60 }
  }
} as const;
```

---

## 5. CSS cần thêm
```css
/* Skeleton */
.skeleton { background: var(--bg-surface-2); border-radius: 4px; animation: pulse 1.5s infinite; }
.skeleton-row td { padding: 9px 12px; }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }

/* Scenario Tooltip */
.scenario-btn { position: relative; }
.scenario-btn:hover::after {
  content: attr(data-description);
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  background: var(--bg-surface);
  border: 1px solid var(--border);
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 11px;
  white-space: nowrap;
  z-index: 100;
}
```

---

## Timeline
```
Day 1-2: Type Definitions Sync (3h)
Day 3-4: Error Handling Enhancement (2h)
Day 5: Loading Skeleton (1h)
Day 6-7: Scenario Descriptions + Tooltips (2h)
Day 8-10: Unit Tests (2.5h)

TOTAL: 10.5 hours
```
