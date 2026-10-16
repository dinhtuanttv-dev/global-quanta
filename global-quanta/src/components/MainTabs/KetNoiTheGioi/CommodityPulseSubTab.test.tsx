// Nhịp đập hàng hoá (C1) — thẻ đọc snapshot Gateway: kỳ/phiên, cơ sở %, nguồn, nhãn heuristic, không bịa số khi thiếu nguồn.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "../../../test/rtl-lite";
import { fmtPct, fmtPeriod, fmtPrice, staleDays, type CommoditySnapshot } from "../../../lib/commodities/types";

const snap: CommoditySnapshot = {
  generatedAt: "2026-10-16T10:00:00Z",
  pinkSheet: { updatedOn: "2026-10-02", lastPeriod: "2026-09", fetchedAt: "2026-10-16T09:00:00Z", url: "u", lastError: null },
  items: [
    { id: "GOLD", nameVi: "Vàng", group: "Kim loại quý", unit: "USD/oz", sectorKey: "PRECIOUS_METALS", vnPrice: false, twoWayVi: null, vnTickers: ["PNJ"], available: true, freq: "day",
      source: { kind: "yahoo", symbol: "GC=F", labelVi: "COMEX" }, value: 4196.5, period: "2026-10-16", change: { pct: 0.63, basisVi: "so với phiên trước" }, history: [["2026-10-15", 4170], ["2026-10-16", 4196.5]] },
    { id: "RICE_VN", nameVi: "Gạo Việt Nam 5% tấm", group: "Nông sản", unit: "USD/tấn", sectorKey: null, vnPrice: true, twoWayVi: null, vnTickers: [], available: true, freq: "month",
      source: { kind: "wb", labelVi: "World Bank Pink Sheet", updatedOn: "2026-10-02" }, value: 418.5, period: "2026-09", change: { pct: 1.85, basisVi: "so với tháng trước" }, yoyPct: 12.7, history: [["2026-08", 410.9], ["2026-09", 418.5]] },
    { id: "BDI", nameVi: "Cước tàu hàng rời (BDI)", group: "Vận tải", unit: "điểm", sectorKey: null, vnPrice: false, twoWayVi: null, vnTickers: ["HAH"], available: false, freq: null,
      source: { kind: "none", labelVi: "Baltic Exchange — chỉ số trả phí, chưa có nguồn mở" }, reasonVi: "Baltic Exchange — chỉ số trả phí, chưa có nguồn mở" },
  ],
};

vi.mock("../../../hooks/useCommoditySnapshot", () => ({ useCommoditySnapshot: () => ({ data: snap, error: undefined }) }));
vi.mock("../../../hooks/useHousingPrices", () => ({ useHousingPrices: () => ({ countries: [], isLoading: false, error: null }) }));

afterEach(cleanup);

describe("định dạng", () => {
  it("kỳ, giá, % kiểu Việt Nam", () => {
    expect(fmtPeriod("2026-10-15")).toBe("15/10/2026");
    expect(fmtPeriod("2026-09")).toBe("09/2026");
    expect(fmtPrice(4196.5)).toBe("4.197");
    expect(fmtPrice(2.75)).toBe("2,75");
    expect(fmtPct(-1.234)).toBe("−1,23%");
    expect(fmtPct(null)).toBe("—");
  });
  it("cũ: ngày > 5 ngày; tháng theo ngày công bố > 45 ngày", () => {
    const now = Date.parse("2026-10-16");
    expect(staleDays({ freq: "day", period: "2026-10-15", source: { kind: "yahoo", labelVi: "" } }, now)).toBeNull();
    expect(staleDays({ freq: "day", period: "2026-10-01", source: { kind: "yahoo", labelVi: "" } }, now)).toBe(15);
    expect(staleDays({ freq: "month", period: "2026-09", source: { kind: "wb", labelVi: "", updatedOn: "2026-10-02" } }, now)).toBeNull();
    expect(staleDays({ freq: "month", period: "2026-07", source: { kind: "wb", labelVi: "", updatedOn: "2026-08-04" } }, now)).toBe(73);
  });
});

describe("CommodityPulseSubTab", () => {
  it("hiện giá kèm kỳ + cơ sở %, giá Việt Nam, nhãn heuristic; BDI không có số", async () => {
    const { default: Tab } = await import("./CommodityPulseSubTab");
    render(<Tab />);
    const text = document.body.textContent ?? "";
    expect(text).toContain("4.197");
    expect(text).toContain("so với phiên trước");
    expect(text).toContain("Phiên 16/10/2026");
    expect(text).toContain("Kỳ 09/2026");
    expect(text).toContain("so với tháng trước");
    expect(text).toContain("GIÁ VIỆT NAM");
    expect(text).toContain("Mã liên quan (heuristic)");
    expect(text).toContain("chưa có nguồn mở");
    expect(screen.getByTestId("commodity-card-BDI").textContent).not.toMatch(/\d+,\d+ điểm/);
  });
});
