import { describe, expect, it } from "vitest";
import type { TimelineRow } from "../cotuc/buy-timeline";
import { portfolioBuyCalendar } from "./portfolioBuyCalendar";

const row = (o: Partial<TimelineRow>): TimelineRow => ({
  id: "x", ticker: "MSH", sector: null, kind: "EARNINGS", tier: "NEAR", status: "UPCOMING", eventLabel: "KQKD Q4", eventDate: "2027-01-28", eventDateBasis: "HISTORICAL_LAG",
  windowId: "w", windowLabel: "w", entryFrom: -3, entryTo: 0, exitOffset: 10, entryFromDate: "2027-01-25", entryToDate: "2027-01-28", exitDate: "2027-02-11",
  sessionsToEntry: 44, nEvents: 6, winRate: 0.83, probability: null, netExpectancy: 0.0311, netExpectancyLcb: 0.0074, fdrQValue: 0.515, decisionLevel: null, missing: [], ...o,
});

describe("MP-a portfolioBuyCalendar", () => {
  it("giữ nguyên số của engine; ngày ước tính được đánh dấu; mã không có vùng nằm cuối, đúng thứ tự danh mục", () => {
    const cal = portfolioBuyCalendar(["VPL", "MSH", "VJC", "HSG"], [
      row({ ticker: "HSG", entryFromDate: "2027-01-26", netExpectancy: 0.0332, netExpectancyLcb: 0.0002, fdrQValue: 0.951 }),
      row({ ticker: "MSH" }),
      row({ ticker: "BMP", tier: "VALIDATED" }),
    ]);
    expect(cal.lines.map((l) => l.ticker)).toEqual(["MSH", "HSG", "VPL", "VJC"]);
    const m = cal.lines[0].rows[0];
    expect([m.netExpectancy, m.netExpectancyLcb, m.winRate, m.nEvents, m.fdrQValue]).toEqual([0.0311, 0.0074, 0.83, 6, 0.515]);
    expect(m.estimated).toBe(true); expect(m.source).toBe("TIMELINE");
    expect(cal.withZone).toBe(2);
    expect(cal.universe).toEqual({ rows: 3, validated: 1 });
  });
  it("vùng đang mở đứng trước vùng sắp tới; trong một mã: đang mở → sắp tới → đã qua (mới trước)", () => {
    const cal = portfolioBuyCalendar(["A", "B"], [
      row({ ticker: "A", status: "UPCOMING", entryFromDate: "2026-12-01" }),
      row({ ticker: "B", status: "PASSED", entryFromDate: "2026-10-01" }), row({ ticker: "B", status: "PASSED", entryFromDate: "2026-11-01" }),
      row({ ticker: "B", status: "IN_WINDOW", entryFromDate: "2026-11-19" }),
    ]);
    expect(cal.lines.map((l) => l.ticker)).toEqual(["B", "A"]);
    expect(cal.lines[0].rows.map((r) => `${r.status}:${r.entryFromDate}`)).toEqual(["IN_WINDOW:2026-11-19", "PASSED:2026-11-01", "PASSED:2026-10-01"]);
  });
  it("vùng Săn cổ tức TO (EXPLORATORY): nguồn TO, không in q, không tính vào đếm Timeline; ngày đã công bố không gắn ước tính", () => {
    const cal = portfolioBuyCalendar(["VCP"], [row({ ticker: "VCP", kind: "DIVIDEND", tier: "EXPLORATORY" as TimelineRow["tier"], eventDateBasis: "ANNOUNCED", fdrQValue: 1, missing: ["THĂM DÒ — chờ kiểm định tiến TO-r1"] })]);
    const r = cal.lines[0].rows[0];
    expect(r.source).toBe("TO"); expect(r.fdrQValue).toBeNull(); expect(r.estimated).toBe(false); expect(r.notes[0]).toMatch(/TO-r1/);
    expect(cal.universe).toEqual({ rows: 0, validated: 0 });
  });
  it("không có Timeline -> mọi mã 'không có vùng', không lỗi", () => {
    const cal = portfolioBuyCalendar(["X", "x"], null);
    expect(cal.lines).toEqual([{ ticker: "X", rows: [] }]); expect(cal.withZone).toBe(0);
  });
});
