// T1 — dải "Lịch 10 phiên tới" trên Bảng quyết định Elite HL: nhóm theo ngày, mã danh mục / hàng chờ, nhãn nguồn, không lời khuyên mua.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "../../../test/rtl-lite";
import type { EliteDecision } from "../../../lib/elite10/decisionTypes";

const profiles = new Map([
  ["AAA", { version: "PFA-v1", asOf: "2026-11-18", ticker: "AAA", events: { upcoming: [{ cat: "CASH", group: "DIVIDEND", label: "Cổ tức tiền", title: null, disclosed: "2026-11-12", ex: "2026-11-24", record: null, pay: null, meeting: null, date: "2026-11-24", cash: 1500, ratio: null, leadDays: 12, sessionsAway: 4 }], recent: [], status: [] } }],
  ["BBB", { version: "PFA-v1", asOf: "2026-11-18", ticker: "BBB", events: { upcoming: [{ cat: "AGM", group: "MEETING", label: "Họp ĐHCĐ", title: null, disclosed: "2026-11-01", ex: null, record: null, pay: null, meeting: "2026-11-24", date: "2026-11-24", cash: null, ratio: null, leadDays: 23, sessionsAway: 4 }], recent: [], status: [] } }],
]);
let empty = false;
vi.mock("swr", () => ({ default: (key: unknown) => ({ data: key ? (empty ? new Map() : profiles) : undefined }) }));
vi.mock("../../../hooks/elite10/useEliteTiming", () => ({ useEliteTiming: () => ({ data: { rows: [], counts: { validated: 2, near: 163, inWindow: 0, upcoming: 2 }, coverage: { universe: 281 } }, sessions: [] }) }));
import HlCalendarStrip from "./HlCalendarStrip";

const d = { date: "2026-11-18", portfolio: [{ ticker: "AAA" }], hl: { queue: [{ ticker: "BBB" }] } } as unknown as EliteDecision;
afterEach(() => { cleanup(); empty = false; });

describe("HlCalendarStrip", () => {
  it("nhóm theo ngày, mã danh mục và hàng chờ, nhãn 'đã công bố', ghi chú bằng chứng Timeline; bấm mã mở Hồ sơ", () => {
    const open = vi.fn();
    render(<HlCalendarStrip d={d} onOpenTicker={open} />);
    const day = screen.getByTestId("hl-cal-2026-11-24").textContent ?? "";
    expect(day).toMatch(/24\/11/); expect(day).toMatch(/AAA.*GDKHQ cổ tức tiền 1\.500đ\/cp.*đã công bố/); expect(day).toMatch(/BBB\(hàng chờ\)Họp ĐHCĐ/);
    expect(screen.getByTestId("hl-calendar").textContent).toMatch(/2\/2 mã có hồ sơ.*chỉ hiển thị, không đổi danh mục/);
    expect(screen.getByTestId("hl-calendar-note").textContent).toMatch(/2 vùng đạt kiểm định trên 281 mã/);
    expect(screen.getByTestId("hl-calendar").textContent).not.toMatch(/Mua ngay/);
    fireEvent.click(screen.getByText("AAA")); expect(open).toHaveBeenCalledWith("AAA");
  });
  it("không có sự kiện -> câu rõ ràng", () => {
    empty = true; render(<HlCalendarStrip d={d} onOpenTicker={() => {}} />);
    expect(screen.getByTestId("hl-calendar-empty").textContent).toMatch(/Không có sự kiện/);
  });
});
