// CH2 — panel "⏱ Mô phỏng thời điểm vào" (Hồ sơ 360°) trên dữ liệu thật FPT: đường từng đợt + trung vị, cửa sổ v3, con trỏ HÔM NAY
// theo lịch phiên, trạng thái ước tính / xác nhận, đổi loại sự kiện, mặc định theo Timeline điểm mua (D5), trạng thái rỗng.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "../../../test/rtl-lite";
import div from "../../../lib/elite10/__fixtures__/event-study-FPT-dividend.json";
import earn from "../../../lib/elite10/__fixtures__/event-study-FPT-earnings.json";

let buyRows: { ticker: string; kind: string; status: string; sessionsToEntry: number }[] = [];
const calls: string[] = [];
vi.mock("../../../hooks/elite10/useEventStudy", () => ({
  useEventStudy: (ticker: string, kind: string) => {
    calls.push(`${ticker}:${kind}`);
    if (ticker === "VNINDEX") return { es: null, emptyReason: "Không đủ dữ liệu giá / lịch sử cổ tức cho mã này.", loading: false, error: null };
    return { es: kind === "DIVIDEND" ? div : earn, emptyReason: null, loading: false, error: null };
  },
}));
vi.mock("../../../hooks/useGatewayBuyTimeline", () => ({ useGatewayBuyTimeline: () => ({ data: { rows: buyRows }, sessions: [], meta: null, loading: false, error: null }) }));

import TimingSimPanel from "./TimingSimPanel";

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-29T03:00:00Z")); calls.length = 0; buyRows = []; });
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
    buyRows = [{ ticker: "FPT", kind: "EARNINGS", status: "UPCOMING", sessionsToEntry: 3 }, { ticker: "FPT", kind: "DIVIDEND", status: "UPCOMING", sessionsToEntry: 9 }];
    render(<TimingSimPanel ticker="FPT" />);
    expect(screen.getByTestId("timing-kind-EARNINGS").getAttribute("aria-pressed")).toBe("true");
  });

  it("chỉ số / mã chưa đủ dữ liệu -> thông báo rỗng, không vẽ chart", () => {
    render(<TimingSimPanel ticker="VNINDEX" />);
    expect(screen.getByTestId("timing-sim-empty").textContent).toContain("Không đủ dữ liệu");
    expect(screen.queryByTestId("event-study-chart")).toBeNull();
  });
});
