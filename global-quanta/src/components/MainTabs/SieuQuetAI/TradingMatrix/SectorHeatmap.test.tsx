import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import SectorHeatmap, { quadrantOf } from "./SectorHeatmap";
import NotableMovers from "./NotableMovers";
import type { MatrixMovers } from "../../../../hooks/useTradingMatrix";
import type { SectorLadderDoc, SectorLadderRow } from "../../../../lib/locnganh/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const row = (code: string, name: string, z: number, beat: number, value20: number, flags: SectorLadderRow["flags"] = [], level = 2): SectorLadderRow => ({
  code, name, level, parent: null, tickers: [code + "A", code + "B"], asOf: "2026-10-30", sigmaDailyPct: 1, value20, foreign5: 1e9, avgSmart: 55, flags,
  rungs: [1, 5, 20, 40, 65, 130].map((h) => ({ h, rs: z, z, beat, n: 10, lo: 30, hi: 80, trail: h > 1 ? [{ date: "2026-10-23", z: z - 1, beat: beat - 5 }, { date: "2026-10-30", z, beat }] : [] })),
  structure: { key: "MIXED", label: "Chưa rõ", short: 0, mid: 0, long: 0 },
});
const data: SectorLadderDoc = { engine: "x", generatedAt: "", asOf: "2026-10-30", horizons: [1, 5, 20, 40, 65, 130], crosswalk: { classified: 0, withScanner: 0, sectors: [] }, sectors: [
  row("1", "Ngân hàng", 1.5, 70, 9e12), row("2", "Bất động sản", -1.2, 30, 5e12, [{ id: "BREADTH_DROP", text: "giảm" }]), row("3", "Thép", 1.2, 40, 2e12), row("4", "Chứng khoán", -0.5, 60, 3e12), row("9", "Cấp ba", 1, 60, 1e12, [], 3),
] };
let el: HTMLDivElement;
const render = async (node: React.ReactNode) => { el = document.createElement("div"); document.body.appendChild(el); await act(async () => createRoot(el).render(node)); };
afterEach(() => el?.remove());

describe("Trading Matrix M2", () => {
  it("vùng có tên riêng, không dùng tên RRG; đúng cấp ngành; bấm ngành gửi cả danh sách mã; bấm lại và Xoá lọc thì bỏ lọc", async () => {
    expect([quadrantOf(1, 60), quadrantOf(1, 40), quadrantOf(-1, 60), quadrantOf(-1, 40), quadrantOf(null, 40)]).toEqual(["lead", "fading", "improving", "lagging", null]);
    const onSector = vi.fn(), onOpen = vi.fn();
    await render(<SectorHeatmap doc={data} active="1" onSector={onSector} onOpenSector={onOpen} />);
    expect(el.querySelectorAll("svg circle").length).toBe(4);
    expect(el.textContent).toContain("⚠ Bất động sản");
    for (const q of ["Mạnh, lan tỏa", "Mạnh, ít mã", "Yếu, còn lan tỏa", "Yếu, hẹp"]) expect(el.textContent).toContain(q);
    for (const q of ["Dẫn dắt", "Cải thiện", "Suy yếu", "Tụt hậu"]) expect(el.textContent).not.toContain(q);
    await act(async () => (el.querySelector('g[aria-label^="Thép"]') as SVGGElement).dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onSector.mock.lastCall?.[0].tickers).toEqual(["3A", "3B"]);
    await act(async () => (el.querySelector('g[aria-label^="Ngân hàng"]') as SVGGElement).dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onSector).toHaveBeenLastCalledWith(null);
    await act(async () => (el.querySelector("[data-testid=mx-clear-industry]") as HTMLButtonElement).click());
    expect(onSector).toHaveBeenLastCalledWith(null);
    await act(async () => (el.querySelector("[data-testid=mx-open-sector]") as HTMLButtonElement).click());
    expect(onOpen).toHaveBeenCalledWith("1");
    expect(el.querySelectorAll("[data-testid=mx-heatmap-list] li")[0].textContent).toContain("Ngân hàng");
    await act(async () => (el.querySelector("[data-mx-level='3']") as HTMLButtonElement).click());
    expect(el.querySelectorAll("svg circle").length).toBe(1);
  });

  it("quỹ đạo chỉ hiện khi đang chọn; 1 phiên là thanh nhịp, không xếp vùng; đủ sáu kỳ", async () => {
    await render(<SectorHeatmap doc={data} active="1" onSector={vi.fn()} />);
    expect(el.querySelectorAll("[data-testid=mx-trail]").length).toBe(1);
    expect([...el.querySelectorAll("[data-mx-h]")].map((b) => b.textContent)).toEqual(["1 phiên", "5 phiên", "20 phiên", "8 tuần", "13 tuần", "26 tuần"]);
    await act(async () => (el.querySelector("[data-mx-h='1']") as HTMLButtonElement).click());
    expect(el.querySelector("[data-testid=mx-pulse]")).toBeTruthy();
    expect(el.querySelector("svg")).toBeNull();
    expect(el.textContent).not.toContain("Mạnh, lan tỏa");
  });

  it("mã biến động đáng chú ý: bấm mã chọn toàn trang", async () => {
    const m = (symbol: string, ret: number) => ({ symbol, industry: "Ngân hàng", close: 10, ret, value: 5e11, valueRatio: 2.5, avgValue20: 2e11, atCeiling: ret > 6, atFloor: false, foreignNet: 0 });
    const mv: MatrixMovers = { version: "v", scope: { id: "VN30", label: "Rổ VN30" }, asOf: "2026-10-21", eligible: 30, liquidityFloor: 3e11, gainers: [m("VCB", 6.9)], losers: [m("HPG", -2)], valueSpikes: [m("SSI", 1)], label: "Mã biến động đáng chú ý", note: "KHÔNG phải mức đóng góp vào VN-Index." };
    const onSelect = vi.fn();
    await render(<NotableMovers data={mv} onSelect={onSelect} />);
    expect(el.textContent).toContain("trần");
    await act(async () => (el.querySelector('button[aria-label="Chọn HPG"]') as HTMLButtonElement).click());
    expect(onSelect).toHaveBeenCalledWith("HPG");
  });
});
