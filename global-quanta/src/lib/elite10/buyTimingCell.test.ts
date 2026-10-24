// B2 — ô "⏱ Điểm mua": mọi mã đều có thời điểm mua; ưu tiên vùng mùa vụ đạt kiểm định trong kỳ nắm giữ; ngược lại quy tắc Elite.
import { describe, expect, it } from "vitest";
import { buyTimingCells, nextSessionAfter } from "./buyTimingCell";
import type { TimelineRow } from "../cotuc/buy-timeline";

const row = (ticker: string, o: Partial<TimelineRow>): TimelineRow => ({ id: `${ticker}-${o.entryFromDate}`, ticker, sector: null, kind: "DIVIDEND", tier: "VALIDATED", status: "UPCOMING", eventLabel: "x",
  eventDate: "2026-11-10", eventDateBasis: "x", windowId: "w1", windowLabel: "W", entryFrom: -5, entryTo: -1, exitOffset: 3, entryFromDate: "2026-10-28", entryToDate: "2026-11-03",
  exitDate: "2026-11-06", sessionsToEntry: 3, nEvents: 12, winRate: 0.7, probability: null, netExpectancy: 0.02, netExpectancyLcb: 0.004, fdrQValue: 0.04, decisionLevel: null, missing: [], ...o });
const sessions = ["2026-10-26", "2026-10-28", "2026-10-29"]; // 27/10 nghỉ (lịch của Gateway)
const picks = ["IN", "SOON", "WAIT", "NEAR", "FAR", "NONE", "PASS"];
const rows = [
  row("IN", { status: "IN_WINDOW", sessionsToEntry: 0, entryFromDate: "2026-10-20", entryToDate: "2026-10-30" }),
  row("SOON", { sessionsToEntry: 3 }),
  row("WAIT", { sessionsToEntry: 8, entryFromDate: "2026-11-05" }),
  row("NEAR", { tier: "NEAR", sessionsToEntry: 2, missing: ["thiếu mẫu (n < 10)"] }),
  row("FAR", { sessionsToEntry: 25, entryFromDate: "2026-12-01" }),
  row("PASS", { status: "PASSED" }),
  row("OTHER", { status: "IN_WINDOW" }), // không trong danh mục -> bỏ qua
];

describe("B2 — ô Điểm mua của Elite 10", () => {
  it("phiên kế tiếp sau ngày dựng theo lịch có ngày nghỉ", () => {
    expect(nextSessionAfter("2026-10-23", sessions)).toBe("2026-10-26");
    expect(nextSessionAfter("2026-10-26", sessions)).toBe("2026-10-28");
    expect(nextSessionAfter("2026-12-31", sessions)).toBeNull();
  });
  it("mọi mã trong danh mục đều có ô; đúng loại theo vùng mua", () => {
    const c = buyTimingCells(picks, rows, "2026-10-23", sessions);
    expect([...c.keys()]).toEqual(picks);
    expect(picks.map((t) => c.get(t)!.kind)).toEqual(["in", "soon", "wait", "near", "rule", "rule", "rule"]);
    expect(c.get("IN")!.text).toBe("Mua ngay");
    expect(c.get("SOON")!.text).toBe("Chờ 28/10");
    expect(c.get("SOON")!.sub).toContain("còn 3 phiên");
    expect(c.get("NEAR")!.dashed).toBe(true);
    expect(c.get("NEAR")!.tooltip).toContain("thiếu mẫu");
    expect(c.get("FAR")!.text).toBe("Mở cửa 26/10");
    expect(c.get("FAR")!.sub).toContain("vùng cổ tức xa: 01/12 (25 phiên)");
    expect(c.get("NONE")!.sub).toContain("chưa có vùng mùa vụ");
    expect(c.get("PASS")!.sub).toContain("chưa có vùng mùa vụ");
    expect(c.get("IN")!.tooltip).toMatch(/thắng 70% \/ 12 lần .* FDR q 0,040/);
  });
  it("Timeline không có dữ liệu -> vẫn có thời điểm mua theo quy tắc Elite, ghi rõ", () => {
    const c = buyTimingCells(["A", "B"], null, "2026-10-23", sessions);
    expect([...c.values()].every((x) => x.kind === "rule" && x.text === "Mở cửa 26/10" && x.sub.includes("Timeline tạm không có"))).toBe(true);
  });
});
