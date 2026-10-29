// ⏱ Dải vùng mua — trục phiên thật, kỳ nắm giữ 10 phiên, vùng mua (cắt mép), mốc sự kiện / thoát, vùng ngoài trục.
import { describe, expect, it } from "vitest";
import type { TimelineRow } from "../cotuc/buy-timeline";
import { buyLane, dateIndex, laneAxis } from "./buyZoneLane";

// Phiên thật Gateway 30/10/2026 (bỏ thứ Bảy / Chủ nhật)
const S = ["2026-10-21", "2026-10-22", "2026-10-23", "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06",
  "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-23", "2026-11-24"];
const row = (o: Partial<TimelineRow>): TimelineRow => ({
  id: "x", ticker: "VPI", sector: null, kind: "EARNINGS", tier: "NEAR", status: "PASSED", eventLabel: "Công bố KQKD", eventDate: "2026-10-30", eventDateBasis: "HISTORICAL_LAG",
  windowId: "e2", windowLabel: "E2", entryFrom: -5, entryTo: -2, exitOffset: 3, entryFromDate: "2026-10-23", entryToDate: "2026-10-28", exitDate: "2026-11-04",
  sessionsToEntry: 0, nEvents: 9, winRate: 0.7, probability: null, netExpectancy: 0.02, netExpectancyLcb: 0.001, fdrQValue: 0.2, decisionLevel: null, missing: ["q"], ...o,
});

describe("Dải vùng mua Elite 10", () => {
  const ax = laneAxis(S, "2026-10-29", "2026-10-30");
  it("trục: 5 phiên trước phiên vào (30/10) tới 15 phiên sau; kỳ nắm giữ 10 phiên; HÔM NAY", () => {
    expect(ax.dates[0]).toBe("2026-10-23");
    expect(ax.dates[ax.dates.length - 1]).toBe("2026-11-20");
    expect(ax.dates[ax.entryIdx!]).toBe("2026-10-30");
    expect(ax.dates[ax.holdTo!]).toBe("2026-11-12"); // phiên thứ 10 kể cả phiên vào
    expect(ax.dates[ax.todayIdx!]).toBe("2026-10-30");
  });
  it("ngày nghỉ / ước tính -> phiên giao dịch kế tiếp; ngoài trục -> null", () => {
    expect(ax.dates[dateIndex(ax.dates, "2026-10-31")!]).toBe("2026-11-02");
    expect(dateIndex(ax.dates, "2026-12-01")).toBeNull();
  });
  it("VPI: vùng KQKD gần đạt đã qua 23/10→28/10 trên trục, mốc công bố 30/10, thoát 04/11", () => {
    const l = buyLane("VPI", [row({})], ax);
    expect(l.zones).toHaveLength(1);
    const z = l.zones[0];
    expect([ax.dates[z.i0], ax.dates[z.i1]]).toEqual(["2026-10-23", "2026-10-28"]);
    expect(ax.dates[z.eventIdx!]).toBe("2026-10-30");
    expect(ax.dates[z.exitIdx!]).toBe("2026-11-04");
    expect(z.clipLeft).toBe(false);
  });
  it("IDC: vùng bắt đầu trước trục (22/10) -> cắt mép trái; OCB: vùng 21/01/2027 -> ngoài trục (sau)", () => {
    const l = buyLane("IDC", [row({ ticker: "IDC", entryFromDate: "2026-10-22", entryToDate: "2026-10-27" })], ax);
    expect(l.zones[0].clipLeft).toBe(true);
    expect(ax.dates[l.zones[0].i0]).toBe("2026-10-23");
    const o = buyLane("OCB", [row({ ticker: "OCB", status: "UPCOMING", entryFromDate: "2027-01-21", entryToDate: "2027-01-26", sessionsToEntry: 58 })], ax);
    expect(o.zones).toHaveLength(0);
    expect(o.far).toEqual([{ row: expect.objectContaining({ ticker: "OCB" }), side: "after" }]);
  });
  it("nhiều vùng: trong vùng + đạt kiểm định xếp trước; mã khác không lẫn", () => {
    const rows = [row({ id: "a", status: "PASSED" }), row({ id: "b", status: "IN_WINDOW", tier: "VALIDATED", kind: "DIVIDEND", entryFromDate: "2026-10-28", entryToDate: "2026-11-05" }), row({ id: "c", ticker: "HPG" })];
    expect(buyLane("VPI", rows, ax).zones.map((z) => z.row.id)).toEqual(["b", "a"]);
  });
});
