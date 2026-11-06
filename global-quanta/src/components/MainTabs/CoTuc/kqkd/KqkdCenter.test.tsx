import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "../../../../test/rtl-lite";
// Hợp đồng dữ liệu: dựng payload bằng CHÍNH bộ tính của Gateway (KQ-v1) để giao diện và API không lệch nhau.
// @ts-expect-error — module JS của backend, không có khai báo kiểu
import { buildSummary, buildSummaryRow, buildTickerDetail, evidenceFrom } from "../../../../../backend/src/market/fundamentals/kqkdEngine.js";
import report from "../../../../../backend/src/market/fundamentals/kq-r1-report.json";
import type { KqkdDetail, KqkdSummary } from "../../../../lib/kqkd/types";

const B = 1e9;
const fiscalOf = (y: number, q: number) => { const m = q * 3; return `${y}-${String(m).padStart(2, "0")}-${m === 3 || m === 12 ? 31 : 30}`; };
function corp(ticker: string, k = 1, over: (y: number, q: number) => Record<string, number> = () => ({})) {
  const quarters = [];
  for (let y = 2014; y <= 2026; y++) for (let q = 1; q <= 4; q++) {
    if (y === 2026 && q > 3) break;
    const g = (1 + 0.1 * (y - 2014)) * k, season = [0.9, 1, 1, 1.3][q - 1];
    const rev = 1000 * B * g * season, gross = rev * 0.3, selling = rev * 0.05, ga = rev * 0.05, pbt = gross - selling - ga + 10 * B, tax = pbt * 0.2, npat = pbt - tax;
    const created = new Date(Date.parse(`${fiscalOf(y, q)}T00:00:00Z`) + 30 * 864e5).toISOString().slice(0, 10);
    quarters.push({ fiscal: fiscalOf(y, q), created, v: { revenue: rev, cogs: rev - gross, gross, selling, ga, finInc: 20 * B, finExp: 10 * B, associates: 0, otherProfit: 0, pbt, tax, npat, minority: 0, npatParent: npat,
      eps: 1000, cfo: npat * 1.1, dep: 30 * B, assets: 5000 * B * g, liabilities: 2500 * B * g, equity: 2500 * B * g, curAssets: 2000 * B * g, curLiab: 1200 * B * g, recvCust: 400 * B * g,
      inventory: 300 * B * g, payables: 200 * B * g, ppe: 1500 * B * g, ltDebt: 500 * B, stDebt: 300 * B, retained: 800 * B * g, capital: 1000 * B, cash: 100 * B, ...over(y, q) } });
  }
  return { ticker, tpl: "corp", quarters, annual: [{ year: 2025, v: { npatParent: 1 } }] };
}
const today = "2026-11-06";
const recs = [corp("AAA"), corp("BBB", 2, (y, q) => (y === 2026 && q === 3 ? { finInc: 4000 * B, pbt: 4200 * B, npat: 3400 * B, npatParent: 3400 * B } : ({} as Record<string, number>))), corp("CCC", 0.5)];
const evidence = evidenceFrom(report);
const summary: KqkdSummary = { ...buildSummary(recs.map((r) => buildSummaryRow(r, { today, mcap: 1e13 })), { today }), evidence };
const details: Record<string, KqkdDetail> = Object.fromEntries(recs.map((r) => [r.ticker, { ...buildTickerDetail(r, { today }), evidence }]));

vi.mock("../../../../hooks/useKqkd", () => ({
  useKqkdSummary: () => ({ data: summary, error: null, isLoading: false }),
  useKqkdTicker: (t: string | null) => ({ data: t ? details[t] ?? null : null, error: null, isLoading: false }),
}));
import KqkdCenter from "./KqkdCenter";

beforeAll(() => { HTMLCanvasElement.prototype.getContext = (() => null) as never; });
afterEach(() => cleanup());

describe("K1–K6 KQKD theo quý", () => {
  it("bảng toàn thị trường: lũy kế 9T, cờ ngoài cốt lõi, lọc, hạn công bố, bản đồ nhiệt 12 quý", () => {
    render(<KqkdCenter sectorOf={(t) => (t === "AAA" ? "Bán lẻ" : null)} />);
    expect(screen.getByTestId("kq-center").textContent).toContain("KQKD theo quý — Q3/2026");
    expect(screen.getByTestId("kq-tiles").textContent).toContain("3/3");
    expect(screen.getByTestId("kq-deadline").textContent).toContain("Q3/2026");
    expect(screen.getByTestId("kq-deadline").textContent).toContain("14/11/2026");
    expect(screen.getAllByTestId("kq-row")).toHaveLength(3);
    expect(screen.getByTestId("kq-table").textContent).toContain("9T");
    fireEvent.click(screen.getByTestId("kq-filter-nonCore"));
    expect(screen.getAllByTestId("kq-row").map((r) => r.querySelector("button")!.textContent)).toEqual(["BBB"]);
    expect(screen.getAllByTestId("kq-row")[0].querySelectorAll("i").length).toBe(12);
  });

  it("ngăn chi tiết: ma trận Q1–Q4 + lũy kế (Q4 chưa công bố), thác nước, chất lượng, mùa vụ, 3D/4D, so với ngành", () => {
    const opened: string[] = [];
    render(<KqkdCenter onSelectTicker={(t) => opened.push(t)} />);
    fireEvent.click(screen.getByTestId("kq-open-AAA"));
    expect(screen.getByTestId("kq-drawer")).toBeTruthy();
    const matrix = screen.getByTestId("kq-matrix-table");
    expect(matrix.textContent).toContain("Lũy kế 9T");
    expect(matrix.textContent).toContain("chưa công bố");
    expect(screen.getByTestId("kq-ytd-line").textContent).toContain("lũy kế 9T 2026");
    expect(screen.getByTestId("kq-matrix-table").textContent).toContain("lệch"); // tổng 4 quý 2025 ≠ BCTC năm giả lập
    fireEvent.click(screen.getByTestId("kq-matrix-mode-cumulative"));
    expect(screen.getByTestId("kq-matrix-table").textContent).toContain("Cả năm");
    fireEvent.click(screen.getByTestId("kq-tab-bridge"));
    expect(screen.getByTestId("kq-waterfall").getAttribute("aria-label")).toContain("LN cốt lõi");
    fireEvent.click(screen.getByTestId("kq-tab-quality"));
    expect(screen.getByTestId("kq-q-piotroski").textContent).toMatch(/\d\/9/);
    expect(screen.getByTestId("kq-q-altman")).toBeTruthy();
    fireEvent.click(screen.getByTestId("kq-tab-season"));
    expect(screen.getByTestId("kq-nowcast").textContent).toContain("lũy kế 9 tháng");
    expect(screen.getByTestId("kq-ev-nowcast").textContent).toContain("THĂM DÒ");
    expect(screen.getByTestId("kq-ev-detail").textContent).toContain("dải P10–P90 chỉ chứa");
    expect(screen.getByTestId("kq-ev-sue").textContent).toContain("KHÔNG ĐẠT");
    fireEvent.click(screen.getByTestId("kq-tab-space"));
    expect(screen.getByTestId("kq-3d-canvas-surface")).toBeTruthy();
    fireEvent.click(screen.getByTestId("kq-3d-cum-on"));
    fireEvent.click(screen.getByTestId("kq-space-trajectory"));
    expect(screen.getByTestId("kq-3d-canvas-trajectory")).toBeTruthy();
    fireEvent.click(screen.getByTestId("kq-tab-peers"));
    expect(screen.getByTestId("kq-peers").textContent).toContain("cùng mẫu BCTC");
    fireEvent.click(screen.getByText("Hồ sơ cổ phiếu ↗"));
    expect(opened).toEqual(["AAA"]);
    fireEvent.click(screen.getByTestId("kq-drawer-close"));
    expect(screen.queryByTestId("kq-drawer")).toBeNull();
  });

  it("bản đồ 3D toàn thị trường đóng mặc định, mở khi bấm", () => {
    render(<KqkdCenter />);
    expect(screen.queryByTestId("kq-3d-market")).toBeNull();
    fireEvent.click(screen.getByTestId("kq-market3d-toggle"));
    expect(screen.getByTestId("kq-3d-canvas-market")).toBeTruthy();
  });
});
