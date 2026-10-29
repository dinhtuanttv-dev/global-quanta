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
let buyRows: Record<string, unknown>[] = [];
let zoneData: { rows: Record<string, unknown>[]; notInUniverse: string[] } | null = null;
vi.mock("../../../hooks/elite10/useEliteBuyZones", () => ({ useEliteBuyZones: () => ({ zones: zoneData, error: null, isLoading: false }) }));
let buySessions: string[] = [];
vi.mock("../../../hooks/useGatewayBuyTimeline", () => ({ useGatewayBuyTimeline: () => ({ data: { rows: buyRows }, sessions: buySessions, meta: null, loading: false, error: null }) }));

import PortfolioRadar from "./PortfolioRadar";

const props = (o = {}) => ({ d, buyCells: new Map(), secName: () => "Dịch vụ tài chính", drivers: () => ["Stealth 20"], onOpenTicker: () => {}, compact: false, ...o });
const order = () => [...document.querySelectorAll("[data-testid^=elite-radar-row-]")].map((e) => e.getAttribute("data-testid")!.slice(16));

beforeEach(() => { quotes = {}; liveSession = false; buyRows = []; buySessions = []; zoneData = null; vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-30T01:00:00Z")); try { localStorage.clear(); } catch { /* bỏ qua */ } });
afterEach(() => { cleanup(); vi.useRealTimers(); });

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

describe("PortfolioRadar — ⏱ dải vùng mua", () => {
  const S = ["2026-10-21", "2026-10-22", "2026-10-23", "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06",
    "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-23", "2026-11-24"];
  const tl = (o: Record<string, unknown>) => ({ id: String(o.ticker) + o.status, sector: null, kind: "DIVIDEND", tier: "VALIDATED", status: "IN_WINDOW", eventLabel: "GDKHQ", eventDate: "2026-11-06",
    eventDateBasis: "CONFIRMED", windowId: "w2", windowLabel: "W2 · Trước GDKHQ", entryFrom: -6, entryTo: -2, exitOffset: 3, entryFromDate: "2026-10-29", entryToDate: "2026-11-04", exitDate: "2026-11-11",
    sessionsToEntry: 0, nEvents: 10, winRate: 0.8, probability: null, netExpectancy: 0.03, netExpectancyLcb: 0.01, fdrQValue: 0.02, decisionLevel: null, missing: [], ...o });
  const cell = (kind: string, row: unknown = null) => ({ kind, text: "", sub: "", date: null, tooltip: "t", dashed: false, row });
  it("trục phiên chung + mỗi hàng: trạng thái cùng ngôn ngữ tab Cổ tức, thanh vùng mua theo bậc, vùng xa ghi ngày + số phiên", () => {
    buySessions = S;
    const vpi = tl({ ticker: "VPI" });
    const idc = tl({ ticker: "IDC", kind: "EARNINGS", tier: "NEAR", status: "PASSED", entryFromDate: "2026-10-22", entryToDate: "2026-10-27", eventDate: "2026-10-29", exitDate: "2026-11-03", missing: ["q-value 0,2 > 0,1"] });
    const aas = tl({ ticker: "AAS", kind: "EARNINGS", tier: "NEAR", status: "UPCOMING", entryFromDate: "2027-01-21", entryToDate: "2027-01-26", sessionsToEntry: 58 });
    buyRows = [vpi, idc, aas];
    const cells = new Map([["VPI", cell("in", vpi)], ["IDC", cell("rule")], ["AAS", cell("rule")]]);
    render(<PortfolioRadar {...props({ buyCells: cells })} />);
    expect(screen.getByTestId("buy-zone-axis")).toBeTruthy();
    expect(screen.getByTestId("elite-radar-buy-head").textContent).toContain("⏱ Vùng mua · 21 phiên");
    expect(screen.getByTestId("buy-zone-pill-VPI").textContent).toBe("● ĐANG TRONG VÙNG MUA");
    expect(screen.getByTestId("buy-zone-detail-VPI").textContent).toBe("cổ tức W2 29/10→04/11 · thoát 11/11");
    expect(screen.getByTestId("buy-zone-tier-VPI").textContent).toBe("✓ ĐẠT");
    const bar = screen.getByTestId("buy-zone-bar-VPI");
    expect(bar.getAttribute("data-tier")).toBe("VALIDATED");
    expect(bar.querySelector(".buy-zone-live")).toBeTruthy();
    expect(screen.getByTestId("buy-zone-pill-IDC").textContent).toBe("ĐÃ QUA VÙNG MUA");
    expect(screen.getByTestId("buy-zone-tier-IDC").textContent).toBe("GẦN ĐẠT");
    expect(screen.getByTestId("buy-zone-detail-IDC").textContent).toBe("KQKD W2 22/10→27/10 · thoát 03/11");
    expect(screen.getByTestId("buy-zone-pill-AAS").textContent).toBe("⏭ XA · 58 phiên");
    expect(screen.getByTestId("buy-zone-bar-IDC").getAttribute("data-status")).toBe("PASSED");
    expect(screen.getByTestId("buy-zone-far-AAS").textContent).toContain("→ K 21/01/27 · 58p");
    expect(screen.getByTestId("elite-radar-buy-legend").textContent).toContain("vùng ĐẠT KIỂM ĐỊNH");
  });
  it("không có lịch phiên -> không vẽ dải (không đoán ngày)", () => {
    render(<PortfolioRadar {...props()} />);
    expect(screen.queryByTestId("buy-zone-axis")).toBeNull();
  });
});

describe("PortfolioRadar — ⏱ ĐIỂM MUA 10 PHIÊN TỚI (vùng tối ưu từ tab Cổ tức)", () => {
  const S = ["2026-10-23", "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20"];
  const z = (o: Record<string, unknown>) => ({ id: `${o.ticker}${o.kind ?? "D"}`, sector: null, kind: "DIVIDEND", tier: "EXPLORATORY", status: "UPCOMING", eventLabel: "GDKHQ", eventDate: "2026-11-13",
    eventDateBasis: "ESTIMATED", windowId: "w3", windowLabel: "W3 · Trước GDKHQ", entryFrom: -6, entryTo: -2, exitOffset: 3, entryFromDate: "2026-11-05", entryToDate: "2026-11-11", exitDate: "2026-11-18",
    sessionsToEntry: 4, nEvents: 7, winRate: 0.71, probability: null, netExpectancy: 0.02, netExpectancyLcb: -0.003, fdrQValue: 0.4, decisionLevel: null, missing: ["q-value 0,40 > 0,1"], ...o });
  it("chip trong 10 phiên (THĂM DÒ chấm, GẦN ĐẠT nét đứt) + 'xa hơn'; mỗi hàng hiện vùng tối ưu; mã ngoài danh mục theo dõi Cổ tức được ghi rõ", () => {
    buySessions = S;
    zoneData = { rows: [z({ ticker: "VPI" }), z({ ticker: "IDC", tier: "NEAR", status: "IN_WINDOW", sessionsToEntry: 0, entryFromDate: "2026-10-28", entryToDate: "2026-11-03" }), z({ ticker: "AAS", kind: "EARNINGS", tier: "NEAR", entryFromDate: "2027-01-21", entryToDate: "2027-01-26", exitDate: "2027-02-02", sessionsToEntry: 58 })], notInUniverse: ["HHP"] };
    const opened: string[] = [];
    render(<PortfolioRadar {...props({ onOpenTicker: (t: string) => opened.push(t) })} />);
    const chips = [...document.querySelectorAll("[data-testid=elite-buy-strip] [data-testid=elite-buy-chip]")].map((c) => c.textContent);
    expect(chips).toEqual(["● IDC CT trong vùnggần đạt", "⏱ VPI CT 4pthăm dò", "⏱ AAS KQ 21/01/27 · 58pgần đạt"]);
    expect(screen.getByTestId("elite-buy-strip-later").textContent).toContain("Xa hơn");
    expect(screen.getByTestId("elite-buy-strip").textContent).toContain("Ngoài danh mục theo dõi của tab Cổ tức: HHP");
    expect(screen.getByTestId("buy-zone-pill-VPI").textContent).toBe("⏱ SẮP TỚI · 4 phiên");
    expect(screen.getByTestId("buy-zone-tier-VPI").textContent).toBe("THĂM DÒ");
    expect(screen.getByTestId("buy-zone-detail-VPI").textContent).toBe("cổ tức W3 05/11→11/11 · thoát 18/11");
    expect(screen.getByTestId("buy-zone-pill-IDC").textContent).toBe("● ĐANG TRONG VÙNG MUA");
    fireEvent.click(document.querySelector("[data-testid=elite-buy-chip]")!);
    expect(opened).toEqual(["IDC"]);
  });
  it("không có vùng trong 10 phiên -> câu báo như Radar", () => {
    buySessions = S; zoneData = { rows: [], notInUniverse: [] };
    render(<PortfolioRadar {...props()} />);
    expect(screen.getByTestId("elite-buy-strip-empty").textContent).toContain("Không mã nào trong danh mục Elite 10 có vùng mua trong 10 phiên tới");
    expect(screen.getByTestId("buy-zone-detail-VPI").textContent).toBe("Chưa có vùng mùa vụ có lợi thế · mở cửa 30/10, giữ tới 12/11");
  });
});

describe("PortfolioRadar — canvas không bao giờ ném lỗi (30/10/2026: bán kính −215 làm sập tab)", () => {
  // ctx giả: arc ném IndexSizeError khi bán kính âm — đúng như trình duyệt thật
  const fakeCanvas = () => {
    const calls: number[] = [];
    const ctx = new Proxy({ arc: (_x: number, _y: number, r: number) => { calls.push(r); if (r < 0) throw new DOMException("radius negative", "IndexSizeError"); } } as Record<string, unknown>, {
      get: (o, k) => (k in o ? o[k as string] : k === "createLinearGradient" ? () => ({ addColorStop() {} }) : k === "measureText" ? () => ({ width: 30 }) : () => {}),
      set: () => true,
    });
    const cv = { getContext: () => ctx, clientWidth: 200, clientHeight: 38, width: 0, height: 0 } as unknown as HTMLCanvasElement;
    return { cv, calls };
  };
  it("vẽ tĩnh (t = 0) với ping cũ (t0 lớn) / tỷ trọng thiếu -> không ném, mọi bán kính > 0", async () => {
    const { drawTrack, safeR } = await import("./PortfolioRadar");
    const { cv, calls } = fakeCanvas();
    const row = { pick: { ticker: "VPI", weight: Number.NaN, pOutperform: 0.52 }, z: 2.3, trail: [2.1], topTier: true, stealth: { dir: 1, z: 2 }, buy: null, rim: "#34d399", hot: true } as never;
    expect(() => drawTrack(cv, row, [0, 3], 0, null, true, { t0: 151_000 })).not.toThrow();
    expect(() => drawTrack(cv, row, [0, 3], 151_200, 0.5, true, { t0: 151_000 })).not.toThrow();
    expect(calls.every((r) => r > 0)).toBe(true);
    expect(safeR(-215.004)).toBe(0.1);
    expect(safeR(Number.NaN)).toBe(0.1);
    expect(safeR(7)).toBe(7);
  });
});
