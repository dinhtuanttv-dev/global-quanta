import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "../../../test/rtl-lite";

const decision = {
  version: "E3-v2", date: "2026-10-16", builtAt: "2026-10-17T09:00:00Z", icComb: 0.0146, sigma5: 0.043,
  universe: { panel: 276, eligible: 131 },
  weights: [
    { id: "stealth20", labelVi: "Stealth 20", tab: "Siêu quét AI", tier: "A", mainH: 5, n: 215, icMeas: 0.0159, icPrior: 0.02, icPost: 0.0168, w: 0.6 },
    { id: "top20_alpha", labelVi: "Điểm alpha M1", tab: "Lọc ngành", tier: "B", mainH: 5, n: 0, icMeas: 0, icPrior: 0.01, icPost: 0.01, w: 0.4 },
  ],
  portfolio: [{ ticker: "ORS", weight: 0.14, Z: 2.25, rank: 1, alpha5Pct: 0.14, pOutperform: 0.513, sectorKey: "8700", close: 13500, stop: 12896, target: 14406, holdSessions: 10, retained: true, riskContribution: 0.1 }],
  construction: { method: "erc", sessions: 120, retained: 1, previous: 10, turnover: 0.42 },
  signalWeighting: { method: "correlation", corr: { ids: ["stealth20"], matrix: [[1]], shrink: 0.5, names: 119 }, noteVi: null },
  scores: [
    { ticker: "ORS", rank: 1, Z: 2.25, alpha5Pct: 0.14, pOutperform: 0.513, eligible: true, reason: null, close: 13500, advBn: 25, sigma20: 0.02, sectorKey: "8700", contributions: [{ id: "stealth20", z: 2, contribution: 1.2 }, { id: "top20_alpha", z: 0, contribution: 0 }] },
    { ticker: "DSE", rank: 2, Z: 2.2, alpha5Pct: 0.13, pOutperform: 0.512, eligible: true, reason: null, close: 20650, advBn: 11, sigma20: 0.02, sectorKey: "8700", contributions: [] },
  ],
  candidates: [
    { ticker: "DSE", rank: 2, Z: 2.2, alpha5Pct: 0.13, pOutperform: 0.512, sectorKey: "8700", close: 20650, sigma20: 0.02, stop: 18803, target: 23420, holdSessions: 10, inBuffer: true, reason: "sector_cap", sectorCount: 3, maxPerSector: 3, sectorHeld: 3 },
    { ticker: "PVT", rank: 24, Z: 1.1, alpha5Pct: 0.07, pOutperform: 0.506, sectorKey: "2770", close: 19000, sigma20: 0.025, stop: 16876, target: 22186, holdSessions: 10, inBuffer: false, reason: "full", sectorCount: null, maxPerSector: 3, sectorHeld: 0 },
  ] as unknown[] | undefined,
  ledgerSummary: { horizons: { 5: { n: 0, meanExcess: null, hitRate: null, excessCi95: null, meanPortfolioNet: null, meanVnIndex: null, ic: { n: 0, mean: null, t: null }, curve: [] }, 10: { n: 0, ic: { n: 0 } } }, criteria: { icPass: false, excessPass: false, sessions: 1 }, label: "EXPERIMENTAL", labelVi: "THĂM DÒ — cần ≥ 60 phiên tiến (hiện 1 phiên)" },
};
const panelTicker = {
  date: "2026-10-16", ticker: "ORS", icb: { l2: "8700" }, sector: null, missingSources: ["cotuc"],
  values: { stealth20: 2.1, top20_alpha: null, smart_score: 70 },
  signals: [
    { id: "stealth20", tab: "Siêu quét AI", labelVi: "Stealth 20", unit: "z", level: "stock", tier: "A" },
    { id: "top20_alpha", tab: "Lọc ngành", labelVi: "Điểm alpha M1", unit: "điểm", level: "stock", tier: "B" },
    { id: "smart_score", tab: "Siêu quét AI", labelVi: "Smart Score", unit: "0–100", level: "stock", tier: "C" },
  ],
};
const holdRule = (o: Record<string, unknown>) => ({ cagr: 0.17, mdd: -0.34, sharpe: 0.9, deltaSharpe: 0.1, pHolm: 0.59, pctReduced: 0.04, episodes: 10, criteria: { C1: false, C2: true, C3: true, C4: true }, pass: false, ...o });
const cashGate = {
  version: "CG-r1 (prereg 2026-11-05)", generatedAt: "2026-11-05T12:00:00Z", asOf: "2026-11-05",
  inputs: { regime: "DOWNTREND", vix: 16.61, vix3m: 18.8, volSlope: -0.1165, volAnnual: 0.142, volTargetAnnual: 0.155 },
  rules: { H1: { target: 1, active: false }, H1b: { target: 1, active: false }, H2: { target: 0.8, active: true }, H3: { target: 1, active: false } },
  official: { equityShare: 1, reasonVi: "100%: Cổng tiền mặt KHÔNG ĐẠT kiểm định đăng ký trước CG-r1." },
  holdout: { version: "CG-r1", ranAt: "2026-11-05", prereg: "x", period: { from: "2014-12-30", to: "2021-10-29", sessions: 1706 }, summaryVi: "KHÔNG ĐẠT.", base: { cagr: 0.164, mdd: -0.477, sharpe: 0.82 },
    rules: { H1: holdRule({}), H1b: holdRule({ mdd: -0.383 }), H2: holdRule({ criteria: { C1: false, C2: true, C3: false, C4: false } }), H3: holdRule({}) }, passed: [] },
  ledger: { entries: 1, first: "2026-11-05", last: "2026-11-05" },
};
vi.mock("../../../hooks/elite10/useHlLedger", () => ({ useHlLedger: () => ({ data: null }) }));
vi.mock("../../../hooks/elite10/useEliteCenter", () => ({
  useCashGate: () => ({ data: cashGate, isLoading: false }),
  useEliteRetro: () => ({ data: { horizons: { 5: { ic: { n: 204, mean: 0.031, t: 2.65 } } } } }),
  useEliteDecision: () => ({ data: decision, error: null, isLoading: false }),
  useEliteEvidence: () => ({ data: { signals: [{ id: "stealth20", tier: "A" }, { id: "top20_alpha", tier: "B" }, { id: "smart_score", tier: "C" }] } }),
  useElitePanel: () => ({ data: { date: "2026-10-16", rows: [{ ticker: "ORS", values: { stealth20: 2.1, smart_score: 70 } }, { ticker: "X", values: { stealth20: 0, smart_score: 90 } }] } }),
  useEliteLeadership: () => ({ data: null, error: null, isLoading: false }),
  useEliteTicker: (t: string) => (t === "ORS" ? { decision: { ...decision.scores[0], date: "2026-10-16", version: "E3-v2", icComb: 0.0146, weights: decision.weights, inPortfolio: true, universe: decision.universe }, panel: panelTicker, isLoading: false } : { decision: null, panel: null, isLoading: false }),
}));
const buyRow = { id: "ORS-1", ticker: "ORS", sector: null, kind: "EARNINGS", tier: "VALIDATED", status: "IN_WINDOW", eventLabel: "GDKHQ", eventDate: "2026-10-22", eventDateBasis: "x",
  windowId: "w1", windowLabel: "Trước GDKHQ 5 phiên", entryFrom: -5, entryTo: -1, exitOffset: 3, entryFromDate: "2026-10-15", entryToDate: "2026-10-21", exitDate: "2026-10-27",
  sessionsToEntry: 0, nEvents: 14, winRate: 0.71, probability: null, netExpectancy: 0.021, netExpectancyLcb: 0.004, fdrQValue: 0.03, decisionLevel: null, missing: [] };
vi.mock("../../../hooks/useGatewayBuyTimeline", async (orig) => ({
  ...(await orig<typeof import("../../../hooks/useGatewayBuyTimeline")>()),
  useGatewayBuyTimeline: () => ({ data: { rows: [buyRow] }, sessions: ["2026-10-16", "2026-10-17", "2026-10-20"], meta: { source: "GATEWAY_STORE", fetchedAt: "2026-10-17T08:00:00Z", dataAsOf: "2026-10-16T08:00:00Z", ageSessions: 1, stale: false, lastError: null }, loading: false, error: null }),
}));
vi.mock("../../../hooks/useWorldStrategy", () => ({ useWorldStrategy: () => ({ data: { short: { rows: [{ icb: "8700", nameVi: "Dịch vụ tài chính" }] }, regime: { stressed: true, vix: 20, vixChg: 21.4 } } }) }));
vi.mock("swr", async (orig) => {
  const real = await orig<typeof import("swr")>();
  return { ...real, default: (key: unknown, ...rest: unknown[]) => (key === "research-overview" ? { data: { currentRegime: { date: "2026-10-16", regime: "SIDEWAY", impulseScore: 39.3, breadthPct: 41.1 } } } : (real.default as never as (...a: unknown[]) => unknown)(key, ...rest)) };
});

import DecisionBoard from "./DecisionBoard";
import CashGateCard from "./CashGateCard";
import SignalProfileCard, { percentile } from "./SignalProfileCard";

beforeEach(() => {
  try { localStorage.clear(); } catch { /* không có storage */ }
  // Hook phụ của radar (tin, nến, giá trực tiếp) không gọi mạng thật trong test: nguồn "tạm lỗi" như khi mất kết nối.
  vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ error: "test" }), { status: 503, headers: { "content-type": "application/json" } }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Elite 10 E4 — Bảng quyết định & Hồ sơ 360°", () => {
  it("G1: tài liệu cũ (chưa có Elite HL) -> câu rõ ràng, không dựng bảng Elite 10 cũ", () => {
    render(<DecisionBoard onOpenTicker={() => {}} />);
    expect(screen.getByTestId("elite-no-hl").textContent).toMatch(/chưa trả danh mục Elite HL/);
    expect(screen.queryByTestId("elite-decision-board")).toBeNull(); expect(screen.queryByTestId("elite-candidates")).toBeNull();
  });

  it("CG-r1: ô Tỷ lệ cổ phiếu — chính thức 100%, trạng thái cổng hôm nay (mô tả), kết quả kiểm định KHÔNG ĐẠT kèm tiêu chí", () => {
    // G2: thẻ Cổng tiền mặt chuyển từ bảng Elite 10 cũ sang bảng Elite HL — kiểm trực tiếp thành phần.
    render(<CashGateCard />);
    const card = screen.getByTestId("elite-cash-gate");
    expect(screen.getByTestId("elite-cash-gate-official").textContent).toContain("100%");
    expect(screen.getByTestId("elite-cash-gate-official").textContent).not.toMatch(/100%.*100%/);
    expect(card.textContent).toContain("CỔNG CG-r1 · MÔ TẢ");
    expect(screen.getByTestId("elite-cash-gate-inputs").textContent).toContain("Xu hướng giảm");
    const rules = screen.getByTestId("elite-cash-gate-rules").textContent ?? "";
    expect(rules).toContain("H1 DOWNTREND + VIX > 25 → 30% (quy tắc chính)");
    expect(rules).toContain("kích hoạt · 80%");
    const ho = screen.getByTestId("elite-cash-gate-holdout").textContent ?? "";
    expect(ho).toContain("KHÔNG ĐẠT");
    expect(ho).toContain("1.706 phiên");
    expect(ho).toContain("C1✗ C2✓ C3✓ C4✓");
  });

  it("hồ sơ: đủ tín hiệu theo tab, bậc hiện hành, giá trị trống không điền số; mã ngoài vũ trụ báo rõ", () => {
    render(<SignalProfileCard ticker="ORS" />);
    expect(screen.getByTestId("elite-profile-score").textContent).toContain("Trong Elite 10");
    expect(screen.getByTestId("elite-sig-top20_alpha").textContent).toContain("—");
    expect(screen.getByTestId("elite-sig-smart_score").textContent).toContain("Bậc C");
    expect(screen.getByTestId("elite-profile").textContent).toContain("cotuc");
    expect(screen.getByTestId("elite-profile").textContent).toContain("3 tín hiệu từ 2 tab");
    expect(screen.getByTestId("elite-contrib-stealth20").textContent).toContain("+1,2");
    // G3: khối khoảng cách theo Z (danh mục dòng tiền) đã bỏ; tài liệu cũ không có Elite HL thì không hiện khoảng cách.
    expect(screen.getByTestId("elite-profile-gap").textContent).not.toMatch(/ΔZ|Elite 10/);
    cleanup();
    render(<SignalProfileCard ticker="VNINDEX" />);
    expect(screen.getByTestId("elite-profile-missing").textContent).toContain("VNINDEX");
    expect(percentile([1, 2, 3, 4], 3)).toBe(62.5);
  });
});
