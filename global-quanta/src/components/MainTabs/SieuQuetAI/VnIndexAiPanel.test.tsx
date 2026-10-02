import { act } from "react";
import { createRoot } from "react-dom/client";
import { SWRConfig } from "swr";
import { afterEach, describe, expect, it, vi } from "vitest";
import VnIndexAiPanel from "./VnIndexAiPanel";
import AdaptiveScoreCard from "./AdaptiveScoreCard";
import ResearchUiToggle from "./ResearchUiToggle";
import { resetResearchUiForTest } from "../../../hooks/useResearchUi";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fs = (pUp: number, meanRet: number, n = 100, h = 5) => ({ n, nEff: Math.round(n / h), pUp, lo: pUp - 0.1, hi: pUp + 0.1, meanRet });
const hz = (p: number, m: number) => ({ 3: fs(p, m, 100, 3), 5: fs(p, m), 10: fs(p, m, 100, 10) });
const index = {
  from: "2024-03-12", to: "2026-10-01",
  current: { date: "2026-10-01", close: 1749.3, regime: "SIDEWAY", streak: 26, impulseScore: 29.6, impulseZone: "LOW", breadthPct: 31.8, ma20: 1802.97, ma50: 1772.95, ma200: 1795.7 },
  history: Array.from({ length: 60 }, (_, i) => ({ date: `2026-07-${String(1 + (i % 28)).padStart(2, "0")}#${i}`, regime: i < 30 ? "UPTREND" : "SIDEWAY", impulseScore: 50, breadthPct: 50, close: 1700 + i })),
  base: hz(0.57, 0.003),
  byRegime: { UPTREND: { sessions: 282, share: 0.44, avgRun: 18.8, horizons: hz(0.518, -0.001) }, SIDEWAY: { sessions: 242, share: 0.38, avgRun: 11, horizons: hz(0.557, 0.005) }, DOWNTREND: { sessions: 113, share: 0.18, avgRun: 16.1, horizons: hz(0.726, 0.011) } },
  byImpulse: { LOW: { label: "Impulse < 40", sessions: 99, horizons: hz(0.575, 0.007) }, MID: { label: "Impulse 40–60", sessions: 123, horizons: hz(0.52, 0) }, HIGH: { label: "Impulse ≥ 60", sessions: 6, horizons: hz(0, -0.019) } },
  note: "Cửa sổ T+h chồng lấn: khoảng tin cậy 95% dùng n hiệu dụng ≈ n / h.",
};

const perf = (signal: string, regime: string, horizon: number, hitRate: number, verdict: string, n = 400) => ({
  signal, regime, horizon, n, long: n / 2, short: n / 2, hitRate, hitLow: hitRate - 0.04, hitHigh: hitRate + 0.04, baseline: 0.48,
  avgSignedExcess: 0.004, tStat: 2.4, pValue: 0.01, verdict,
});
const holdout = { n: 5200, from: "2026-08-01", to: "2026-09-24", baseRate: 0.48, logLoss: 0.68, brier: 0.244, brierSkill: 0.021, auc: 0.571, decileSpread: 0.012, activeShare: 0.3, activeHitRate: 0.56, calibration: [] };

const overview = (withModel: boolean) => ({
  generatedAt: "2026-10-02T09:40:00Z",
  currentRegime: { date: "2026-10-01", regime: "SIDEWAY", impulseScore: 52.3, breadthPct: 48 },
  baseline: { 3: 0.47, 5: 0.48, 10: 0.49 },
  performance: [perf("STEALTH_20", "ALL", 5, 0.58, "edge"), perf("STEALTH_20", "ALL", 10, 0.55, "edge"), perf("IFE_INTENT", "ALL", 5, 0.5, "none"), perf("IMPULSE", "ALL", 5, 0.4, "negative", 40)],
  index,
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

async function mount(node: React.ReactNode, withModel = true, researchUi = true) {
  vi.stubEnv("VITE_MARKET_GATEWAY_ENABLED", "true");
  window.localStorage.setItem("gq.researchUi.v2", researchUi ? "1" : "0");
  const fetchMock = vi.fn(async (url: string) => ({ ok: true, json: async () => (String(url).includes("/overview") ? overview(withModel) : symbolDetail) }));
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

describe("VnIndexAiPanel (cột vĩ mô) / AdaptiveScoreCard (từng mã)", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); window.localStorage.clear(); resetResearchUiForTest(); document.body.innerHTML = ""; });

  it("người dùng đã ẩn: không hiển thị gì và không gọi API nghiên cứu", async () => {
    const panel = await mount(<VnIndexAiPanel />, true, false);
    expect(panel.textContent).toBe("");
    const card = await mount(<AdaptiveScoreCard symbol="PVT" />, true, false);
    expect(card.textContent).toBe("");
    expect(panel.fetchMock).not.toHaveBeenCalled();
    expect(card.fetchMock).not.toHaveBeenCalled();
  });

  it("panel cột trái chỉ phân tích VN-Index: trạng thái, dải 60 phiên, VN-Index sau T+h theo trạng thái/Impulse, chấm điểm tín hiệu Impulse", async () => {
    const el = await mount(<VnIndexAiPanel />);
    const text = el.textContent ?? "";
    expect(text).toContain("AI phân tích VN-Index");
    expect(text).toContain("■ Sideway · 26 phiên");
    expect(text).toContain("dưới MA20 (-3.0%)");
    expect(el.querySelectorAll('[role="img"] > div').length).toBe(60);
    expect(text).toContain("■ Sideway (hiện tại)");
    expect(text).toContain("▼ Downtrend");
    expect(text).toContain("73% +1.1%");
    expect(text).toContain("Impulse < 40 (hiện tại)");
    expect(text).toContain("40.0% / 48% z");
    expect(text).toContain("✗ ngược kỳ vọng");
    // Không còn chỉ số cấp mã ở cột vĩ mô.
    for (const s of ["Stealth 20 phiên", "Trọng số học được", "Brier skill", "Điểm thích ứng"]) expect(text).not.toContain(s);
  });

  it("khối AI của từng mã chứa mọi chỉ số chuyển từ cột trái: điểm T+3/5/10, bảng hiệu suất T+3/5/10 có KTC, trọng số học được", async () => {
    const el = await mount(<AdaptiveScoreCard symbol="PVT" />);
    const text = el.textContent ?? "";
    expect(text).toContain("▲ 61%");
    expect(text).toContain("▼ 44%");
    expect(text).toContain("+0.38");
    expect(text).toContain("lịch sử T+5 trúng 58% (n=400)");
    expect(text).toContain("POC 27.350");
    expect(text).toContain("T+10");
    expect(text).toContain("55.0% / 48.0%");
    expect(text).toContain("Trọng số học được");
    expect(text).toContain("0.571");
    expect(text).toContain("(0.532)");
    expect(text).toContain("Stealth 20 phiên");
    expect(text).toContain("41.000 tín hiệu");
  });

  it("chưa có mô hình đạt kiểm định: khối của mã nêu lý do, không hiển thị chỉ số mô hình", async () => {
    const el = await mount(<AdaptiveScoreCard symbol="PVT" />, false);
    expect(el.textContent).toContain("Cần ≥ 3000 mẫu");
    expect(el.textContent).not.toContain("Brier skill");
  });

  it("công tắc trên UI: mặc định HIỆN; ẩn -> cả hai nơi về nguyên bản (đồng bộ hai cây React); nhớ lựa chọn", async () => {
    vi.stubEnv("VITE_MARKET_GATEWAY_ENABLED", "true");
    const fetchMock = vi.fn(async (url: string) => ({ ok: true, json: async () => (String(url).includes("/overview") ? overview(true) : symbolDetail) }));
    vi.stubGlobal("fetch", fetchMock);
    const mk = (node: React.ReactNode) => {
      const el = document.createElement("div");
      document.body.appendChild(el);
      return { el, root: createRoot(el), node };
    };
    // Hai cây React riêng như Siêu Quét và Action Center trên trang thật.
    const a = mk(<><ResearchUiToggle /><VnIndexAiPanel /></>);
    const b = mk(<AdaptiveScoreCard symbol="PVT" />);
    await act(async () => {
      for (const t of [a, b]) t.root.render(<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{t.node}</SWRConfig>);
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    // Mặc định HIỆN trên trang chính (không cần cờ môi trường).
    const sw = a.el.querySelector('[role="switch"]') as HTMLButtonElement;
    expect(sw.getAttribute("aria-checked")).toBe("true");
    expect(a.el.textContent).toContain("AI phân tích VN-Index");
    expect(b.el.textContent).toContain("▲ 61%");

    // Ẩn -> cả hai nơi về nguyên bản, không còn khối AI; lựa chọn được nhớ.
    await act(async () => { sw.click(); });
    expect(sw.getAttribute("aria-checked")).toBe("false");
    expect(a.el.textContent).not.toContain("AI phân tích VN-Index");
    expect(b.el.textContent).toBe("");
    expect(window.localStorage.getItem("gq.researchUi.v2")).toBe("0");

    await act(async () => { sw.click(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(a.el.textContent).toContain("AI phân tích VN-Index");
    expect(window.localStorage.getItem("gq.researchUi.v2")).toBe("1");
  });

  it("không có Market Gateway: không hiện công tắc", async () => {
    vi.stubEnv("VITE_MARKET_GATEWAY_ENABLED", "false");
    const el = document.createElement("div");
    document.body.appendChild(el);
    await act(async () => { createRoot(el).render(<ResearchUiToggle />); });
    expect(el.innerHTML).toBe("");
  });
});
