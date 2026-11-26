import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { SWRConfig } from "swr";
import { cleanup, render, screen } from "../../../test/rtl-lite";
import PriceActionConfirmation, { loadInstruments } from "./PriceActionConfirmation";

const bars = Array.from({ length: 160 }, (_, i) => {
  const c = 20000 + Math.round(Math.sin(i / 6) * 1500 + i * 10);
  return { date: `2026-${String(Math.floor(i / 28) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`, open: c - 100, high: c + 300, low: c - 300, close: c, volume: 1000 + (i % 7) * 400 };
});
vi.mock("../../../hooks/elite10/useAdjustedDaily", () => ({ useAdjustedDaily: () => ({ bars, priceBasis: "ADJUSTED_CUMULATIVE", isLoading: false, error: null, warnings: [], gapRepairs: [] }) }));
vi.mock("../../../services/marketDataClient", () => ({
  fetchMarketJson: async (path: string) => (path.includes("/securities")
    ? { securities: [{ symbol: "NAF", exchange: "HOSE", name: null }, { symbol: "HPG", exchange: "HOSE", name: null }] }
    : { tickers: [{ ticker: "HPG", exchange: "HOSE", name: "Hòa Phát" }] }),
}));
afterEach(() => cleanup());

describe("Price Action × Khối lượng (Hồ sơ 360°)", () => {
  it("mã ngoài universe 100 mã vẫn có sàn nhờ danh sách chứng khoán đầy đủ; tên ưu tiên universe", async () => {
    const { tickers } = await loadInstruments();
    expect(tickers.find((t) => t.ticker === "NAF")?.exchange).toBe("HOSE");
    expect(tickers.find((t) => t.ticker === "HPG")?.name).toBe("Hòa Phát");
  });
  it("hiện khối lượng phiên cuối và nhãn kiểm định PA-VOL-r1 KHÔNG ĐẠT; không báo thiếu sàn", async () => {
    render(<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}><PriceActionConfirmation ticker="NAF" /></SWRConfig>);
    await act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); });
    expect(screen.getByTestId("pa-confirmation").textContent).toContain("HOSE");
    expect(screen.getByTestId("pa-confirmation").textContent).not.toContain("Chưa xác định sàn");
    expect(screen.getByTestId("pa-last-volume").textContent).toMatch(/RVOL .*× · tăng\/giảm/);
    expect(screen.getByTestId("pa-validation").textContent).toContain("PA-VOL-r1 · KHÔNG ĐẠT");
  });
});
