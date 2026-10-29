// CH3D — không gian thời điểm 4D: ESA ngày (không nhìn trước, chuẩn hoá ESA R0), gắn đợt sự kiện vào nến ngày, dải kỳ hiện tại,
// chọn dòng Timeline điểm mua. Dữ liệu thật FPT (nghiên cứu sự kiện cổ tức + nến ngày 5 năm, chụp 29/10/2026).
import { describe, expect, it } from "vitest";
import type { EventStudy } from "./timingSim";
import type { TimelineRow } from "../cotuc/buy-timeline";
import div from "./__fixtures__/event-study-FPT-dividend.json";
import fptBars from "./__fixtures__/ohlcv-FPT-5y.json";
import vniBars from "./__fixtures__/ohlcv-VNINDEX-1y.json";
import { buildTimingSpace, currentPathFromBars, esaDailyAt, eventIndex, timelineRowFor, type DailyBar } from "./timingSpace";

const es = div as unknown as EventStudy;
const last = <T,>(xs: T[]): T => xs[xs.length - 1];
const bars = fptBars as DailyBar[];
const flat = (n: number, v = 100): DailyBar[] => Array.from({ length: n }, (_, i) => ({ date: `2026-01-${String(i + 1).padStart(2, "0")}`, volume: 1, value: v + (i % 3) }));

describe("ESA ngày", () => {
  it("phiên giá trị gấp 4 lần nền ổn định -> bất thường mức cao; chỉ dùng phiên trước (thay đổi phiên sau không ảnh hưởng)", () => {
    const b = flat(25); b[22] = { ...b[22], value: 400 };
    const r = esaDailyAt(b, 22)!;
    expect(r.rv).toBeGreaterThan(3.5);
    expect(r.level).toBe("high");
    const b2 = b.map((x, i) => (i > 22 ? { ...x, value: 1e9 } : x));
    expect(esaDailyAt(b2, 22)).toEqual(r);
  });
  it("chưa đủ 15 phiên nền -> không chấm (z null); không đủ cả hai ngưỡng -> không cảnh báo", () => {
    expect(esaDailyAt(flat(10), 9)!.z).toBeNull();
    const b = flat(25); b[22] = { ...b[22], value: 150 }; // z lớn nhưng chỉ gấp 1,5 lần
    expect(esaDailyAt(b, 22)!.level).toBe("none");
  });
  it("không có giá trị -> dùng khối lượng × giá", () => {
    const b: DailyBar[] = flat(25).map((x) => ({ date: x.date, volume: 10, close: 5 }));
    b[22] = { ...b[22], volume: 50 };
    expect(esaDailyAt(b, 22)!.rv).toBeCloseTo(5);
  });
});

describe("gắn sự kiện vào nến ngày", () => {
  it("ngày sự kiện có phiên -> đúng phiên; rơi vào ngày nghỉ -> phiên kế tiếp", () => {
    const i = eventIndex(bars, "2025-06-12");
    expect(bars[i].date).toBe("2025-06-12");
    const sat = eventIndex(bars, "2026-10-24"); // thứ Bảy
    expect(bars[sat].date).toBe("2026-10-26");
  });

  it("FPT cổ tức: 9 đợt + trung vị + kỳ hiện tại; thảm W đủ phiên mỗi đợt, kỳ hiện tại tới hôm nay", () => {
    const w = es.windows.find((x) => x.id === "w3")!;
    const sp = buildTimingSpace(es, bars, -16, w, "2026-10-29");
    expect(sp.ribbons.map((r) => r.kind)).toEqual([...Array(9).fill("event"), "median", "current"]);
    const ev = sp.ribbons.filter((r) => r.kind === "event");
    // đợt cũ nhất trước, mới nhất sau (Z tăng theo thời gian)
    expect(ev[0].eventDate! < ev[8].eventDate!).toBe(true);
    for (const r of ev) expect(r.cells.length).toBe(es.offsets[es.offsets.length - 1] - es.offsets[0] + 1);
    // ô offset 0 của mỗi đợt là đúng phiên sự kiện
    expect(ev[8].cells.find((c) => c.offset === 0)!.date).toBe(bars[eventIndex(bars, ev[8].eventDate!)].date);
    const cur = last(sp.ribbons);
    expect(last(cur.cells)).toMatchObject({ offset: -16, date: "2026-10-29" });
    expect(cur.cells[0].offset).toBe(es.offsets[0]);
    // lãi ròng cửa sổ w3 khớp v3 (7/9 thắng)
    expect(ev.filter((r) => (r.windowNet ?? 0) > 0).length).toBe(w.wins ?? Math.round(w.winRate * w.nEvents));
    expect(sp.cellsWithEsa).toBeGreaterThan(1000);
  });

  it("chưa có nến hôm nay (trước giờ mở cửa) -> phiên cuối gắn với hôm qua (todayOff − 1)", () => {
    const sp = buildTimingSpace(es, bars, -15, null, "2026-10-30");
    expect(last(last(sp.ribbons).cells)).toMatchObject({ offset: -16, date: "2026-10-29" });
  });
});

describe("Timeline điểm mua", () => {
  const row = (o: Partial<TimelineRow>): TimelineRow => ({
    id: "x", ticker: "FPT", sector: null, kind: "DIVIDEND", tier: "NEAR", status: "UPCOMING", eventLabel: "GDKHQ", eventDate: "2026-11-20",
    eventDateBasis: "ESTIMATED", windowId: "w3", windowLabel: "W3", entryFrom: -25, entryTo: -15, exitOffset: 3, entryFromDate: "2026-10-16",
    entryToDate: "2026-10-30", exitDate: "2026-11-25", sessionsToEntry: 5, nEvents: 9, winRate: 0.78, probability: null, netExpectancy: 0.02,
    netExpectancyLcb: 0.01, fdrQValue: 0.1, decisionLevel: null, missing: [], ...o,
  });
  it("ưu tiên đang trong vùng, rồi sắp tới gần nhất; đúng mã + loại", () => {
    const rows = [row({ id: "a", sessionsToEntry: 9 }), row({ id: "b", sessionsToEntry: 2 }), row({ id: "c", status: "IN_WINDOW", sessionsToEntry: 0 }), row({ id: "d", kind: "EARNINGS", status: "IN_WINDOW" }), row({ id: "e", ticker: "VCB", status: "IN_WINDOW" })];
    expect(timelineRowFor(rows, "FPT", "DIVIDEND")!.id).toBe("c");
    expect(timelineRowFor(rows.slice(0, 2), "FPT", "DIVIDEND")!.id).toBe("b");
    expect(timelineRowFor(rows, "FPT", "EARNINGS")!.id).toBe("d");
    expect(timelineRowFor(rows, "HPG", "DIVIDEND")).toBeNull();
  });
});

describe("đường kỳ tới tự tính", () => {
  const vni = vniBars as DailyBar[];
  it("FPT trước GDKHQ 20/11: neo 0 tại −75, điểm cuối = hôm nay (−16) đúng công thức ln(P/P0) − ln(I/I0)", () => {
    const pts = currentPathFromBars(es.offsets, bars, vni, -16);
    expect(pts[0]).toEqual({ offset: -75, ret: 0 });
    const lastPt = last(pts);
    expect(lastPt.offset).toBe(-16);
    const b = bars.length - 1, p0 = bars[b - 59], p1 = bars[b];
    const i0 = vni.find((x) => x.date === p0.date)!.close!, i1 = vni.find((x) => x.date === p1.date)!.close!;
    expect(lastPt.ret).toBeCloseTo(Math.expm1(Math.log(p1.close! / p0.close!) - Math.log(i1 / i0)), 10);
    expect(pts.map((x) => x.offset)).toEqual([-75, -60, -30, -25, -16]);
  });
  it("đã qua sự kiện (todayOff > 0) hoặc thiếu VN-Index -> không tự tính (tránh cổ tức xen giữa)", () => {
    expect(currentPathFromBars(es.offsets, bars, vni, 3)).toEqual([]);
    expect(currentPathFromBars(es.offsets, bars, [], -16)).toEqual([]);
  });
  it("buildTimingSpace: engine không có đường kỳ hiện tại -> dải KỲ TỚI dùng đường tự tính, gắn cờ derived", () => {
    const sp = buildTimingSpace(es, bars, -16, null, "2026-10-29", vni);
    const cur = last(sp.ribbons);
    expect(cur.derived).toBe(true);
    expect(cur.points.length).toBe(5);
  });
});
