// HL-RADAR P1 (20/11/2026, tài liệu 20): lớp hiển thị trên bảng Danh mục Elite HL — dữ liệu thật 18/11 + tin / tín hiệu giả lập.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "../../../test/rtl-lite";
import fixture from "../../../lib/elite10/__fixtures__/deck-2026-11-18.json";
import type { EliteDecision } from "../../../lib/elite10/decisionTypes";

const d = fixture.decision as unknown as EliteDecision;
const NEWS = { items: [
  { id: "n1", title: "VPL công bố kết quả kinh doanh quý 3", summary: "", url: "https://example.com/n1", attachment: null, publishedAt: "2026-11-18T03:00:00Z", source: "CAFEF", sourceLabel: "CafeF", alsoIn: ["VIETSTOCK"], corroboration: 2, tickers: ["VPL"], eventType: "EARNINGS", eventLabel: "KQKD", sentiment: 0.6, sentimentHits: [], reaction: { sessions: 1, ret: 0.012, excess: 0.01, volumeRatio: 2.1, abnormal: { method: "x", sessions: 1, classification: "repricing" } }, insight: { tone: "up", text: "Lợi nhuận vượt kỳ vọng" }, importance: 80 },
  { id: "n2", title: "HSG giảm giá bán thép", summary: "", url: null, attachment: null, publishedAt: "2026-11-16T03:00:00Z", source: "VIETSTOCK", sourceLabel: "Vietstock", alsoIn: [], corroboration: 1, tickers: ["HSG"], eventType: "OTHER", eventLabel: "Khác", sentiment: -0.5, sentimentHits: [], reaction: null, insight: null, importance: 50 },
] };
const SIG = { items: { VIC: { stealth20: { on: true, z: 2.4, direction: 1, date: "2026-11-18" }, intent: { state: "acc", label: "Gom", p: 0.62, direction: 1, date: "2026-11-18" } } }, evidence: { STEALTH_20: { verdict: "edge" } } };
const ROWS = [{ id: "MSH:E", ticker: "MSH", sector: null, kind: "EARNINGS", tier: "VALIDATED", status: "IN_WINDOW", eventLabel: "KQKD", eventDate: "2026-11-25", eventDateBasis: "ESTIMATED", windowId: "e2", windowLabel: "E2 · trước KQKD",
  entryFrom: -5, entryTo: -2, exitOffset: 3, entryFromDate: "2026-11-17", entryToDate: "2026-11-20", exitDate: "2026-11-28", sessionsToEntry: 0, nEvents: 6, winRate: 0.67, probability: null, netExpectancy: 0.015, netExpectancyLcb: 0.002, fdrQValue: 0.7, decisionLevel: null, missing: [] }];
const newsCalls: string[][] = [];
vi.mock("../../../hooks/useSmartNews", () => ({ useSmartNews: (t: string[]) => { newsCalls.push(t); return { data: t.length ? NEWS : undefined, error: null, isLoading: false, enabled: true }; } }));
vi.mock("../../../hooks/useRadarSignals", () => ({ useRadarSignals: (t: string[]) => ({ data: t.length ? SIG : null, error: null, isLoading: false, enabled: true }) }));
let live: Record<string, { price: number; changePct: number | null }> = { VPL: { price: 96500, changePct: 0.8 } };
vi.mock("../../../store/useAppStore", () => ({ useAppStore: (sel: (s: unknown) => unknown) => sel({ livePrices: live }) }));
vi.mock("../../../hooks/elite10/useDeckData", () => ({ useDeckRisk: () => ({ data: fixture.risk }), useDeckPanel: () => ({ data: fixture.panel }), useEvidenceRegistry: () => ({ data: null }) }));
vi.mock("../../../hooks/useWorldStrategy", () => ({ useWorldStrategy: () => ({ data: { short: { rows: [] }, regime: fixture.world.regime } }) }));
vi.mock("../../../hooks/elite10/useHlLedger", () => ({ useHlLedger: () => ({ data: null }) }));
vi.mock("../../../hooks/elite10/useEliteTiming", () => ({ useEliteTiming: () => ({ data: { rows: ROWS }, sessions: [], meta: null, loading: false, error: null }) }));
vi.mock("../../../hooks/useGatewayBuyTimeline", () => ({ buyTimingFreshness: () => null }));
vi.mock("swr", () => ({ default: () => ({ data: undefined }) }));
vi.mock("./CashGateCard", () => ({ default: () => null }));
vi.mock("./ToTickerCard", () => ({ default: () => null }));
vi.mock("../timing/TimingSimPanel", () => ({ default: () => null }));
vi.mock("../news/EliteNewsPanel", () => ({ default: () => null }));
vi.mock("../../../hooks/elite10/useProfileFa", () => ({ useProfileFaWarnings: () => ({ data: null }) }));
import EliteHlBoard from "./EliteHlBoard";

const row = (t: string) => screen.getByTestId(`hl-row-${t}`);
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-11-18T08:00:00Z")); newsCalls.length = 0; window.localStorage.clear(); });
afterEach(() => { cleanup(); vi.useRealTimers(); live = { VPL: { price: 96500, changePct: 0.8 } }; });

describe("HL-RADAR P1 — lớp hiển thị trên bảng Danh mục Elite HL", () => {
  it("một lệnh tin cho cả 7 mã đang giữ; tin nóng -> vòng nhấp nháy; cảm xúc -> vạch mép trái xanh / đỏ; mã không tin -> không vạch", () => {
    render(<EliteHlBoard d={d} onOpenTicker={() => {}} />);
    expect(newsCalls[newsCalls.length - 1]!.slice().sort()).toEqual(["AAS", "HSG", "MSH", "VCP", "VIC", "VJC", "VPL"]);
    expect(screen.getByTestId("hl-hot-VPL").getAttribute("class")).toContain("radar-pulse");
    expect(row("VPL").getAttribute("style")).toMatch(/inset 3px 0px 0px|inset 3px 0 0/);
    expect(row("HSG").getAttribute("style")).toMatch(/inset 3px/);
    expect(row("VPL").getAttribute("style")).not.toBe(row("HSG").getAttribute("style"));
    expect(row("AAS").getAttribute("style")).toBeNull();
    expect(screen.queryByTestId("hl-hot-HSG")).toBeNull(); // tin 16/11, quan trọng 50 -> không nóng
  });
  it("◆ Stealth 20 (đặc = đã kiểm định), vòng ⏱ điểm mua (trong vùng -> nhấp nháy), giá trong phiên", () => {
    render(<EliteHlBoard d={d} onOpenTicker={() => {}} />);
    expect(screen.getByTestId("hl-stealth-VIC").getAttribute("fill")).toBe("#34d399");
    const ring = screen.getByTestId("hl-badge-MSH").querySelector("[data-buy-ring]")!;
    expect(ring.getAttribute("data-buy-ring")).toBe("in"); expect(ring.getAttribute("class")).toContain("radar-buy-pulse");
    expect(screen.getByTestId("hl-live-VPL").textContent).toMatch(/trong phiên 96\.500 \+0,80%/);
    expect(screen.queryByTestId("hl-live-AAS")).toBeNull();
  });
  it("thẻ rê: tin nổi bật, số nguồn, phản ứng ESA, nhận định, MÔ TẢ, ngưỡng; HMM ghi 'chỉ tham khảo'; không chữ khuyến nghị", () => {
    render(<EliteHlBoard d={d} onOpenTicker={() => {}} />);
    fireEvent.click(screen.getByTestId("hl-badge-VPL").querySelector("button")!);
    const tip = screen.getByTestId("hl-tip-VPL").textContent ?? "";
    expect(tip).toMatch(/MÔ TẢ/); expect(tip).toMatch(/VPL công bố kết quả kinh doanh quý 3/); expect(tip).toMatch(/2 nguồn/);
    expect(tip).toMatch(/Phản ứng giá: Định giá lại/); expect(tip).toMatch(/Lợi nhuận vượt kỳ vọng/); expect(tip).toMatch(/Không đổi hạng, tỷ trọng hay ngưỡng ra/);
    fireEvent.click(screen.getByTestId("hl-badge-VIC").querySelector("button")!);
    expect(screen.getByTestId("hl-tip-VIC").textContent).toMatch(/Stealth 20: tích luỹ âm thầm.*đã kiểm định có lợi thế.*Ý đồ HMM: Gom 62% — chỉ tham khảo/);
    for (const bad of [/mua ngay/i, /nên mua/i, /chắc thắng/i]) expect(screen.getByTestId("elite-portfolio").textContent).not.toMatch(bad);
  });
  it("tắt lớp Tin -> không gọi tin, không vòng nóng, không vạch; nhớ theo trình duyệt", () => {
    render(<EliteHlBoard d={d} onOpenTicker={() => {}} />);
    fireEvent.click(screen.getByTestId("hl-layer-news"));
    expect(newsCalls[newsCalls.length - 1]).toEqual([]);
    expect(screen.queryByTestId("hl-hot-VPL")).toBeNull(); expect(row("VPL").getAttribute("style")).toBeNull();
    expect(JSON.parse(window.localStorage.getItem("gq.hl.layers.v1")!).news).toBe(false);
    cleanup(); render(<EliteHlBoard d={d} onOpenTicker={() => {}} />);
    expect(screen.getByTestId("hl-layer-news").getAttribute("aria-pressed")).toBe("false");
  });
  it("giá đổi -> lóe màu; trở lại sau 0,6 giây", () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] }); vi.setSystemTime(new Date("2026-11-18T08:00:00Z"));
    const { rerender } = render(<EliteHlBoard d={d} onOpenTicker={() => {}} />);
    live = { VPL: { price: 97000, changePct: 1.3 } };
    rerender(<EliteHlBoard d={d} onOpenTicker={() => {}} />);
    expect(screen.getByTestId("hl-live-VPL").getAttribute("class")).toContain("bg-emerald-400/25");
  });
});

// HL-RADAR P2 (20/11/2026): cột "Tin & tác động 14 ngày", chip lọc hiển thị, thông báo tuỳ chọn.
describe("HL-RADAR P2 — Tin & tác động 14 ngày, lọc hiển thị, thông báo", () => {
  it("cột tin: tiêu đề có MÔ TẢ; VPL 1 chấm có vòng nổi bật + viền đôi (2 nguồn), ESA 'Định giá lại', ▲; HSG cảm xúc âm; mã không tin ghi rõ", () => {
    render(<EliteHlBoard d={d} onOpenTicker={() => {}} />);
    expect(screen.getByTestId("hl-news-th").textContent).toMatch(/Tin & tác động 14 ngày.*MÔ TẢ/);
    const vpl = screen.getByTestId("hl-news-VPL");
    expect(vpl.querySelectorAll("[data-news-dot]").length).toBe(1);
    expect(vpl.querySelectorAll("circle").length).toBe(3); // vòng nổi bật + viền đôi + chấm
    expect(vpl.querySelector("a")!.getAttribute("href")).toBe("https://example.com/n1");
    expect(screen.getByTestId("hl-news-sum-VPL").textContent).toMatch(/1 tin · cảm xúc 3 ngày \+0,60 · tin nóng.*Định giá lại.*▲/);
    expect(screen.getByTestId("hl-news-sum-HSG").textContent).toMatch(/1 tin · cảm xúc 3 ngày −0,50/);
    expect(screen.getByTestId("hl-news-sum-AAS").textContent).toBe("Không có tin trong 14 ngày");
  });
  it("lọc 'có tin nóng 24h' -> chỉ còn VPL, ghi 'Đang hiện 1/6 mã'; bỏ lọc -> đủ 6 dòng; thứ tự không đổi", () => {
    render(<EliteHlBoard d={d} onOpenTicker={() => {}} />);
    const order = () => [...screen.getByTestId("elite-portfolio").querySelectorAll('tr[data-testid^="hl-row-"]')].map((r) => r.getAttribute("data-testid"));
    const before = order();
    fireEvent.click(screen.getByTestId("hl-filter-hot"));
    expect(order()).toEqual(["hl-row-VPL"]); expect(screen.getByTestId("hl-filter-count").textContent).toBe("Đang hiện 1/6 mã");
    fireEvent.click(screen.getByTestId("hl-filter-hot"));
    expect(order()).toEqual(before); expect(before.length).toBe(6);
  });
  it("thông báo tin nóng mặc định TẮT; tắt mọi lớp tin / điểm mua / dòng tiền -> không còn chip lọc", () => {
    render(<EliteHlBoard d={d} onOpenTicker={() => {}} />);
    expect(screen.getByTestId("hl-notify").getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByTestId("hl-notify").textContent).toMatch(/Thông báo tin nóng: tắt/);
    for (const k of ["news", "buy", "signals"]) fireEvent.click(screen.getByTestId(`hl-layer-${k}`));
    expect(screen.queryByTestId("hl-filters")).toBeNull(); expect(screen.queryByTestId("hl-news-th")).toBeNull();
  });
});

// HL-RADAR P3 (20/11/2026): lớp tác động mở rộng dưới dòng (khối Tác động lên cổ phiếu của Hồ sơ 360°, tải khi mở).
describe("HL-RADAR P3 — lớp tác động", () => {
  it("chưa mở -> không có dòng tác động; bấm 'Tác động' -> dòng mở rộng đúng mã, phủ đủ cột; bấm lại -> đóng; tắt lớp -> không có nút", () => {
    render(<EliteHlBoard d={d} onOpenTicker={() => {}} />);
    expect(screen.queryByTestId("hl-impact-row-VJC")).toBeNull();
    fireEvent.click(screen.getByTestId("hl-impact-btn-VJC"));
    const row = screen.getByTestId("hl-impact-row-VJC");
    expect(row.querySelector("td")!.getAttribute("colspan")).toBe("13"); // 12 cột (PZ-v2) + cột Tin
    expect(row.previousElementSibling!.getAttribute("data-testid")).toBe("hl-row-VJC");
    fireEvent.click(screen.getByTestId("hl-impact-btn-VJC"));
    expect(screen.queryByTestId("hl-impact-row-VJC")).toBeNull();
    fireEvent.click(screen.getByTestId("hl-layer-impact"));
    expect(screen.queryByTestId("hl-impact-btn-VJC")).toBeNull();
  });
});
