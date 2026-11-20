// HL-RADAR P4 (20/11/2026): xu hướng LS-v1 theo phiên và tua lại các phiên trước của bảng Danh mục Elite HL.
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "../../../test/rtl-lite";
import { HlLsTrend, HlReplay, lsSeries, type HlHistory, type HlHistSession } from "./HlHistoryLayers";

const row = (t: string, ls: number, o: Partial<HlHistSession["held"][number]> = {}) => ({ t, rank: 1, cls: "STRONG", w: 0.15, ls, t1: 10, ta: 5, rrg: 2, status: "HOLD", since: "2026-11-12", ret: 0.012, pz: "BUY_ZONE", lane: "CORE", close: 95_900, ...o });
const sess = (date: string, held: HlHistSession["held"], o: Partial<HlHistSession> = {}): HlHistSession => ({ date, rebalance: false, frozen: false, cash: 0.3, invested: 0.7, exitLsPct: 60, held, added: [], exits: [], ...o });
const H: HlHistory = { version: "HL-H1", dates: [], sessions: [
  sess("2026-11-12", [row("VPL", 90), row("CTD", 94.6)], { rebalance: true, added: ["VPL", "CTD"] }),
  sess("2026-11-13", [row("CTD", 70)]),
  sess("2026-11-18", [row("VPL", 95), row("VJC", 93.6, { status: "NEW" })], { exits: [{ t: "CTD", code: "ls", reasonVi: "LS-v1 xuống phân vị 55 (ngưỡng bán < 60)", w: 0.1 }] }),
  sess("2026-11-19", [row("VPL", 97.6), row("VJC", 91)]),
] };
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("HlLsTrend", () => {
  it("chuỗi LS theo phiên (null khi không giữ); đường tăng -> xanh, ghi số phiên và mức đổi; vạch ngưỡng ra; khoảng trống không nối", () => {
    expect(lsSeries(H, "VPL").map((p) => p.ls)).toEqual([90, null, 95, 97.6]);
    render(<HlLsTrend h={H} ticker="VPL" exit={60} />);
    const el = screen.getByTestId("hl-trend-VPL");
    expect(el.textContent).toMatch(/LS 3 phiên \+8/);
    expect(el.getAttribute("title")).toMatch(/ngưỡng ra 60.*12\/11 90 · 13\/11 — · 18\/11 95 · 19\/11 98/);
    expect(el.querySelectorAll("polyline").length).toBe(1); // 12/11 bị ngắt bởi 13/11 -> chỉ nối 18/11–19/11
    expect(el.querySelector("polyline")!.getAttribute("stroke")).toBe("#34d399");
    expect(el.getAttribute("data-hl-layer")).toBe("trend");
  });
  it("giảm -> đỏ; dưới 2 phiên có số -> không vẽ", () => {
    render(<HlLsTrend h={H} ticker="CTD" exit={60} />);
    expect(screen.getByTestId("hl-trend-CTD").textContent).toMatch(/LS 2 phiên −25/);
    cleanup(); render(<HlLsTrend h={H} ticker="VJC" exit={60} />);
    expect(screen.getByTestId("hl-trend-VJC")).toBeTruthy();
    cleanup(); render(<HlLsTrend h={{ ...H, sessions: H.sessions.slice(0, 1) }} ticker="VPL" exit={60} />);
    expect(screen.queryByTestId("hl-trend-VPL")).toBeNull();
  });
});

describe("HlReplay", () => {
  const today = { date: "2026-11-19", held: ["VPL", "VJC"] };
  it("mặc định thu gọn; mở -> phiên trước gần nhất; nhãn LỊCH SỬ; kéo về 12/11 -> mã đã ra, vào mới, chênh lệch so với hôm nay", () => {
    const open = vi.fn();
    render(<HlReplay h={H} today={today} onOpenTicker={open} />);
    expect(screen.getByTestId("hl-replay-toggle").textContent).toMatch(/Tua lại các phiên trước \(3 phiên đã lưu, từ 12\/11\)/);
    expect(screen.queryByTestId("hl-replay-table")).toBeNull();
    fireEvent.click(screen.getByTestId("hl-replay-toggle"));
    expect(screen.getByTestId("hl-replay-date").textContent).toBe("Phiên 18/11");
    expect(screen.getByTestId("hl-replay").textContent).toMatch(/LỊCH SỬ · không phải bảng hôm nay/);
    expect(screen.getByTestId("hl-replay-exits").textContent).toMatch(/Ra CTD — LS-v1 xuống phân vị 55/);
    fireEvent.change(screen.getByTestId("hl-replay-range"), { target: { value: "0" } });
    expect(screen.getByTestId("hl-replay-date").textContent).toBe("Phiên 12/11");
    expect(screen.getByTestId("hl-replay-row-CTD").textContent).toMatch(/CTD\(đã ra\)/);
    expect(screen.getByTestId("hl-replay-sum").textContent).toMatch(/2 mã · cổ phiếu 70% · tiền mặt 30% · phiên vào lệnh \(đầu tuần\).*vào VPL, CTD/);
    expect(screen.getByTestId("hl-replay-diff").textContent).toMatch(/thêm VJC · bớt CTD.*khoá lúc dựng\), không tính lại/);
    fireEvent.click(screen.getByTestId("hl-replay-row-CTD").querySelector("button")!);
    expect(open).toHaveBeenCalledWith("CTD");
  });
  it("▶ tua lần lượt từ phiên đầu, dừng ở phiên cuối", () => {
    vi.useFakeTimers();
    render(<HlReplay h={H} today={today} onOpenTicker={() => {}} />);
    fireEvent.click(screen.getByTestId("hl-replay-toggle"));
    fireEvent.click(screen.getByTestId("hl-replay-play"));
    expect(screen.getByTestId("hl-replay-date").textContent).toBe("Phiên 12/11");
    act(() => { vi.advanceTimersByTime(1400); }); expect(screen.getByTestId("hl-replay-date").textContent).toBe("Phiên 13/11");
    act(() => { vi.advanceTimersByTime(1400 * 5); }); expect(screen.getByTestId("hl-replay-date").textContent).toBe("Phiên 18/11");
    expect(screen.getByTestId("hl-replay-play").textContent).toBe("▶");
  });
  it("chưa có phiên trước -> không hiện", () => {
    render(<HlReplay h={{ ...H, sessions: H.sessions.slice(-1) }} today={today} onOpenTicker={() => {}} />);
    expect(screen.queryByTestId("hl-replay")).toBeNull();
  });
});
