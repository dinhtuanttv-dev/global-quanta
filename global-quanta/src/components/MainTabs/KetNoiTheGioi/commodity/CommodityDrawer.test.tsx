// Bảng phân tích chuyên sâu (C3): biểu đồ một trục quy về 100, quy đổi VND ghi rõ không phải giá nội địa, quan hệ = thăm dò,
// cổng W3 cho mặt hàng có yếu tố thế giới, khối truyền dẫn heuristic, đóng bằng Esc.
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SWRConfig } from "swr";
import { cleanup, fireEvent, render, screen } from "../../../../test/rtl-lite";
import type { CommodityHistory, CommodityItem } from "../../../../lib/commodities/types";
import CommodityDrawer from "./CommodityDrawer";

const days = Array.from({ length: 80 }, (_, i) => new Date(Date.UTC(2026, 6, 1) + i * 86_400_000).toISOString().slice(0, 10));
const line = (f: (i: number) => number): [string, number][] => days.map((d, i) => [d, f(i)]);
const history: CommodityHistory = {
  id: "BRENT", nameVi: "Dầu Brent", unit: "USD/thùng", group: "Năng lượng", worldFactor: "OIL", vnPrice: false, twoWayVi: null, range: "3y",
  available: true, freq: "day", source: { kind: "yahoo", symbol: "BZ=F", labelVi: "ICE" }, from: days[0], to: days[79],
  world: line((i) => 100 + i), vnd: { labelVi: "VND/thùng", source: "Yahoo:VND=X", points: line((i) => 2_600_000 + i) },
  vnSeries: [{ kind: "icb", code: "0500", labelVi: "Chỉ số ngành ICB 0500 Dầu khí", priceBasis: "INDEX_POINTS", first: days[0], last: days[79] }],
  chart: [
    { key: "world", labelVi: "Giá thế giới", rebased: line((i) => 100 + i * 0.5) },
    { key: "vnd", labelVi: "Quy đổi VND", rebased: line((i) => 100 + i * 0.6) },
    { key: "vn:0500", labelVi: "Chỉ số ngành ICB 0500 Dầu khí", rebased: line((i) => 100 - i * 0.2) },
  ],
  stats: {
    last: 179, lastDate: days[79], changes: { d1: 0.5, w1: 1, m1: 2, m3: 5, y1: null, ytd: 7 }, high1y: 179, low1y: 100, percentile5y: 100, zScore1y: 1.7, drawdown5y: 0,
    vol: { now: 25, avg5y: 30, window: 20, unitVi: "20 phiên, năm hoá" }, volSeries: line((i) => 20 + (i % 5)), ddSeries: line(() => 0), n: 80,
  },
  relations: [{ kind: "icb", code: "0500", labelVi: "Chỉ số ngành ICB 0500 Dầu khí", n: 60, window: 60, corr: 0.16, beta: 0.1, band: 0.25, significant: false,
    rolling: line(() => 0.1), leadLag: Array.from({ length: 11 }, (_, k) => ({ lag: k, r: k === 2 ? -0.3 : 0.05, n: 240 })), bestLag: { lag: 2, r: -0.3 }, basisVi: "Lợi suất phiên.", exploratory: true }],
  notes: [],
};
const confirm = { version: "W3-v1", rows: [{ id: "P1", factor: "OIL", sector: "S_OIL", sectorName: "Dầu khí", sign: 1, beta: -0.25, q: 1, confirmed: false, signOk: false, reasonVi: "Chưa xác nhận: ngược chiều kỳ vọng." }] };

vi.mock("../../../../services/marketDataClient", () => ({
  fetchMarketJson: vi.fn(async (path: string) => (path.includes("confirmatory") ? confirm : history)),
}));

const item: CommodityItem = { id: "BRENT", nameVi: "Dầu Brent", group: "Năng lượng", unit: "USD/thùng", sectorKey: "ENERGY_OIL_GAS", vnPrice: false, twoWayVi: null, vnTickers: ["GAS", "PVS"], available: true, freq: "day", source: { kind: "yahoo", labelVi: "ICE" } };
const flush = () => act(async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); });

afterEach(cleanup);

describe("CommodityDrawer", () => {
  it("đủ các khối, nhãn đúng, đóng bằng Esc", async () => {
    const onClose = vi.fn();
    render(<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}><CommodityDrawer item={item} onClose={onClose} /></SWRConfig>);
    await flush();
    const t = screen.getByTestId("commodity-drawer").textContent ?? "";
    expect(t).toContain("Xu hướng giá Việt Nam ↔ thế giới");
    expect(t).toContain("KHÔNG phải giá bán lẻ trong nước");
    expect(t).toContain("Chỉ số ngành ICB 0500");
    expect(t).toContain("không khác 0 có ý nghĩa");
    expect(t).toMatch(/Thăm dò: không phải bằng chứng/);
    expect(t).toContain("Ngược chiều kỳ vọng"); // cổng W3 cho OIL
    expect(t).toContain("ánh xạ đặt tay");
    expect(screen.getByTestId("cm-chart-price").querySelectorAll("path").length).toBe(3);
    expect(screen.getByTestId("cm-chart-vol").querySelectorAll("path").length).toBe(1);
    act(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
    expect(onClose).toHaveBeenCalled();
  });

  it("đổi khung thời gian gọi lại API với range mới", async () => {
    const { fetchMarketJson } = await import("../../../../services/marketDataClient");
    render(<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}><CommodityDrawer item={item} onClose={() => {}} /></SWRConfig>);
    await flush();
    const btn = Array.from(document.querySelectorAll("button")).find((b) => b.textContent === "10 năm")!;
    fireEvent.click(btn);
    await flush();
    expect(vi.mocked(fetchMarketJson).mock.calls.some(([p, q]) => String(p).includes("/history") && (q as { range?: string })?.range === "10y")).toBe(true);
  });
});
