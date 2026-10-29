// 📡 Radar Elite 10 — hàng theo hạng (#1 = hạng cao nhất), lên/xuống hạng, MỚI, xếp trực tiếp theo vượt VN-Index, sự kiện,
// tua lại lịch sử, lớp ◆ Stealth 20 / ⏱ điểm mua lấy từ Elite Command Radar, chú giải trung thực về bằng chứng.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "../../../test/rtl-lite";
import type { EliteDecision } from "../../../lib/elite10/decisionTypes";

const pick = (ticker: string, rank: number, Z: number, weight: number, close: number, o: Record<string, unknown> = {}) =>
  ({ ticker, rank, Z, weight, alpha5Pct: 0.2, pOutperform: 0.52, sectorKey: "8600", close, stop: close * 0.9, target: close * 1.15, holdSessions: 10, retained: false, riskContribution: 0.1, ...o });
const d = {
  version: "E3-v3", date: "2026-10-29", builtAt: "", icComb: 0.01, sigma5: 0.04, weights: [], universe: { panel: 284, eligible: 120 },
  portfolio: [pick("IDC", 4, 2.3, 0.09, 50000, { retained: true }), pick("VPI", 2, 2.4, 0.07, 57900, { retained: true }), pick("AAS", 5, 2.2, 0.06, 10000)],
  scores: [], ledgerSummary: null,
} as unknown as EliteDecision;
const history = {
  dates: ["2026-10-27", "2026-10-28", "2026-10-29"],
  sessions: [
    { date: "2026-10-27", portfolio: [{ ticker: "VPI", rank: 14, Z: 1.8, weight: 0.1, retained: false }], ranks: { VPI: { rank: 14, Z: 1.8 } } },
    { date: "2026-10-28", portfolio: [{ ticker: "VPI", rank: 7, Z: 2.1, weight: 0.1, retained: true }, { ticker: "IDC", rank: 8, Z: 2.0, weight: 0.1, retained: true }, { ticker: "MCH", rank: 24, Z: 1.4, weight: 0.1, retained: true }],
      ranks: { VPI: { rank: 7, Z: 2.1 }, IDC: { rank: 8, Z: 2.0 }, MCH: { rank: 24, Z: 1.4 }, AAS: { rank: 30, Z: 1.2 } } },
    { date: "2026-10-29", portfolio: [], ranks: { VPI: { rank: 2, Z: 2.4 }, IDC: { rank: 4, Z: 2.3 }, AAS: { rank: 5, Z: 2.2 }, MCH: { rank: 41, Z: 0.9 } } },
  ],
};
let quotes: Record<string, { price: number; changePct: number }> = {};
let liveSession = false;
vi.mock("../../../hooks/elite10/useRankHistory", () => ({ useRankHistory: () => ({ history, error: null, isLoading: false }) }));
vi.mock("../../../hooks/elite10/useLiveQuotes", () => ({ useLiveQuotes: () => ({ quotes, index: liveSession ? { code: "VNINDEX", value: 1773.17 } : null, status: { session: liveSession ? "LO" : "CLOSED" }, sessionLive: liveSession }) }));
vi.mock("../../../hooks/useOhlcvData", () => ({ useOhlcvData: () => ({ bars: [{ date: "2026-10-29", close: 1755.61, volume: 1, open: 1, high: 1, low: 1 }], isLoading: false, error: null }) }));
vi.mock("../../../hooks/useRadarSignals", () => ({
  useRadarSignals: () => ({ data: { asOf: "2026-10-29", regime: "DOWNTREND", evidence: { STEALTH_20: { verdict: "edge", all: {}, regime: { verdict: "none" } }, IFE_INTENT: { verdict: "none" } },
    items: { VPI: { stealth20: { on: true, direction: 1, z: 2.1 } }, IDC: { stealth20: { on: false, direction: 0, z: 0.3 } } } } }),
}));
vi.mock("../../../hooks/useSmartNews", () => ({ useSmartNews: () => ({ data: { items: [{ tickers: ["AAS"], publishedAt: new Date().toISOString(), sentiment: 0.6, importance: 80 }] } }) }));
vi.mock("../../../hooks/useGatewayBuyTimeline", () => ({ useGatewayBuyTimeline: () => ({ data: { rows: [] }, sessions: [], meta: null, loading: false, error: null }) }));

import PortfolioRadar from "./PortfolioRadar";

const props = (o = {}) => ({ d, buyCells: new Map(), secName: () => "Dịch vụ tài chính", drivers: () => ["Stealth 20"], onOpenTicker: () => {}, compact: false, ...o });
const order = () => [...document.querySelectorAll("[data-testid^=elite-radar-row-]")].map((e) => e.getAttribute("data-testid")!.slice(16));

beforeEach(() => { quotes = {}; liveSession = false; try { localStorage.clear(); } catch { /* bỏ qua */ } });
afterEach(() => cleanup());

describe("PortfolioRadar", () => {
  it("xếp theo hạng Elite: #1 = hạng vũ trụ cao nhất; ▲ lên hạng so phiên trước; MỚI cho mã mới vào", () => {
    render(<PortfolioRadar {...props()} />);
    expect(order()).toEqual(["VPI", "IDC", "AAS"]);
    expect(screen.getByTestId("elite-radar-pos-VPI").textContent).toBe("#1");
    expect(screen.getByTestId("elite-radar-delta-VPI").textContent).toBe("▲5");
    expect(screen.getByTestId("elite-radar-delta-IDC").textContent).toBe("▲4");
    expect(screen.getByTestId("elite-radar-new-AAS").textContent).toBe("MỚI");
    expect(document.querySelectorAll("canvas").length).toBe(3);
  });

  it("sự kiện danh mục: vào / ra (kèm hạng mới) / lên ≥ 3 hạng; bấm mở hồ sơ", () => {
    const opened: string[] = [];
    render(<PortfolioRadar {...props({ onOpenTicker: (t: string) => opened.push(t) })} />);
    const ev = screen.getByTestId("elite-radar-events").textContent ?? "";
    expect(ev).toContain("AAS vào danh mục (hạng 5, trước #30)");
    expect(ev).toContain("MCH ra khỏi danh mục (nay hạng #41)");
    expect(ev).toContain("VPI lên 5 hạng (#7 → #2)");
    fireEvent.click(screen.getByTestId("elite-radar-open-IDC"));
    expect(opened).toEqual(["IDC"]);
  });

  it("● Trực tiếp: tự xếp lại theo vượt VN-Index từ giá lúc dựng; lưu chế độ; hiện TRỰC TIẾP", () => {
    liveSession = true;
    quotes = { VPI: { price: 57900, changePct: 0 }, IDC: { price: 51000, changePct: 2 }, AAS: { price: 10400, changePct: 4 } };
    render(<PortfolioRadar {...props()} />);
    fireEvent.click(screen.getByTestId("elite-radar-sort-live"));
    expect(order()).toEqual(["AAS", "IDC", "VPI"]);
    expect(localStorage.getItem("elite10:radar-sort")).toBe("live");
    expect(screen.getByTestId("elite-radar-live").textContent).toContain("TRỰC TIẾP");
    // AAS: (10400/10000)/(1773.17/1755.61) − 1 ≈ +2,97%
    expect(screen.getByTestId("elite-radar-ex-AAS").textContent).toContain("+2,97%");
    expect(screen.getByTestId("elite-radar-row-AAS").textContent).toContain("↑2");
  });

  it("tua lại: kéo về phiên 28/10 hiện danh mục phiên đó (MCH còn trong danh mục)", () => {
    render(<PortfolioRadar {...props()} />);
    const slider = screen.getByTestId("elite-radar-history").querySelector("input")!;
    fireEvent.change(slider, { target: { value: "1" } });
    expect(order()).toEqual(["VPI", "IDC", "MCH"]);
    expect(screen.getByTestId("elite-radar-history").textContent).toContain("28/10");
  });

  it("chú giải trung thực: Stealth 20 có lợi thế toàn giai đoạn nhưng chưa có ở chế độ thị trường hiện tại", () => {
    render(<PortfolioRadar {...props()} />);
    const lg = screen.getByTestId("elite-radar-legend").textContent ?? "";
    expect(lg).toContain("đã kiểm định có lợi thế");
    expect(lg).toContain("chưa có lợi thế ở chế độ thị trường hiện tại");
    expect(lg).toContain("(mô tả)");
  });
});
