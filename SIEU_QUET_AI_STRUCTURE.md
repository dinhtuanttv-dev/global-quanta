# 📊 SƠ ĐỒ CẤU TRÚC - TAB SIÊU QUÉT AI

**Ngày:** 2026-09-01 | **Dự án:** global-quanta-react_1 + quant-macro-scanner

---

## I. KIẾN TRÚC TỔNG THỂ

```
┌─────────────────────────────────────────────────────────────────────┐
│           🖥️ FRONTEND (global-quanta-react_1)                      │
├─────────────────────────────────────────────────────────────────────┤
│  SieuQuetAiTab.tsx (Main Container)                                  │
│  ├── State: scenario, data, loading, error, viewMode                │
│  ├── CommandCenterBar → ScenarioSwitcher                            │
│  └── Tang1Table → Tang1TableRow (×20)                               │
│                                                                     │
│  🔌 Services: tang1Api.ts                                           │
│  📝 Types: tang1.ts                                                  │
│  🎨 Styling: App.css                                                 │
└─────────────────────────────────────────────────────────────────────┘
                              │ HTTP GET /api/tang1
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│           🚀 BACKEND (quant-macro-scanner)                          │
├─────────────────────────────────────────────────────────────────────┤
│  ✅ /api/tang1 (Used)                                               │
│  ⚠️ /api/pattern-scan | convergence-scan | golden-filter            │
│  ⚠️ /api/catalysts | market-data | market/status                    │
│                                                                     │
│  📚 Lib: quant-funnel/ (T1-T4), quant-data.ts, scenario-weights.ts  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## II. CẤU TRÚC FILE

### Frontend
```
src/components/MainTabs/SieuQuetAI/
├── SieuQuetAiTab.tsx       (51 lines) ← Main
├── CommandCenterBar.tsx    (18 lines) ← Scenario bar
├── ScenarioSwitcher.tsx    (29 lines) ← Buttons
├── Tang1Table.tsx          (31 lines) ← Table
└── Tang1TableRow.tsx       (44 lines) ← Row
src/services/tang1Api.ts    (9 lines)
src/types/tang1.ts          (20 lines)
```

### Backend
```
app/api/
├── tang1/route.ts              ← Main
├── pattern-scan/route.ts       ← Patterns
├── convergence-scan/route.ts   ← Confluence
├── golden-filter/route.ts      ← Quality
├── catalysts/latest/route.ts   ← Events
├── market-data/route.ts        ← Market data
├── market-data/latest/route.ts ← Prices
├── scored-stocks/route.ts      ← Top 20
├── quant-funnel/route.ts       ← T1-T4
└── market/status/route.ts      ← Regime

lib/quant-funnel/
├── quant-funnel.ts             ← Core algorithms
└── computeTang1WithScenario.ts ← Re-ranking
lib/quant-data.ts               ← 130 stocks + TA
lib/quant-funnel-scenario-weights.ts
```

---

## III. DATA FLOW

```
User Click → SieuQuetAiTab.useEffect → tang1Api.fetch()
    ↓
fetch('/api/tang1?scenario=growth')
    ↓
Next.js route → computeTang1(stockUniverse)
    ↓
computeTang1WithScenario(top20, scenario)
    ↓
Tang1ApiResponse → setData() → render
```

---

## IV. CORE ALGORITHM

### Tang1 Scoring
```typescript
tang1Score = faScore * 0.55 + Math.min(epsGrowth, 35) * 1.3
// FPT: 92*0.55 + 24.5*1.3 = 82.45
```

### Scenario Re-ranking
```typescript
scenarioScore = 
  normalize(epsGrowth, 40) * epsWeight +
  momentumProxy(ticker) * (rsWeight + volWeight) +
  stabilityScore(ticker) * stableWeight
```

### Scenario Weights
| Scenario | EPS | RS | Vol | Stable |
|----------|-----|-----|-----|--------|
| GROWTH | 25% | 35% | 25% | 15% |
| CAUTIOUS | 25% | 25% | 20% | 30% |
| DEFENSIVE | 20% | 10% | 10% | 60% |

---

## V. API ENDPOINTS

### Used ✅
```bash
GET /api/tang1?scenario={growth|cautious|defensive}
→ { tang1Result, tang1WithScenario, scenario, universeSize }
```

### Available ⚠️
```bash
/api/pattern-scan       # Technical patterns
/api/convergence-scan   # Signal confluence
/api/golden-filter      # Quality stocks
/api/catalysts/latest   # Market events
/api/market-data        # Full market data
/api/market-data/latest # Latest prices
/api/scored-stocks      # Top 20 tech
/api/quant-funnel       # Funnel T1-T4
/api/market/status      # Market regime
```

---

## VI. COMPONENT RELATIONSHIP

```
SieuQuetAiTab (Main)
├── CommandCenterBar
│   └── ScenarioSwitcher
│       └── [growth | cautious | defensive]
├── Tang1Table
│   └── Tang1TableRow ×20
│       ├── # (rank)
│       ├── Ma CP + Sector
│       ├── EPS Growth (colored)
│       ├── FA Score
│       ├── Diem Tang 1
│       └── [Diem kich ban] (if scenario mode)
├── [Loading] Tang1TableSkeleton
└── [Error] Error Message
```

---

## VII. STOCK UNIVERSE SAMPLE

```typescript
// 130 stocks in quant-data.ts
{ ticker: 'FPT', sector: 'Cong nghe', epsGrowth: 24.5, faScore: 92 }
{ ticker: 'PVS', sector: 'Dau khi', epsGrowth: 18.2, faScore: 86 }
{ ticker: 'TCB', sector: 'Ngan hang', epsGrowth: 15.8, faScore: 84 }

// TA Signals in taSignalPool
FPT: { breakout: true, volSpike: 2.1, foreignNet: 45.2, ma50Status: 'safe' }
VCB: { breakout: false, volSpike: 0.9, foreignNet: 65.3, ma50Status: 'safe' }
HPG: { breakout: false, volSpike: 1.2, foreignNet: -22.1, ma50Status: 'broken' }
```
