import { act } from "react";
import { createRoot } from "react-dom/client";
import { SWRConfig } from "swr";
import { afterEach, describe, expect, it, vi } from "vitest";
import VolumeAnalysisPanel from "./VolumeAnalysisPanel";
import { resetResearchUiForTest } from "../../../hooks/useResearchUi";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fixture = {
  symbol: "FPT", asOf: "2026-10-01", partialToday: false,
  today: { date: "2026-10-01", price: 62700, changePct: -0.48, volume: 3413000, value: 214485140000, dealVolume: 0, dealValue: 0, avgVolume20: 2000000, rvol20: 1.71 },
  trend: {
    bars30: [
      { date: "2026-09-30", volume: 2000000, value: 1.26e11, close: 63000, up: true },
      { date: "2026-10-01", volume: 3413000, value: 2.14e11, close: 62700, up: false },
    ],
    ma20Volume: 2000000, upDownVolumeRatio20: 1.2, obvDirection: "up", obvChangeVsAvgVolume: 1.5, cmf20: 0.12, divergence: null,
  },
  foreign: {
    today: { buyVol: 983168, sellVol: 415788, netVol: 567380, buyVal: 61788249600, sellVal: 26132985200, netVal: 35655264400 },
    net5Val: 1.2e11, net20Val: -3e10, buySharePct: 28.8, sellSharePct: 12.2,
    streak: { direction: "buy", sessions: 3 }, room: 351514606,
    netSeries20: [{ date: "2026-09-30", netVal: -1e9 }, { date: "2026-10-01", netVal: 3.5e10 }],
  },
  profile: {
    sessions: 6, poc: 62800, valueAreaLow: 62400, valueAreaHigh: 63200, position: "inside",
    bins: [{ priceLow: 62000, priceHigh: 62500, volume: 1000 }, { priceLow: 62500, priceHigh: 63000, volume: 5000 }, { priceLow: 63000, priceHigh: 63500, volume: 2000 }],
  },
  intraday: { buckets15m: [{ time: "09:15", volume: 500000 }, { time: "14:45", volume: 800000 }], totalVolume: 3413000, atoSharePct: 14.6, atcSharePct: 23.4, peak: { time: "14:45", volume: 174900, multipleOfAvgBar: 11.6 }, sameTime: null },
  insights: ["Khối ngoại mua ròng 3 phiên liên tiếp (20 phiên: −30.0 tỷ)."],
  notes: ["Mua/bán chủ động: SSI FC Data v2 không cung cấp (luôn = 0) nên không hiển thị."],
};

describe("VolumeAnalysisPanel", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); window.localStorage.clear(); resetResearchUiForTest(); });

  it("hiển thị ô số liệu, chú thích và mã hoá phụ phiên tăng (đặc) / giảm (rỗng)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => fixture })));
    const el = document.createElement("div");
    const root = createRoot(el);
    await act(async () => {
      root.render(<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}><VolumeAnalysisPanel symbol="FPT" /></SWRConfig>);
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });

    expect(el.textContent).toContain("Phân tích khối lượng · FPT");
    expect(el.textContent).toContain("1.71×");
    expect(el.textContent).toContain("Phiên tăng");
    expect(el.textContent).toContain("Phiên giảm");
    expect(el.textContent).toContain("Khối ngoại mua ròng 3 phiên liên tiếp");
    const svg = el.querySelector('svg[aria-label="Khối lượng 30 phiên"]')!;
    const marks = [...svg.querySelectorAll("rect[pointer-events='none']")];
    expect(marks[0].getAttribute("fill")).not.toBe("none"); // phiên tăng: cột đặc
    expect(marks[1].getAttribute("fill")).toBe("none"); // phiên giảm: cột rỗng
    expect(el.querySelector("details table")).not.toBeNull(); // bảng số liệu dự phòng
    act(() => root.unmount());
  });

  it("báo lỗi rõ ràng khi API lỗi", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503, json: async () => ({ error: "Chưa có dữ liệu ngày" }) })));
    const el = document.createElement("div");
    const root = createRoot(el);
    await act(async () => {
      root.render(<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false }}><VolumeAnalysisPanel symbol="FPT" /></SWRConfig>);
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(el.textContent).toContain("Chưa có dữ liệu ngày");
    act(() => root.unmount());
  });

  const research = {
    symbol: "FPT", asOf: "2026-10-01", regime: "SIDEWAY", method: "BVC", features: [], profile: null,
    adaptive: [3, 5, 10].map((h) => ({ horizon: h, ready: true, version: "v1", prob: h === 3 ? 0.58 : h === 5 ? 0.62 : 0.5, regimeModel: false, contributions: [], holdout: null })),
    todaySignals: [{ date: "2026-10-01", signal: "STEALTH_20", label: "Stealth Score 20 phiên", direction: 1, score: 1.8, regime: "SIDEWAY", outcomes: {}, trackRecord: [] }],
    recentSignals: [], disclaimer: "Không phải khuyến nghị đầu tư.",
  };
  const perfRow = (signal: string, horizon: number, hitRate: number, baseline: number, z: number, verdict: string) => ({
    signal, regime: "ALL", horizon, n: 1700, long: 1000, short: 700, hitRate, hitLow: hitRate - 0.02, hitHigh: hitRate + 0.02, baseline,
    avgSignedExcess: 0.005, tStat: 5, zHit: 5.6, pValue: 0.004, zHitClustered: z, tStatClustered: 2.5, effectiveN: 366, clusters: { dates: 69, symbols: 43 }, verdict,
  });
  const overview = {
    generatedAt: "2026-10-02T01:41:00Z", currentRegime: { date: "2026-10-01", regime: "SIDEWAY", impulseScore: 29.6, breadthPct: 31.8 }, baseline: {},
    performance: [perfRow("STEALTH_20", 3, 0.543, 0.48, 2.62, "edge"), perfRow("STEALTH_20", 5, 0.537, 0.48, 2.25, "edge"), perfRow("IFE_INTENT", 5, 0.474, 0.473, 0.1, "none")],
    counts: null, models: [], lastTraining: null, signalLabels: {}, featureLabels: {}, disclaimer: "",
  };
  async function renderPanel(researchUi: "1" | "0" | null) {
    vi.stubEnv("VITE_MARKET_GATEWAY_ENABLED", "true");
    if (researchUi) window.localStorage.setItem("gq.researchUi", researchUi);
    const fetchMock = vi.fn(async (url: string) => ({
      ok: true,
      json: async () => (String(url).includes("/research/overview") ? overview : String(url).includes("/research/") ? research : fixture),
    }));
    vi.stubGlobal("fetch", fetchMock);
    const el = document.createElement("div");
    const root = createRoot(el);
    await act(async () => {
      root.render(<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}><VolumeAnalysisPanel symbol="FPT" /></SWRConfig>);
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    const researchCalls = () => fetchMock.mock.calls.filter(([u]) => String(u).includes("/research/")).length;
    return { el, root, researchCalls };
  }

  it("mặc định (AI tắt): chỉ thêm công tắc nhỏ cuối dòng tiêu đề, không có khối AI, không gọi API nghiên cứu", async () => {
    const { el, root, researchCalls } = await renderPanel(null);
    const header = el.querySelector(".font-sans > div")!;
    expect(header.children.length).toBe(2);
    expect(header.children[0].textContent).toBe("Phân tích khối lượng · FPT");
    const sw = header.querySelector('[role="switch"]') as HTMLButtonElement;
    expect(sw.getAttribute("aria-checked")).toBe("false");
    expect(sw.textContent).toBe("AI");
    expect(el.textContent).not.toContain("Điểm dòng tiền thích ứng");
    expect(researchCalls()).toBe(0);
    act(() => root.unmount());
  });

  it("bật công tắc trong bảng KL: hiện điểm thích ứng T+3/T+5 và bảng hiệu suất với z đã tính chồng lấn; tắt -> về nguyên bản", async () => {
    const { el, root, researchCalls } = await renderPanel(null);
    const sw = el.querySelector('[role="switch"]') as HTMLButtonElement;
    await act(async () => { sw.click(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(sw.getAttribute("aria-checked")).toBe("true");
    const text = el.textContent ?? "";
    expect(text).toContain("AI · Điểm dòng tiền thích ứng & hiệu suất tín hiệu");
    expect(text).toContain("▲ 58%");
    expect(text).toContain("▲ 62%");
    expect(text).toContain("Hiệu suất tín hiệu");
    expect(text).toContain("54.3% / 48.0% z 2.6");
    expect(text).toContain("✓ có lợi thế");
    expect(text).toContain("≈ như ngẫu nhiên");
    expect(text).toContain("● Stealth 20 phiên");
    expect(researchCalls()).toBe(2);
    expect(window.localStorage.getItem("gq.researchUi")).toBe("1");

    await act(async () => { sw.click(); });
    expect(el.textContent).not.toContain("AI · Điểm dòng tiền thích ứng");
    expect(window.localStorage.getItem("gq.researchUi")).toBe("0");
    act(() => root.unmount());
  });
});
