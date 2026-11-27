// PFA-v1 — Hồ sơ 360° · Doanh nghiệp & Sự kiện: thanh tiêu đề + 3 góc nhìn, góc Doanh nghiệp (KQKD, chất lượng lợi nhuận, cổ tức),
// góc Sự kiện (lịch KQKD, sự kiện đã công bố, TO-v1); tổ chức tài chính = không áp dụng; không điền số 0 giả.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "../../../test/rtl-lite";
import type { ProfileFa } from "../../../lib/elite10/profileFaTypes";

const base: ProfileFa = {
  version: "PFA-v1 (17/11/2026)", asOf: "2026-11-17", builtAt: "2026-11-17T10:20:00Z", ticker: "VJC",
  earnings: {
    available: true, quarter: "Q3/2026", published: "2026-11-02", publishedSource: "DISCLOSURE", tpl: "corp", financial: false,
    npatTtm: 2.204e12, npatYoY: { value: 0.0855, status: "NORMAL" }, coreYoY: { value: -0.0124, status: "NORMAL" }, topYoY: { value: 0.35, status: "NORMAL" },
    ytd: { value: 0.05, status: "NORMAL" }, ttmGrowth: { value: null, status: "TURNAROUND" }, roe: 0.0865, netMarginTtm: 0.0213, nonCoreShare: -1.95,
    piotroski: { score: 5, of: 9, tests: [{ id: "roa", label: "ROA dương", pass: true }, { id: "accrual", label: "CFO lớn hơn LNST", pass: false }] },
    beneish: { m: -1.26, flag: true }, altman: { z: 1.02, zone: "DISTRESS" }, accrual: 0.0041, cfoToNpat: 0.7519, kpi: { debtToEquity: 2.77, interestCover: 1.67, netDebtToEbitda: 7.72 },
    surprise: { sueNpat: 0.08, sueCore: -0.02 }, nowcast: { growth: 0.0292, est: 2.18e12, lo: 1.81e12, hi: 2.57e12, cumShare: 0.775 }, flags: ["M_FLAG", "Z_DISTRESS"], na: [],
    evidence: { prereg: "KQ-r1 (2026-11-06)", nowcast: { pass: true, label: "THĂM DÒ", ic: 0.047, p: 0.0005 }, sue: { pass: false, label: "MÔ TẢ", ic: 0.0398, p: 0.075 } },
  },
  calendar: { current: { label: "current", status: "REPORTED", date: "2026-11-02", expected: "2026-11-02", band: ["2026-10-30", "2026-11-23"], medianLag: 31, lateShare: 0.17, ownN: 6 },
    next: { label: "next", status: "UPCOMING", date: null, expected: "2027-02-01", band: ["2027-02-01", "2027-03-08"], medianLag: 32, lateShare: 0.17, ownN: 6 } },
  dividend: { available: true, price: 136500, yieldGross: 0, yieldNet: 0, ttmCash: 0, stockPct12m: 15, streak: 0, cagr3: null, cuts5: 0, years5: 0, payout: 0, fcfCover: null, history: [],
    exStudy: null, quality: null, fm: { version: "FM-v1", label: "MÔ TẢ", score: -0.4, groups: null, rank: 250, of: 280, quintile: 1 } },
  events: {
    upcoming: [{ cat: "CASH", group: "DIVIDEND", label: "Cổ tức tiền", title: null, disclosed: "2026-11-12", ex: "2026-11-26", record: "2026-11-27", pay: "2026-12-15", meeting: null, date: "2026-11-26", cash: 1000, ratio: null, leadDays: 14, sessionsAway: 7 }],
    recent: [], status: [{ cat: "WARNING", group: "STATUS", label: "Diện cảnh báo", title: null, disclosed: null, ex: null, record: null, pay: null, meeting: null, date: "2026-09-01", cash: null, ratio: null, leadDays: null, sessionsAway: null }],
  },
  to: { available: true, done: 2, hitRate: 0.5, events: [{ ex: "2026-06-26", disclosed: "2026-06-17", yield: 0.031, bucket: "3–5%", qualifies: false, entryDate: "2026-06-18", exitDate: "2026-06-25", excess: 0.012, postEx5: -0.02, runUp: 0.01 }] },
  warnings: [{ id: "BENEISH", level: "warn", text: "Beneish M -1.26 > −1,78 — cần soát", source: "KQKD Q3/2026" }, { id: "ALTMAN", level: "warn", text: "Altman Z″ 1.02 — vùng rủi ro", source: "KQKD Q3/2026" }, { id: "CASH_EX_SOON", level: "info", text: "GDKHQ cổ tức tiền 1.000đ sau khoảng 7 phiên (2026-11-26)", source: "Sự kiện doanh nghiệp" }],
};
let fa: ProfileFa | null = base;
const decision = { date: "2026-11-17", hl: { version: "E4-HL v1" }, portfolio: [{ ticker: "VJC", weight: 0.15, hl: { rank: 1, cls: "STRONG", exitBufferLs: 25 } }] };
vi.mock("../../../hooks/elite10/useProfileFa", () => ({ useProfileFa: () => ({ data: fa, error: null, isLoading: false }), useProfileFaWarnings: () => ({ data: null }) }));
const tlRow = (o: Record<string, unknown>) => ({ ticker: "VJC", kind: "EARNINGS", tier: "VALIDATED", status: "UPCOMING", eventLabel: "KQKD", eventDate: "2027-01-20", eventDateBasis: "ESTIMATED", windowId: "e1", windowLabel: "Trước KQKD", entryFrom: -10, entryTo: -8, exitOffset: 0, entryFromDate: "2027-01-05", entryToDate: "2027-01-07", exitDate: "2027-01-20", sessionsToEntry: 32, nEvents: 12, winRate: 0.75, probability: null, netExpectancy: 0.021, netExpectancyLcb: 0.004, fdrQValue: 0.04, decisionLevel: null, missing: [], ...o });
let tlRows: unknown[] = [tlRow({}), tlRow({ kind: "DIVIDEND", tier: "EXPLORATORY", windowId: "to", eventDateBasis: "ANNOUNCED", eventDate: "2026-11-26", entryFromDate: "2026-11-18", entryToDate: "2026-11-19", exitDate: "2026-11-25", status: "IN_WINDOW", fdrQValue: 1, missing: ["THĂM DÒ — chờ kiểm định tiến TO-r1"] }), tlRow({ ticker: "HPG" })];
vi.mock("../../../hooks/elite10/useEliteTiming", () => ({ useEliteTiming: () => ({ data: { rows: tlRows, counts: { validated: 2, near: 163, inWindow: 0, upcoming: 2 }, coverage: { universe: 281, decisions: 281, seasonality: 281 } }, sessions: [], loading: false }) }));
vi.mock("../../../hooks/elite10/useEliteDilution", () => ({ useEliteDilution: () => ({ data: null, error: null, isLoading: false }), usePxLedger: () => ({ data: null }) }));
vi.mock("../../../hooks/elite10/useEliteLiquidity", () => ({ useEliteLiquidity: () => ({ data: null, error: null, isLoading: false }) }));
// HS360-v3 H1: thanh đầu đọc thêm hồ sơ tín hiệu của mã (ngành, giá đóng cửa, nguồn thiếu); bảng quyết định thay được theo từng bài.
const H1 = vi.hoisted(() => ({ decision: null as unknown, panel: null as unknown, score: null as unknown }));
vi.mock("../../../hooks/elite10/useEliteCenter", () => ({ useEliteDecision: () => ({ data: H1.decision ?? decision }), useEliteTicker: () => ({ panel: H1.panel, decision: H1.score, isLoading: false, error: null }) }));

import ProfileHeader from "./ProfileHeader";
import CompanyProfileCard from "./CompanyProfileCard";
import EventsProfileCard from "./EventsProfileCard";

const text = (id: string) => screen.getByTestId(id).textContent ?? "";

describe("Hồ sơ 360° · PFA-v1", () => {
  beforeEach(() => { fa = base; H1.decision = null; H1.panel = null; H1.score = null; });
  afterEach(() => cleanup());

  it("thanh tiêu đề: vị thế Elite HL, số cảnh báo, công tắc 3 góc nhìn (bàn phím ← →)", () => {
    const onView = vi.fn();
    render(<ProfileHeader ticker="VJC" view="summary" onView={onView} />);
    expect(text("profile-header-position")).toMatch(/Trong danh mục Elite HL.*hạng hợp lưu 1.*Hợp lưu mạnh.*15,0%.*cách ngưỡng ra 25/);
    expect(text("profile-header-warn-count")).toMatch(/2 cảnh báo.*1 lưu ý/);
    expect(text("profile-header-warnings")).toMatch(/Beneish.*Altman rủi ro.*Sắp GDKHQ tiền/);
    expect(screen.getByTestId("profile-view-summary").getAttribute("aria-selected")).toBe("true");
    fireEvent.click(screen.getByTestId("profile-view-company")); expect(onView).toHaveBeenLastCalledWith("company");
    screen.getByTestId("profile-view-summary").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })); expect(onView).toHaveBeenLastCalledWith("events");
  });

  it("góc Doanh nghiệp: KQKD có ngày công bố thật, nowcast THĂM DÒ / SUE MÔ TẢ, Piotroski kèm từng phép thử, Beneish, Altman, không trả cổ tức tiền", () => {
    render(<CompanyProfileCard ticker="VJC" />);
    expect(text("pfa-earnings-published")).toMatch(/Công bố 02\/11\/2026 · tin công bố chính thức/);
    expect(text("pfa-npat-ttm")).toMatch(/2\.204 tỷ.*chuyển lãi/);
    expect(text("pfa-nowcast")).toMatch(/2\.180 tỷ.*\+2,9%.*THĂM DÒ/);
    expect(text("pfa-sue")).toMatch(/MÔ TẢ/);
    expect(text("pfa-piotroski")).toBe("5/9");
    expect(text("pfa-piotroski-tests")).toMatch(/✓ ROA dương.*✗ CFO lớn hơn LNST/);
    expect(text("pfa-beneish")).toMatch(/−1,26 ⚠|-1,26 ⚠/); expect(text("pfa-altman")).toMatch(/1,02 · rủi ro/);
    expect(text("pfa-no-cash")).toMatch(/Không trả cổ tức tiền.*cổ tức cổ phiếu 15%/);
    expect(text("pfa-fm")).toMatch(/hạng 250\/280 · nhóm 1\/5/);
    expect(text("pfa-warnings")).toMatch(/⚠ Beneish.*ⓘ GDKHQ/);
    expect(text("pfa-far1-BENEISH")).toMatch(/FA-r1 V3: chặn mua theo cờ này −0,52% . 20 phiên.*t [-−]2,32.*Ngược chiều/);
    expect(screen.queryByTestId("pfa-far1-CASH_EX_SOON")).toBeNull();
    expect(text("pfa-far1")).toMatch(/KHÔNG làm danh mục Elite HL tốt hơn.*KHÔNG ĐẠT/);
    expect(text("pfa-provenance")).toMatch(/khoá theo phiên 17\/11\/2026.*quý công bố sau phiên không được dùng/);
  });

  it("tổ chức tài chính: Piotroski / Beneish / Altman / dòng tiền KHÔNG ÁP DỤNG (không hiện số); quý công bố sau phiên -> lý do, không số", () => {
    fa = { ...base, earnings: { ...base.earnings!, tpl: "sec", financial: true, piotroski: null, beneish: null, altman: null, accrual: null, cfoToNpat: null }, warnings: [] };
    render(<CompanyProfileCard ticker="AAS" />);
    expect(text("pfa-quality-na")).toMatch(/chứng khoán.*không áp dụng/);
    expect(screen.queryByTestId("pfa-piotroski")).toBeNull();
    expect(text("pfa-warnings")).toMatch(/Không có cảnh báo/);
    cleanup();
    fa = { ...base, earnings: { available: false, reasonVi: "BCTC Q3/2026 công bố 2026-11-20, sau phiên 2026-11-17 — không dùng để tránh nhìn trước." } };
    render(<CompanyProfileCard ticker="VJC" />);
    expect(text("pfa-earnings-na")).toMatch(/sau phiên 2026-11-17/); expect(screen.queryByTestId("pfa-quality")).toBeNull();
  });

  it("góc Sự kiện: lịch KQKD, trạng thái giao dịch, sự kiện sắp tới có số phiên và độ trễ công bố, giải thích không chấm theo GDKHQ ước tính, TO-v1", () => {
    render(<EventsProfileCard ticker="VJC" />);
    expect(text("pfa-cal-current")).toMatch(/Đã công bố 02\/11\/2026.*31 ngày/);
    expect(text("pfa-cal-next")).toMatch(/Dự kiến 01\/02\/2027 – 08\/03\/2027/);
    expect(text("pfa-status")).toMatch(/Diện cảnh báo — 01\/09\/2026/);
    expect(text("pfa-upcoming-table")).toMatch(/26\/11\/2026.*Cổ tức tiền.*1\.000đ\/cp.*trả 15\/12\/2026.*12\/11\/2026 \(trước 14 ngày\).*~7 phiên/);
    expect(text("pfa-no-forecast")).toMatch(/không chấm điểm theo khoảng cách tới GDKHQ ước tính/);
    expect(text("pfa-to-summary")).toMatch(/2 lần đã đóng.*50%/);
    expect(text("pfa-to-table")).toMatch(/26\/06\/2026.*3,1%.*\+1,2%.*−2,0%/);
    expect(text("pfa-recent-table")).toMatch(/Không có sự kiện trong 120 ngày/);
  });

  it("T2 · Vùng Timeline của mã: chỉ đọc, đúng mã, bậc ĐẠT / THĂM DÒ, ngày ước tính được gắn nhãn, q của TO không hiện, ghi chú bằng chứng", () => {
    render(<EventsProfileCard ticker="VJC" />);
    const t = text("pfa-timeline");
    expect(screen.getByTestId("pfa-timeline-row-0")).toBeTruthy(); expect(screen.getByTestId("pfa-timeline-row-1")).toBeTruthy(); expect(screen.queryByTestId("pfa-timeline-row-2")).toBeNull();
    expect(text("pfa-timeline-row-0")).toMatch(/ĐẠT KIỂM ĐỊNH.*Mùa vụ KQKD.*sắp tới.*sau 32 phiên.*(ước tính).*12.*75%.*[+]2,1%.*[+]0,4%.*0,04/);
    expect(text("pfa-timeline-row-1")).toMatch(/THĂM DÒ.*Săn cổ tức TO-v1.*đang mở.*(đã công bố)/); expect(text("pfa-timeline-row-1")).not.toMatch(/1,00/);
    expect(t).toMatch(/2 vùng đạt kiểm định trên 281 mã/); expect(t).toMatch(/không phải tín hiệu mua/); expect(t).not.toMatch(/Mua ngay/);
    expect(text("pfa-timeline-missing")).toMatch(/chờ kiểm định tiến TO-r1/);
    cleanup(); tlRows = []; render(<EventsProfileCard ticker="VJC" />); expect(text("pfa-timeline-none")).toMatch(/không có vùng Timeline/);
  });
  it("mã ngoài bảng tín hiệu -> thông báo rõ, không dựng khung rỗng", () => {
    fa = { version: "PFA-v1", asOf: "2026-11-17", ticker: "VNINDEX", missing: true };
    render(<CompanyProfileCard ticker="VNINDEX" />); expect(text("pfa-missing")).toMatch(/không nằm trong bảng tín hiệu.*17\/11\/2026/);
    cleanup(); render(<EventsProfileCard ticker="VNINDEX" />); expect(screen.getByTestId("pfa-events-missing")).toBeTruthy();
  });
});

// HS360-v3 H1 (27/11/2026): thanh đầu hợp nhất — nguồn duy nhất của vị thế Elite HL, ngành, giá, nguồn thiếu, nút điều hướng.
describe("Hồ sơ 360° · H1 thanh đầu hợp nhất", () => {
  beforeEach(() => { fa = base; H1.decision = null; H1.panel = null; H1.score = null; });
  afterEach(() => cleanup());
  const hlDoc = {
    date: "2026-11-27", hl: { version: "E4-HL v1.1",
      queue: [{ ticker: "MWG", hlRank: 3, code: "wait", reasonVi: "Chờ phiên cân bằng đầu tuần kế tiếp" }],
      queueIlliquid: [{ ticker: "HDA", hlRank: 13, code: "illiquid", reasonVi: "Chưa giao dịch được: GTGD TB20 < 5 tỷ" }],
      against: [{ ticker: "VCB", hlRank: 2, rrgVi: "Suy yếu" }] },
    portfolio: [{ ticker: "VJC", weight: 0.15, hl: { rank: 1, cls: "STRONG", exitBufferLs: 25, pz: { state: "IN_BASE", lane: "CORE" } } }],
  };

  it("đang giữ: lớp, làn, tỷ trọng, cách ngưỡng ra; ngành + giá đóng cửa; nguồn thiếu ghi bằng chữ dễ đọc", () => {
    H1.decision = hlDoc;
    H1.panel = { date: "2026-11-27", ticker: "VJC", sector: "Hàng không", icb: null, values: {}, missingSources: ["researchFeatures", "strategies:camslim"] };
    H1.score = { ticker: "VJC", close: 101500 };
    render(<ProfileHeader ticker="VJC" view="summary" onView={() => {}} />);
    expect(text("profile-header-position")).toMatch(/Trong danh mục Elite HL.*hạng hợp lưu 1.*Hợp lưu mạnh.*Lõi.*15,0%.*cách ngưỡng ra 25/);
    expect(text("profile-header-sector")).toBe("Hàng không");
    expect(text("profile-header-price")).toContain("101.500");
    expect(text("profile-header-missing")).toMatch(/27\/11.*dòng tiền \(Stealth, IFE\).*bộ lọc camslim/);
  });

  it("ngoài danh mục: hàng chờ (kể cả chưa giao dịch được) nêu hạng + lý do Gateway; ngành phản đối; ngoài cả hàng chờ", () => {
    H1.decision = hlDoc;
    render(<ProfileHeader ticker="MWG" view="summary" onView={() => {}} />);
    expect(text("profile-header-position")).toMatch(/hàng chờ, hạng hợp lưu 3.*Chờ phiên cân bằng đầu tuần kế tiếp/);
    cleanup(); render(<ProfileHeader ticker="HDA" view="summary" onView={() => {}} />);
    expect(text("profile-header-position")).toMatch(/hạng hợp lưu 13.*GTGD TB20 < 5 tỷ/);
    cleanup(); render(<ProfileHeader ticker="VCB" view="summary" onView={() => {}} />);
    expect(text("profile-header-position")).toMatch(/ngành ở góc Suy yếu.*quy tắc không nhận/);
    cleanup(); render(<ProfileHeader ticker="HPG" view="summary" onView={() => {}} />);
    expect(text("profile-header-position")).toContain("Ngoài danh mục và hàng chờ Elite HL phiên này");
  });

  it("nút điều hướng: chart, Phòng họp AI, Chu kỳ; VNINDEX không có Phòng họp AI / Chu kỳ", () => {
    H1.decision = hlDoc;
    const chart = vi.fn(), ai = vi.fn(), cycle = vi.fn();
    render(<ProfileHeader ticker="VJC" view="summary" onView={() => {}} actions={{ onOpenChart: chart, onOpenAi: ai, onOpenCycle: cycle }} />);
    fireEvent.click(screen.getByTestId("elite-open-chart")); fireEvent.click(screen.getByTestId("profile-open-ai")); fireEvent.click(screen.getByTestId("profile-open-cycle"));
    expect([chart.mock.calls.length, ai.mock.calls.length, cycle.mock.calls.length]).toEqual([1, 1, 1]);
    cleanup();
    render(<ProfileHeader ticker="VNINDEX" view="summary" onView={() => {}} actions={{ onOpenChart: chart, onOpenAi: ai, onOpenCycle: cycle }} />);
    expect(screen.getByTestId("elite-open-chart")).toBeTruthy();
    expect(screen.queryByTestId("profile-open-ai")).toBeNull(); expect(screen.queryByTestId("profile-open-cycle")).toBeNull();
  });
});
