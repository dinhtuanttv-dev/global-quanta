// CH2 — panel "⏱ Mô phỏng thời điểm vào" (Hồ sơ 360°) trên dữ liệu thật FPT: đường từng đợt + trung vị, cửa sổ v3, con trỏ HÔM NAY
// theo lịch phiên, trạng thái ước tính / xác nhận, đổi loại sự kiện, mặc định theo Timeline điểm mua (D5), trạng thái rỗng.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "../../../test/rtl-lite";
import div from "../../../lib/elite10/__fixtures__/event-study-FPT-dividend.json";
import earn from "../../../lib/elite10/__fixtures__/event-study-FPT-earnings.json";
import fptBars from "../../../lib/elite10/__fixtures__/ohlcv-FPT-5y.json";
import vniBars from "../../../lib/elite10/__fixtures__/ohlcv-VNINDEX-5y.json";

let buyRows: Record<string, unknown>[] = [];
// Dòng Timeline thật của FPT ngày 29/10/2026 (Gateway /api/elite/buy-timing).
const FPT_TL = { id: "FPT:DIV:w3:2026-11-20", ticker: "FPT", sector: "Công nghệ TT", kind: "DIVIDEND", tier: "NEAR", eventLabel: "GDKHQ", eventDate: "2026-11-20",
  eventDateBasis: "ESTIMATED", windowId: "w3", windowLabel: "W3 · Trước GDKHQ (an toàn)", entryFrom: -25, entryTo: -15, exitOffset: 3, nEvents: 9, winRate: 0.7777,
  probability: null, netExpectancy: 0.0244, netExpectancyLcb: 0.0098, fdrQValue: 0.1027, decisionLevel: "AVOID", missing: ["q-value 0.10 > 0.1"], status: "IN_WINDOW",
  entryFromDate: "2026-10-16", entryToDate: "2026-10-30", exitDate: "2026-11-25", sessionsToEntry: 0 };
const calls: string[] = [];
vi.mock("../../../hooks/elite10/useEventStudy", () => ({
  useEventStudy: (ticker: string, kind: string) => {
    calls.push(`${ticker}:${kind}`);
    if (ticker === "VNINDEX") return { es: null, emptyReason: "Không đủ dữ liệu giá / lịch sử cổ tức cho mã này.", loading: false, error: null };
    return { es: kind === "DIVIDEND" ? div : earn, emptyReason: null, loading: false, error: null };
  },
}));
vi.mock("../../../hooks/useGatewayBuyTimeline", () => ({
  useGatewayBuyTimeline: () => ({ data: { rows: buyRows }, sessions: [], meta: null, loading: false, error: null }),
  buyTimingFreshness: () => ({ text: "Gateway tự tính · dữ liệu 29/10", stale: false }),
}));
const ohlcvCalls: (string | null)[] = [];
vi.mock("../../../hooks/useOhlcvData", () => ({ useOhlcvData: (t: string | null) => { ohlcvCalls.push(t); return { bars: t === "VNINDEX" ? vniBars : t ? fptBars : [], isLoading: false, error: null }; } }));
vi.mock("../../../hooks/elite10/useAdjustedDaily", () => ({ useAdjustedDaily: (t: string | null) => { ohlcvCalls.push(t); return { bars: t ? fptBars : [], corporateActions: [{ date: "2026-09-21", factor: 0.909091, label: "Thưởng CP 10%" }], priceBasis: "ADJUSTED_CUMULATIVE", isLoading: false, error: null }; } }));
const esaCalls: (string | null)[] = [];
const SINCE = { status: "research_only", sinceIso: "2026-10-29T03:00:00Z", reason: null, sinceMinute: "10:00", observedMinute: "10:00", currentVolume: 2_480_000,
  medianSameWindow: 800_000, p90SameWindow: 1_300_000, relativeVolume: 3.1, robustZ: 5.6, priceChangeSincePct: 1.8, sampleSize: 118,
  alert: { severity: "high_anomaly", triggeredBy: ["same_window_relative_volume>=2", "robust_z>=3"] } };
let sinceOn = false;
vi.mock("../../../hooks/elite10/useEsaSnapshot", () => ({
  useEsaSnapshot: (_t: string, _on: boolean, since: string | null = null) => { esaCalls.push(since); return { esa: since && sinceOn ? { status: "research_only", sinceNews: SINCE } : null, loading: false, error: null }; },
}));
let newsItems: Record<string, unknown>[] = [];
vi.mock("../../../hooks/useSmartNews", () => ({ useSmartNews: (t: string[]) => ({ data: t.length ? { items: newsItems } : undefined, error: null, isLoading: false, enabled: true }) }));
let liveQuote: Record<string, unknown> | null = null;
vi.mock("../../../hooks/elite10/useLiveDaily", () => ({ useLiveDaily: () => ({ quote: liveQuote, index: liveQuote ? { code: "VNINDEX", value: 1760, totalValue: 1.2e13 } : null, status: { session: "LO" }, sessionLive: Boolean(liveQuote) }) }));
const NEWS_TODAY = { id: "n1", title: "FPT ký hợp đồng 200 triệu USD", summary: "", url: "https://example.com/n1", attachment: null, publishedAt: "2026-10-29T03:00:00Z",
  source: "CAFEF", sourceLabel: "CafeF", alsoIn: [], corroboration: 1, tickers: ["FPT"], eventType: "CONTRACT", eventLabel: "Hợp đồng", sentiment: 0.6, sentimentHits: [],
  reaction: null, insight: null, importance: 70 };

import TimingSimPanel from "./TimingSimPanel";

const setWide = (on: boolean) => { window.matchMedia = ((q: string) => ({ matches: on, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia; };

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-29T03:00:00Z")); calls.length = 0; ohlcvCalls.length = 0; buyRows = []; setWide(false); window.localStorage.clear(); esaCalls.length = 0; sinceOn = false; newsItems = []; liveQuote = null; });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("TimingSimPanel", () => {
  it("cổ tức FPT: 9 đường + trung vị, GDKHQ ước tính 20/11, HÔM NAY ở phiên âm (trước sự kiện), cửa sổ v3", () => {
    render(<TimingSimPanel ticker="FPT" />);
    fireEvent.click(screen.getByTestId("hist-preset-all"));
    expect(screen.getAllByTestId("event-study-path")).toHaveLength(9);
    expect(screen.getByTestId("event-study-median")).toBeTruthy();
    const up = screen.getByTestId("timing-sim-upcoming").textContent ?? "";
    expect(up).toContain("20/11/2026");
    expect(up).toContain("ƯỚC TÍNH");
    expect(up).toMatch(/hôm nay ở phiên −?-1[0-9]/);
    expect(screen.getByTestId("event-study-today").textContent).toMatch(/HÔM NAY \(-1[0-9]\)/);
    expect(screen.getByTestId("event-study-window")).toBeTruthy();
    expect(document.querySelectorAll("[role=option]").length).toBe(div.windows.length);
  });

  it("đổi sang KQKD: dùng nghiên cứu sự kiện KQKD Q3 (6 kỳ); chọn cửa sổ khác cập nhật vùng mua", () => {
    render(<TimingSimPanel ticker="FPT" />);
    fireEvent.click(screen.getByTestId("timing-kind-EARNINGS"));
    expect(calls[calls.length - 1]).toBe("FPT:EARNINGS");
    fireEvent.click(screen.getByTestId("hist-preset-all"));
    expect(screen.getAllByTestId("event-study-path")).toHaveLength(6);
    expect(screen.getByTestId("timing-sim-upcoming").textContent).toContain("Công bố KQKD Q3");
    const opt = document.querySelectorAll("[role=option]")[1] as HTMLElement;
    fireEvent.click(opt);
    expect(opt.getAttribute("aria-selected")).toBe("true");
  });

  it("mặc định theo Timeline điểm mua (D5): mã có vùng mua KQKD gần nhất -> mở KQKD", () => {
    buyRows = [{ ...FPT_TL, id: "e", kind: "EARNINGS", status: "UPCOMING", sessionsToEntry: 3 }, { ...FPT_TL, status: "UPCOMING", sessionsToEntry: 9 }];
    render(<TimingSimPanel ticker="FPT" />);
    expect(screen.getByTestId("timing-kind-EARNINGS").getAttribute("aria-pressed")).toBe("true");
  });

  it("chỉ số / mã chưa đủ dữ liệu -> thông báo rỗng, không vẽ chart", () => {
    render(<TimingSimPanel ticker="VNINDEX" />);
    expect(screen.getByTestId("timing-sim-empty").textContent).toContain("Không đủ dữ liệu");
    expect(screen.queryByTestId("event-study-chart")).toBeNull();
  });
});

describe("TimingSimPanel — mốc đã qua", () => {
  it("KQKD dự kiến đã qua ngày (24/10 < 29/10) -> ghi 'kỳ gần nhất', không ghi 'sắp tới'", () => {
    render(<TimingSimPanel ticker="FPT" />);
    fireEvent.click(screen.getByTestId("timing-kind-EARNINGS"));
    const t = screen.getByTestId("timing-sim-upcoming").textContent ?? "";
    expect(t).toContain("kỳ gần nhất");
    expect(t).not.toContain("sắp tới");
    expect(t).toContain("đã qua");
  });
});

describe("TimingSimPanel — Timeline điểm mua + 3D", () => {
  it("dòng Timeline FPT: ĐANG TRONG VÙNG MUA, ngày vào/thoát thật, GẦN ĐẠT + lý do; cửa sổ mặc định = cửa sổ Timeline (w3)", () => {
    buyRows = [FPT_TL];
    render(<TimingSimPanel ticker="FPT" />);
    const t = screen.getByTestId("timing-timeline").textContent ?? "";
    expect(t).toContain("ĐANG TRONG VÙNG MUA");
    expect(t).toContain("16/10/2026 → 30/10/2026");
    expect(t).toContain("25/11/2026");
    expect(t).toContain("GẦN ĐẠT");
    expect(t).toContain("q-value 0.10 > 0.1");
    expect(screen.getByTestId("timing-window-w3").getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("timing-window-w3").textContent).toContain("TIMELINE");
    // 2D: nhãn vùng mua mang ngày thật của Timeline
    expect(screen.getByTestId("event-study-window").textContent).toContain("16/10–30/10");
    expect(screen.getByTestId("event-study-window").textContent).toContain("THOÁT 25/11");
  });

  it("không có dòng Timeline -> nói rõ lý do, không bịa vùng mua", () => {
    render(<TimingSimPanel ticker="FPT" />);
    expect(screen.getByTestId("timing-timeline-empty").textContent).toContain("chưa có vùng mua cổ tức cho FPT");
  });

  it("2D mặc định trên màn hẹp: đường kỳ tới + quạt dự phóng + thẻ dự phóng; bật 3D -> không gian 4D có bảng số liệu", () => {
    buyRows = [FPT_TL];
    render(<TimingSimPanel ticker="FPT" />);
    expect(ohlcvCalls.slice(-2)).toEqual(["FPT", "VNINDEX"]);
    expect(screen.getByTestId("event-study-current-derived")).toBeTruthy();
    expect(screen.getByTestId("event-study-fan")).toBeTruthy();
    const card = screen.getByTestId("analog-fan-card").textContent ?? "";
    expect(card).toContain("Tới THOÁT (phiên +3)");
    expect(card).toMatch(/P\(lãi ròng > 0 nếu mua hôm nay\): \d+%/);
    expect(card).toMatch(/thô \d+% → sau hiệu chỉnh CQR \d+%/);
    fireEvent.click(screen.getByTestId("timing-view-3D"));
    expect(screen.getByTestId("timing-space-3d")).toBeTruthy();
    expect(screen.getByTestId("space-esa-summary").textContent).toMatch(/ESA ngày \(đã trừ thị trường\): \d+ phiên bất thường \/ \d+ phiên/);
    const rows = screen.getByTestId("space-table").querySelectorAll("tbody tr");
    expect(rows.length).toBe(10); // 9 đợt + kỳ tới
    expect(screen.queryByTestId("event-study-chart")).toBeNull();
  });
});

describe("TimingSimPanel — màn rộng", () => {
  it("màn ≥ 768 px mở thẳng 3D · 4D; chuyển 2D được", () => {
    setWide(true);
    render(<TimingSimPanel ticker="FPT" />);
    expect(screen.getByTestId("timing-view-3D").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("timing-space-3d")).toBeTruthy();
    fireEvent.click(screen.getByTestId("timing-view-2D"));
    expect(screen.getByTestId("event-study-chart")).toBeTruthy();
  });
});

describe("TimingSimPanel — N4 đường lịch sử", () => {
  const paths = () => document.querySelectorAll("[data-testid=event-study-path]").length;
  it("mặc định: 3 đợt giống nhất (trọng số analog) + trung vị; thống kê vẫn trên đủ 9 đợt", () => {
    render(<TimingSimPanel ticker="FPT" />);
    expect(paths()).toBe(3);
    expect(screen.getByTestId("hist-preset-analog3").getAttribute("aria-pressed")).toBe("true");
    // FPT 29/10: nặng nhất 01/12/25 (20%), 12/06/25 (19%), 28/05/26 (16%)
    for (const d of ["2025-12-01", "2025-06-12", "2026-05-28"]) expect(screen.getByTestId(`hist-event-${d}`).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("hist-event-2022-06-13").getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByTestId("history-toggles").textContent).toContain("đang hiện 3/9 đợt");
    expect(screen.getByTestId("event-study-median")).toBeTruthy();
    expect(screen.getByTestId("timing-window-w3").textContent).toContain("7/9 thắng");
  });
  it("bấm từng đợt -> tự chọn; Ẩn lịch sử -> 0 đường, vẫn còn trung vị + quạt", () => {
    render(<TimingSimPanel ticker="FPT" />);
    fireEvent.click(screen.getByTestId("hist-event-2022-06-13"));
    expect(paths()).toBe(4);
    expect(screen.getByTestId("history-toggles").textContent).toContain("tự chọn");
    fireEvent.click(screen.getByTestId("hist-preset-none"));
    expect(paths()).toBe(0);
    expect(screen.getByTestId("event-study-median")).toBeTruthy();
    expect(screen.getByTestId("event-study-fan")).toBeTruthy();
  });
  it("bộ chọn nhanh được nhớ theo trình duyệt", () => {
    const r = render(<TimingSimPanel ticker="FPT" />);
    fireEvent.click(screen.getByTestId("hist-preset-wins"));
    expect(window.localStorage.getItem("elite10:timing-hist-preset")).toBe("wins");
    expect(paths()).toBe(7); // w3: 7/9 đợt thắng
    r.unmount?.(); cleanup();
    render(<TimingSimPanel ticker="FPT" />);
    expect(screen.getByTestId("hist-preset-wins").getAttribute("aria-pressed")).toBe("true");
  });
});

describe("TimingSimPanel — N3 nến ngày thời gian thực + N2 vòng sáng ESA từ tin", () => {
  it("dải nến ngày: nến hôm nay từ luồng giá (đang hình thành), cờ tin tại phiên phản ứng", () => {
    liveQuote = { symbol: "FPT", price: 53100, open: 52800, high: 53400, low: 52500, totalVolume: 4_200_000, totalValue: 222e9 };
    newsItems = [NEWS_TODAY];
    render(<TimingSimPanel ticker="FPT" />);
    expect(screen.getByTestId("live-daily-strip")).toBeTruthy();
    expect(screen.getByTestId("live-candle-today").textContent).toContain("đang hình thành");
    expect(screen.getByTestId("live-daily-strip").textContent).toContain("TRỰC TIẾP");
    expect(document.querySelectorAll("[data-testid=live-candle]").length).toBeGreaterThan(50);
    expect(document.querySelectorAll("[data-testid=live-news-flag]").length).toBe(1);
  });
  it("tin trong phiên hôm nay -> gọi ESA từ lúc ra tin; đột biến -> vòng sáng; bấm -> bảng khối lượng đột biến", () => {
    newsItems = [NEWS_TODAY]; sinceOn = true;
    render(<TimingSimPanel ticker="FPT" />);
    expect(esaCalls).toContain("2026-10-29T03:00:00Z");
    const ring = screen.getByTestId("esa-news-ring");
    expect(ring.querySelector(".esa-ring-glow")).toBeTruthy();
    expect(screen.queryByTestId("esa-since-popover")).toBeNull();
    fireEvent.click(ring);
    const pop = screen.getByTestId("esa-since-popover").textContent ?? "";
    expect(pop).toContain("KHỐI LƯỢNG ĐỘT BIẾN SAU TIN · MỨC CAO");
    expect(pop).toContain("FPT ký hợp đồng 200 triệu USD");
    expect(pop).toContain("Từ 10:00 (ra tin)");
    expect(pop).toContain("3.10×");
    expect(pop).toContain("+5.60");
    expect(pop).toContain("118 phiên");
  });
  it("không có tin trong phiên -> không gọi ESA theo tin, không có vòng sáng", () => {
    newsItems = [{ ...NEWS_TODAY, publishedAt: "2026-10-27T03:00:00Z" }];
    render(<TimingSimPanel ticker="FPT" />);
    expect(esaCalls.every((x) => x === null)).toBe(true);
    expect(screen.queryByTestId("esa-news-ring")).toBeNull();
  });
});
