// @vitest-environment node
// TA-T6a — hình chung: tạo theo cú bấm, điểm dừng vị thế tự đặt (R:R 2), scene đúng loại, bấm chọn điểm neo / thân,
// lưu / nạp lại (giao diện + Gateway cùng danh sách kiểu), khoá / ẩn tất cả một bước hoàn tác.
import { describe, expect, it } from "vitest";
import { DrawingManager, sanitizePrimitives, shiftPrimitive, type ShapeMarking } from "../DrawingManager";
import { SHAPE_KINDS, SHAPE_SPEC, completeShapePoints, shapeHit, shapeScene } from "./shapes";
// @ts-expect-error -- module JS của Gateway (không có khai báo kiểu); so trực tiếp để bảo đảm hai phía cùng danh sách kiểu.
import { SHAPE_KINDS as GATEWAY_KINDS, sanitizeChartPrimitives } from "../../../../backend/src/market/watchlists/userChartState.js";

const bars = Array.from({ length: 30 }, (_, i) => ({ date: `2026-10-${String(i + 1).padStart(2, "0")}` }));
const P = (d: number, price: number) => ({ date: `2026-10-${String(d).padStart(2, "0")}`, price });

describe("TA-T6a — hình vẽ chung", () => {
  it("giao diện và Gateway cùng danh sách kiểu (không mất hình khi lưu)", () => {
    expect([...GATEWAY_KINDS].sort()).toEqual([...SHAPE_KINDS].sort());
  });

  it("vẽ theo cú bấm: đủ số cú bấm mới tạo hình; vị thế Mua thêm điểm dừng R:R 2", () => {
    const m = new DrawingManager();
    expect(m.addShapePoint("long", P(1, 100))).toBeNull();
    expect(m.isDrawingShape()).toBe(true);
    const s = m.addShapePoint("long", P(5, 110))!;
    expect(s.kind).toBe("long");
    expect(s.points.map((p) => p.price)).toEqual([100, 110, 95]);
    expect(m.isDrawingShape()).toBe(false);
    const h = m.addShapePoint("hline", P(3, 120))!;
    expect(h.points).toHaveLength(1);
    expect(completeShapePoints("short", [P(1, 100), P(2, 90)])[2].price).toBe(105);
  });

  it("scene: đúng loại phần tử cho từng công cụ", () => {
    const kinds = (k: Parameters<typeof shapeScene>[0], pts: ReturnType<typeof P>[], text?: string) => shapeScene(k, pts, text, { bars }).map((x) => x.kind);
    expect(kinds("hline", [P(3, 100)])).toEqual(["hline", "text"]);
    expect(kinds("ray", [P(1, 100), P(3, 105)])).toEqual(["ray"]);
    expect(kinds("extended", [P(1, 100), P(3, 105)])).toEqual(["ray"]);
    expect(kinds("channel", [P(1, 100), P(10, 110), P(5, 98)])).toEqual(["segment", "polygon", "segment", "segment"]);
    expect(kinds("measure", [P(1, 100), P(11, 110)])).toEqual(["zone", "text"]);
    expect(kinds("long", [P(1, 100), P(5, 110), P(5, 95)])).toEqual(["zone", "zone", "hline", "text", "text"]);
    expect(kinds("arrow", [P(1, 100), P(3, 105)])).toEqual(["segment"]);
    expect(kinds("text", [P(2, 100)], "Vùng mua")).toEqual(["note"]); // TA-T8: ghi chú 12px luôn hiện
    // nhãn đo: chênh giá + % + số nến
    const t = shapeScene("measure", [P(1, 100), P(11, 110)], undefined, { bars }).find((x) => x.kind === "text");
    expect(t && t.kind === "text" ? t.label.text : "").toBe("+10,00 (+10,00%) · 10 nến");
  });

  it("bấm chọn: gần điểm neo -> sửa điểm đó; trên thân -> dời; ngoài -> không chạm", () => {
    const proj = (p: { date: string; price: number }) => ({ x: bars.findIndex((b) => b.date === p.date) * 10, y: 200 - p.price });
    const pts = [P(1, 100), P(11, 120)];
    expect(shapeHit("arrow", pts, undefined, { x: 101, y: 81 }, proj, 7)).toMatchObject({ part: "pt", index: 1 });
    expect(shapeHit("arrow", pts, undefined, { x: 50, y: 90 }, proj, 7)).toMatchObject({ part: "body" });
    expect(shapeHit("arrow", pts, undefined, { x: 50, y: 40 }, proj, 7)).toBeNull();
    expect(shapeHit("hline", [P(5, 100)], undefined, { x: 250, y: 101 }, proj, 7)).toMatchObject({ part: "body" });
  });

  it("lưu / nạp: hình chung qua được kiểm dữ liệu cả giao diện lẫn Gateway; dời cả hình dời mọi điểm", () => {
    const s: ShapeMarking = { id: "s1", toolType: "shape", kind: "channel", points: [P(1, 100), P(10, 110), P(5, 98)], createdAt: 1 };
    expect(sanitizePrimitives([s, { ...s, id: "x", kind: "renko" }])).toHaveLength(1);
    expect(sanitizeChartPrimitives([s])).toHaveLength(1);
    const dates = bars.map((b) => b.date);
    const patch = shiftPrimitive(s, 2, 1, dates);
    expect(patch.points?.map((p) => p.date)).toEqual(["2026-10-03", "2026-10-12", "2026-10-07"]);
  });

  it("khoá / ẩn tất cả: một bước hoàn tác", () => {
    const m = new DrawingManager();
    m.addShapePoint("hline", P(3, 120)); m.addShapePoint("hline", P(4, 121));
    m.setAll({ hidden: true });
    expect(m.getPrimitives().every((p) => p.hidden)).toBe(true);
    m.undo();
    expect(m.getPrimitives().some((p) => p.hidden)).toBe(false);
    expect(Object.keys(SHAPE_SPEC)).toHaveLength(40); // T6a 12 + T6b 28
  });
});
