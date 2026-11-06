import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "../../../test/rtl-lite";

const row = (o: Record<string, unknown>) => ({
  ticker: "X", fiscal: "2026-09-30", quarter: "Q3/2026", publishedAt: "2026-10-28", current: true, revenue: 1e12, npat: 1e11,
  npatYoY: 0.2, npatStatus: "NORMAL", npatYoYRaw: 0.2, revYoY: 0.1, revStatus: "NORMAL", sue: 1, sur: 1, margin: 0.1, marginDelta: 0.01, ttmYoY: 0.1, streak: 3,
  spark: Array.from({ length: 8 }, (_, i) => ({ q: `Q${(i % 4) + 1}/2025`, npat: 9e10 + i * 1e9 })), notes: [], score: 50, rank: 3, ...o,
});
const data = {
  version: "EQ-v1 (2026-11-06)", label: "MÔ TẢ", asOf: "2026-11-06", fetchedAt: "2026-11-05T10:00:00Z", latestQuarter: "Q3/2026", latestFiscal: "2026-09-30",
  counts: { tickers: 5, reportedLatest: 4, ranked: 3, turnaround: 0, toLoss: 1, lowBase: 1, positiveSue: 1 },
  medianNpatYoY: 0.17, shareNpatUp: 0.75,
  method: { weights: {}, lowBaseVnd: 5e9, lowBaseRel: 0.1, growthCap: [-1, 3], sueWindow: 8, sueMinObs: 6, noteVi: "SUE/SUR …" },
  rows: [
    row({ ticker: "MWG", rank: 1, score: 81.2, sue: 3.48, streak: 8 }),
    row({ ticker: "HPG", rank: 2, score: 70, sue: 2.36, npatYoY: 1.06 }),
    row({ ticker: "PNJ", rank: 3, score: 4.5, npatStatus: "TO_LOSS", npatYoY: null, notes: ["Từ lãi sang lỗ so với cùng kỳ"] }),
    row({ ticker: "MSR", rank: null, score: null, npatStatus: "LOW_BASE", npatYoY: 3, npatYoYRaw: 415.1, sue: 4.2, notes: ["LNST kỳ gốc thấp: tăng trưởng thô 41.510% không dùng để xếp hạng"] }),
    row({ ticker: "OLD", rank: null, score: null, current: false, quarter: "Q2/2026" }),
  ],
};
vi.mock("../../../hooks/useEarningsQuality", () => ({ useEarningsQuality: () => ({ data, error: null, isLoading: false }) }));
import EarningsQualityPanel from "./EarningsQualityPanel";

afterEach(() => cleanup());

describe("F5 — Chất lượng KQKD", () => {
  it("phân trang: mặc định 50 mã, Xem thêm 50", () => {
    const many = Array.from({ length: 120 }, (_, i) => row({ ticker: `T${String(i).padStart(3, "0")}`, rank: i + 1, score: 100 - i * 0.5 }));
    const saved = data.rows; data.rows = many as never;
    try {
      render(<EarningsQualityPanel />);
      expect(screen.getAllByTestId("eq-row")).toHaveLength(50);
      fireEvent.click(screen.getByTestId("eq-more"));
      expect(screen.getAllByTestId("eq-row")).toHaveLength(100);
    } finally { data.rows = saved; }
  });

  it("thẻ tổng quan, xếp hạng theo điểm, mã nền thấp không xếp hạng (ghi chú tăng trưởng thô)", () => {
    const opened: string[] = [];
    render(<EarningsQualityPanel onSelectTicker={(t) => opened.push(t)} sectorOf={(t) => (t === "MWG" ? "Bán lẻ" : null)} />);
    expect(screen.getByTestId("eq-panel").textContent).toContain("Chất lượng KQKD — Q3/2026");
    expect(screen.getByTestId("eq-tiles").textContent).toContain("4/5");
    const tickers = () => screen.getAllByTestId("eq-row").map((r) => r.querySelector("button")!.textContent);
    expect(tickers()).toEqual(["MWG", "HPG", "PNJ"]); // mặc định: chỉ mã đã xếp hạng
    expect(screen.getByTestId("eq-table").textContent).toContain("lãi → lỗ");
    fireEvent.click(screen.getByTestId("eq-filter-lowbase"));
    expect(tickers()).toEqual(["MSR"]);
    expect(screen.getByTestId("eq-table").textContent).toContain("nền thấp");
    expect(screen.getByTestId("eq-note-MSR").getAttribute("title")).toContain("41.510%");
    fireEvent.click(screen.getByTestId("eq-filter-notyet"));
    expect(tickers()).toEqual(["OLD"]);
    fireEvent.click(screen.getByTestId("eq-filter-ranked"));
    fireEvent.click(screen.getAllByTestId("eq-row")[0].querySelector("button")!);
    expect(opened).toEqual(["MWG"]);
  });
});
