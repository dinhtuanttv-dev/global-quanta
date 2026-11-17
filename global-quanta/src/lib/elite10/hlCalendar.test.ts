// T1 — Lịch 10 phiên tới (Elite HL): chỉ sự kiện đã công bố + mốc dự kiến, đúng cửa sổ 10 phiên theo lịch Gateway, vùng "gần đạt" không hiện.
import { describe, expect, it } from "vitest";
import { buildHlCalendar, calendarEnd, sessionsBetween } from "./hlCalendar";
import type { ProfileFa } from "./profileFaTypes";
import type { TimelineRow } from "../cotuc/buy-timeline";

// 18/11 → 10 phiên: 19,20,23,24,25,26,27,30/11, 01,02/12 (lịch giả có 20/11 nghỉ để thử ngày nghỉ).
const sessions = ["2026-11-18", "2026-11-19", "2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-30", "2026-12-01", "2026-12-02", "2026-12-03", "2026-12-04"];
const ev = (o: Partial<ProfileFa["events"] extends infer E ? NonNullable<E> extends { upcoming: (infer R)[] } ? R : never : never>) => ({ cat: "CASH", group: "DIVIDEND", label: "Cổ tức tiền", title: null, disclosed: "2026-11-12", ex: null, record: null, pay: null, meeting: null, date: null, cash: null, ratio: null, leadDays: null, sessionsAway: null, ...o });
const prof = (t: string, o: Partial<ProfileFa> = {}): ProfileFa => ({ version: "PFA-v1", asOf: "2026-11-18", ticker: t, ...o });
const row = (o: Partial<TimelineRow>): TimelineRow => ({ ticker: "AAA", kind: "EARNINGS", tier: "VALIDATED", status: "UPCOMING", eventLabel: "KQKD", eventDate: "2026-12-10", eventDateBasis: "ESTIMATED", windowId: "e1", windowLabel: "x", entryFrom: 0, entryTo: 0, exitOffset: 0, entryFromDate: "2026-11-25", entryToDate: "2026-11-26", exitDate: "2026-12-10", sessionsToEntry: 4, nEvents: 10, winRate: 0.7, probability: null, netExpectancy: 0.02, netExpectancyLcb: 0.01, fdrQValue: 0.05, decisionLevel: null, missing: [], ...o } as TimelineRow);

describe("hlCalendar", () => {
  it("cửa sổ 10 phiên theo lịch Gateway (bỏ ngày nghỉ); thiếu lịch -> +14 ngày", () => {
    expect(calendarEnd("2026-11-18", sessions)).toBe("2026-12-03");
    expect(calendarEnd("2026-11-18", [])).toBe("2026-12-02");
    expect(sessionsBetween("2026-11-18", "2026-11-23", sessions)).toBe(2);
    expect(sessionsBetween("2026-11-18", "2027-01-05", sessions, 7)).toBe(7);
  });

  it("ghép sự kiện đã công bố, KQKD dự kiến, TO THĂM DÒ, vùng KQKD đạt; bỏ vùng gần đạt / đã qua / ngoài cửa sổ / mã ngoài danh sách", () => {
    const profiles = new Map<string, ProfileFa | null>([
      ["AAA", prof("AAA", { events: { upcoming: [ev({ ex: "2026-11-24", date: "2026-11-24", cash: 1500, pay: "2026-12-15" }), ev({ cat: "STOCK", date: "2026-12-20", ratio: 20 })], recent: [], status: [] },
        calendar: { current: null, next: { label: "next", status: "UPCOMING", date: null, expected: null, band: ["2026-11-10", "2026-12-20"], medianLag: 30, lateShare: 0, ownN: 6 } } })],
      ["BBB", prof("BBB", { events: { upcoming: [ev({ cat: "AGM", date: "2026-11-27" })], recent: [], status: [] } })],
      ["CCC", null],
    ]);
    const cal = buildHlCalendar({ asOf: "2026-11-18", sessions, portfolio: ["AAA"], queue: ["BBB", "CCC"], profiles, timeline: [
      row({}),
      row({ ticker: "BBB", windowId: "to", tier: "EXPLORATORY" as TimelineRow["tier"], kind: "DIVIDEND", status: "IN_WINDOW", entryFromDate: "2026-11-17", entryToDate: "2026-11-19", exitDate: "2026-11-26" }),
      row({ tier: "NEAR" }), row({ status: "PASSED" }), row({ entryFromDate: "2026-12-20" }), row({ ticker: "ZZZ" }),
    ] });
    expect(cal.endDate).toBe("2026-12-03"); expect(cal.tickers).toBe(3); expect(cal.withProfile).toBe(2);
    expect(cal.items.map((i) => `${i.date} ${i.ticker} ${i.kind} ${i.basis} ${i.sessionsAway}`)).toEqual([
      "2026-11-18 AAA KQKD EXPECTED 0",
      "2026-11-18 BBB TO EXPLORATORY 0",
      "2026-11-24 AAA EX_CASH ANNOUNCED 3",
      "2026-11-25 AAA SEASON VALIDATED_ESTIMATED 4",
      "2026-11-27 BBB MEETING ANNOUNCED 6",
    ]);
    const cash = cal.items.find((i) => i.kind === "EX_CASH")!;
    expect(cash.label).toMatch(/GDKHQ cổ tức tiền 1\.500đ\/cp/); expect(cash.detail).toMatch(/trả tiền 15\/12/); expect(cash.inPortfolio).toBe(true);
    expect(cal.items.find((i) => i.ticker === "BBB" && i.kind === "TO")!.inPortfolio).toBe(false);
    expect(cal.items.some((i) => /mua ngay/i.test(i.label))).toBe(false);
  });
});
