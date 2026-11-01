import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "../../../../test/rtl-lite";
import type { SectorLadderDoc, SectorLadderRow } from "../../../../lib/locnganh/types";
import SectorLadderGrid, { zBackground } from "./SectorLadderGrid";

const row = (code: string, name: string, key: SectorLadderRow["structure"]["key"], label: string, z20: number, level = 2): SectorLadderRow => ({
  code, name, level, parent: null, tickers: [], asOf: "2026-10-30", sigmaDailyPct: 0.8,
  rungs: [1, 5, 20, 40, 65, 130].map((h) => ({ h, rs: h === 20 ? 1.5 : -0.4, z: h === 20 ? z20 : -0.2, beat: h === 130 ? null : 60, n: 10, lo: 30, hi: 80 })),
  structure: { key, label, short: 0, mid: 0, long: 0 },
});
const doc: SectorLadderDoc = { engine: "sector-ladder/LD1", asOf: "2026-10-30", horizons: [1, 5, 20, 40, 65, 130], generatedAt: "", sectors: [
  row("1", "Yếu", "DOWN_ALIGNED", "Đồng thuận giảm", -1), row("2", "Mạnh", "UP_ALIGNED", "Đồng thuận tăng", 0.5), row("3", "Rất mạnh Z", "MIXED", "Chưa rõ", 2), row("9", "Cấp ba", "UP_ALIGNED", "Đồng thuận tăng", 1, 3),
], crosswalk: { classified: 0, withScanner: 0, sectors: [] } };
const order = () => [...document.querySelectorAll('[data-testid^="ladder-sector-"]')].map((e) => e.textContent);

afterEach(cleanup);

describe("Lưới thang kỳ hạn", () => {
  it("đủ sáu nấc đúng tên, đúng cấp, xếp theo cấu trúc", () => {
    render(<SectorLadderGrid doc={doc} level={2} />);
    expect([1, 5, 20, 40, 65, 130].map((h) => screen.getByTestId(`ladder-sort-${h}`).textContent)).toEqual(["1 phiên", "5 phiên", "20 phiên", "8 tuần", "13 tuần", "26 tuần"]);
    expect(order()).toEqual(["Mạnh", "Rất mạnh Z", "Yếu"]);
    expect(screen.getByTestId("ladder-row-2").querySelectorAll('[data-testid="ladder-cell"]').length).toBe(6);
  });
  it("bấm cột xếp theo Z của kỳ đó", () => {
    render(<SectorLadderGrid doc={doc} level={2} />);
    fireEvent.click(screen.getByTestId("ladder-sort-20"));
    expect(order()).toEqual(["Rất mạnh Z", "Mạnh", "Yếu"]);
  });
  it("thiếu độ tham gia hiện gạch, không hiện 0%; 1 phiên không tô nền; bấm tên mở ngành", () => {
    const onSelect = vi.fn();
    render(<SectorLadderGrid doc={doc} level={2} onSelectSector={onSelect} />);
    const cells = screen.getByTestId("ladder-row-2").querySelectorAll<HTMLElement>('[data-testid="ladder-cell"]');
    expect(cells[5].textContent).toContain("—");
    expect(cells[0].style.background).toBe("");
    expect(cells[2].style.background).not.toBe("");
    fireEvent.click(screen.getByTestId("ladder-sector-2"));
    expect(onSelect).toHaveBeenCalledWith("2");
  });
  it("nền ô theo dấu Z và bão hòa ở 2", () => {
    expect(zBackground(null)).toBeUndefined();
    expect(zBackground(5)).toBe(zBackground(2));
    expect(zBackground(1)).toContain("34,197,94");
    expect(zBackground(-1)).toContain("248,113,113");
  });
});
