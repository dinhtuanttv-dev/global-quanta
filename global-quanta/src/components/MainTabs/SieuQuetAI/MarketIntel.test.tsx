import { act } from "react";
import { createRoot } from "react-dom/client";
import { SWRConfig } from "swr";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImpulseFlowPanel, IntelAiSections, TechnicalTiles } from "./MarketIntel";
import VnIndexBand from "./VnIndexBand";
import type { MarketIntel, PerformanceRow } from "../../../hooks/useResearch";
import type { SieuQuetIndexState } from "../../../hooks/useSieuQuetScanner";
import { resetResearchUiForTest } from "../../../hooks/useResearchUi";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const dayRow = (i: number, over: Partial<MarketIntel["series"][number]> = {}) => ({
  date: `2026-07-${String(i).padStart(3, "0")}`, close: 1700 + i, regime: "SIDEWAY" as const, impulse: 30, impulse2: 27.2, breadth: 29,
  zLd5: i % 2 ? -1.2 : 0.8, zFr5: 0.14, dist25: 8, distPct: 0.86, acc25: 1, isDist: i % 3 === 0, effortNoResult: i === 119,
  pBear: 0.99, pNeutral: 0.005, pBull: 0.005, div: 1, risk: 85, ...over,
});
const post = (mean: number, lo: number, hi: number, n = 58) => ({ n, nEff: 19, ups: 39, mean, lo, hi, raw: mean });
const model = (passed: boolean) => ({
  samples: 219, passed, prob: passed ? 0.62 : 0.24, baseRate: 0.54,
  oos: { n: 95, nEff: 19, skill: passed ? 0.06 : -0.108, lo: passed ? 0.01 : -0.66, hi: 0.3, hitRate: 0.558 },
  weights: [
    { name: "zLd5", label: "Dấu chân tay to 5 phiên (z)", coef: 0.72, lo: 0.29, hi: 1.39 },
    { name: "impulse", label: "Market Impulse", coef: -1.32, lo: -2.58, hi: -0.28 },
    { name: "zFr5", label: "Khối ngoại ròng 5 phiên (z)", coef: -0.19, lo: -0.58, hi: 0.4 },
  ],
});
const intelFixture = (passed = false): MarketIntel => ({
  asOf: "2026-10-02",
  current: { ...dayRow(119), date: "2026-10-02", zLd5: -1.27, hmmState: 0, divergences: [{ window: 20, indicator: "footprint", priceRank: 0.1, indRank: 0.7, type: "bullish" }, { window: 5, indicator: "breadth", priceRank: 0.5, indRank: 0.5, type: null }] },
  hmm: { states: [{ label: "Giảm", ret5: -2.34, vol20: 1.3, stay: 0.89 }, { label: "Đi ngang", ret5: 0.33, vol20: 0.65, stay: 0.98 }, { label: "Tăng", ret5: 2.54, vol20: 1.48, stay: 0.92 }], trainedThrough: "2026-09-23" },
  series: Array.from({ length: 120 }, (_, i) => dayRow(i)),
  bayes: Object.fromEntries(["3", "5", "10"].map((h) => [h, {
    base: { n: 692, p: 0.587 },
    rows: [
      { id: "hmm", label: "Chế độ HMM", value: "Giảm", ...post(h === "3" ? 0.646 : 0.654, 0.445, 0.836) },
      { id: "footprint", label: "Dấu chân tay to", value: "z ≤ −1 (xả mạnh)", ...post(0.522, 0.29, 0.75, 33) },
    ],
  }])),
  models: { 3: model(passed), 5: model(passed), 10: model(passed) },
  coverage: { indexDays: 697, footprintDays: 248, from: "2023-12-12", to: "2026-10-02" },
  modelFeatures: [],
  notes: "Mọi giá trị ngày t chỉ dùng dữ liệu ≤ t.",
});
const perf = (signal: string, horizon: number, hitRate: number, verdict: PerformanceRow["verdict"]) => ({
  signal, regime: "ALL", horizon, n: 47, long: 30, short: 17, hitRate, hitLow: hitRate - 0.1, hitHigh: hitRate + 0.1, baseline: 0.55,
  avgSignedExcess: 0.004, tStat: 1.1, pValue: 0.1, verdict,
});
const state: SieuQuetIndexState = {
  asOf: "2026-10-02", ma20: 1797.2, ma50: 1773.1, ma200: 1795.7, maAlignmentScore: 40, trendBias: "distribution", trendLabel: "Phân phối — Cảnh báo dòng tiền rút",
  rsi14: 35.6, macdHistogram: -8.68, marketBreadthPct: 29.2, divergence: "none", atr14: 20, atrPercentile: 60, breakoutProbability: 19.2, impulseScore: 35, narrative: "VN-Index đang ở trạng thái phân phối.",
};

async function render(node: React.ReactNode) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  await act(async () => { createRoot(el).render(<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{node}</SWRConfig>); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  return el;
}

describe("Market Intelligence VN-Index", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); window.localStorage.clear(); resetResearchUiForTest(); document.body.innerHTML = ""; });

  it("khối kỹ thuật giữ đủ chỉ số cũ, thêm vị trí so MA và thanh ngưỡng", async () => {
    const el = await render(<TechnicalTiles state={state} close={1737.7} />);
    const t = el.textContent ?? "";
    for (const s of ["Xu hướng", "MA20", "MA50", "MA200", "RSI(14)", "MACD Hist.", "Breadth", "Phân kỳ", "ATR Percentile", "Breakout Prob.", "VN-Index đang ở trạng thái phân phối."]) expect(t).toContain(s);
    expect(t).toContain("▼ dưới 3.3%");
    expect(t).toContain("▼ động lượng âm");
  });

  it("khối Impulse giữ đồng hồ cũ + Impulse 2.0, dấu chân tay to, khối ngoại, 25 ô ngày phân phối, rủi ro dòng tiền rút", async () => {
    const el = await render(<ImpulseFlowPanel score={35} intel={intelFixture()} />);
    const t = el.textContent ?? "";
    expect(t).toContain("35.0");
    expect(t).toContain("Tích lũy an toàn");
    expect(t).toContain("Impulse 2.0");
    expect(t).toContain("−1.27");
    expect(t).toContain("▼ tay to xả mạnh");
    expect(t).toContain("Cao hơn 86% các phiên");
    expect(t).toContain("85 · Cao");
    expect(el.querySelectorAll('[aria-label^="25 phiên"] > span')).toHaveLength(25);
  });

  it("AI: HMM, biểu đồ rừng Bayes có KTC, phân kỳ; mô hình CHƯA đạt -> không hiện xác suất; kiểm định tín hiệu mới", async () => {
    const el = await render(<IntelAiSections intel={intelFixture(false)} performance={[perf("FOOTPRINT", 3, 0.67, "none")]} signalLabels={{ FOOTPRINT: "Dấu chân tay to toàn thị trường (5 phiên)" }} />);
    const t = el.textContent ?? "";
    expect(t).toContain("▼ Giảm 99%");
    expect(t).toContain("Chế độ HMM: Giảm");
    expect(t).toContain("65% [45%–84%]");
    expect(t).toContain("▲ dương · giá vs tay to · 20 phiên");
    expect(t).toContain("CHƯA ĐẠT KIỂM ĐỊNH");
    expect(t).toContain("không hiển thị xác suất của mô hình");
    expect(t).not.toContain("P(VN-Index tăng sau");
    expect(t).toContain("Market Impulse");
    expect(t).toContain("67%/55%");
    // Đổi kỳ hạn
    const tab = [...el.querySelectorAll('[role="tab"]')].find((b) => b.textContent === "T+3") as HTMLButtonElement;
    await act(async () => { tab.click(); });
    expect(el.textContent).toContain("sau T+3");
    expect(el.textContent).toContain("MÔ HÌNH TỔNG HỢP T+3");
  });

  it("mô hình ĐẠT kiểm định -> hiện xác suất kèm mức nền", async () => {
    const el = await render(<IntelAiSections intel={intelFixture(true)} performance={[]} signalLabels={{}} />);
    expect(el.textContent).toContain("✓ ĐẠT KIỂM ĐỊNH");
    expect(el.textContent).toContain("P(VN-Index tăng sau T+5) = 62%");
  });

  it("dòng tóm tắt dải VN-Index: đọc vị trong một dòng (trạng thái, HMM, rủi ro dòng tiền rút, tay to)", async () => {
    vi.stubEnv("VITE_MARKET_GATEWAY_ENABLED", "true");
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({
      index: { current: { date: "2026-10-02", close: 1737.7, regime: "SIDEWAY", streak: 27 } }, intel: intelFixture(), performance: [], signalLabels: {},
    }) })));
    const el = await render(<VnIndexBand indexState={state} technical={null} impulse={null} aiPanel={null} toggle={null} />);
    const t = el.textContent ?? "";
    expect(t).toContain("■ Sideway · 27 phiên");
    expect(t).toContain("▼ Giảm 99%");
    expect(t).toContain("Rủi ro dòng tiền rút85 · Cao");
    expect(t).toContain("z −1.27");
  });
});
