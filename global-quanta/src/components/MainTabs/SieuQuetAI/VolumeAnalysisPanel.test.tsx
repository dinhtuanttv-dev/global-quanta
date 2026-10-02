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
    todaySignals: [], recentSignals: [], disclaimer: "Không phải khuyến nghị đầu tư.",
  };
  async function renderPanel(researchUi: "1" | "0" | null) {
    vi.stubEnv("VITE_MARKET_GATEWAY_ENABLED", "true");
    if (researchUi) window.localStorage.setItem("gq.researchUi", researchUi);
    const fetchMock = vi.fn(async (url: string) => ({ ok: true, json: async () => (String(url).includes("/research/") ? research : fixture) }));
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

  it("mặc định (công tắc AI tắt): phần đầu bảng nguyên bản, không có nút AI, không gọi API nghiên cứu", async () => {
    const { el, root, researchCalls } = await renderPanel(null);
    const header = el.querySelector(".font-sans > div")!;
    expect(header.children[0].textContent).toBe("Phân tích khối lượng · FPT");
    expect(header.children[0].tagName).toBe("DIV");
    expect(header.children[0].children.length).toBe(0);
    expect(el.querySelector("button[aria-controls]")).toBeNull();
    expect(el.textContent).not.toContain("Điểm dòng tiền thích ứng");
    expect(researchCalls()).toBe(0);
    act(() => root.unmount());
  });

  it("công tắc AI bật: nút 'AI ▸' thu gọn sẵn; bấm mở xem xác suất T+3/T+5, bấm lại thu gọn", async () => {
    const { el, root, researchCalls } = await renderPanel("1");
    const btn = el.querySelector("button[aria-controls='ai-insights-FPT']") as HTMLButtonElement;
    expect(btn.textContent).toBe("AI ▸");
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    expect(el.textContent).not.toContain("Điểm dòng tiền thích ứng");
    expect(researchCalls()).toBe(0);

    await act(async () => { btn.click(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    expect(el.querySelector("#ai-insights-FPT")!.textContent).toContain("▲ 58%");
    expect(el.textContent).toContain("▲ 62%");
    expect(researchCalls()).toBe(1);

    await act(async () => { btn.click(); });
    expect(el.querySelector("#ai-insights-FPT")).toBeNull();
    expect(el.textContent).toContain("Phân tích khối lượng · FPT");
    act(() => root.unmount());
  });
});
