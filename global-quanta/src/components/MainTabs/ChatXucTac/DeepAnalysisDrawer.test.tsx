import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "../../../test/rtl-lite";

const fin = { ticker: "HPG", source: "VNDIRECT_FINFO", reportType: "ANNUAL", applicable: true, reason: null, fiscalDates: ["2025-12-31", "2024-12-31"], fetchedAt: "",
  current: { ticker: "HPG", period: "2025", receivables: 11e12, sales: 156e12, costOfGoodsSold: 131e12, currentAssets: 103e12, ppeGross: 180e12, totalAssets: 257e12, depreciation: 8.4e12, sgaExpense: 5e12, netIncome: 15.5e12, totalLongTermDebt: 27e12, operatingCashFlow: 17e12, currentLiabilities: 94e12, retainedEarnings: 51e12, ebit: 21.5e12, bookValueEquity: 131e12, totalLiabilities: 126e12, workingCapital: 9e12, sharesOutstanding: 7.6e9 },
  prior: { ticker: "HPG", period: "2024", receivables: 4.3e12, sales: 138e12, costOfGoodsSold: 120e12, currentAssets: 86e12, ppeGross: 150e12, totalAssets: 224e12, depreciation: 6.9e12, sgaExpense: 4.3e12, netIncome: 12e12, totalLongTermDebt: 27e12, operatingCashFlow: 6.6e12, currentLiabilities: 75e12, retainedEarnings: 49e12, ebit: 17e12, bookValueEquity: 114e12, totalLiabilities: 109e12, workingCapital: 11e12, sharesOutstanding: 6.4e9 } };
const risk = { requested: ["FPT", "HPG"], used: ["FPT", "HPG"], failed: [], priceBasis: "ADJUSTED_CUMULATIVE", weighting: "EQUAL_DAILY_REBALANCE", from: "2025-10-01", to: "2026-10-15", sampleSize: 4, dailyReturns: [0.01, -0.02, 0.005, -0.01], beta: 1.12 };

vi.mock("../../../hooks/useDeepAnalysisData", () => ({
  useForensicInputs: () => ({ data: fin, isLoading: false }),
  usePortfolioRiskData: () => ({ data: risk, isLoading: false, symbols: ["FPT", "HPG"] }),
}));
vi.mock("../../../hooks/useWatchlists", () => ({ useWatchlists: () => ({ radar: { id: "default", name: "Danh mục của tôi", tickers: ["HPG", "FPT"] } }) }));

import DeepAnalysisDrawer from "./DeepAnalysisDrawer";

afterEach(cleanup);
const card = { ticker: "HPG", sourceId: "s", sourceTitle: "Thuế chống bán phá giá thép", direction: "benefit", netSignedImpact: 4.2, propagationDistance: "direct", hopCount: 1, horizon: "medium", scheduled: false, daysRemaining: null, corroborationCount: 2, historicalWinRate: 50, priceInStatus: "not_reflected", volumeFlag: "none", foreignFlowDirection: "none", opportunityScore: 3, isBestPickInGroup: true, isConflicted: false, isWatchlisted: false, compositeScore: 60, trustScore: 0.7 } as never;

describe("X5 — ngăn kéo Phân tích sâu (dữ liệu thật)", () => {
  it("không còn nhãn 'minh hoạ' cho BCTC; hiện kỳ BCTC thật và danh mục ★ thật; Esc đóng", async () => {
    const onClose = vi.fn();
    render(<DeepAnalysisDrawer card={card} onClose={onClose} />);
    const tab = (label: string) => Array.from(document.querySelectorAll("button")).find((b) => b.textContent === label)!;
    fireEvent.click(tab("Sức khoẻ tài chính"));
    expect(document.body.textContent).toMatch(/BCTC năm 2025 so với 2024 · nguồn VNDirect/);
    expect(document.body.textContent).not.toMatch(/minh hoa|minh hoạ - chua noi/i);
    fireEvent.click(tab("Quản trị rủi ro"));
    expect(document.body.textContent).toMatch(/FPT, HPG · cân bằng tỷ trọng · 4 phiên/);
    expect(document.body.textContent).toMatch(/beta 1,12/);
    expect(document.body.textContent).toMatch(/giá trị mặc định/);
    await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
    expect(onClose).toHaveBeenCalled();
  });
});
