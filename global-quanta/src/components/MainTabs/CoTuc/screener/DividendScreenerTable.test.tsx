import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_FILTER, DIVIDEND_STOCKS, explainFilter, filterVerdict, type DividendStock } from "../../../../lib/quant-cotuc";
import { DividendScreenerTable } from "./DividendScreenerTable";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const base = DIVIDEND_STOCKS.find((s) => s.ticker === "FPT")!;
const stock = (over: Partial<DividendStock>): DividendStock => ({ ...base, exDividendDate: "", paymentDate: "", agmDate: "", ...over });
const SIEU = { ...DEFAULT_FILTER, minYield: 7, minRoe: 12, maxPe: 15, maxDebt: 0.5, hideRiskFlags: true };

describe("filterVerdict — thiếu dữ liệu khác với không đạt", () => {
  it("mặc định: mã chưa có số thật vẫn hiện (không bật ngưỡng nào)", () => {
    expect(filterVerdict(stock({ isUniverseOnly: true, fundamentalsReal: false, pe: 0, roe: 0 }), DEFAULT_FILTER)).toBe("PASS");
  });
  it("bật ngưỡng ROE/PE: chưa có số thật -> MISSING_DATA (không lọt vào 'Siêu Cổ Tức')", () => {
    expect(filterVerdict(stock({ dividendYield: 9, fundamentalsReal: false }), SIEU)).toBe("MISSING_DATA");
  });
  it("số thật đạt -> PASS; không đạt -> FAIL", () => {
    expect(filterVerdict(stock({ dividendYield: 9, fundamentalsReal: true, roe: 20, pe: 9, debtEquity: 0.3, fscore: 0 }), SIEU)).toBe("PASS");
    expect(filterVerdict(stock({ dividendYield: 9, fundamentalsReal: true, roe: 8, pe: 9, debtEquity: 0.3 }), SIEU)).toBe("FAIL");
  });
  it("ngân hàng không bị loại vì Nợ/VCSH (bản chất ngành)", () => {
    expect(filterVerdict(stock({ sector: "Ngân hàng", dividendYield: 9, fundamentalsReal: true, roe: 17, pe: 8, debtEquity: 9.7 }), SIEU)).toBe("PASS");
  });
  it("mặc định không giới hạn P/E (VIC ~81 vẫn hiện)", () => {
    expect(filterVerdict(stock({ fundamentalsReal: true, pe: 81 }), DEFAULT_FILTER)).toBe("PASS");
  });
  it("đếm riêng mã bị ẩn vì đợt cũ", () => {
    const old = stock({ exDividendDate: "01/01/2020" });
    expect(explainFilter([old, stock({})], DEFAULT_FILTER)).toEqual({ pass: 1, fail: 0, missingData: 0, stale: 1 });
  });
});

describe("DividendScreenerTable", () => {
  afterEach(() => { document.body.innerHTML = ""; });

  it("badge thay N/A, giá trực tiếp, cờ cổ tức đặc biệt, bấm dòng mở mã", async () => {
    const onSelect = vi.fn();
    const rows = [
      stock({ ticker: "DGC", sector: "Hóa chất", dividendYield: 31, dividendAmount: 5000, fundamentalsReal: true, pe: 6.3, roe: 13.1, specialDividend: true }),
      stock({ ticker: "VIC", sector: "Bất động sản", dividendYield: 0, dividendAmount: 0, isUniverseOnly: true, fundamentalsReal: false, pe: 0, roe: 0 }),
    ];
    const el = document.createElement("div");
    document.body.appendChild(el);
    await act(async () => {
      createRoot(el).render(
        <DividendScreenerTable rows={rows} sortField="dividendYield" sortAsc={false} onSort={() => {}} onSelect={onSelect}
          isPinned={() => false} onTogglePin={() => {}} realRsMap={{}} timingByTicker={new Map([["DGC", {
            ticker: "DGC", action: "IN_WINDOW", tdToEx: 18, window: { entryFrom: -25, entryTo: -15, exitOffset: 3 }, expectedNetReturn: 0.012,
            nEvents: 9, fdrQValue: 0.05, confidence: "MEDIUM", dateStatus: "ESTIMATED", earnings: { revenueGrowthYoY: 0.1, profitGrowthYoY: -0.05, conflict: "NONE" } }]])}
          decisionsByTicker={new Map()} livePrices={{ DGC: 35500 }} liveChangePct={{ DGC: -1.2 }} flash={{}} now={Date.now()} />,
      );
    });
    expect(el.querySelectorAll('[data-testid="screener-row"]')).toHaveLength(2);
    expect(el.textContent).toContain("35.50");
    expect(el.textContent).toContain("TRONG VÙNG MUA");
    expect(el.textContent).toContain("ĐB");
    expect(el.textContent).toContain("+1.2%");
    expect(el.textContent).toContain("−5%");
    expect(el.textContent).toContain("6.3x");
    expect(el.textContent).not.toMatch(/N\/A|NaN|undefined|0\/100/);
    await act(async () => { (el.querySelectorAll('[data-testid="screener-row"]')[1] as HTMLElement).click(); });
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ ticker: "VIC" }));
  });
});
