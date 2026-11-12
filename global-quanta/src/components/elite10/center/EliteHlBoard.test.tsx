// E4-HL: Bảng quyết định Elite HL — dải chỉ số, phễu, thay đổi, danh mục ba tầng, ngành, hàng chờ, K0, sổ so sánh; nút chuyển danh mục cũ.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "../../../test/rtl-lite";
import type { EliteDecision, HlPosition, PortfolioPick } from "../../../lib/elite10/decisionTypes";

const pos = (o: Partial<HlPosition>): HlPosition => ({ rank: 1, cls: "STRONG", t1: 10, t2: 1, t3: 2, lsPct: 85, lsPts: 5, taCount: 5, taPts: 5, rrg: 2, status: "NEW", since: "2026-11-12", advBn: 132, sigma20: 0.0075, exitBufferLs: 25, warnings: [], ...o });
const pick = (ticker: string, weight: number, hl: Partial<HlPosition>, sectorKey = "5700"): PortfolioPick => ({ ticker, weight, Z: 1, rank: 15, alpha5Pct: 0.1, pOutperform: 0.51, sectorKey, close: 100000, stop: 90000, target: 115000, holdSessions: null, retained: hl.status === "HOLD", riskContribution: 0.5, hl: pos(hl) });
const horizon = (n: number, meanExcess: number | null) => ({ n, meanExcess, hitRate: 0.6, excessCi95: null, meanPortfolioNet: 0, meanVnIndex: 0, ic: { n: 0, mean: null, t: null }, curve: [] });
const summary = (n: number, ex: number | null) => ({ horizons: { 5: horizon(n, ex), 10: horizon(0, null) }, criteria: { icPass: false, excessPass: false, sessions: n }, label: "EXPERIMENTAL" as const, labelVi: "THĂM DÒ" });
const decision: EliteDecision = {
  version: "E4-HL v1 (G2r, 12/11/2026)", date: "2026-11-13", builtAt: "2026-11-13T10:05:00Z", icComb: 0.02, sigma5: 0.04, weights: [], universe: { panel: 275, eligible: 142 }, scores: [],
  portfolio: [pick("VJC", 0.15, {}), pick("CTD", 0.091, { rank: 7, cls: "CONFLUENCE", t1: 9, t3: -1, lsPct: 66, rrg: -1, t2: -1, status: "HOLD", since: "2026-11-03", exitBufferLs: 6, warnings: ["LS-v1 phân vị 66 — cách ngưỡng bán 6 điểm", "Ngành chuyển sang Suy yếu"] }, "2300")],
  ledgerSummary: summary(0, null), flowLedgerSummary: summary(12, -0.0031),
  flowVersion: "E3-v4 (prereg 2026-10-17, sửa đổi 2026-11-05)", flowPortfolio: [{ ...pick("DCL", 0.5, {}), hl: undefined }, { ...pick("SBT", 0.5, {}), hl: undefined }],
  flowConstruction: { method: "erc", sessions: 120, retained: 2, previous: 2, turnover: 0 },
  hl: {
    version: "E4-HL v1 (G2r, 12/11/2026)", ruleVersion: "HL-v1 (12/11/2026)", date: "2026-11-13", rebalance: false, week: "2026-W46", prevDate: "2026-11-12",
    rule: { slots: 10, slotW: 0.1, wMin: 0.05, wMax: 0.15, sectorCap: 0.3, maxPerSector: 3, minAdvBn: 5, exitLsPct: 60, exitTaMin: 1, warnLsPct: 70, costBuy: 0.002, costSell: 0.0025, bandSessions: 20 },
    k0: { period: "28/07/2020 → 05/11/2026", cagr: 0.125, vol: 0.199, maxDd: -0.468, turnover: 6.9, vnIndexCagr: 0.135, equalWeightCagr: 0.109, t: -0.02, noteVi: "Mô phỏng khám phá (K0): 12,5%/năm — NGANG thị trường (VN-Index 13,5%/năm), t ≈ 0." },
    funnel: { panel: 275, tradable: 171, tier1: 38, selected: 22, selectedTradable: 14, held: 2 }, invested: 0.241, cash: 0.759, sigmaMedian: 0.02,
    changes: { added: ["VJC"], exits: [{ ticker: "HSG", weight: 0.099, since: "2026-11-03", code: "ls", reasonVi: "Sức mạnh dẫn dắt LS-v1 xuống phân vị 41 (ngưỡng bán < 60)", hlRank: 120, lsPct: 41, taCount: 2, rrg: 2 }], kept: 1, turnover: 0.1245, costEst: 0.00055 },
    sectors: [{ sectorKey: "5700", weight: 0.15, names: 1 }, { sectorKey: "2300", weight: 0.091, names: 1 }],
    queue: [{ ticker: "HDA", hlRank: 13, cls: "STRONG", t1: 8, t2: 1, t3: 2, lsPct: 93, taCount: 3, rrg: 1, sectorKey: "2300", advBn: 3, code: "illiquid", reasonVi: "Chưa giao dịch được: GTGD TB20 < 5 tỷ" }, { ticker: "NKG", hlRank: 30, cls: "CONFLUENCE", t1: 7, t2: 1, t3: 0, lsPct: 82, taCount: 2, rrg: 2, sectorKey: "1700", advBn: 79, code: "wait", reasonVi: "Chờ phiên cân bằng đầu tuần kế tiếp" }],
    against: [{ ticker: "MSB", hlRank: 3, t1: 10, rrg: -2, rrgVi: "Tụt hậu" }],
    market: { regime: "WEAK", regimeVi: "Thị trường yếu", bias: "defensive", breadth: 41, guard: false }, labelVi: "THĂM DÒ — …",
  },
};
let current: EliteDecision = decision;
vi.mock("../../../hooks/elite10/useEliteCenter", () => ({ useEliteDecision: () => ({ data: current, error: null, isLoading: false }) }));
vi.mock("../../../hooks/useWorldStrategy", () => ({ useWorldStrategy: () => ({ data: { short: { rows: [{ icb: "5700", nameVi: "Du lịch & Giải trí" }, { icb: "2300", nameVi: "Xây dựng & Vật liệu" }] }, regime: { stressed: false, vix: 15, vixChg: 0 } } }) }));
vi.mock("../../../hooks/elite10/useHlLedger", () => ({ useHlLedger: () => ({ data: null }) }));
vi.mock("../../../hooks/elite10/useEliteTiming", () => ({ useEliteTiming: () => ({ data: null, sessions: [], meta: null, loading: false, error: null }) }));
vi.mock("../../../hooks/elite10/useRankHistory", () => ({ useRankHistory: () => ({ history: null }) }));
vi.mock("../../../hooks/useGatewayBuyTimeline", () => ({ buyTimingFreshness: () => null }));
vi.mock("swr", () => ({ default: () => ({ data: undefined }) }));
vi.mock("./PortfolioRadar", () => ({ default: ({ d }: { d: EliteDecision }) => <div data-testid="radar-stub">{d.portfolio.map((p) => p.ticker).join(",")}</div> }));
vi.mock("./EliteCandidates", () => ({ default: () => null }));
vi.mock("./CashGateCard", () => ({ default: () => null }));

import DecisionBoard from "./DecisionBoard";
import EliteHlBoard from "./EliteHlBoard";

const text = (id: string) => screen.getByTestId(id).textContent ?? "";

describe("Bảng quyết định Elite HL", () => {
  beforeEach(() => { localStorage.clear(); current = decision; });
  afterEach(() => cleanup());

  it("dải chỉ số, phễu, thay đổi hôm nay và danh mục ba tầng kèm ngưỡng ra", () => {
    const onOpen = vi.fn();
    render(<EliteHlBoard d={decision} onOpenTicker={onOpen} />);
    expect(text("hl-kpi-names")).toMatch(/2 \/ 10.*vào 1 · ra 1 · giữ 1/);
    expect(text("hl-kpi-invested")).toMatch(/24,1%.*Tiền mặt 75,9%/);
    expect(text("hl-kpi-market")).toMatch(/Thị trường yếu.*Độ rộng 41%/);
    expect(text("hl-kpi-rebalance")).toMatch(/Chỉ xét ra.*phiên đầu tuần kế tiếp/);
    expect(text("hl-kpi-turnover")).toMatch(/12%.*0,06%/);
    expect([0, 1, 2, 3, 4, 5].map((i) => Number(screen.getByTestId(`hl-funnel-${i}`).getAttribute("data-n")))).toEqual([275, 171, 38, 22, 14, 2]);
    expect(text("hl-added")).toContain("VJC"); expect(text("hl-exit-HSG")).toMatch(/Ra HSG.*9,9%.*giữ từ 03\/11\/2026.*phân vị 41/);
    expect(text("hl-row-VJC")).toMatch(/Hợp lưu mạnh.*Du lịch & Giải trí.*Vào mới.*15,0%.*10\/10.*LS phân vị 85 · TA 5\/7.*Dẫn dắt.*ủng hộ.*\+2.*\+25/);
    expect(text("hl-row-CTD")).toMatch(/Giữ từ 03\/11.*9,1%.*Suy yếu.*phản đối.*−1.*\+6.*⚠ LS-v1 phân vị 66.*⚠ Ngành chuyển sang Suy yếu/);
    fireEvent.click(screen.getByTestId("hl-open-CTD")); expect(onOpen).toHaveBeenCalledWith("CTD");
    expect(text("elite-label")).toBe("THĂM DÒ");
  });

  it("phân bổ ngành, hàng chờ có lý do, mã bị ngành phản đối, ghi chú K0 và sổ so sánh hai danh mục", () => {
    render(<EliteHlBoard d={decision} onOpenTicker={() => {}} />);
    expect(text("hl-sector-5700")).toMatch(/Du lịch & Giải trí.*15%.*1 mã/); expect(text("hl-sectors")).toMatch(/Tiền mặt.*76%/);
    expect(text("hl-queue-HDA")).toMatch(/GTGD TB20 < 5 tỷ/); expect(text("hl-queue-NKG")).toMatch(/Chờ phiên cân bằng/);
    expect(text("hl-against")).toContain("MSB (Tụt hậu)");
    expect(text("hl-k0")).toMatch(/NGANG thị trường/);
    expect(text("hl-rules")).toMatch(/Ra \(xét mỗi phiên\):.*phân vị 60.*Tụt hậu/);
    expect(text("hl-ledger-hl-5")).toMatch(/chưa có phiên nào/); expect(text("hl-ledger-flow-5")).toMatch(/12 phiên · vượt rổ đều −0,31%/);
  });

  it("danh mục rỗng -> nói rõ 100% tiền mặt", () => {
    render(<EliteHlBoard d={{ ...decision, portfolio: [], hl: { ...decision.hl!, sectors: [], invested: 0, cash: 1, funnel: { ...decision.hl!.funnel, held: 0 } } }} onOpenTicker={() => {}} />);
    expect(text("hl-empty")).toMatch(/100% tiền mặt/);
  });

  it("Bảng quyết định: mặc định Elite HL; chuyển sang danh mục dòng tiền (cũ) dùng flowPortfolio và nhớ lựa chọn", () => {
    render(<DecisionBoard onOpenTicker={() => {}} />);
    expect(screen.getByTestId("elite-hl-board")).toBeTruthy();
    expect(screen.getByTestId("board-view-hl").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByTestId("board-view-flow"));
    expect(screen.queryByTestId("elite-hl-board")).toBeNull();
    expect(text("elite-decision-board")).toMatch(/Elite dòng tiền — danh mục cũ/); expect(text("elite-flow-legacy")).toMatch(/danh mục chính thức là Elite HL/);
    expect(text("radar-stub")).toBe("DCL,SBT");
    expect(text("elite-ledger")).toMatch(/12 phiên đã chấm/);
    expect(localStorage.getItem("elite.board.view")).toBe("flow");
    cleanup(); render(<DecisionBoard onOpenTicker={() => {}} />);
    expect(screen.queryByTestId("elite-hl-board")).toBeNull();
  });

  it("tài liệu cũ (chưa có hl) -> bảng cũ, không có nút chuyển", () => {
    current = { ...decision, hl: undefined, flowPortfolio: undefined, portfolio: decision.flowPortfolio!, version: decision.flowVersion! };
    render(<DecisionBoard onOpenTicker={() => {}} />);
    expect(screen.queryByTestId("board-view")).toBeNull(); expect(text("radar-stub")).toBe("DCL,SBT");
    expect(text("elite-decision-board")).toMatch(/Bảng quyết định Elite 10/);
  });
});
