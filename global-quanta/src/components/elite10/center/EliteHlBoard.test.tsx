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

  it("N0 chốt dữ liệu: thiếu nguồn -> băng cảnh báo, ô nhịp cân bằng ghi Giữ nguyên; đủ nguồn -> dòng xác nhận", () => {
    render(<EliteHlBoard d={{ ...decision, hl: { ...decision.hl!, dataGuard: { frozen: true, reasonsVi: ["LS-v1 chỉ có 0/275 mã (cần ≥ 97)"] } } }} onOpenTicker={() => {}} />);
    expect(text("hl-data-guard")).toMatch(/danh mục giữ nguyên, không vào và không ra.*LS-v1 chỉ có 0\/275 mã/);
    expect(text("hl-kpi-rebalance")).toMatch(/Giữ nguyên.*Chốt dữ liệu đang bật/);
    cleanup(); render(<EliteHlBoard d={{ ...decision, hl: { ...decision.hl!, dataGuard: { frozen: false, reasonsVi: [] } } }} onOpenTicker={() => {}} />);
    expect(screen.queryByTestId("hl-data-guard")).toBeNull(); expect(text("hl-data-ok")).toMatch(/đủ nguồn/);
  });

  it("N2 thẻ Vì sao: điều kiện tầng 1, từng phiếu tầng 3, ba ngưỡng ra và thay đổi từ phiên khoá; bấm lại thì đóng", () => {
    const d = { ...decision, portfolio: [{ ...decision.portfolio[0], hl: { ...decision.portfolio[0].hl!, ta: { sepa_state: true, base_breakout: false, convergence: null }, votes: { stealth20: 1, fa_score: -1, catalyst_impact: 0, cotuc_decision: null }, ref: 130000, sinceRet: 0.05 } }, decision.portfolio[1]] };
    render(<EliteHlBoard d={d} onOpenTicker={() => {}} />);
    expect(screen.queryByTestId("hl-why-VJC")).toBeNull();
    fireEvent.click(screen.getByTestId("hl-why-btn-VJC"));
    const w = text("hl-why-VJC");
    expect(w).toMatch(/✓ SEPA gần pivot . phá vỡ.*✗ Base Breakout ≥ hạng B.*· Hợp lưu v2 mua ≥ hạng B — chưa có dữ liệu/);
    expect(w).toMatch(/[+]1 Stealth 20.*−1 Điểm cơ bản.*0 Chất xúc tác.*· Cổ tức/);
    expect(w).toMatch(/còn cách 25 điểm phân vị.*ra khi < 60.*đang đạt 5.*ra khi còn 0.*Dẫn dắt.*ra khi Tụt hậu/);
    expect(w).toMatch(/Vào danh mục: 12.11.2026.*130[.]000 → 100[.]000.*[+]5,0%/);
    expect(screen.getByTestId("hl-why-btn-VJC").getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(screen.getByTestId("hl-why-btn-CTD"));
    expect(screen.queryByTestId("hl-why-VJC")).toBeNull(); expect(text("hl-why-CTD")).toMatch(/Chưa có chi tiết mô hình TA/);
    fireEvent.click(screen.getByTestId("hl-why-btn-CTD")); expect(screen.queryByTestId("hl-why-CTD")).toBeNull();
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

  it("bảng dòng tiền: giới hạn ngành và trần tỷ trọng lấy từ Gateway; Gateway cũ dùng mặc định", () => {
    localStorage.setItem("elite.board.view", "flow");
    render(<DecisionBoard onOpenTicker={() => {}} />);
    expect(text("elite-decision-board")).toMatch(/tối đa 3 mã mỗi ngành/); expect(text("elite-decision-board")).toMatch(/trần 20%/);
    cleanup();
    current = { ...decision, display: { ledgerCostRoundTrip: 0.004, flowMinAdvBn: 10, flowMinPrice: 5000, flowRrgPenalty: 0.25, flowBufferRank: 15, flowMaxPerSector: 2, flowWeightCap: 0.15 } };
    render(<DecisionBoard onOpenTicker={() => {}} />);
    expect(text("elite-decision-board")).toMatch(/tối đa 2 mã mỗi ngành/); expect(text("elite-decision-board")).toMatch(/trần 15%/);
  });
});

// 13/11/2026 — số ngưỡng lấy từ Gateway, cảnh báo độ mới, vị thế thiếu số, gợi ý hiện thành chữ (không chỉ nằm trong title).
describe("Bảng quyết định Elite HL — nguồn số, độ mới, thiếu dữ liệu", () => {
  beforeEach(() => { localStorage.clear(); current = decision; });
  afterEach(() => cleanup());

  it("ngưỡng tầng 1 và chi phí sổ lấy từ Gateway: đổi nguồn thì chữ đổi theo; Gateway cũ dùng mặc định", () => {
    render(<EliteHlBoard d={decision} onOpenTicker={() => {}} />);
    expect(text("hl-funnel-tip-2")).toBe("LS-v1 top 20% và ≥ 2 mô hình TA");
    expect(text("hl-rules")).toContain("LS-v1 top 20% và ≥ 2/7 mô hình TA");
    expect(text("hl-funnel-tip-1")).toContain("giá ≥ 5.000đ");
    expect(text("elite-ledger")).toContain("chi phí giả định 0,40%/vòng");
    cleanup();
    const d2: EliteDecision = { ...decision, display: { ledgerCostRoundTrip: 0.0045, flowMinAdvBn: 10, flowMinPrice: 5000 }, hl: { ...decision.hl!, tier1: { lsLeaderPct: 75, taMin: 3, taModels: 8, maxScore: 10 }, rule: { ...decision.hl!.rule, minPrice: 6000 } } };
    render(<EliteHlBoard d={d2} onOpenTicker={() => {}} />);
    expect(text("hl-funnel-tip-2")).toBe("LS-v1 top 25% và ≥ 3 mô hình TA");
    expect(text("hl-rules")).toContain("≥ 3/8 mô hình TA");
    expect(text("hl-row-VJC")).toContain("TA 5/8");
    expect(text("hl-funnel-tip-1")).toContain("giá ≥ 6.000đ");
    expect(text("elite-ledger")).toContain("chi phí giả định 0,45%/vòng");
  });

  it("độ mới: chậm ≥ 2 phiên -> cảnh báo đỏ; chậm 1 phiên -> ghi chú chờ dựng; mới nhất -> không hiện gì", () => {
    render(<EliteHlBoard d={{ ...decision, freshness: { latestSession: "2026-11-17", sessionsBehind: 2 } }} onOpenTicker={() => {}} />);
    expect(text("hl-stale")).toContain("Bảng đang chậm 2 phiên");
    expect(text("hl-stale")).toContain("17/11/2026");
    cleanup();
    render(<EliteHlBoard d={{ ...decision, freshness: { latestSession: "2026-11-16", sessionsBehind: 1 } }} onOpenTicker={() => {}} />);
    expect(screen.queryByTestId("hl-stale")).toBeNull();
    expect(text("hl-pending")).toContain("dựng sau 17:00");
    cleanup();
    // chậm 1 phiên nhưng đã quá hạn dựng -> cảnh báo đỏ, không còn là ghi chú "chờ dựng"
    render(<EliteHlBoard d={{ ...decision, freshness: { latestSession: "2026-11-16", sessionsBehind: 1, overdue: true } }} onOpenTicker={() => {}} />);
    expect(text("hl-stale")).toContain("Bảng chưa có phiên 16/11/2026"); expect(screen.queryByTestId("hl-pending")).toBeNull();
    cleanup();
    render(<EliteHlBoard d={{ ...decision, freshness: { latestSession: "2026-11-13", sessionsBehind: 0 } }} onOpenTicker={() => {}} />);
    expect(screen.queryByTestId("hl-stale")).toBeNull();
    expect(screen.queryByTestId("hl-pending")).toBeNull();
  });

  it("làm mới lỗi khi đang có dữ liệu cũ -> băng cảnh báo, bảng vẫn hiện", () => {
    render(<EliteHlBoard d={decision} onOpenTicker={() => {}} refreshError="Market API lỗi 503" />);
    expect(text("hl-refresh-error")).toContain("Không làm mới được dữ liệu");
    expect(text("hl-refresh-error")).toContain("503");
    expect(text("hl-row-VJC")).toContain("VJC");
  });

  it("vị thế đang giữ nhưng vắng dữ liệu phiên này (Z / giá = null): hiện '—', không sập, không ra số 0", () => {
    const ghost = { ...pick("ABC", 0.08, { rank: 9999, cls: "NOT_T1", t1: 0, t3: 0, lsPct: null, taCount: 0, rrg: null, status: "HOLD", exitBufferLs: null, advBn: null, warnings: ["Không có dữ liệu của mã phiên này (lần 1/2) — chưa ra"] }), Z: null, rank: null, pOutperform: null, close: null, stop: null, target: null, sectorKey: null };
    render(<EliteHlBoard d={{ ...decision, portfolio: [...decision.portfolio, ghost as unknown as PortfolioPick] }} onOpenTicker={() => {}} />);
    const row = text("hl-row-ABC");
    expect(row).toContain("Không có dữ liệu của mã phiên này");
    expect(row).toContain("—");
    expect(row).not.toMatch(/(^|[^0-9,.])0 – 0/);
  });

  it("ghi chú: cơ sở chấm của sổ HL, dải tham chiếu không phải lệnh, tỷ trọng là số lúc vào", () => {
    render(<EliteHlBoard d={decision} onOpenTicker={() => {}} />);
    expect(text("hl-ledger-basis")).toContain("không tính phần tiền mặt");
    expect(text("hl-sizing-note")).toContain("không phải lệnh cắt lỗ");
    expect(text("hl-sizing-note")).toContain("số lúc vào");
  });
});

// F03 (14/11/2026): dòng "tính cả tiền mặt" chỉ hiện khi Gateway đã có số; không thay số chấm chính thức.
describe("Bảng quyết định Elite HL — sổ tính cả tiền mặt", () => {
  afterEach(() => cleanup());
  it("có cashIncl -> hiện lợi suất danh mục thật kèm tỷ lệ cổ phiếu trung bình; chưa có -> không hiện", () => {
    render(<EliteHlBoard d={decision} onOpenTicker={() => {}} />);
    expect(screen.queryByTestId("hl-ledger-cash-5")).toBeNull();
    cleanup();
    const s = summary(8, 0.012);
    const withCash = { ...s, horizons: { ...s.horizons, 5: { ...s.horizons[5], cashIncl: { n: 6, meanPortfolio: 0.0031, meanInvested: 0.24, meanVnIndex: 0.004 } } } };
    render(<EliteHlBoard d={{ ...decision, ledgerSummary: withCash }} onOpenTicker={() => {}} />);
    const line = text("hl-ledger-cash-5");
    expect(line).toContain("6 phiên, cổ phiếu TB 24%");
    expect(line).toContain("+0,31%");
    expect(line).toContain("VN-Index +0,40%");
    expect(text("hl-ledger-hl-5")).toContain("+1,20%"); // số chấm chính thức vẫn nguyên
  });
});
