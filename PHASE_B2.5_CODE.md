# 🔧 PHASE B2.5 - IMPLEMENTATION CODE SNIPPETS

## Ready-to-Use Code for Quick Wins

---

## 1️⃣ Type Definitions Sync & Enhancement

### File: `src/types/tang1.ts`

```typescript
// BEFORE
export type Scenario = "growth" | "cautious" | "defensive";

export interface Tang1Stock {
  ticker: string;
  sector: string;
  epsGrowth: number;
  faScore: number;
  tang1Score: number;
}

export interface Tang1ScenarioStock extends Tang1Stock {
  scenarioScore: number;
}

export interface Tang1ApiResponse {
  tang1Result: Tang1Stock[];
  tang1WithScenario: Tang1ScenarioStock[];
  scenario: Scenario;
  universeSize: number;
}

// ============================================

// AFTER (Enhanced)
export type Scenario = "growth" | "cautious" | "defensive";

export interface TASignals {
  ma50Status: "safe" | "warning" | "broken";
  breakout: boolean;
  volSpike: number;
  rsi?: number;
  macd?: string;
}

export interface Tang1Stock {
  ticker: string;
  sector: string;
  epsGrowth: number;
  faScore: number;
  tang1Score: number;
  ta?: TASignals; // Add TA signals
}

export interface Tang1ScenarioStock extends Tang1Stock {
  scenarioScore: number;
  confidence?: number; // 0-1 confidence metric
  momentum?: number;   // Momentum indicator
  rank?: number;       // Rank in scenario
}

export interface Tang1ApiResponse {
  tang1Result: Tang1Stock[];
  tang1WithScenario: Tang1ScenarioStock[];
  scenario: Scenario;
  universeSize: number;
  generatedAt?: string;     // Add timestamp
  cacheExpiry?: number;     // Cache info
  lastRefresh?: string;     // Last refresh time
}

// Scenario metadata
export const SCENARIO_METADATA: Record<Scenario, {
  label: string;
  description: string;
  riskLevel: "low" | "medium" | "high";
  icon: string;
}> = {
  growth: {
    label: "Tăng trưởng",
    description: "Ưu tiên EPS tăng & momentum mạnh (Risk: Cao)",
    riskLevel: "high",
    icon: "🚀"
  },
  cautious: {
    label: "Thận trọng",
    description: "Cân bằng giữa tăng trưởng & ổn định (Risk: Trung bình)",
    riskLevel: "medium",
    icon: "⚖️"
  },
  defensive: {
    label: "Phòng thủ",
    description: "Ưu tiên ổn định & giảm volatility (Risk: Thấp)",
    riskLevel: "low",
    icon: "🛡️"
  }
};
```

---

## 2️⃣ Enhanced API Service with Error Handling

### File: `src/services/tang1Api.ts`

```typescript
// BEFORE
import type { Scenario, Tang1ApiResponse } from "../types/tang1";

const API_BASE = "https://tuan-quant-scanner-9lwpafmq-dinhtuanttv-devs-projects.vercel.app";

export async function fetchTang1(scenario: Scenario): Promise<Tang1ApiResponse> {
  const res = await fetch(`${API_BASE}/api/tang1?scenario=${scenario}`);
  if (!res.ok) throw new Error(`Tang1 API loi: ${res.status}`);
  return res.json();
}

// ============================================

// AFTER (Enhanced)
import type { Scenario, Tang1ApiResponse } from "../types/tang1";

const API_BASE = "https://tuan-quant-scanner-9lwpafmq-dinhtuanttv-devs-projects.vercel.app";

export class Tang1ApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    message: string
  ) {
    super(message);
    this.name = "Tang1ApiError";
  }
}

export async function fetchTang1(scenario: Scenario): Promise<Tang1ApiResponse> {
  // Validate scenario parameter
  const validScenarios: Scenario[] = ["growth", "cautious", "defensive"];
  if (!validScenarios.includes(scenario)) {
    throw new Tang1ApiError(400, "Bad Request", `Kịch bản không hợp lệ: ${scenario}`);
  }

  try {
    const url = `${API_BASE}/api/tang1?scenario=${scenario}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) {
      let errorMsg = `API lỗi: ${res.status} ${res.statusText}`;
      try {
        const errorData = await res.json();
        if (errorData.message) errorMsg = errorData.message;
      } catch {
        // Use default error message
      }
      throw new Tang1ApiError(res.status, res.statusText, errorMsg);
    }

    const data: Tang1ApiResponse = await res.json();

    // Validate response structure
    if (!Array.isArray(data.tang1Result) || data.tang1Result.length === 0) {
      throw new Tang1ApiError(
        500,
        "Internal Server Error",
        "Dữ liệu Tang1 trống hoặc không hợp lệ"
      );
    }

    if (!Array.isArray(data.tang1WithScenario)) {
      throw new Tang1ApiError(
        500,
        "Internal Server Error",
        "Dữ liệu kịch bản không hợp lệ"
      );
    }

    // Add generated timestamp if not present
    if (!data.generatedAt) {
      data.generatedAt = new Date().toISOString();
    }

    return data;
  } catch (err) {
    if (err instanceof Tang1ApiError) {
      throw err;
    }

    if (err instanceof TypeError && err.message.includes("abort")) {
      throw new Tang1ApiError(
        408,
        "Request Timeout",
        "Yêu cầu quá lâu, vui lòng thử lại"
      );
    }

    throw new Tang1ApiError(
      500,
      "Unknown Error",
      `Lỗi không xác định: ${err instanceof Error ? err.message : "Unknown"}`
    );
  }
}

// Retry helper for failed requests
export async function fetchTang1WithRetry(
  scenario: Scenario,
  maxRetries: number = 3
): Promise<Tang1ApiResponse> {
  let lastError: Tang1ApiError | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fetchTang1(scenario);
    } catch (err) {
      lastError = err instanceof Tang1ApiError ? err : null;

      // Don't retry on validation errors
      if (lastError?.status === 400) throw err;

      // Wait before retrying (exponential backoff)
      if (attempt < maxRetries - 1) {
        await new Promise((resolve) =>
          setTimeout(resolve, Math.pow(2, attempt) * 1000)
        );
      }
    }
  }

  throw lastError || new Tang1ApiError(
    500,
    "Max Retries",
    "Không thể tải dữ liệu sau nhiều lần thử"
  );
}
```

---

## 3️⃣ Enhanced ScenarioSwitcher with Tooltips

### File: `src/components/MainTabs/SieuQuetAI/ScenarioSwitcher.tsx`

```typescript
// BEFORE
import type { Scenario } from "../../../types/tang1";

interface Props {
  value: Scenario;
  onChange: (s: Scenario) => void;
}

const OPTIONS: { key: Scenario; label: string }[] = [
  { key: "growth", label: "Tang truong" },
  { key: "cautious", label: "Than trong" },
  { key: "defensive", label: "Phong thu" },
];

export default function ScenarioSwitcher({ value, onChange }: Props) {
  return (
    <div className="scenario-switcher">
      {OPTIONS.map((opt) => (
        <button
          key={opt.key}
          type="button"
          className={`scenario-btn ${value === opt.key ? "active" : ""}`}
          onClick={() => onChange(opt.key)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ============================================

// AFTER (Enhanced with Tooltips & Descriptions)
import type { Scenario } from "../../../types/tang1";
import { SCENARIO_METADATA } from "../../../types/tang1";

interface Props {
  value: Scenario;
  onChange: (s: Scenario) => void;
  disabled?: boolean;
}

export default function ScenarioSwitcher({ value, onChange, disabled }: Props) {
  const [activeTooltip, setActiveTooltip] = React.useState<Scenario | null>(null);

  return (
    <div className="scenario-switcher" title="Chọn kịch bản phân tích">
      {(Object.keys(SCENARIO_METADATA) as Scenario[]).map((key) => {
        const meta = SCENARIO_METADATA[key];
        return (
          <div key={key} className="scenario-btn-wrapper">
            <button
              type="button"
              className={`scenario-btn ${value === key ? "active" : ""}`}
              onClick={() => onChange(key)}
              disabled={disabled}
              onMouseEnter={() => setActiveTooltip(key)}
              onMouseLeave={() => setActiveTooltip(null)}
              aria-pressed={value === key}
              aria-label={`Kịch bản ${meta.label}: ${meta.description}`}
            >
              <span className="scenario-icon">{meta.icon}</span>
              <span className="scenario-label">{meta.label}</span>
              {value === key && <span className="scenario-check">✓</span>}
            </button>

            {activeTooltip === key && (
              <div className="scenario-tooltip">
                <div className="tooltip-label">{meta.label}</div>
                <div className="tooltip-desc">{meta.description}</div>
                <div className="tooltip-risk">
                  <span className="risk-label">Mức rủi ro:</span>
                  <span className={`risk-badge risk-${meta.riskLevel}`}>
                    {meta.riskLevel === "low"
                      ? "🟢 Thấp"
                      : meta.riskLevel === "medium"
                      ? "🟡 Trung bình"
                      : "🔴 Cao"}
                  </span>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

---

## 4️⃣ Enhanced SieuQuetAiTab with Timestamp & Better UX

### File: `src/components/MainTabs/SieuQuetAI/SieuQuetAiTab.tsx`

```typescript
// BEFORE
import { useEffect, useState } from "react";
import CommandCenterBar from "./CommandCenterBar";
import Tang1Table from "./Tang1Table";
import { fetchTang1 } from "../../../services/tang1Api";
import type { Scenario, Tang1ApiResponse } from "../../../types/tang1";

export default function SieuQuetAiTab() {
  const [scenario, setScenario] = useState<Scenario>("growth");
  const [data, setData] = useState<Tang1ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"default" | "scenario">("default");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchTang1(scenario)
      .then((res) => { if (!cancelled) setData(res); })
      .catch((err) => { if (!cancelled) setError(String(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [scenario]);

  return (
    <div className="sieu-quet-ai-tab">
      <CommandCenterBar scenario={scenario} onScenarioChange={setScenario} />

      <div className="t1-toolbar">
        <span className="t1-toolbar-title">TANG 1: SIEU QUET AI - TOP 20 THEO FA &amp; EPS GROWTH</span>
        <button
          type="button"
          className={`t1-view-toggle ${viewMode === "scenario" ? "active" : ""}`}
          onClick={() => setViewMode((v) => (v === "default" ? "scenario" : "default"))}
        >
          {viewMode === "scenario" ? "Dang xem theo kich ban" : "Xem theo kich ban"}
        </button>
      </div>

      {loading && <div className="t1-state-msg">Dang tai du lieu Tang 1...</div>}
      {error && <div className="t1-state-msg t1-error">Khong tai duoc du lieu: {error}</div>}

      {!loading && !error && data && (
        <Tang1Table
          rows={viewMode === "scenario" ? data.tang1WithScenario : data.tang1Result}
          showScenarioScore={viewMode === "scenario"}
        />
      )}
    </div>
  );
}

// ============================================

// AFTER (Enhanced)
import { useEffect, useState, useCallback, useMemo } from "react";
import CommandCenterBar from "./CommandCenterBar";
import Tang1Table from "./Tang1Table";
import { fetchTang1, Tang1ApiError } from "../../../services/tang1Api";
import type { Scenario, Tang1ApiResponse } from "../../../types/tang1";

export default function SieuQuetAiTab() {
  const [scenario, setScenario] = useState<Scenario>("growth");
  const [data, setData] = useState<Tang1ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"default" | "scenario">("default");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchTang1(scenario);
      setData(result);
      setLastRefresh(new Date());
    } catch (err) {
      if (err instanceof Tang1ApiError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Lỗi không xác định khi tải dữ liệu");
      }
    } finally {
      setLoading(false);
    }
  }, [scenario]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      const result = await fetchTang1(scenario);
      setData(result);
      setLastRefresh(new Date());
      setError(null);
    } catch (err) {
      if (err instanceof Tang1ApiError) {
        setError(err.message);
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  const formattedLastRefresh = useMemo(() => {
    if (!lastRefresh) return null;
    const now = new Date();
    const diffMs = now.getTime() - lastRefresh.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return "Vừa xong";
    if (diffMins < 60) return `${diffMins} phút trước`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} giờ trước`;
    return lastRefresh.toLocaleString("vi-VN");
  }, [lastRefresh]);

  return (
    <div className="sieu-quet-ai-tab">
      <CommandCenterBar scenario={scenario} onScenarioChange={setScenario} />

      <div className="t1-toolbar">
        <div className="t1-toolbar-left">
          <span className="t1-toolbar-title">
            TANG 1: SIEU QUET AI - TOP 20 THEO FA &amp; EPS GROWTH
          </span>
          {!loading && formattedLastRefresh && (
            <span className="t1-refresh-time" title={lastRefresh?.toLocaleString("vi-VN")}>
              🕐 {formattedLastRefresh}
            </span>
          )}
        </div>

        <div className="t1-toolbar-right">
          <button
            type="button"
            className="t1-refresh-btn"
            onClick={handleManualRefresh}
            disabled={loading || isRefreshing}
            title="Làm mới dữ liệu"
          >
            {isRefreshing ? "⟳ Đang làm mới..." : "⟳ Làm mới"}
          </button>

          <button
            type="button"
            className={`t1-view-toggle ${viewMode === "scenario" ? "active" : ""}`}
            onClick={() => setViewMode((v) => (v === "default" ? "scenario" : "default"))}
            title={viewMode === "default" ? "Xem theo kịch bản" : "Xem điểm mặc định"}
          >
            {viewMode === "scenario" ? "Đang xem kịch bản" : "Xem kịch bản"}
          </button>
        </div>
      </div>

      {loading && <LoadingSkeletonTable />}

      {error && (
        <div className="t1-error-banner">
          <div className="t1-error-icon">⚠️</div>
          <div className="t1-error-content">
            <div className="t1-error-title">Không thể tải dữ liệu</div>
            <div className="t1-error-message">{error}</div>
          </div>
          <button className="t1-error-close" onClick={() => setError(null)}>
            ✕
          </button>
        </div>
      )}

      {!loading && !error && data && (
        <>
          <div className="t1-data-info">
            <span>📊 Vũ trụ: {data.universeSize} cổ phiếu</span>
            <span>📈 Hiển thị: Top 20 theo {scenario === "growth" ? "tăng trưởng" : scenario === "cautious" ? "thận trọng" : "phòng thủ"}</span>
          </div>
          <Tang1Table
            rows={viewMode === "scenario" ? data.tang1WithScenario : data.tang1Result}
            showScenarioScore={viewMode === "scenario"}
          />
        </>
      )}
    </div>
  );
}

// Loading skeleton component
function LoadingSkeletonTable() {
  return (
    <div className="t1-loading-skeleton">
      <div className="skeleton-header" />
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="skeleton-row" />
      ))}
    </div>
  );
}
```

---

## 5️⃣ New CSS Classes for Phase B2.5

### File: `src/styles/App.css` (Add to existing styles)

```css
/* ===== TANG1 ENHANCEMENTS (PHASE B2.5) ===== */

/* Scenario Switcher Enhancements */
.scenario-switcher {
  display: flex;
  gap: 4px;
  background: var(--bg-surface-2);
  padding: 3px;
  border-radius: 8px;
  position: relative;
}

.scenario-btn-wrapper {
  position: relative;
}

.scenario-btn {
  padding: 6px 12px;
  border: none;
  background: transparent;
  border-radius: 6px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  transition: all 0.15s;
}

.scenario-icon {
  font-size: 14px;
}

.scenario-label {
  display: none;
}

.scenario-check {
  display: none;
  font-weight: 700;
  color: var(--gold-bright);
}

.scenario-btn.active {
  background: #232C40;
  color: var(--gold-bright);
}

.scenario-btn.active .scenario-label {
  display: inline;
}

.scenario-btn.active .scenario-check {
  display: inline;
}

.scenario-btn:hover:not(:disabled) {
  background: rgba(232, 184, 75, 0.08);
}

.scenario-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Tooltip */
.scenario-tooltip {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 0;
  background: #1a2332;
  border: 1px solid rgba(232, 184, 75, 0.4);
  border-radius: 8px;
  padding: 10px 12px;
  white-space: nowrap;
  z-index: 100;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  animation: tooltip-in 0.2s ease-out;
}

@keyframes tooltip-in {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.tooltip-label {
  font-weight: 700;
  font-size: 11px;
  color: var(--gold-bright);
  margin-bottom: 4px;
}

.tooltip-desc {
  font-size: 10px;
  color: var(--text-secondary);
  margin-bottom: 6px;
  line-height: 1.4;
}

.tooltip-risk {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 9.5px;
}

.risk-label {
  color: var(--text-tertiary);
  font-weight: 600;
}

.risk-badge {
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 600;
}

.risk-badge.risk-low {
  background: rgba(52, 211, 153, 0.12);
  color: var(--positive);
}

.risk-badge.risk-medium {
  background: rgba(251, 191, 36, 0.12);
  color: var(--warning);
}

.risk-badge.risk-high {
  background: rgba(248, 113, 113, 0.12);
  color: var(--negative);
}

/* Toolbar Enhancements */
.t1-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  gap: 12px;
}

.t1-toolbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.t1-toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.t1-refresh-time {
  font-size: 10px;
  color: var(--text-tertiary);
  background: var(--bg-surface-2);
  padding: 4px 8px;
  border-radius: 4px;
  font-family: var(--font-mono);
}

.t1-refresh-btn {
  font-size: 10.5px;
  font-weight: 600;
  padding: 5px 10px;
  border-radius: 6px;
  background: var(--bg-surface-2);
  border: 1px solid var(--border);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s;
}

.t1-refresh-btn:hover:not(:disabled) {
  color: var(--gold-bright);
  border-color: rgba(232, 184, 75, 0.4);
  background: rgba(232, 184, 75, 0.08);
}

.t1-refresh-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Error Banner */
.t1-error-banner {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  background: rgba(248, 113, 113, 0.08);
  border: 1px solid rgba(248, 113, 113, 0.35);
  border-radius: 8px;
  padding: 12px 14px;
  margin-bottom: 12px;
}

.t1-error-icon {
  flex-shrink: 0;
  font-size: 18px;
}

.t1-error-content {
  flex: 1;
}

.t1-error-title {
  font-weight: 600;
  font-size: 12px;
  color: var(--negative);
  margin-bottom: 4px;
}

.t1-error-message {
  font-size: 11px;
  color: var(--text-secondary);
  line-height: 1.5;
}

.t1-error-close {
  flex-shrink: 0;
  background: none;
  border: none;
  color: var(--text-tertiary);
  cursor: pointer;
  font-size: 14px;
  padding: 4px;
}

.t1-error-close:hover {
  color: var(--negative);
}

/* Data Info Line */
.t1-data-info {
  display: flex;
  gap: 20px;
  font-size: 10px;
  color: var(--text-tertiary);
  padding: 8px 12px;
  background: var(--bg-surface-2);
  border-radius: 6px;
  margin-bottom: 12px;
}

.t1-data-info span {
  display: flex;
  align-items: center;
  gap: 4px;
}

/* Loading Skeleton */
.t1-loading-skeleton {
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
  background: var(--bg-surface-2);
}

.skeleton-header {
  height: 32px;
  background: linear-gradient(90deg, var(--bg-surface) 25%, var(--bg-surface-2) 50%, var(--bg-surface) 75%);
  background-size: 200% 100%;
  animation: skeleton-load 1.5s infinite;
  border-bottom: 1px solid var(--border);
}

.skeleton-row {
  height: 40px;
  background: linear-gradient(90deg, var(--bg-surface) 25%, var(--bg-surface-2) 50%, var(--bg-surface) 75%);
  background-size: 200% 100%;
  animation: skeleton-load 1.5s infinite;
  border-bottom: 1px solid var(--border);
}

@keyframes skeleton-load {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

/* Responsive - Mobile */
@media (max-width: 768px) {
  .t1-toolbar {
    flex-direction: column;
    align-items: flex-start;
  }

  .t1-toolbar-right {
    width: 100%;
    justify-content: flex-end;
  }

  .scenario-tooltip {
    white-space: normal;
    max-width: 200px;
  }

  .t1-data-info {
    flex-direction: column;
    gap: 8px;
  }
}
```

---

## 🧪 Unit Tests for Phase B2.5

### File: `src/__tests__/tang1Api.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { fetchTang1, fetchTang1WithRetry, Tang1ApiError } from "../services/tang1Api";
import type { Scenario } from "../types/tang1";

describe("Tang1Api", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("fetchTang1", () => {
    it("should fetch data for valid scenario", async () => {
      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              tang1Result: [{ ticker: "ACB", sector: "Finance", epsGrowth: 10, faScore: 80, tang1Score: 85 }],
              tang1WithScenario: [{ ticker: "ACB", sector: "Finance", epsGrowth: 10, faScore: 80, tang1Score: 85, scenarioScore: 90 }],
              scenario: "growth",
              universeSize: 130
            })
        })
      );

      const result = await fetchTang1("growth");
      expect(result.tang1Result.length).toBeGreaterThan(0);
      expect(result.scenario).toBe("growth");
    });

    it("should throw error for invalid scenario", async () => {
      expect(() => fetchTang1("invalid" as Scenario)).toThrow(Tang1ApiError);
    });

    it("should handle network timeout", async () => {
      global.fetch = vi.fn(() =>
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Timeout")), 100)
        )
      );

      await expect(fetchTang1("growth")).rejects.toThrow();
    });

    it("should validate response structure", async () => {
      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ tang1Result: [] })
        })
      );

      await expect(fetchTang1("growth")).rejects.toThrow(Tang1ApiError);
    });
  });

  describe("fetchTang1WithRetry", () => {
    it("should retry on failure", async () => {
      let attempts = 0;
      global.fetch = vi.fn(() => {
        attempts++;
        if (attempts < 3) {
          return Promise.reject(new Error("Network error"));
        }
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              tang1Result: [{ ticker: "ACB", sector: "Finance", epsGrowth: 10, faScore: 80, tang1Score: 85 }],
              tang1WithScenario: [],
              scenario: "growth",
              universeSize: 130
            })
        });
      });

      const result = await fetchTang1WithRetry("growth", 3);
      expect(attempts).toBe(3);
      expect(result.tang1Result.length).toBeGreaterThan(0);
    });

    it("should not retry on validation errors", async () => {
      global.fetch = vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 400,
          statusText: "Bad Request",
          json: () => Promise.resolve({ message: "Invalid scenario" })
        })
      );

      await expect(fetchTang1WithRetry("growth", 3)).rejects.toThrow(Tang1ApiError);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });
});
```

---

## ✅ Implementation Checklist for Phase B2.5

```bash
## Frontend Tasks
- [ ] Update type definitions in src/types/tang1.ts
- [ ] Enhance tang1Api.ts with error handling
- [ ] Update ScenarioSwitcher.tsx with tooltips
- [ ] Update SieuQuetAiTab.tsx with timestamp and refresh
- [ ] Add new CSS classes to App.css
- [ ] Add unit tests for Tang1Api
- [ ] Test responsiveness on mobile
- [ ] Add error handling tests

## Backend Tasks (if applicable)
- [ ] Ensure /api/tang1 endpoint includes generatedAt timestamp
- [ ] Validate error response format
- [ ] Test with invalid scenarios

## QA Tasks
- [ ] Test all 3 scenarios (growth, cautious, defensive)
- [ ] Test error states (network error, timeout, invalid data)
- [ ] Test manual refresh functionality
- [ ] Verify tooltips appear correctly
- [ ] Test on Chrome, Firefox, Safari
- [ ] Test on mobile (iOS, Android)

## Deployment Tasks
- [ ] Create feature branch: feature/phase-b2.5
- [ ] Create pull request for code review
- [ ] Merge to staging after approval
- [ ] Deploy to staging environment
- [ ] Run smoke tests on staging
- [ ] Merge to production
- [ ] Monitor production logs
```

---

## 📊 Estimate Effort Breakdown

| Component | File | Effort | Status |
|-----------|------|--------|--------|
| Type Definitions | `src/types/tang1.ts` | 1h | Ready |
| API Service | `src/services/tang1Api.ts` | 2h | Ready |
| ScenarioSwitcher | `src/components/MainTabs/SieuQuetAI/ScenarioSwitcher.tsx` | 1.5h | Ready |
| SieuQuetAiTab | `src/components/MainTabs/SieuQuetAI/SieuQuetAiTab.tsx` | 2.5h | Ready |
| CSS | `src/styles/App.css` | 1.5h | Ready |
| Tests | `src/__tests__/tang1Api.test.ts` | 2h | Ready |
| **Total** | | **10.5h** | ✅ |

---

**Document Version:** 1.0  
**Status:** ✅ Ready for Implementation  
**Start Date:** 2026-09-01  
**Target Completion:** 2026-09-14
