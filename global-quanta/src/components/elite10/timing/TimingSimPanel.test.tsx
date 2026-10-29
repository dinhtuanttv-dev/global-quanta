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
vi.mock("../../../hooks/elite10/useEsaSnapshot", () => ({ useEsaSnapshot: () => ({ esa: null, loading: false, error: null }) }));

import TimingSimPanel from "./TimingSimPanel";

const setWide = (on: boolean) => { window.matchMedia = ((q: string) => ({ matches: on, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia; };

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-29T03:00:00Z")); calls.length = 0; ohlcvCalls.length = 0; buyRows = []; setWide(false); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("TimingSimPanel", () => {
  it("cổ tức FPT: 9 đường + trung vị, GDKHQ ước tính 20/11, HÔM NAY ở phiên âm (trước sự kiện), cửa sổ v3", () => {
    render(<TimingSimPanel ticker="FPT" />);
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
    expect(screen.getByTestId("space-esa-summary").textContent).toMatch(/ESA ngày: \d+ phiên bất thường \/ \d+ phiên/);
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
