import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import SectorHeatmap, { quadrantOf } from "./SectorHeatmap";
import NotableMovers from "./NotableMovers";
import type { MatrixMovers, MatrixSectors, SectorStat } from "../../../../hooks/useTradingMatrix";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const sec = (industry: string, rs5: number, breadth: number, value20: number, flags: SectorStat["flags"] = []): SectorStat => ({
  industry, group: "Nhóm", count: 10, eligible: 9, rs: { 1: rs5 / 2, 5: rs5, 20: rs5 * 2 }, medianReturn: { 1: 0, 5: rs5, 20: 0 },
  breadth, breadth5: breadth, value20, foreign5: 1e9, avgSmart: 55, smartCoverage: 1, rangeRatio: 1, flags,
});
const data: MatrixSectors = {
  version: "matrix/M1 1.0.0", scope: { id: "VNINDEX", label: "Toàn sàn HOSE" }, asOf: "2026-10-21", horizons: [1, 5, 20], indexReturn: { 1: 0.2, 5: 1, 20: -2 },
  sectors: [sec("Ngân hàng", 2.1, 70, 9e12), sec("Bất động sản", -3.2, 30, 5e12, [{ id: "BREADTH_DROP", text: "Độ rộng giảm 30 điểm" }]), sec("Thép", 1.2, 40, 2e12), sec("Chứng khoán", -0.5, 60, 3e12)],
  unclassified: 2, minSectorSize: 3, definition: "định nghĩa", smartAsOf: "2026-10-21", smartMatched: true, taxonomySource: "scanner:taxonomy",
};
let el: HTMLDivElement;
const render = async (node: React.ReactNode) => { el = document.createElement("div"); document.body.appendChild(el); await act(async () => createRoot(el).render(node)); };
afterEach(() => el?.remove());

describe("Trading Matrix M2", () => {
  it("góc phần tư có tên (không chỉ màu); bấm ngành gọi lọc CÙNG state; bấm lại / Xoá lọc -> bỏ lọc; cờ ⚠ hiện trên nhãn", async () => {
    expect([quadrantOf(1, 60), quadrantOf(1, 40), quadrantOf(-1, 60), quadrantOf(-1, 40), quadrantOf(null, 40)]).toEqual(["lead", "fading", "improving", "lagging", null]);
    const onIndustry = vi.fn();
    await render(<SectorHeatmap data={data} active={new Set(["Ngân hàng"])} onIndustry={onIndustry} />);
    expect(el.querySelectorAll("svg circle").length).toBe(4);
    expect(el.textContent).toContain("⚠ Bất động sản");
    for (const q of ["Dẫn dắt", "Suy yếu", "Cải thiện", "Tụt hậu"]) expect(el.textContent).toContain(q);
    await act(async () => (el.querySelector('g[aria-label^="Thép"]') as SVGGElement).dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onIndustry).toHaveBeenLastCalledWith("Thép");
    await act(async () => (el.querySelector('g[aria-label^="Ngân hàng"]') as SVGGElement).dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onIndustry).toHaveBeenLastCalledWith(null);
    await act(async () => (el.querySelector("[data-testid=mx-clear-industry]") as HTMLButtonElement).click());
    expect(onIndustry).toHaveBeenLastCalledWith(null);
    const list = el.querySelectorAll("[data-testid=mx-heatmap-list] li");
    expect(list[0].textContent).toContain("Ngân hàng"); // xếp theo RS
    await act(async () => (el.querySelector("[data-mx-h='20']") as HTMLButtonElement).click());
    expect(el.textContent).toContain("VN-Index -2");
  });

  it("mã biến động đáng chú ý: ghi rõ KHÔNG phải đóng góp chỉ số; bấm mã chọn toàn trang", async () => {
    const m = (symbol: string, ret: number) => ({ symbol, industry: "Ngân hàng", close: 10, ret, value: 5e11, valueRatio: 2.5, avgValue20: 2e11, atCeiling: ret > 6, atFloor: false, foreignNet: 0 });
    const mv: MatrixMovers = { version: "v", scope: { id: "VN30", label: "Rổ VN30" }, asOf: "2026-10-21", eligible: 30, liquidityFloor: 3e11, gainers: [m("VCB", 6.9)], losers: [m("HPG", -2)], valueSpikes: [m("SSI", 1)], label: "Mã biến động đáng chú ý", note: "KHÔNG phải mức đóng góp vào VN-Index." };
    const onSelect = vi.fn();
    await render(<NotableMovers data={mv} onSelect={onSelect} />);
    expect(el.textContent).toContain("KHÔNG phải mức đóng góp");
    expect(el.textContent).toContain("trần");
    await act(async () => (el.querySelector('button[aria-label="Chọn HPG"]') as HTMLButtonElement).click());
    expect(onSelect).toHaveBeenCalledWith("HPG");
  });
});
