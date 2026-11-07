import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { countPass, DEFAULT_FILTER, DIVIDEND_STOCKS, filterVerdict, marginalCounts, type DividendStock } from "../../../../lib/quant-cotuc";
import { EMPTY_PREFS, filterToSaved, sanitizePrefs, savedToFilter } from "../../../../lib/cotuc/screenerPrefs";
import type { FmView } from "../../../../lib/cotuc/dsStocks";
import { ScreenerToolbar } from "./ScreenerToolbar";
import { DividendScreenerTable } from "./DividendScreenerTable";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fm = (quintile: number): FmView => ({ version: "FM-v1", label: "MÔ TẢ", score: 0, groups: { Y: 0, D: 0, G: 0, Q: 0, V: 0, R: 0 }, rank: 1, of: 3, quintile, pct: quintile / 5 });
const mk = (i: number, over: Partial<DividendStock>): DividendStock => ({ ...DIVIDEND_STOCKS[i], exDividendDate: "", paymentDate: "", agmDate: "", ...over });
const stocks = [
  mk(0, { dividendYield: 8, fundamentalsReal: true, roe: 20, pe: 9, fm: fm(5) }),
  mk(1, { dividendYield: 4, fundamentalsReal: true, roe: 10, pe: 20, fm: fm(3) }),
  mk(2, { dividendYield: 6, fundamentalsReal: false, fm: null }),
];

describe("BL4 lọc: hạng NT + đếm ngay khi chỉnh", () => {
  it("Hạng NT ≥ Q4: mã chưa có điểm -> thiếu dữ liệu, Q3 -> không đạt", () => {
    const f = { ...DEFAULT_FILTER, minQuintile: 4 };
    expect(stocks.map((s) => filterVerdict(s, f))).toEqual(["PASS", "FAIL", "MISSING_DATA"]);
  });
  it("mỗi điều kiện đang bật loại bao nhiêu mã (giữ các điều kiện khác)", () => {
    const f = { ...DEFAULT_FILTER, minYield: 5, minQuintile: 5 };
    expect(countPass(stocks, f)).toBe(1);
    expect(marginalCounts(stocks, f)).toEqual({ minYield: 0, minQuintile: 1 });
  });
});

describe("BL4 bộ lọc đã lưu", () => {
  it("chỉ lưu trường khác mặc định, không lưu ô tìm kiếm; kẹp miền khi đọc", () => {
    expect(filterToSaved({ ...DEFAULT_FILTER, minYield: 5, searchQ: "FPT" })).toEqual({ minYield: 5 });
    expect(savedToFilter({ minYield: 5 })).toEqual({ ...DEFAULT_FILTER, minYield: 5 });
    const p = sanitizePrefs({ screens: [{ name: "A", filter: { minYield: 99, trend: "X" } }, { name: "a", filter: {} }], columns: { pe: false, zz: true }, defaultScreen: "A" });
    expect(p).toEqual({ schemaVersion: 1, screens: [{ name: "A", filter: { minYield: 15 } }], columns: { pe: false }, defaultScreen: "A" });
  });
});

describe("ScreenerToolbar", () => {
  afterEach(() => { document.body.innerHTML = ""; });
  const render = async (props: Partial<Parameters<typeof ScreenerToolbar>[0]> = {}) => {
    const el = document.createElement("div"); document.body.appendChild(el);
    const setFilter = vi.fn(), updatePrefs = vi.fn(), setSort = vi.fn();
    await act(async () => {
      createRoot(el).render(<ScreenerToolbar stocks={stocks} filter={{ ...DEFAULT_FILTER, minYield: 5 }} setFilter={setFilter} sort={{ field: "score", asc: false }} setSort={setSort}
        prefs={EMPTY_PREFS} updatePrefs={updatePrefs} cloud="saved" notice={null} shown={2} {...props} />);
    });
    return { el, setFilter, updatePrefs, setSort };
  };
  it("bộ lọc mẫu ghi số mã đạt; chip điều kiện ghi số mã bị loại, bấm để bỏ", async () => {
    const { el, setFilter } = await render();
    expect(el.querySelector('[data-testid="preset-topfm"]')!.textContent).toContain("1");
    expect(el.querySelector('[data-testid="filter-live-count"]')!.textContent).toBe("2");
    const chip = el.querySelector<HTMLButtonElement>('[data-testid="chip-minYield"]')!;
    expect(chip.textContent).toContain("−1");
    await act(async () => { chip.click(); });
    expect(setFilter).toHaveBeenCalledWith(expect.objectContaining({ minYield: 0 }));
  });
  it("lưu bộ lọc theo tên (kèm cách sắp xếp) và ẩn cột", async () => {
    const { el, updatePrefs } = await render();
    const input = el.querySelector<HTMLInputElement>('[data-testid="saved-name"]')!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "Lợi suất 5%"); input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => { el.querySelector<HTMLButtonElement>('[data-testid="saved-save"]')!.click(); });
    const next = updatePrefs.mock.calls[0][0](EMPTY_PREFS);
    expect(next.screens).toEqual([{ name: "Lợi suất 5%", filter: { minYield: 5 }, sort: { field: "score", asc: false } }]);
    await act(async () => { el.querySelector<HTMLButtonElement>('[data-testid="cols-toggle"]')!.click(); });
    await act(async () => { el.querySelector<HTMLInputElement>('[data-testid="col-pe"]')!.click(); });
    expect(updatePrefs.mock.calls[1][0](EMPTY_PREFS).columns).toEqual({ pe: false });
  });
  it("chọn bộ lọc đã lưu -> áp bộ lọc + cách sắp xếp", async () => {
    const prefs = sanitizePrefs({ screens: [{ name: "Q5", filter: { minQuintile: 5 }, sort: { field: "dividendYield", asc: true } }] });
    const { el, setFilter, setSort } = await render({ prefs });
    const sel = el.querySelector<HTMLSelectElement>('[data-testid="saved-select"]')!;
    await act(async () => { sel.value = "Q5"; sel.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(setFilter).toHaveBeenCalledWith(expect.objectContaining({ minQuintile: 5, minYield: 0 }));
    expect(setSort).toHaveBeenCalledWith({ field: "dividendYield", asc: true });
  });
});

describe("DividendScreenerTable — chọn cột", () => {
  afterEach(() => { document.body.innerHTML = ""; });
  it("ẩn cột P/E và cả nhóm Chu kỳ & xác suất", async () => {
    const el = document.createElement("div"); document.body.appendChild(el);
    await act(async () => {
      createRoot(el).render(<DividendScreenerTable rows={stocks} sortField="score" sortAsc={false} onSort={() => {}} onSelect={() => {}} isPinned={() => false} onTogglePin={() => {}}
        realRsMap={{}} timingByTicker={new Map()} decisionsByTicker={new Map()} livePrices={{}} liveChangePct={{}} flash={{}} now={0} hidden={new Set(["pe", "window", "expected"])} />);
    });
    const heads = [...el.querySelectorAll("thead tr:last-child th")].map((t) => t.textContent ?? "");
    expect(heads.some((h) => h.startsWith("P/E"))).toBe(false);
    expect(heads.some((h) => h.includes("Cửa sổ"))).toBe(false);
    expect(el.textContent).not.toContain("Chu kỳ & xác suất");
    expect(el.querySelectorAll("tbody tr")[0].querySelectorAll("td").length).toBe(heads.length);
  });
});
