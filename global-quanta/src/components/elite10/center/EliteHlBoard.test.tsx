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
vi.mock("../../../hooks/useGatewayBuyTimeline", () => ({ buyTimingFreshness: () => null }));
vi.mock("swr", () => ({ default: () => ({ data: undefined }) }));
vi.mock("./CashGateCard", () => ({ default: () => null }));
// QĐ-R: khung "Mã đang chọn" dùng nguyên ba component của Hồ sơ 360° — thay bằng khối giả ghi lại mã được truyền vào (không gọi mạng).
vi.mock("./ToTickerCard", () => ({ default: ({ ticker }: { ticker: string }) => <div data-testid={`stub-to-${ticker}`} /> }));
vi.mock("../timing/TimingSimPanel", () => ({ default: ({ ticker }: { ticker: string }) => <div data-testid={`stub-sim-${ticker}`} /> }));
vi.mock("../news/EliteNewsPanel", () => ({ default: ({ ticker }: { ticker: string }) => <div data-testid={`stub-news-${ticker}`} /> }));
// PFA-v1 pha B: cảnh báo cơ bản & sự kiện theo mã (chỉ hiện khi đúng phiên của tài liệu quyết định).
let pfaWarnings: { asOf: string; tickers: Record<string, { id: string; level: "warn" | "info"; text: string; source: string }[]> } | null = null;
vi.mock("../../../hooks/elite10/useProfileFa", () => ({ useProfileFaWarnings: () => ({ data: pfaWarnings }) }));

import DecisionBoard from "./DecisionBoard";
// LQ1: dựng trong khối PZ-v2 (dùng withPz), dùng ở khối LQ1 cuối tệp.
let withPzLq: () => EliteDecision;
import EliteHlBoard from "./EliteHlBoard";
import { HlLedgerPanel, HlRulesPanel } from "./HlRulesLedger";
// QĐ-R (20/11/2026): hai khối "Quy tắc vào · giữ · ra" và "Sổ theo dõi tiến" chuyển từ Bảng quyết định sang tab 4 — các câu kiểm giữ nguyên,
// chỉ render thêm đúng hai khối đó với cùng dữ liệu.
const Moved = ({ d }: { d: EliteDecision }) => <><HlRulesPanel d={d} /><HlLedgerPanel d={d} /></>;

const text = (id: string) => screen.getByTestId(id).textContent ?? "";

describe("Bảng quyết định Elite HL", () => {
  beforeEach(() => { localStorage.clear(); current = decision; localStorage.setItem("gq.hl.layers.v1", JSON.stringify({ pulse: false })); /* NHỊP QUYẾT ĐỊNH: các test này kiểm HAI KHỐI CŨ -> lớp pulse tắt (KP8) */ });
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
    render(<Moved d={decision} />); // QĐ-R: quy tắc + sổ theo dõi đã chuyển sang tab 4
    expect(text("hl-sector-5700")).toMatch(/Du lịch & Giải trí.*15%.*1 mã/); expect(text("hl-sectors")).toMatch(/Tiền mặt.*76%/);
    // LQ1: mã chưa giao dịch được tách khỏi hàng chờ (Gateway cũ để chung, code "illiquid").
    expect(screen.queryByTestId("hl-queue-HDA")).toBeNull(); expect(text("hl-queue-ill-HDA")).toMatch(/GTGD TB20 < 5 tỷ/);
    expect(text("hl-queue-illiquid")).toMatch(/chưa giao dịch được [(]1[)].*không chiếm suất hàng chờ/); expect(text("hl-queue-NKG")).toMatch(/Chờ phiên cân bằng/);
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

  it("G1–G2: Bảng quyết định luôn là Elite HL, không còn nút chuyển sang danh mục cũ, kể cả khi trình duyệt còn lưu lựa chọn cũ", () => {
    localStorage.setItem("elite.board.view", "flow");
    render(<DecisionBoard onOpenTicker={() => {}} />);
    expect(screen.getByTestId("elite-hl-board")).toBeTruthy();
    expect(screen.queryByTestId("board-view")).toBeNull(); expect(screen.queryByTestId("elite-decision-board")).toBeNull();
    expect(screen.queryByTestId("elite-candidates")).toBeNull(); expect(screen.queryByTestId("elite-buy-note")).toBeNull();
    expect(text("hl-context-global")).toMatch(/Rủi ro toàn cầu.*VIX/);
  });

  it("G1: tài liệu cũ (chưa có hl) -> câu rõ ràng thay vì bảng Elite 10 cũ", () => {
    current = { ...decision, hl: undefined, flowPortfolio: undefined, portfolio: decision.flowPortfolio!, version: decision.flowVersion! };
    render(<DecisionBoard onOpenTicker={() => {}} />);
    expect(text("elite-no-hl")).toMatch(/chưa trả danh mục Elite HL/); expect(screen.queryByTestId("radar-stub")).toBeNull();
  });
});

// 13/11/2026 — số ngưỡng lấy từ Gateway, cảnh báo độ mới, vị thế thiếu số, gợi ý hiện thành chữ (không chỉ nằm trong title).
describe("Bảng quyết định Elite HL — nguồn số, độ mới, thiếu dữ liệu", () => {
  beforeEach(() => { localStorage.clear(); current = decision; });
  afterEach(() => cleanup());

  it("ngưỡng tầng 1 và chi phí sổ lấy từ Gateway: đổi nguồn thì chữ đổi theo; Gateway cũ dùng mặc định", () => {
    render(<EliteHlBoard d={decision} onOpenTicker={() => {}} />);
    render(<Moved d={decision} />); // QĐ-R: quy tắc + sổ theo dõi đã chuyển sang tab 4
    expect(text("hl-funnel-tip-2")).toBe("LS-v1 top 20% và ≥ 2 mô hình TA");
    expect(text("hl-rules")).toContain("LS-v1 top 20% và ≥ 2/7 mô hình TA");
    expect(text("hl-funnel-tip-1")).toContain("giá ≥ 5.000đ");
    expect(text("elite-ledger")).toContain("chi phí giả định 0,40%/vòng");
    cleanup();
    const d2: EliteDecision = { ...decision, display: { ledgerCostRoundTrip: 0.0045, flowMinAdvBn: 10, flowMinPrice: 5000 }, hl: { ...decision.hl!, tier1: { lsLeaderPct: 75, taMin: 3, taModels: 8, maxScore: 10 }, rule: { ...decision.hl!.rule, minPrice: 6000 } } };
    render(<EliteHlBoard d={d2} onOpenTicker={() => {}} />);
    render(<Moved d={d2} />); // QĐ-R: quy tắc + sổ theo dõi đã chuyển sang tab 4
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
    render(<Moved d={decision} />); // QĐ-R: quy tắc + sổ theo dõi đã chuyển sang tab 4
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
    render(<Moved d={decision} />); // QĐ-R: quy tắc + sổ theo dõi đã chuyển sang tab 4
    expect(screen.queryByTestId("hl-ledger-cash-5")).toBeNull();
    cleanup();
    const s = summary(8, 0.012);
    const withCash = { ...s, horizons: { ...s.horizons, 5: { ...s.horizons[5], cashIncl: { n: 6, meanPortfolio: 0.0031, meanInvested: 0.24, meanVnIndex: 0.004 } } } };
    render(<EliteHlBoard d={{ ...decision, ledgerSummary: withCash }} onOpenTicker={() => {}} />);
    render(<Moved d={{ ...decision, ledgerSummary: withCash }} />); // QĐ-R: quy tắc + sổ theo dõi đã chuyển sang tab 4
    const line = text("hl-ledger-cash-5");
    expect(line).toContain("6 phiên, cổ phiếu TB 24%");
    expect(line).toContain("+0,31%");
    expect(line).toContain("VN-Index +0,40%");
    expect(text("hl-ledger-hl-5")).toContain("+1,20%"); // số chấm chính thức vẫn nguyên
  });
});

// PZ-v2 (14/11/2026) — lớp Vị trí giá: bảng chính chỉ còn mã trong nền / vùng mua; mã đang giữ đã nóng ở bảng Theo dõi chờ nền.
describe("Elite HL — vị trí giá và bảng Theo dõi chờ nền", () => {
  beforeEach(() => { localStorage.clear(); current = decision; localStorage.setItem("gq.hl.layers.v1", JSON.stringify({ pulse: false })); /* NHỊP QUYẾT ĐỊNH: các test này kiểm HAI KHỐI CŨ -> lớp pulse tắt (KP8) */ });
  afterEach(() => cleanup());
  const zone = { state: "BUY_ZONE" as const, lane: "CORE" as const, sessions: 3, baseSource: "SEPA" as const, pivot: 98000, stopRef: 94000, zoneLow: 95060, zoneHigh: 102900, x1: 0.0204, risk: 0.06, x2: 1.1, x3: 0.05, x4: false, hotReasons: [], missingVi: [] };
  const hot = { state: "EXTENDED" as const, lane: "RUNNER" as const, sessions: 2, baseSource: "BOX" as const, pivot: 80000, stopRef: 74000, zoneLow: 77600, zoneHigh: 84000, x1: 0.25, risk: 0.26, x2: 4.8, x3: 0.31, x4: true, hotReasons: ["x1", "risk", "x2", "x3", "x4"], missingVi: ["Chờ lùi ≥ 5,0% từ đỉnh, hoặc đi ngang 3 phiên"], climax: true, hStar: 100000, depth: 0 };
  const cooling = { state: "COOLING" as const, lane: "WAIT" as const, sessions: 6, hotReasons: [], missingVi: ["Khối lượng 0,92 × TB50 (cần ≤ 0,7)"], rebase: [{ key: "depth" as const, ok: true, vi: "Độ sâu 9%" }, { key: "tight" as const, ok: true, vi: "Biên độ co" }, { key: "dry" as const, ok: false, vi: "Khối lượng 0,92" }, { key: "rs" as const, ok: true, vi: "RS giữ" }], zoneLow: null, zoneHigh: null, hStar: 52000, depth: 0.09 };
  const withPz = (gate = false): EliteDecision => ({
    ...decision,
    portfolio: decision.portfolio.map((p) => ({ ...p, hl: { ...p.hl!, pz: p.ticker === "VJC" ? zone : { ...hot } } })),
    hl: {
      ...decision.hl!, funnel: { ...decision.hl!.funnel, inZone: 4 }, changes: { ...decision.hl!.changes, toWatch: ["CTD"], backToZone: [] },
      queue: decision.hl!.queue.map((q, i) => (i === 0 ? { ...q, pz: { ...zone, lane: null } } : q)),
      watch: [{ ticker: "CTD", hlRank: 7, cls: "CONFLUENCE", sectorKey: "2300", held: true, weight: 0.091, sinceRet: 0.18, pz: hot }, { ticker: "CAR", hlRank: 20, cls: "STRONG", sectorKey: null, held: false, weight: null, sinceRet: null, pz: cooling }],
      watchExits: [{ ticker: "NAF", date: "2026-11-12", to: "BUY_ZONE", kindVi: "Về vùng mua", reasonVi: "Nền mới 18 phiên", held: false }],
      pz: { version: "PZ-v2 (hiển thị, 14/11/2026)", gate, rules: { zoneLow: -0.03, zoneHigh: 0.05, maxRisk: 0.1, x2Hot: 3, x2Cool: 1.5, x2CoolSessions: 3, x3Min: 0.15, x3Pct: 0.9, x4Ret5: 0.15, x4LimitDays: 2, coolPullMin: 0.05, rebaseMaxDepth: 0.25, rebaseAtrRatio: 0.7, rebaseVolDry: 0.7, rebaseMinSessions: 15, expireSessions: 60, heldHotSessions: 2, climaxX2: 4.5 },
        counts: { BUY_ZONE: 4, IN_BASE: 3, NO_SETUP: 5, UNKNOWN: 0, EXTENDED: 2, COOLING: 1, REBASING: 0, FAILED: 0 }, date: "2026-11-13",
        coreWeight: 0.15, runnerWeight: 0.091, coreNames: 1, runnerNames: 1, modeVi: gate ? "Cổng vị trí giá: đang bật — chỉ mua mới mã ở Vùng mua." : "Vị trí giá: chỉ hiển thị, chưa ảnh hưởng lệnh mua (chờ kiểm định PZ-r1)." },
    },
  });

  // LQ1: thêm số đo thanh khoản cho CTD (đang giữ, làn Chạy lãi); CAR không có điểm -> chữ cũ.
  withPzLq = () => { const d = withPz(); return { ...d, scores: [...d.scores.filter((s) => s.ticker !== "CTD"), { ticker: "CTD", rank: 50, Z: 0, alpha5Pct: null, pOutperform: 0.5, eligible: true, reason: null, close: 40000, advBn: 8.3, sigma20: 0.042, sectorKey: "2300", contributions: [],
    liq: { version: "LQ-v1", tier: "L3" as const, reasons: ["MED" as const, "P10" as const, "STRESS" as const], n20: 20, n60: 60, med20: 6.98, mean20: 8.28, p10: 0.052, min20: 0.34, max20: 22, density: 15, maxShare: 0.13, illiq: 0.56, stressDays: 1, capacityBn: 0.03, capitalMaxBn: 0.21, binding: "out" as const, impactPct: 1.1, dtl: 72 } }] }; };

  it("bảng chính chỉ còn mã trong nền / vùng mua; mã đang giữ đã nóng chuyển sang Chạy lãi, vẫn trong vốn", () => {
    render(<EliteHlBoard d={withPz()} onOpenTicker={() => {}} />);
    expect(screen.queryByTestId("hl-row-CTD")).toBeNull();
    expect(screen.getByTestId("hl-row-VJC")).toBeTruthy();
    expect(text("elite-portfolio")).toMatch(/trong nền và vùng mua \(1 mã\)/);
    expect(text("hl-runner-note")).toMatch(/1 mã đang giữ đã tăng nóng/);
    expect(text("hl-kpi-split")).toMatch(/Chính 15,0%.*Chạy lãi 9,1%.*Tiền mặt 75,9%/);
    expect(text("hl-kpi-lanes")).toBe("1 chính · 1 chạy lãi");
    expect(text("hl-row-VJC")).toMatch(/Vùng mua/); expect(text("hl-row-VJC")).toMatch(/\+2,0%/); expect(text("hl-row-VJC")).toMatch(/pivot 98\.000 · SEPA/);
    expect(text("hl-pz-mode")).toMatch(/CHỈ HIỂN THỊ/);
  });

  it("bảng Theo dõi chờ nền: nhóm Chạy lãi trước, Chờ nền sau; tiến độ dựng nền, còn thiếu, cao trào, mã vừa rời bảng", () => {
    render(<EliteHlBoard d={withPz()} onOpenTicker={() => {}} />);
    render(<Moved d={withPz()} />); // QĐ-R: quy tắc + sổ theo dõi đã chuyển sang tab 4
    expect(text("hl-watch-runners")).toMatch(/Chạy lãi \(1\)/); expect(text("hl-watch-waiting")).toMatch(/Chờ nền \(1\)/);
    expect(text("pz-row-CTD")).toMatch(/Tăng nóng/); expect(text("pz-row-CTD")).toMatch(/Cao trào/); expect(text("pz-row-CTD")).toMatch(/đang giữ 9,1%/);
    expect(text("pz-row-CTD")).toMatch(/5 độ đo vượt ngưỡng/);
    fireEvent.click(screen.getByTestId("pz-why-btn-CTD"));
    expect(screen.getAllByTestId("pz-hot-x2")[0].getAttribute("data-on")).toBe("1");
    expect(text("pz-row-CAR")).toMatch(/Hạ nhiệt/); expect(text("pz-row-CAR")).toMatch(/3\/4/); expect(text("pz-row-CAR")).toMatch(/Khối lượng 0,92/);
    expect(text("hl-watch-exits")).toMatch(/NAF.*Về vùng mua/);
    expect(text("hl-pz-changes")).toMatch(/Chuyển sang theo dõi: 1 mã.*CTD/);
    expect(text("hl-funnel")).toMatch(/Trong vùng mua/);
    expect(text("hl-rules")).toMatch(/Vị trí giá \(PZ-v2/); expect(text("hl-rules")).toMatch(/Cổng chưa bật/);
    expect(screen.getByTestId("hl-queue-ill-pz-HDA")).toBeTruthy();
  });

  it("Gateway chưa gửi vị trí giá -> trang như cũ (không có cột mới, không có bảng theo dõi)", () => {
    render(<EliteHlBoard d={decision} onOpenTicker={() => {}} />);
    expect(screen.queryByTestId("hl-watch")).toBeNull(); expect(screen.queryByTestId("hl-pz-mode")).toBeNull();
    expect(screen.getByTestId("hl-row-CTD")).toBeTruthy();
    expect(text("elite-portfolio")).toMatch(/Danh mục Elite HL \(2\/10\)/);
  });
});

describe("Elite HL — ghi chú K0 kèm kết quả HL-r2", () => {
  afterEach(() => cleanup());
  it("có hlR2 -> bảng trong mẫu / ngoài mẫu; không có -> chỉ ghi chú", () => {
    const k0 = { ...decision.hl!.k0, hlR2: { ranAt: "2026-11-14", decision: { period: "03/03/2014 → 31/12/2019", cagr: 0.161, maxDd: -0.303, excess20: 0.0113, t: 2.13, verdict: "CÓ LỢI THẾ" }, outOfSample: { period: "02/01/2020 → 18/05/2023", cagr: 0.008, maxDd: -0.527, excess20: -0.0107, t: -1.13 }, report: "r" } };
    render(<EliteHlBoard d={{ ...decision, hl: { ...decision.hl!, k0 } }} onOpenTicker={() => {}} />);
    render(<Moved d={{ ...decision, hl: { ...decision.hl!, k0 } }} />); // QĐ-R: quy tắc + sổ theo dõi đã chuyển sang tab 4
    const t = text("hl-k0-r2");
    expect(t).toMatch(/Quyết định.*\+16,1%.*−30,3%.*\+1,13% \(\+2,13\)/);
    expect(t).toMatch(/Ngoài mẫu.*\+0,8%.*−52,7%.*−1,07% \(−1,13\)/);
    cleanup();
    render(<EliteHlBoard d={decision} onOpenTicker={() => {}} />);
    render(<Moved d={decision} />); // QĐ-R: quy tắc + sổ theo dõi đã chuyển sang tab 4
    expect(screen.queryByTestId("hl-k0-r2")).toBeNull();
  });

  it("PFA-v1 pha B: nhãn cảnh báo theo vị thế, chỉ khi cùng phiên; không đổi danh mục", () => {
    pfaWarnings = { asOf: decision.date, tickers: { VJC: [{ id: "BENEISH", level: "warn", text: "Beneish M", source: "KQKD" }, { id: "KQKD_SOON", level: "info", text: "KQKD sắp có", source: "Lịch" }] } };
    render(<EliteHlBoard d={decision} onOpenTicker={() => {}} />);
    expect(text("hl-pfa-VJC")).toMatch(/⚠ Beneish.*ⓘ Sắp có KQKD/);
    expect(screen.queryByTestId("hl-pfa-CTD")).toBeNull();
    expect(document.querySelectorAll('[data-testid^="hl-row-"]').length).toBe(decision.portfolio.length);
    cleanup(); pfaWarnings = { ...pfaWarnings, asOf: "2026-11-01" };
    render(<EliteHlBoard d={decision} onOpenTicker={() => {}} />);
    expect(screen.queryByTestId("hl-pfa-VJC")).toBeNull();
    pfaWarnings = null;
  });
});

describe("LQ1 — huy hiệu thanh khoản trong bảng Theo dõi chờ nền", () => {
  it("mã đang giữ ở làn Chạy lãi có huy hiệu + cờ; mã chưa giữ có huy hiệu, không cờ; thiếu số đo -> giữ chữ GTGD cũ", () => {
    const base = withPzLq();
    render(<EliteHlBoard d={base} onOpenTicker={() => {}} />);
    const ctd = screen.getByTestId("pz-liq-CTD");
    expect(ctd.getAttribute("data-tier")).toBe("L3"); expect(ctd.textContent).toMatch(/L3GTGD 6,98 tỷmỏng⚠/);
    expect(ctd.getAttribute("title")).toMatch(/Đang giữ: 1 phiên giảm sâu mà cạn cầu/);
    expect(screen.getByTestId("pz-liq-CAR").textContent).toMatch(/^GTGD/);
  });
});

describe("PX0 — huy hiệu đợt pha loãng trên bảng Elite HL", () => {
  it("mã trong danh mục và mã ở bảng Theo dõi chờ nền có huy hiệu; mã không có đợt thì không", () => {
    const px = { phase: "POST_EX" as const, day: 3, listed: false, ex: "2026-11-11", cat: "STOCK" as const, ratio: 20, record: "2026-11-12", disclosed: "2026-11-02", listing: "2026-12-21", listingBasis: "ESTIMATED_OWN" as const, lag: 28, until: "2026-12-28", ownLag: 28, nOwn: 3 };
    const d = { ...withPzLq(), dilution: { version: "PX-v0", rules: {}, pxR1: { verdict: "KHÔNG ĐẠT", ranAt: "2026-11-18", period: "x", n: 520, mean30: -0.0057, t: -0.65, median30: -0.0134, half1: -0.0154, half2: 0.0042, superShare: 0.05, textVi: "PX-r1 KHÔNG ĐẠT" },
      byTicker: { VJC: px, CTD: { ...px, phase: "PRE_EX" as const, sessionsTo: 4 } } } };
    render(<EliteHlBoard d={d} onOpenTicker={() => {}} />);
    expect(text("hl-px-VJC")).toBe("HẬU GDKHQ · CP 20% · phiên 3/≈28");
    expect(text("pz-px-CTD")).toBe("SẮP GDKHQ · CP 20% · 4 phiên");
    expect(screen.queryByTestId("pz-px-CAR")).toBeNull();
  });
});

// QĐ-R (20/11/2026): quy tắc + sổ theo dõi + Cổng tiền mặt chuyển sang tab 4; bảng còn thẻ tóm tắt có nút; ba khối của Hồ sơ 360° vào khung "Mã đang chọn".
describe("QĐ-R — Bảng quyết định sau khi sắp xếp lại", () => {
  beforeEach(() => cleanup()); afterEach(() => cleanup());
  it("không còn khối Quy tắc / Sổ theo dõi; thẻ tóm tắt có số sổ; nút sang tab 4 chỉ khi Hub truyền callback", () => {
    const go = vi.fn();
    render(<EliteHlBoard d={decision} onOpenTicker={() => {}} onNavigateToEvidence={go} />);
    expect(screen.queryByTestId("hl-rules")).toBeNull(); expect(screen.queryByTestId("elite-ledger")).toBeNull();
    expect(text("hl-evidence-link-ledger")).toMatch(/5 phiên: chưa có phiên nào đủ kỳ hạn/);
    expect(text("hl-evidence-link")).toMatch(/tối đa 10 mã.*phân vị 60/);
    fireEvent.click(screen.getByTestId("hl-goto-evidence"));
    expect(go).toHaveBeenCalledTimes(1);
    cleanup();
    render(<EliteHlBoard d={decision} onOpenTicker={() => {}} />);
    expect(screen.queryByTestId("hl-goto-evidence")).toBeNull();
    expect(text("hl-evidence-link")).toMatch(/4\. Bằng chứng & sổ theo dõi/);
  });
  it("khung Mã đang chọn: mặc định mã giữ đầu tiên, đổi mã bằng chip; mô phỏng thời điểm chỉ dựng khi bấm", () => {
    const open = vi.fn();
    render(<EliteHlBoard d={decision} onOpenTicker={open} />);
    expect(text("hl-focus")).toMatch(/Mã đang chọn · VJC/);
    expect(screen.getByTestId("stub-to-VJC")).toBeTruthy(); expect(screen.getByTestId("stub-news-VJC")).toBeTruthy();
    expect(screen.queryByTestId("stub-sim-VJC")).toBeNull(); expect(screen.getByTestId("hl-focus-sim-off")).toBeTruthy();
    fireEvent.click(screen.getByTestId("hl-focus-sim-on"));
    expect(screen.getByTestId("stub-sim-VJC")).toBeTruthy();
    fireEvent.click(screen.getByTestId("hl-focus-pick-CTD"));
    expect(screen.getByTestId("stub-to-CTD")).toBeTruthy(); expect(screen.getByTestId("stub-sim-CTD")).toBeTruthy(); expect(screen.queryByTestId("stub-to-VJC")).toBeNull();
    fireEvent.click(screen.getByTestId("hl-focus-open"));
    expect(open).toHaveBeenCalledWith("CTD");
  });
  it("danh mục trống -> khung dùng mã đầu hàng chờ, ghi rõ", () => {
    render(<EliteHlBoard d={{ ...decision, portfolio: [] }} onOpenTicker={() => {}} />);
    expect(text("hl-focus-picks")).toMatch(/Danh mục trống — mã đầu hàng chờ/);
    expect(text("hl-focus")).toMatch(/Mã đang chọn · HDA/);
  });
});

// EC-1 (27/11/2026): nút "Chu kỳ →" mở mã ở Cycle Fingerprint (tab Ngành); không có điều hướng tab -> không hiện nút.
import { TabNavigationContext } from "../../../lib/TabNavigationContext";
import { useAppStore } from "../../../store/useAppStore";
describe("EliteHlBoard — Chu kỳ →", () => {
  it("bấm nút chọn mã ở Cycle Fingerprint và chuyển sang tab Ngành", () => {
    const go = vi.fn();
    render(<TabNavigationContext.Provider value={go}><EliteHlBoard d={decision} onOpenTicker={() => {}} /></TabNavigationContext.Provider>);
    fireEvent.click(screen.getByTestId("hl-cycle-btn-CTD"));
    expect(go).toHaveBeenCalledWith("Loc nganh");
    expect(useAppStore.getState().cycleFocus?.ticker).toBe("CTD");
    expect(useAppStore.getState().selectedTicker).toBe("CTD");
  });
  it("không có điều hướng tab -> không có nút", () => {
    cleanup();
    render(<EliteHlBoard d={decision} onOpenTicker={() => {}} />);
    expect(screen.queryByTestId("hl-cycle-btn-CTD")).toBeNull();
  });
});
