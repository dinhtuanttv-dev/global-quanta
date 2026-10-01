import { act } from "react";
import { createRoot } from "react-dom/client";
import { SWRConfig } from "swr";
import { afterEach, describe, expect, it, vi } from "vitest";
import VolumeAnalysisPanel from "./VolumeAnalysisPanel";

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
  afterEach(() => vi.unstubAllGlobals());

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
});
