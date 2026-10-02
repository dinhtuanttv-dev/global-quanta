import { act } from "react";
import { createRoot } from "react-dom/client";
import { SWRConfig } from "swr";
import { afterEach, describe, expect, it, vi } from "vitest";
import AdaptiveLearningPanel from "./AdaptiveLearningPanel";
import AdaptiveScoreCard from "./AdaptiveScoreCard";
import ResearchUiToggle from "./ResearchUiToggle";
import { resetResearchUiForTest } from "../../../hooks/useResearchUi";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const perf = (signal: string, regime: string, horizon: number, hitRate: number, verdict: string, n = 400) => ({
  signal, regime, horizon, n, long: n / 2, short: n / 2, hitRate, hitLow: hitRate - 0.04, hitHigh: hitRate + 0.04, baseline: 0.48,
  avgSignedExcess: 0.004, tStat: 2.4, pValue: 0.01, verdict,
});
const holdout = { n: 5200, from: "2026-08-01", to: "2026-09-24", baseRate: 0.48, logLoss: 0.68, brier: 0.244, brierSkill: 0.021, auc: 0.571, decileSpread: 0.012, activeShare: 0.3, activeHitRate: 0.56, calibration: [] };

const overview = (withModel: boolean) => ({
  generatedAt: "2026-10-02T09:40:00Z",
  currentRegime: { date: "2026-10-01", regime: "SIDEWAY", impulseScore: 52.3, breadthPct: 48 },
  baseline: { 3: 0.47, 5: 0.48, 10: 0.49 },
  performance: [perf("STEALTH_20", "ALL", 5, 0.58, "edge"), perf("IFE_INTENT", "ALL", 5, 0.5, "none"), perf("IMPULSE", "ALL", 5, 0.4, "negative", 40)],
  counts: { signals: 41_000, outcomes: 120_000 },
  models: [3, 5, 10].map((h) => ({
    horizon: h,
    active: withModel ? {
      model: `ADAPTIVE_T${h}`, version: "v1", status: "active", trainFrom: "2025-10-01", trainTo: "2026-09-24", holdout,
      heuristic: { auc: 0.532, decileSpread: 0.006 }, byRegime: null, lambda: 30,
      weights: [{ name: "stealth20", weight: 0.21 }, { name: "pocDistAtr", weight: -0.12 }, { name: "zEffort", weight: 0.08 }], regimeModels: ["UPTREND"],
    } : null,
  })),
  lastTraining: withModel ? null : { trainedAt: "2026-10-02", horizons: { 5: { status: "insufficient", reason: "Cần ≥ 3000 mẫu, mới có 900.", samples: 900 } } },
  signalLabels: { STEALTH_5: "Stealth Score 5 phiên", STEALTH_20: "Stealth Score 20 phiên", IFE_INTENT: "Bản đồ ý đồ dòng tiền (HMM)", IMPULSE: "Market Impulse Gauge", ADAPTIVE_T5: "Điểm thích ứng T+5" },
  featureLabels: { stealth20: "Stealth 20 phiên", pocDistAtr: "Khoảng cách tới POC 20 phiên (ATR)", zEffort: "Nỗ lực dòng lệnh (z)" },
  disclaimer: "Thống kê quá khứ, kiểm định ngoài mẫu; không phải khuyến nghị đầu tư.",
});

const symbolDetail = {
  symbol: "PVT", asOf: "2026-10-01", regime: "SIDEWAY", method: "BVC",
  features: [], profile: { date: "2026-10-01", poc: 27_350, vaLow: 27_000, vaHigh: 27_800, vwap: 27_400 },
  adaptive: [3, 5, 10].map((h) => ({
    horizon: h, ready: true, version: "v1", prob: h === 5 ? 0.61 : 0.44, regimeModel: false,
    contributions: [{ name: "stealth20", label: "Stealth 20 phiên", value: 1.8, weight: 0.21, contribution: 0.38 }],
    holdout: { brierSkill: 0.02, auc: 0.57, activeHitRate: 0.56, n: 5200 },
  })),
  todaySignals: [{ date: "2026-10-01", signal: "STEALTH_20", label: "Stealth Score 20 phiên", direction: 1, score: 1.8, regime: "SIDEWAY", outcomes: {}, trackRecord: [perf("STEALTH_20", "ALL", 5, 0.58, "edge")] }],
  recentSignals: [],
  disclaimer: "Xác suất học từ dữ liệu quá khứ (kiểm định walk-forward); không phải khuyến nghị đầu tư.",
};

async function mount(node: React.ReactNode, body: unknown, researchUi = true) {
  vi.stubEnv("VITE_MARKET_GATEWAY_ENABLED", "true");
  window.localStorage.setItem("gq.researchUi", researchUi ? "1" : "0");
  const fetchMock = vi.fn(async () => ({ ok: true, json: async () => body }));
  vi.stubGlobal("fetch", fetchMock);
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => {
    root.render(<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{node}</SWRConfig>);
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  return Object.assign(el, { fetchMock });
}

describe("AdaptiveLearningPanel / AdaptiveScoreCard", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); window.localStorage.clear(); resetResearchUiForTest(); document.body.innerHTML = ""; });

  it("công tắc tắt: không hiển thị gì và không gọi API nghiên cứu", async () => {
    const panel = await mount(<AdaptiveLearningPanel />, overview(true), false);
    expect(panel.textContent).toBe("");
    const card = await mount(<AdaptiveScoreCard symbol="PVT" />, symbolDetail, false);
    expect(card.textContent).toBe("");
    expect(panel.fetchMock).not.toHaveBeenCalled();
    expect(card.fetchMock).not.toHaveBeenCalled();
  });

  it("hiển thị trạng thái thị trường, tỷ lệ trúng kèm phán định và trọng số học được so với heuristic", async () => {
    const el = await mount(<AdaptiveLearningPanel />, overview(true));
    const text = el.textContent ?? "";
    expect(text).toContain("AI học & thích ứng");
    expect(text).toContain("Sideway · Impulse 52.3");
    expect(text).toContain("58.0%");
    expect(text).toContain("✓ có lợi thế");
    expect(text).toContain("✗ ngược kỳ vọng");
    expect(text).toContain("chưa có dữ liệu");
    expect(text).toContain("0.571");
    expect(text).toContain("(0.532)");
    expect(text).toContain("Stealth 20 phiên");
  });

  it("chưa có mô hình đạt kiểm định thì nói rõ lý do, không hiển thị trọng số", async () => {
    const el = await mount(<AdaptiveLearningPanel />, overview(false));
    expect(el.textContent).toContain("Cần ≥ 3000 mẫu");
    expect(el.textContent).not.toContain("Brier skill");
  });

  it("thẻ điểm thích ứng của mã: xác suất T+3/5/10, đóng góp, tín hiệu đang bật kèm lịch sử", async () => {
    const el = await mount(<AdaptiveScoreCard symbol="PVT" />, symbolDetail);
    const text = el.textContent ?? "";
    expect(text).toContain("▲ 61%");
    expect(text).toContain("▼ 44%");
    expect(text).toContain("+0.38");
    expect(text).toContain("lịch sử T+5 trúng 58% (n=400)");
    expect(text).toContain("POC 27.350");
  });

  it("công tắc trên UI: mặc định tắt; bật -> hiện panel và khối mã (cả hai cây React đồng bộ); tắt -> về nguyên bản; nhớ lựa chọn", async () => {
    vi.stubEnv("VITE_MARKET_GATEWAY_ENABLED", "true");
    const fetchMock = vi.fn(async (url: string) => ({ ok: true, json: async () => (String(url).includes("/overview") ? overview(true) : symbolDetail) }));
    vi.stubGlobal("fetch", fetchMock);
    const mk = (node: React.ReactNode) => {
      const el = document.createElement("div");
      document.body.appendChild(el);
      return { el, root: createRoot(el), node };
    };
    // Hai cây React riêng như Siêu Quét và Action Center trên trang thật.
    const a = mk(<><ResearchUiToggle /><AdaptiveLearningPanel /></>);
    const b = mk(<AdaptiveScoreCard symbol="PVT" />);
    await act(async () => {
      for (const t of [a, b]) t.root.render(<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{t.node}</SWRConfig>);
    });
    const sw = a.el.querySelector('[role="switch"]') as HTMLButtonElement;
    expect(sw.getAttribute("aria-checked")).toBe("false");
    expect(a.el.textContent).not.toContain("AI học & thích ứng");
    expect(b.el.textContent).toBe("");
    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => { sw.click(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(sw.getAttribute("aria-checked")).toBe("true");
    expect(a.el.textContent).toContain("AI học & thích ứng");
    expect(b.el.textContent).toContain("▲ 61%");
    expect(window.localStorage.getItem("gq.researchUi")).toBe("1");

    await act(async () => { sw.click(); });
    expect(a.el.textContent).not.toContain("AI học & thích ứng");
    expect(b.el.textContent).toBe("");
    expect(window.localStorage.getItem("gq.researchUi")).toBe("0");
  });

  it("không có Market Gateway: không hiện công tắc", async () => {
    vi.stubEnv("VITE_MARKET_GATEWAY_ENABLED", "false");
    const el = document.createElement("div");
    document.body.appendChild(el);
    await act(async () => { createRoot(el).render(<ResearchUiToggle />); });
    expect(el.innerHTML).toBe("");
  });
});
