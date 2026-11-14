// 13/11/2026 — các tab con 2–5 phải hiểu đúng danh mục chính thức là Elite HL (có tiền mặt, không chọn theo Z):
// Hồ sơ 360° (vị trí HL + lỗi tải ≠ "mã ngoài vũ trụ"), Bằng chứng (hai sổ, phạm vi kiểm định), Rủi ro (tiền mặt), Phòng họp AI (không huỷ khi đổi tab).
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "../../../test/rtl-lite";

const S = vi.hoisted(() => ({
  ticker: null as unknown, decision: null as unknown, risk: null as unknown,
  ledger: null as unknown, flowLedger: null as unknown, ledgerError: null as unknown, ledgerCalls: [] as [string | null, boolean][],
}));

vi.mock("../../../hooks/elite10/useEliteCenter", () => ({
  useEliteTicker: () => S.ticker,
  useElitePanel: () => ({ data: null }),
  useEliteEvidence: () => ({ data: { version: "E2-v1", generatedAt: "x", calendarLast: "2026-11-13", tests: 1, counts: { A: 0, B: 0, C: 0 }, signals: [] } }),
  useEliteDecision: () => ({ data: S.decision }),
  useEliteLedger: (book: "flow" | null = null, enabled = true) => { S.ledgerCalls.push([book, enabled]); return !enabled ? { data: undefined } : book === "flow" ? { data: S.flowLedger } : { data: S.ledger, error: S.ledgerError }; },
  useEliteRetro: () => ({ data: null }), useEliteRetroV3: () => ({ data: null }), useEliteToShadow: () => ({ data: null }),
  useEliteRisk: () => ({ data: S.risk, isLoading: false }),
}));
vi.mock("../../../hooks/useWorldStrategy", () => ({ useWorldStrategy: () => ({ data: null }) }));
vi.mock("./ConfluenceCard", () => ({ default: () => null }));
vi.mock("./LeadershipCard", () => ({ default: () => null }));
vi.mock("./WorldTransmissionCard", () => ({ default: () => null }));
vi.mock("./EliteToShadowCard", () => ({ default: () => null }));
// Hub: chỉ kiểm cơ chế giữ Phòng họp AI trong cây -> các tab con thay bằng khối giả.
const aiMounts = vi.hoisted(() => ({ n: 0, unmounts: 0 }));
vi.mock("./DecisionBoard", () => ({ default: () => <div data-testid="stub-board" />, TierChip: () => null }));
vi.mock("./EliteScreener", () => ({ default: () => null }));
vi.mock("./ToTickerCard", () => ({ default: () => null }));
vi.mock("../timing/TimingSimPanel", () => ({ default: () => null }));
vi.mock("../news/EliteNewsPanel", () => ({ default: () => null }));
vi.mock("./EliteAiRoom", async () => {
  const { useEffect } = await import("react");
  return { default: () => { useEffect(() => { aiMounts.n++; return () => { aiMounts.unmounts++; }; }, []); return <div data-testid="stub-ai">đang tranh luận</div>; } };
});
vi.mock("../../../lib/TabNavigationContext", () => ({ useTabNavigation: () => null }));
vi.mock("../../../store/useAppStore", () => ({ useAppStore: (sel: (s: unknown) => unknown) => sel({ selectedTicker: null, selectTicker: () => {} }) }));

import SignalProfileCard from "./SignalProfileCard";
import EvidenceLedgerTab from "./EvidenceLedgerTab";
import RiskTab from "./RiskTab";
import Elite10Hub from "../Elite10Hub";

const text = (id: string) => screen.getByTestId(id).textContent ?? "";
const score = (ticker: string, inPortfolio: boolean) => ({ ticker, rank: 40, Z: 0.5, alpha5Pct: 0.01, pOutperform: 0.503, eligible: true, reason: null, close: 50000, advBn: 30, sigma20: 0.02, sectorKey: "8300", contributions: [], date: "2026-11-13", version: "E4-HL v1", icComb: 0.01, weights: [], inPortfolio, universe: { panel: 275, eligible: 171 } });
const panelOf = (ticker: string) => ({ date: "2026-11-13", ticker, icb: null, sector: null, values: {}, signals: [], missingSources: [] });
const hlDecision = {
  date: "2026-11-13", version: "E4-HL v1",
  portfolio: [{ ticker: "FPT", weight: 0.1, Z: 0.2 }],
  flowPortfolio: [{ ticker: "ORS", weight: 0.5, Z: 2.2, rank: 1 }, { ticker: "NAB", weight: 0.5, Z: 1.4, rank: 4 }],
  hl: {
    queue: [{ ticker: "MWG", hlRank: 3, code: "wait", reasonVi: "Chờ phiên cân bằng đầu tuần kế tiếp" }],
    against: [{ ticker: "VCB", hlRank: 20, t1: 8, rrg: -1, rrgVi: "Suy yếu" }],
  },
};
const summary = (extra: object = {}) => ({ label: "EXPERIMENTAL", labelVi: "THĂM DÒ — cần ≥ 60 phiên tiến và đạt cả hai tiêu chí (hiện 2 phiên)", criteria: { icPass: false, excessPass: false, sessions: 2 }, horizons: { 5: { n: 0, ic: { n: 0 }, curve: [] }, 10: { n: 0, ic: { n: 0 }, curve: [] } }, ...extra });

afterEach(() => { cleanup(); S.ticker = S.decision = S.risk = S.ledger = S.flowLedger = S.ledgerError = null; S.ledgerCalls.length = 0; aiMounts.n = aiMounts.unmounts = 0; });

describe("Hồ sơ 360° với danh mục Elite HL", () => {
  it("mã trong hàng chờ: nêu hạng hợp lưu và lý do của Gateway; không còn nói 'cần thêm ΔZ' cho danh mục chính thức", () => {
    S.decision = hlDecision;
    S.ticker = { decision: score("MWG", false), panel: panelOf("MWG"), isLoading: false, error: null };
    render(<SignalProfileCard ticker="MWG" />);
    const pos = text("elite-profile-hl-pos");
    expect(pos).toContain("Vị trí so với danh mục Elite HL");
    expect(pos).toContain("hạng hợp lưu 3");
    expect(pos).toContain("Chờ phiên cân bằng đầu tuần kế tiếp");
    expect(pos).toContain("không theo Điểm Elite Z");
    // Phần so Z được ghi rõ là của danh mục dòng tiền (cũ), tính trên flowPortfolio (mã yếu nhất NAB), không phải trên danh mục HL.
    const gap = text("elite-profile-gap");
    expect(gap).toContain("Khoảng cách tới danh mục Elite dòng tiền (cũ, xếp theo Z)");
    expect(gap).toContain("NAB");
    expect(gap).not.toContain("FPT");
  });

  it("mã đang giữ / ngành phản đối / ngoài hàng chờ", () => {
    S.decision = hlDecision;
    S.ticker = { decision: score("FPT", true), panel: panelOf("FPT"), isLoading: false, error: null };
    render(<SignalProfileCard ticker="FPT" />);
    expect(text("elite-profile-hl-pos")).toContain("Đang trong danh mục Elite HL");
    expect(text("elite-profile-score")).toContain("Trong Elite HL");
    cleanup();
    S.ticker = { decision: score("VCB", false), panel: panelOf("VCB"), isLoading: false, error: null };
    render(<SignalProfileCard ticker="VCB" />);
    expect(text("elite-profile-hl-pos")).toContain("ngành ở góc Suy yếu");
    cleanup();
    S.ticker = { decision: score("HPG", false), panel: panelOf("HPG"), isLoading: false, error: null };
    render(<SignalProfileCard ticker="HPG" />);
    expect(text("elite-profile-hl-pos")).toContain("Không nằm trong danh mục và hàng chờ");
  });

  it("lỗi tải (500 / mạng) hiện là lỗi, không báo nhầm 'không nằm trong vũ trụ'", () => {
    S.ticker = { decision: null, panel: null, isLoading: false, error: new Error("Kho dữ liệu tạm ngừng") };
    render(<SignalProfileCard ticker="FPT" />);
    expect(text("elite-profile-error")).toContain("Kho dữ liệu tạm ngừng");
    expect(screen.queryByTestId("elite-profile-missing")).toBeNull();
    cleanup();
    S.ticker = { decision: null, panel: null, isLoading: false, error: null };
    render(<SignalProfileCard ticker="VNINDEX" />);
    expect(text("elite-profile-missing")).toContain("không nằm trong vũ trụ");
  });
});

describe("Bằng chứng & sổ theo dõi với sổ Elite HL", () => {
  it("ghi rõ phạm vi kiểm định, tách hai sổ, nêu cơ sở chấm; phiên 100% tiền mặt không ghi 'chờ'", () => {
    S.ledger = {
      version: "E4-HL v1 (G2r, 12/11/2026)", updatedAt: "2026-11-13T10:00:00Z", summary: summary(),
      entries: [
        { date: "2026-11-12", lockedAt: "x", holdings: [], universeSize: 170, empty: true, cash: 1, results: {} },
        { date: "2026-11-13", lockedAt: "x", holdings: [{ ticker: "FPT", weight: 0.1 }], universeSize: null, cash: 0.9, results: {} },
      ],
    };
    S.flowLedger = { version: "E3-v4", updatedAt: "2026-11-13T10:00:00Z", summary: summary({ labelVi: "THĂM DÒ — sổ dòng tiền" }), entries: [{ date: "2026-11-13", lockedAt: "x", holdings: [{ ticker: "ORS", weight: 0.5 }], universeSize: null, results: {} }] };
    render(<EvidenceLedgerTab />);
    expect(text("elite-evidence-scope")).toContain("KHÔNG phải kiểm định của Elite HL");
    const hl = text("elite-ledger-tab");
    expect(hl).toContain("Sổ theo dõi tiến — Elite HL (danh mục chính thức)");
    expect(hl).toContain("sổ mô tả của Elite HL (2 phiên)");
    expect(hl).not.toContain("cần ≥ 60 phiên"); // tiêu chí IC của E3 không áp dụng cho sổ HL
    expect(hl).not.toContain("IC của Điểm Elite");
    expect(text("elite-ledger-tab-basis")).toContain("không tính phần tiền mặt");
    expect(text("elite-ledger-tab-cash-2026-11-12")).toContain("100% tiền mặt");
    expect(hl).toContain("tiền mặt 90%");
    expect(hl.match(/chờ/g)?.length).toBe(2); // chỉ phiên 13/11 (hai kỳ hạn); phiên toàn tiền mặt không "chờ"
    const flow = text("elite-ledger-flow");
    expect(flow).toContain("Elite dòng tiền (cũ, E3)");
    expect(flow).toContain("IC của Điểm Elite");
    expect(flow).toContain("ORS");
    expect(S.ledgerCalls).toContainEqual(["flow", true]);
    expect(text("elite-evidence-disclaimer")).toContain("không phải khuyến nghị đầu tư");
  });

  it("sổ E3 cũ: một sổ, không gọi sổ dòng tiền; lỗi tải sổ hiện là lỗi", () => {
    S.ledger = { version: "E3-v4", updatedAt: "x", summary: summary(), entries: [] };
    render(<EvidenceLedgerTab />);
    expect(text("elite-ledger-tab")).toContain("Sổ theo dõi tiến Elite 10 (E3)");
    expect(screen.queryByTestId("elite-evidence-scope")).toBeNull();
    expect(screen.queryByTestId("elite-ledger-flow")).toBeNull();
    expect(S.ledgerCalls).toContainEqual(["flow", false]);
    cleanup();
    S.ledger = undefined; S.ledgerError = new Error("503");
    render(<EvidenceLedgerTab />);
    expect(text("elite-ledger-tab-error")).toContain("Không tải được sổ theo dõi: 503");
  });
});

describe("Rủi ro danh mục với Elite HL", () => {
  it("100% tiền mặt: thông báo trạng thái, không phải lỗi", () => {
    S.risk = { date: "2026-11-13", version: "E4-HL v1", generatedAt: "x", label: "EXPERIMENTAL", kind: "ELITE_HL", invested: 0, cash: 1, available: false, empty: true, reasonVi: "Danh mục đang 100% tiền mặt — không có vị thế nào để tính rủi ro." };
    render(<RiskTab />);
    const t = text("elite-risk-na");
    expect(t).toContain("Rủi ro danh mục Elite HL");
    expect(t).toContain("100% tiền mặt");
    expect(t).toContain("không phải khuyến nghị đầu tư");
  });

  it("có tiền mặt: nêu tỷ lệ cổ phiếu / tiền mặt; thanh cam so với tỷ trọng trong phần cổ phiếu", () => {
    const vb = { level: 0.95, historical: { var: 0.006, cvar: 0.009 }, gaussian: { var: 0.006, cvar: 0.008 }, cornishFisher: { var: 0.007 }, moments: { mean: 0, sd: 0.004, skew: 0, exKurt: 0 } };
    S.risk = {
      date: "2026-11-13", version: "E4-HL v1", generatedAt: "x", label: "EXPERIMENTAL", kind: "ELITE_HL", invested: 0.2, cash: 0.8, available: true, sessions: 250, from: "2025-11-10", to: "2026-11-13",
      shrinkage: { delta: 0.3, avgCorrelation: 0.3, method: "Ledoit–Wolf" }, volatility: { daily: 0.004, annual: 0.063 },
      // Hai mã 10% + 10%: mỗi mã chiếm 50% phần cổ phiếu. Đóng góp rủi ro 55% (< 1,25 × 50%) -> KHÔNG tô cam; trước đây so với 10% nên luôn cam.
      holdings: [{ ticker: "FPT", weight: 0.1, volAnnual: 0.3, riskContribution: 0.55, sector: "9500" }, { ticker: "MWG", weight: 0.1, volAnnual: 0.28, riskContribution: 0.45, sector: "5300" }],
      diversification: { ratio: 1.2, effectiveN: 2, enb: 1.8, hhi: 0.5 }, var: { "0.95": vb, "0.99": vb, tenDayNoteVi: "√10" }, beta: 0.2, corrWithVnIndex: 0.7,
      maxDrawdown: { value: -0.03, from: "2026-03-01", to: "2026-04-01" }, stress: { worstVnIndexDays: [], worst10Sessions: null }, sectors: [{ key: "9500", weight: 0.1 }], correlation: { tickers: ["FPT", "MWG"], matrix: [[1, 0.3], [0.3, 1]] },
    };
    render(<RiskTab />);
    expect(text("elite-risk-tab")).toContain("Rủi ro danh mục Elite HL");
    const cash = text("elite-risk-cash");
    expect(cash).toContain("20,0%");
    expect(cash).toContain("tiền mặt 80,0%");
    expect(text("elite-risk-tiles")).toContain("N hiệu dụng 2,0");
    const bars = Array.from(screen.getByTestId("elite-risk-rc").querySelectorAll<HTMLElement>("span[style]")).map((el) => el.getAttribute("style") ?? "");
    expect(bars.some((s) => /245,\s*158,\s*11|#f59e0b/i.test(s))).toBe(false);
  });
});

describe("Elite10Hub — Phòng họp AI không bị huỷ khi đổi tab con", () => {
  it("mở Phòng họp AI rồi sang tab khác: thành phần vẫn trong cây (ẩn), quay lại không dựng lại", async () => {
    render(<Elite10Hub />);
    expect(screen.queryByTestId("stub-ai")).toBeNull(); // chưa mở thì chưa dựng (không tốn tài nguyên)
    await act(async () => { fireEvent.click(document.getElementById("elite10-ai-tab")!); });
    expect(aiMounts.n).toBe(1);
    await act(async () => { fireEvent.click(document.getElementById("elite10-board-tab")!); });
    expect(aiMounts.unmounts).toBe(0);
    expect(screen.getByTestId("elite10-ai-keepalive").hasAttribute("hidden")).toBe(true);
    expect(screen.queryByTestId("stub-board")).not.toBeNull();
    await act(async () => { fireEvent.click(document.getElementById("elite10-ai-tab")!); });
    expect(aiMounts.n).toBe(1);
    expect(screen.getByTestId("elite10-ai-keepalive").hasAttribute("hidden")).toBe(false);
  });
});
