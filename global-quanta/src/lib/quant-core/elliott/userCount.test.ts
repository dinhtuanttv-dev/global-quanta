import { describe, expect, it } from "vitest";
import { displayStatus, draftFromState, newVersionId, snapToCandle, userInvalidation, validateUserCount, type UserCountPoint, type UserCountVersion } from "./userCount";
import { elliottState } from "./index";
import { elliottMineItems } from "../../ta-command-center/chart/elliottScene";
import { newerCounts } from "../../ta-command-center/elliottCountsStore";
import type { OhlcvBar } from "../../ta-command-center/types";

const day = (i: number) => new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10);
const legsFn = (legs: number[][]) => (i: number) => {
  for (let k = 1; k < legs.length; k++) if (i <= legs[k][0]) { const [i0, p0] = legs[k - 1], [i1, p1] = legs[k]; return p0 + ((p1 - p0) * (i - i0)) / (i1 - i0); }
  return legs[legs.length - 1][1];
};
const bars = (n: number, f: (i: number) => number): OhlcvBar[] => Array.from({ length: n }, (_, i) => { const c = f(i); return { date: day(i), open: c, high: c + 1, low: c - 1, close: c, volume: 1 }; });
const IMP = [[0, 100], [10, 110], [20, 104], [40, 140], [50, 130], [60, 150]];
const pt = (i: number, price: number, label: string): UserCountPoint => ({ date: day(i), price, label });

describe("DW8 — cách đếm chỉnh tay", () => {
  it("bám nến: chọn high hoặc low theo giá bấm gần bên nào; ngày không có nến -> nến gần nhất", () => {
    const b = bars(10, (i) => 100 + i);
    expect(snapToCandle(b, day(3), 104.4)).toEqual({ date: day(3), price: 104, label: "" });   // high của nến 3 = 104
    expect(snapToCandle(b, day(3), 101.9)).toEqual({ date: day(3), price: 102, label: "" });   // low = 102
    expect(snapToCandle(b, day(30), 0)!.date).toBe(day(9));
    expect(snapToCandle([], day(1), 1)).toBeNull();
  });
  it("kiểm tra quy tắc: cách đếm đúng trên nến (điểm = cực trị) không vi phạm; sai thứ tự nhãn / sóng 4 lấn sóng 1 / không phải cực trị -> gắn cờ", () => {
    const b = bars(61, legsFn(IMP));
    const ok = IMP.map(([i], k) => pt(i, b[i][k % 2 ? "high" : "low"], String(k)));
    expect(validateUserCount(ok, b)).toEqual([]);
    expect(validateUserCount(ok.map((p, k) => (k === 2 ? { ...p, label: "3" } : p)), b).join(" ")).toMatch(/thứ tự/);
    // sóng 2 vượt gốc sóng 1 -> mọi mô hình sóng đẩy (IM / nêm) đều bị loại
    const w2Beyond = ok.map((p, k) => (k === 2 ? { ...p, price: 95 } : p));
    expect(validateUserCount(w2Beyond, b).join(" ")).toMatch(/Sóng đẩy: Sóng 2 không vượt gốc/);
    // sóng 4 lấn sóng 1 nhưng tạo nêm mở rộng hợp lệ -> không gắn cờ (đúng quy tắc nêm)
    expect(validateUserCount(ok.map((p, k) => (k === 4 ? { ...p, price: 105 } : p)), b)).toEqual([]);
    const notExtreme = ok.map((p, k) => (k === 3 ? { ...p, date: day(35), price: b[35].high } : p));
    expect(validateUserCount(notExtreme, b).join(" ")).toMatch(/cực trị/);
  });
  it("mốc vô hiệu theo sóng cuối: 2 -> gốc 0; 4 -> đỉnh 1; 5 -> đáy 4", () => {
    expect(userInvalidation([pt(0, 100, "0"), pt(10, 110, "1"), pt(20, 104, "2")])).toMatchObject({ price: 100, side: "below" });
    expect(userInvalidation([pt(0, 100, "0"), pt(10, 110, "1"), pt(20, 104, "2"), pt(40, 140, "3"), pt(50, 130, "4")])).toMatchObject({ price: 110 });
    expect(userInvalidation([pt(0, 100, "0"), pt(10, 110, "1"), pt(20, 104, "2"), pt(40, 140, "3"), pt(50, 130, "4"), pt(60, 150, "5")])).toMatchObject({ price: 130 });
  });
  it("trạng thái hiển thị: vô hiệu khi giá đóng cửa vượt mốc; cũ khi engine có pivot xác nhận sau điểm cuối; còn lại giữ trạng thái lưu", () => {
    const v: UserCountVersion = { id: "a", createdAt: "2026-10-23T00:00:00Z", status: "user_confirmed", points: [pt(0, 100, "0"), pt(10, 110, "1"), pt(20, 104, "2")],
      degree: null, pattern: null, note: "", basedOn: { source: "engine", asOf: null, rank: 0 }, violations: [] };
    expect(displayStatus(v, 99, null)).toBe("invalidated");
    expect(displayStatus(v, 120, null)).toBe("user_confirmed");
    expect(displayStatus(v, 120, { pivots: [{ i: 30, time: day(30), type: "H", price: 130, confirmed: true, ci: 32 }] } as never)).toBe("stale");
  });
  it("bản nháp từ engine = 0–5 (+ A/B/C sau sóng 5); id phiên bản không trùng", () => {
    const COMPLETE = [[0, 100], [20, 120], [30, 110], [55, 145], [65, 133], [80, 151], [92, 136], [100, 142], [110, 139]];
    const b = [...bars(60, (i) => 100 + Math.sin(i / 3) * 1.5), ...bars(111, legsFn(COMPLETE)).map((x, i) => ({ ...x, date: day(60 + i) }))];
    const d = draftFromState(elliottState(b));
    expect(d.slice(0, 6).map((p) => p.label)).toEqual(["0", "1", "2", "3", "4", "5"]);
    expect(d.slice(6).map((p) => p.label).join("")).toMatch(/^AB/);
    expect(draftFromState(null)).toEqual([]);
    const ids = new Set(Array.from({ length: 50 }, () => newVersionId(1)));
    expect(ids.size).toBe(50);
  });
  it("lớp vẽ: nhãn tròn cyan, nét đứt khi đang chỉnh; điểm không có nến bị bỏ", () => {
    const b = bars(30, (i) => 100 + i);
    const items = elliottMineItems({ points: [pt(1, 101, "0"), pt(5, 106, "1"), pt(99, 90, "2")], editing: true, violations: 1 }, b);
    expect(items).toHaveLength(1);
    const it0 = items[0];
    expect(it0.kind === "poly" && it0.nodeLabels).toEqual(["0", "1"]);
    expect(it0.kind === "poly" && it0.dash).toEqual([5, 3]);
    expect(it0.kind === "poly" && it0.label?.text).toMatch(/Đang chỉnh · ⚠ 1/);
  });
  it("đồng bộ: bản mới hơn (updatedAt) thắng; không có bản đám mây -> giữ bản máy", () => {
    const a = { schemaVersion: 1, activeId: null, versions: [], updatedAt: "2026-10-23T01:00:00Z" };
    const b2 = { ...a, updatedAt: "2026-10-23T02:00:00Z", activeId: "x" };
    expect(newerCounts(a, b2)).toBe(b2); expect(newerCounts(b2, a)).toBe(b2); expect(newerCounts(a, null)).toBe(a);
  });
});
