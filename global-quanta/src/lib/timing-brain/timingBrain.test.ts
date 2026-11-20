// BỘ NÃO CHU KỲ & THỜI ĐIỂM — kiểm định kỹ thuật KT1–KT5 (docs/elite-cycle-timing-brain 06 mục 2) trên ảnh chụp dữ liệu SỐNG 20/11/2026.
import { describe, expect, it } from "vitest";
import fx from "./__fixtures__/timing-2026-11-20.json";
import type { LaneRow } from "../elite10/buyZoneLane";
import type { ToRadarRow } from "../cotuc/to";
import { toLaneRows, withToRows } from "../elite10/toTiming";
import {
  buildTimingBrain, claim, dateWarning, dualLaneRows, laneOf, normSessions, pairDividendLanes, reconcileDates, sessionText, timelineParity,
} from "./index";

const gw = fx.gateway.rows as unknown as LaneRow[];
const pa = fx.projectA.rows as unknown as LaneRow[];
const to = toLaneRows(fx.to.radar.rows as unknown as ToRadarRow[], fx.gateway.today, fx.gateway.sessions);

describe("Bộ não thời điểm — dữ liệu thật 20/11/2026", () => {
  it("KT5 làn: mỗi dòng cổ tức gốc -> đúng một DIV_W; mỗi đợt TO đủ điều kiện -> đúng một DIV_TO; không mất, không nhân đôi", () => {
    const vm = buildTimingBrain(gw, to);
    const rawDiv = gw.filter((r) => r.kind === "DIVIDEND").length;
    expect(rawDiv).toBe(26);
    expect(vm.lanes).toEqual({ DIV_W: 26, DIV_TO: 1, EARN: gw.length - 26 });
    expect(vm.rows.length).toBe(gw.length + to.length);
    expect(new Set(vm.events.map((e) => e.key)).size).toBe(vm.events.length);
    expect(vm.byTicker.get("SAB")!.map((e) => e.lane)).toEqual(["DIV_TO"]);
    // Đường Elite hiện tại (withToRows) chỉ còn 1 vùng cổ tức — đây là mâu thuẫn M1 mà làn kép sửa.
    expect(withToRows(gw, to).filter((r) => r.kind === "DIVIDEND").length).toBe(1);
  });

  it("KT2 bảo toàn nguồn: VM giữ NGUYÊN đối tượng dòng nguồn (không sao chép, không sửa trường)", () => {
    const before = JSON.stringify(gw);
    const vm = buildTimingBrain(gw, to);
    gw.forEach((r) => expect(vm.byId.get(r.id)!.row).toBe(r));
    expect(JSON.stringify(gw)).toBe(before);
  });

  it("KT1 tất định: cùng đầu vào -> cùng đầu ra", () => {
    const a = buildTimingBrain(gw, to), b = buildTimingBrain([...gw], [...to]);
    expect(a.events.map((e) => [e.key, e.text, e.pairId])).toEqual(b.events.map((e) => [e.key, e.text, e.pairId]));
  });

  it("KT3 song song Timeline: Project A ↔ Gateway trùng mọi trường trừ sessionsToEntry (PA âm = đã trôi qua, GW kẹp 0)", () => {
    const p = timelineParity(pa as unknown as Record<string, unknown>[], gw as unknown as Record<string, unknown>[]);
    expect([p.aRows, p.bRows, p.onlyA.length, p.onlyB.length, p.fieldDiffs.length]).toEqual([30, 30, 0, 0, 0]);
    expect(p.sessionDiffs.length).toBeGreaterThan(0);
    for (const d of p.sessionDiffs) { expect(d.a).toBeLessThan(0); expect(d.b).toBe(0); }
    expect(p.sessionDiffs.find((d) => d.id.startsWith("VGR"))).toMatchObject({ a: -28, b: 0 });
  });

  it("KT4 đối soát ngày MSH KQKD Q4/2026: Timeline 01/02 vs nghiên cứu sự kiện 30/01 -> ngày chính 01/02, lệch 2 ngày, có cảnh báo", () => {
    const tl = gw.find((r) => r.ticker === "MSH" && r.kind === "EARNINGS")!;
    const es = fx.eventStudyMSH.upcoming;
    const r = reconcileDates([claim("EVENT_STUDY", es.date, es.status), claim("TIMELINE", tl.eventDate, tl.eventDateBasis)]);
    expect(r.primary).toMatchObject({ source: "TIMELINE", date: "2027-02-01" });
    expect([r.spreadDays, r.agree]).toEqual([2, false]);
    expect(dateWarning(r)).toBe("Ngày lệch 2 ngày giữa các nguồn: Timeline 01/02 · nghiên cứu sự kiện 30/01");
  });
});

describe("Bộ não thời điểm — quy tắc", () => {
  it("nhãn phiên: không bao giờ số âm; PA âm -> 'đã mở N phiên'; GW 0 -> 'đang mở từ dd/mm'", () => {
    const base = { entryFromDate: "2026-10-13", exitDate: "2026-11-02" };
    expect(sessionText({ ...base, status: "UPCOMING", sessionsToEntry: 38 })).toBe("còn 38 phiên");
    expect(sessionText({ ...base, status: "IN_WINDOW", sessionsToEntry: -14 })).toBe("đã mở 14 phiên");
    expect(sessionText({ ...base, status: "IN_WINDOW", sessionsToEntry: 0 })).toBe("đang mở từ 13/10");
    expect(sessionText({ ...base, status: "PASSED", sessionsToEntry: -28 })).toBe("đã qua · vùng mở cách đây 28 phiên");
    expect(sessionText({ ...base, status: "PASSED", sessionsToEntry: 0 })).toBe("đã qua · thoát 02/11");
    expect(normSessions({ status: "UPCOMING", sessionsToEntry: -3 })).toEqual({ toEntry: 0, elapsed: null });
    for (const r of [...gw, ...pa]) expect(sessionText(r)).not.toMatch(/-\d/);
  });

  it("thứ tự ưu tiên ngày (Q3): đã công bố > LC-v1 > Timeline > nghiên cứu sự kiện; ngày sai định dạng bị bỏ", () => {
    const r = reconcileDates([claim("TIMELINE", "2027-02-01", "HISTORICAL_LAG"), claim("LC", "2027-02-03", null), claim("EVENT_STUDY", "2027-01-30", "ANNOUNCED"), claim("LC", "x", null)]);
    expect(r.claims.map((c) => c.source)).toEqual(["ANNOUNCED", "LC", "TIMELINE"]);
    expect(r.primary!.date).toBe("2027-01-30");
    expect(dateWarning(reconcileDates([claim("TIMELINE", "2027-02-01", null)]))).toBeNull();
    expect(dateWarning(reconcileDates([claim("TIMELINE", "2027-02-01", null), claim("LC", "2027-02-01", null)]))).toBeNull();
  });

  it("ghép W ↔ TO cùng đợt: cùng mã, GDKHQ cách ≤ 14 ngày, mỗi dòng ghép một lần (gần nhất trước)", () => {
    const w = (id: string, t: string, ex: string) => ({ ...gw[0], id, ticker: t, kind: "DIVIDEND", windowId: "w1", eventDate: ex }) as LaneRow;
    const o = (id: string, t: string, ex: string) => ({ ...gw[0], id, ticker: t, kind: "DIVIDEND", windowId: "to", eventDate: ex, tier: "EXPLORATORY" }) as LaneRow;
    const rows = [w("W1", "AAA", "2026-12-20"), w("W2", "AAA", "2026-12-26"), o("T1", "AAA", "2026-12-28"), o("T2", "BBB", "2026-12-28"), w("W3", "BBB", "2027-02-28")];
    const p = pairDividendLanes(rows);
    expect([p.get("T1"), p.get("W2"), p.get("W1"), p.get("T2"), p.get("W3")]).toEqual(["W2", "T1", undefined, undefined, undefined]);
    expect(laneOf(rows[2])).toBe("DIV_TO");
    expect(dualLaneRows([rows[0], rows[0]], [rows[2]]).map((r) => r.id)).toEqual(["W1", "T1"]);
  });
});
