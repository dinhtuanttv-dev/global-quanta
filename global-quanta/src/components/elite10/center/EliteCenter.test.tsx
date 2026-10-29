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
vi.mock("../../../hooks/elite10/useEliteCenter", () => ({
  useEliteDecision: () => ({ data: decision, error: null, isLoading: false }),
  useEliteEvidence: () => ({ data: { signals: [{ id: "stealth20", tier: "A" }, { id: "top20_alpha", tier: "B" }, { id: "smart_score", tier: "C" }] } }),
  useElitePanel: () => ({ data: { date: "2026-10-16", rows: [{ ticker: "ORS", values: { stealth20: 2.1, smart_score: 70 } }, { ticker: "X", values: { stealth20: 0, smart_score: 90 } }] } }),
  useEliteTicker: (t: string) => (t === "ORS" ? { decision: { ...decision.scores[0], date: "2026-10-16", version: "E3-v2", icComb: 0.0146, weights: decision.weights, inPortfolio: true, universe: decision.universe }, panel: panelTicker, isLoading: false } : { decision: null, panel: null, isLoading: false }),
}));
const buyRow = { id: "ORS-1", ticker: "ORS", sector: null, kind: "DIVIDEND", tier: "VALIDATED", status: "IN_WINDOW", eventLabel: "GDKHQ", eventDate: "2026-10-22", eventDateBasis: "x",
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

vi.mock("../../../hooks/elite10/useEliteBuyZones", () => ({ useEliteBuyZones: () => ({ zones: null, error: null, isLoading: false }) }));
import DecisionBoard from "./DecisionBoard";
import SignalProfileCard, { percentile } from "./SignalProfileCard";
import { readBoardPrefs } from "./boardPrefs";

beforeEach(() => { try { localStorage.clear(); } catch { /* không có storage */ } });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const heads = (id: string) => [...screen.getByTestId(id).querySelectorAll(`#${id}-table thead th`)].map((th) => th.textContent);
// Radar Elite 10 (thay bảng cũ): tiêu đề cột của hàng đầu
const radarHeads = () => [...document.querySelectorAll("[data-testid=elite-radar] [role=list] > div:first-child > span")].map((e) => (e.textContent ?? "").replace(/^(⏱ Vùng mua · \d+ phiên).*$/, "$1"));

describe("Elite 10 E4 — Bảng quyết định & Hồ sơ 360°", () => {
  it("bảng quyết định: nhãn THĂM DÒ, bối cảnh, danh mục, trọng số chỉ A/B, bấm mã mở hồ sơ", () => {
    const opened: string[] = [];
    render(<DecisionBoard onOpenTicker={(t) => opened.push(t)} />);
    expect(screen.getByTestId("elite-label").textContent).toContain("THĂM DÒ");
    expect(screen.getByTestId("elite-context").textContent).toContain("Căng thẳng");
    expect(screen.getByTestId("elite-context").textContent).toContain("Đi ngang");
    const row = screen.getByTestId("elite-radar-row-ORS").textContent ?? "";
    expect(row).toContain("Dịch vụ tài chính");
    expect(row).toContain("14,0%");
    expect(row).toContain("Stealth 20");
    expect(row).toContain("giữ");
    expect(screen.getByTestId("elite-radar-risk-ORS").textContent).toBe("rủi ro 10,0%");
    expect(screen.queryByTestId("elite-portfolio-table-details")).toBeNull(); // bảng số liệu cũ đã bỏ
    expect(screen.getByTestId("elite-portfolio").textContent).toContain("cân bằng đóng góp rủi ro (ERC)");
    expect(screen.getByTestId("elite-portfolio").textContent).toContain("vòng quay 42%");
    expect(screen.getByTestId("elite-weighting-note").textContent).toContain("119 mã");
    expect(screen.getByTestId("elite-weights").textContent).toContain("chưa đo");
    fireEvent.click(screen.getByTestId("elite-radar-open-ORS"));
    expect(opened).toEqual(["ORS"]);
    expect(screen.getByTestId("elite-next").textContent).toContain("DSE");
  });

  it("B2: cột số 4 '⏱ Điểm mua' — vùng mua đạt kiểm định hiển thị trong ô, ghi chú nguồn + thời điểm lấy Timeline", () => {
    render(<DecisionBoard onOpenTicker={() => {}} />);
    expect(radarHeads()[4]).toMatch(/^⏱ Vùng mua · \d+ phiên$/);
    expect(screen.getByTestId("buy-zone-pill-ORS").textContent).toBe("● ĐANG TRONG VÙNG MUA");
    expect(screen.getByTestId("buy-zone-tier-ORS").textContent).toBe("✓ ĐẠT");
    expect(screen.getByTestId("buy-zone-detail-ORS").textContent).toBe("cổ tức W1 15/10→21/10 · thoát 27/10");
    expect([...document.querySelectorAll("[data-testid=elite-buy-strip] [data-testid=elite-buy-chip]")].map((c) => c.textContent)).toEqual(["● ORS CT trong vùng"]);
    expect(screen.getByTestId("elite-buy-note").textContent).toContain("lấy lúc");
    expect(screen.getByTestId("elite-buy-note").textContent).toContain("Gateway tự tính · dữ liệu 16/10");
  });

  it("C2: Ứng viên tiếp theo — mặc định thu gọn (dòng tóm tắt), mở ra bảng cùng cấu trúc danh mục + lý do chưa vào", () => {
    const opened: string[] = [];
    render(<DecisionBoard onOpenTicker={(t) => opened.push(t)} />);
    const toggle = screen.getByTestId("elite-candidates-toggle");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByTestId("elite-next").textContent).toContain("DSE");
    expect(screen.getByTestId("elite-portfolio-toggle").getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(toggle);
    expect(screen.getByTestId("elite-candidates-toggle").getAttribute("aria-expanded")).toBe("true");
    const h = heads("elite-candidates");
    expect(h.slice(0, 4)).toEqual(["Mã", "Ngành", "Lý do chưa vào", "⏱ Điểm mua"]);
    expect(h).toContain("σ20");
    const dse = screen.getByTestId("elite-cand-DSE").textContent ?? "";
    expect(dse).toContain("#2");
    expect(dse).toContain("đệm");
    expect(dse).toContain("Dịch vụ tài chính");
    expect(dse).toContain("18.803");
    expect(dse).toContain("23.420");
    expect(dse).toContain("2,0%");
    expect(screen.getByTestId("elite-cand-reason-DSE").textContent).toBe("Trần ngành 3/3");
    expect(screen.getByTestId("elite-cand-reason-PVT").textContent).toBe("Xếp sau 10 mã");
    expect(screen.getByTestId("elite-cand-PVT").textContent).not.toContain("đệm");
    expect(screen.getByTestId("elite-cand-buy-DSE").textContent).toContain("Mở cửa 17/10");
    expect(screen.getByTestId("elite-candidates").textContent).toContain("không phải tín hiệu mua thêm");
    fireEvent.click(screen.getByTestId("elite-cand-PVT").querySelector("button")!);
    expect(opened).toEqual(["PVT"]);
  });

  it("C2: Gọn / Thu gọn — ẩn cột phụ, lưu theo tài khoản, hai bảng độc lập", () => {
    render(<DecisionBoard onOpenTicker={() => {}} />);
    expect(radarHeads()).toContain("P vượt · α5");
    fireEvent.click(screen.getByTestId("elite-portfolio-compact"));
    const h = radarHeads();
    expect(h).not.toContain("P vượt · α5");
    expect(h).not.toContain("Động lực chính");
    expect(h.slice(0, 4)).toEqual(["Hạng", "Mã", "Rãnh Z · vệt 5 phiên", "Tỷ trọng"]);
    fireEvent.click(screen.getByTestId("elite-candidates-toggle"));
    expect(heads("elite-candidates")).toContain("α 5 phiên"); // bảng ứng viên giữ chế độ riêng (đầy đủ)
    fireEvent.click(screen.getByTestId("elite-portfolio-toggle"));
    expect(screen.getByTestId("elite-portfolio-summary").textContent).toContain("ORS");
    expect(screen.queryByTestId("elite-radar-row-ORS")).toBeNull();
    expect(readBoardPrefs()).toEqual({ portfolio: { open: false, compact: true }, candidates: { open: true, compact: null } });
    cleanup();
    render(<DecisionBoard onOpenTicker={() => {}} />);
    expect(screen.getByTestId("elite-portfolio-toggle").getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByTestId("elite-candidates-toggle").getAttribute("aria-expanded")).toBe("true");
  });

  it("C2: màn hẹp tự dùng chế độ gọn khi người dùng chưa chọn; Gateway cũ (không có candidates) vẫn hiện ứng viên từ scores", () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("max-width"), media: q, addEventListener() {}, removeEventListener() {} }));
    const saved = decision.candidates;
    decision.candidates = undefined;
    try {
      render(<DecisionBoard onOpenTicker={() => {}} />);
      expect(radarHeads()).not.toContain("P vượt · α5");
      expect(screen.getByTestId("elite-portfolio-compact").getAttribute("aria-pressed")).toBe("true");
      fireEvent.click(screen.getByTestId("elite-candidates-toggle"));
      expect(screen.getByTestId("elite-cand-reason-DSE").textContent).toBe("Hạng 2");
      expect(screen.getByTestId("elite-cand-DSE").textContent).toContain("—");
    } finally { decision.candidates = saved; }
  });

  it("hồ sơ: đủ tín hiệu theo tab, bậc hiện hành, giá trị trống không điền số; mã ngoài vũ trụ báo rõ", () => {
    render(<SignalProfileCard ticker="ORS" />);
    expect(screen.getByTestId("elite-profile-score").textContent).toContain("Trong Elite 10");
    expect(screen.getByTestId("elite-sig-top20_alpha").textContent).toContain("—");
    expect(screen.getByTestId("elite-sig-smart_score").textContent).toContain("Bậc C");
    expect(screen.getByTestId("elite-profile").textContent).toContain("cotuc");
    expect(screen.getByTestId("elite-profile").textContent).toContain("3 tín hiệu từ 2 tab");
    expect(screen.getByTestId("elite-contrib-stealth20").textContent).toContain("+1,2");
    expect(screen.getByTestId("elite-profile-gap").textContent).toContain("Đang trong danh mục Elite 10");
    cleanup();
    render(<SignalProfileCard ticker="VNINDEX" />);
    expect(screen.getByTestId("elite-profile-missing").textContent).toContain("VNINDEX");
    expect(percentile([1, 2, 3, 4], 3)).toBe(62.5);
  });
});
