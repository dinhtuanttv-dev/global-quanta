// MP-a (20/11/2026): Lịch vùng mua của danh mục — số đúng của engine, nhãn trung thực, không chữ khuyến nghị, bấm mã để chọn.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "../../../test/rtl-lite";
import type { TimelineRow } from "../../../lib/cotuc/buy-timeline";

const T = vi.hoisted(() => ({ rows: null as unknown, loading: false, error: null as string | null }));
vi.mock("../../../hooks/elite10/useEliteTiming", () => ({ useEliteTiming: () => ({ data: T.rows ? { rows: T.rows } : null, loading: T.loading, error: T.error }) }));
import HlBuyCalendar from "./HlBuyCalendar";

const row = (o: Partial<TimelineRow>): TimelineRow => ({
  id: "x", ticker: "MSH", sector: null, kind: "EARNINGS", tier: "NEAR", status: "UPCOMING", eventLabel: "KQKD Q4", eventDate: "2027-01-28", eventDateBasis: "HISTORICAL_LAG",
  windowId: "w", windowLabel: "w", entryFrom: -3, entryTo: 0, exitOffset: 10, entryFromDate: "2027-01-25", entryToDate: "2027-01-28", exitDate: "2027-02-11",
  sessionsToEntry: 44, nEvents: 6, winRate: 0.83, probability: null, netExpectancy: 0.0311, netExpectancyLcb: 0.0074, fdrQValue: 0.515, decisionLevel: null, missing: [], ...o,
});
const text = (id: string) => screen.getByTestId(id).textContent ?? "";
afterEach(() => { cleanup(); T.rows = null; T.loading = false; T.error = null; });

describe("HlBuyCalendar (MP-a)", () => {
  it("dữ liệu 20/11: 3/7 mã có vùng, đều gần đạt; mã không có vùng ghi rõ; số đúng engine; THĂM DÒ + ghi chú bằng chứng; không chữ khuyến nghị", () => {
    T.rows = [row({ ticker: "MSH" }), row({ ticker: "VCP", entryFromDate: "2027-01-11", netExpectancy: 0.0152, netExpectancyLcb: 0.0028, winRate: 0.67, fdrQValue: 0.702 }),
      row({ ticker: "HSG", netExpectancy: 0.0332, netExpectancyLcb: 0.0002, fdrQValue: 0.951 }), row({ ticker: "BMP", tier: "VALIDATED" })];
    const pick = vi.fn();
    render(<HlBuyCalendar tickers={["VPL", "VJC", "MSH", "VCP", "AAS", "VIC", "HSG"]} picked="VPL" onPick={pick} />);
    const all = text("hl-buy-cal");
    expect(all).toMatch(/3\/7 mã có vùng/); expect(all).toMatch(/THĂM DÒ/);
    expect(text("hl-buy-cal-MSH")).toMatch(/KQKD.*28\/01 \(ước tính\).*25\/01 → 28\/01.*còn 44 phiên.*11\/02.*Gần đạt — chưa qua kiểm định.*kỳ vọng \+3,1% \(cận dưới \+0,7%\).*thắng 83% · n 6 · mẫu rất nhỏ · q 0,52 · sau phí 0,45%/);
    expect(text("hl-buy-cal-VPL")).toMatch(/Không có vùng Timeline/);
    // VCP vùng gần hơn MSH -> đứng trước; mã không có vùng ở cuối theo thứ tự danh mục
    const order = [...screen.getByTestId("hl-buy-cal").querySelectorAll('[data-testid^="hl-buy-cal-pick-"]')].map((b) => b.textContent);
    expect(order).toEqual(["VCP", "MSH", "HSG", "VPL", "VJC", "AAS", "VIC"]);
    expect(text("hl-buy-cal-note")).toMatch(/1\/4 dòng đạt kiểm định.*tương đương dữ liệu giả/);
    for (const bad of [/mua ngay/i, /nên mua/i, /chắc thắng/i]) expect(all).not.toMatch(bad);
    fireEvent.click(screen.getByTestId("hl-buy-cal-pick-HSG"));
    expect(pick).toHaveBeenCalledWith("HSG");
  });
  it("vùng Săn cổ tức TO: nhãn THĂM DÒ riêng, không in q, ghi 'vượt VN-Index'", () => {
    T.rows = [row({ ticker: "VCP", kind: "DIVIDEND", tier: "EXPLORATORY" as TimelineRow["tier"], status: "IN_WINDOW", eventLabel: "GDKHQ", eventDateBasis: "ANNOUNCED", fdrQValue: 1, nEvents: 40 })];
    render(<HlBuyCalendar tickers={["VCP"]} picked={null} onPick={() => {}} />);
    const t = text("hl-buy-cal-VCP");
    expect(t).toMatch(/Cổ tức GDKHQ 28\/01(?! \(ước tính\))/); expect(t).toMatch(/đang mở/); expect(t).toMatch(/Săn cổ tức TO — THĂM DÒ/);
    expect(t).toMatch(/chưa kiểm định · vượt VN-Index/); expect(t).not.toMatch(/q 1/); expect(t).not.toMatch(/mẫu rất nhỏ/);
  });
  it("Timeline chưa có -> câu rõ ràng, không bảng", () => {
    T.error = "Timeline tạm không có";
    render(<HlBuyCalendar tickers={["VPL"]} picked={null} onPick={() => {}} />);
    expect(text("hl-buy-cal-missing")).toMatch(/Timeline điểm mua tạm không có/);
  });
});
