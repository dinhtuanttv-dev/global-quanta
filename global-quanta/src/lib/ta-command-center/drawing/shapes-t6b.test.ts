// @vitest-environment node
// TA-T6b — mẫu hình giá, sóng Elliott, chu kỳ, cọ vẽ (kéo tay), đường dẫn (bấm nhiều điểm), mũi tên, hình học:
// tỉ lệ Fibonacci đúng, scene đúng loại, bấm chọn khớp cách vẽ, kéo tay lấy mẫu ≤ 400 điểm, thanh vẽ / E2E đủ mọi kiểu.
import { describe, expect, it } from "vitest";
import { DrawingManager } from "../DrawingManager";
import { MAX_SHAPE_POINTS, SHAPE_GROUPS, SHAPE_KINDS, SHAPE_SPEC, shapeHit, shapeScene, thinPoints, type ShapeKind } from "./shapes";
import { cycleXs, rotRectCorners, sineY } from "./geometry";
import { REVEAL } from "../../../components/MainTabs/TaVnIndex/workspace/parityManifest";

const bars = Array.from({ length: 60 }, (_, i) => ({ date: `2026-09-${String(i + 1).padStart(2, "0")}` }));
const P = (d: number, price: number) => ({ date: `2026-09-${String(d).padStart(2, "0")}`, price });
const proj = (p: { date: string; price: number }) => ({ x: bars.findIndex((b) => b.date === p.date) * 10, y: 500 - p.price });
type Pt = ReturnType<typeof P>;
const kinds = (k: ShapeKind, pts: Pt[]) => shapeScene(k, pts, undefined, { bars }).map((x) => x.kind);
const texts = (k: ShapeKind, pts: Pt[]) => shapeScene(k, pts, undefined, { bars }).flatMap((x) => (x.kind === "text" ? [x.label.text] : []));

describe("TA-T6b — bộ công cụ vẽ mở rộng", () => {
  it("mỗi nhóm có ít nhất một kiểu; mọi kiểu thuộc một nhóm có trên thanh vẽ", () => {
    for (const g of SHAPE_GROUPS) expect(SHAPE_KINDS.some((k) => SHAPE_SPEC[k].group === g.id)).toBe(true);
    for (const k of SHAPE_KINDS) expect(SHAPE_GROUPS.some((g) => g.id === SHAPE_SPEC[k].group)).toBe(true);
  });

  it("E2E: mọi kiểu đều có đúng một đường mở, qua nhóm của nó (REVEAL)", () => {
    for (const k of SHAPE_KINDS) {
      const rules = REVEAL.filter((r) => r.match.test(`[data-shape=${k}]`));
      expect(rules, k).toHaveLength(1);
      expect(rules[0].by.docked?.[0]?.[0], k).toBe(`[data-testid=shape-group-${SHAPE_SPEC[k].group}]`);
    }
  });

  it("XABCD: tỉ lệ XB = AB/XA, AC = BC/AB, BD = CD/BC, XD = AD/XA (như TradingView)", () => {
    // X=100, A=200 (XA 100), B=138,2 (AB 61,8 -> 0,618), C=176,4 (BC 38,2 -> 0,618), D=121,4 (CD 55 -> 1,440), AD 78,6 -> 0,786
    const pts = [P(1, 100), P(10, 200), P(20, 138.2), P(30, 176.4), P(40, 121.4)];
    expect(texts("xabcd", pts)).toEqual(["0,618", "0,618", "1,440", "0,786"]);
    expect(kinds("xabcd", pts).filter((x) => x === "polygon")).toHaveLength(2);
  });

  it("ABCD: tỉ lệ từng chân; vai-đầu-vai: đường cổ qua 2 đáy cổ", () => {
    expect(texts("abcd", [P(1, 100), P(10, 200), P(20, 150), P(30, 250)])).toEqual(["0,500", "2,000"]);
    const hs = shapeScene("headShoulders", [P(1, 100), P(5, 150), P(9, 120), P(14, 180), P(19, 121), P(24, 151), P(28, 100)], undefined, { bars });
    const neck = hs.find((x) => x.kind === "ray");
    expect(neck && neck.kind === "ray" ? [neck.a.price, neck.b.price] : null).toEqual([120, 121]);
  });

  it("Elliott: nhãn điểm (0)…(5); bản nháp hiện dần đúng số nhãn", () => {
    const sc = shapeScene("impulse", [P(1, 100), P(5, 120), P(8, 110), P(15, 150)], undefined, { bars }, true);
    const lab = sc.find((x) => x.kind === "poly" && x.nodeLabels);
    expect(lab && lab.kind === "poly" ? lab.nodeLabels : null).toEqual(["(0)", "(1)", "(2)", "(3)"]);
    expect(SHAPE_SPEC.wxyxz.labels).toEqual(["(0)", "(W)", "(X)", "(Y)", "(X)", "(Z)"]);
  });

  it("chu kỳ: vạch cách đều hai phía; đường sin qua đúng 2 cực trị; bấm trúng vạch / sin / nửa vòng", () => {
    expect(cycleXs([100, 0], [130, 0], 200)).toEqual([10, 40, 70, 100, 130, 160, 190]);
    expect(sineY([100, 50], [130, 90], 100)).toBeCloseTo(50);
    expect(sineY([100, 50], [130, 90], 130)).toBeCloseTo(90);
    expect(sineY([100, 50], [130, 90], 160)).toBeCloseTo(50);
    const pts = [P(11, 400), P(14, 380)]; // x 100 -> 130, y 100 -> 120
    expect(shapeHit("cyclicLines", pts, undefined, { x: 191, y: 300 }, proj, 7)).toMatchObject({ part: "body" });
    expect(shapeHit("cyclicLines", pts, undefined, { x: 175, y: 300 }, proj, 7)).toBeNull();
    expect(shapeHit("sineLine", pts, undefined, { x: 160, y: 101 }, proj, 7)).toMatchObject({ part: "body" });
    // nửa vòng thứ 2: tâm (145, 100) bán kính 15 -> đỉnh (145, 85)
    expect(shapeHit("timeCycles", pts, undefined, { x: 145, y: 85 }, proj, 7)).toMatchObject({ part: "body" });
    expect(kinds("timeCycles", pts)).toEqual(["cycle"]);
  });

  it("cọ vẽ: kéo tay -> lấy mẫu ≤ 400 điểm, bỏ trùng; dời cả nét (không sửa từng điểm)", () => {
    const m = new DrawingManager();
    for (let i = 0; i < 1500; i++) m.addShapePoint("brush", P(1 + (i % 50), 100 + i));
    expect(m.isDrawingShape()).toBe(true);
    const s = m.finishShape()!;
    expect(s.kind).toBe("brush");
    expect(s.points.length).toBe(MAX_SHAPE_POINTS);
    expect(s.points[0]).toEqual(P(1, 100));
    expect(thinPoints([P(1, 1), P(1, 1), P(2, 1)])).toHaveLength(2);
    expect(shapeHit("brush", [P(1, 100), P(3, 100), P(5, 100)], undefined, { x: 0, y: 400 }, proj, 7)).toMatchObject({ part: "body" });
    // một cú bấm (chưa kéo) -> không tạo hình
    m.addShapePoint("highlighter", P(2, 100));
    expect(m.finishShape()).toBeNull();
  });

  it("đường dẫn: bấm nhiều điểm, bấm đúp (điểm trùng) không thêm điểm, xong bằng finishShape", () => {
    const m = new DrawingManager();
    expect(m.addShapePoint("path", P(1, 100))).toBeNull();
    expect(m.addShapePoint("path", P(5, 110))).toBeNull();
    expect(m.addShapePoint("path", P(9, 105))).toBeNull();
    m.addShapePoint("path", P(9, 105)); // bấm đúp
    expect(m.finishShape()!.points).toHaveLength(3);
    m.addShapePoint("polyline", P(1, 100)); m.addShapePoint("polyline", P(2, 100));
    expect(m.finishShape()).toBeNull(); // gấp khúc khép kín cần ≥ 3 điểm
  });

  it("hình học: scene đúng chế độ; bấm trong hình tròn / elip / tam giác trúng thân", () => {
    const mode = (k: ShapeKind, pts: Pt[]) => shapeScene(k, pts, undefined, { bars }).map((x) => (x.kind === "pathx" ? x.mode : x.kind));
    expect(mode("circle", [P(11, 400), P(14, 400)])).toEqual(["circle"]);
    expect(mode("arc", [P(1, 400), P(5, 420), P(9, 400)])).toEqual(["arc"]);
    expect(mode("curve", [P(1, 400), P(5, 420), P(9, 400)])).toEqual(["quad"]);
    expect(mode("doubleCurve", [P(1, 400), P(3, 420), P(6, 380), P(9, 400)])).toEqual(["cubic"]);
    expect(mode("rotatedRect", [P(1, 400), P(9, 420), P(9, 380)])).toEqual(["rotRect"]);
    expect(shapeHit("circle", [P(11, 400), P(14, 400)], undefined, { x: 110, y: 110 }, proj, 7)).toMatchObject({ part: "body" });
    expect(shapeHit("circle", [P(11, 400), P(14, 400)], undefined, { x: 100, y: 160 }, proj, 7)).toBeNull();
    expect(shapeHit("ellipse", [P(11, 400), P(21, 380)], undefined, { x: 150, y: 110 }, proj, 7)).toMatchObject({ part: "body" });
    expect(shapeHit("triangleShape", [P(1, 400), P(21, 400), P(11, 300)], undefined, { x: 100, y: 150 }, proj, 7)).toMatchObject({ part: "body" });
    expect(rotRectCorners([0, 0], [10, 0], [5, 4])).toEqual([[0, 0], [10, 0], [10, 4], [0, 4]]);
  });

  it("mũi tên lên / xuống: dấu neo tại giá; bấm trúng thân dấu", () => {
    expect(kinds("arrowUp", [P(11, 400)])).toEqual(["glyph"]);
    expect(shapeHit("arrowUp", [P(11, 400)], undefined, { x: 101, y: 115 }, proj, 7)).toMatchObject({ part: "body" });
    expect(shapeHit("arrowDown", [P(11, 400)], undefined, { x: 101, y: 85 }, proj, 7)).toMatchObject({ part: "body" });
    expect(shapeHit("arrowDown", [P(11, 400)], undefined, { x: 101, y: 125 }, proj, 7)).toBeNull();
  });
});
