import { describe, expect, it } from "vitest";
import { FIT_3D, domainOf, flatPlot, isFreshImproving, niceStep, placeLabels, projectPoint, type Box } from "./rrg4dGeometry";

const R = { yaw: 0.62, pitch: -0.38, zoom: 1 };
const plot = flatPlot(1000, 600, 1), center = { x: 500, y: 298 };

describe("Phép chiếu RRG", () => {
  it("chế độ phẳng: mọi điểm đúng phía trục và khớp tuyến tính, không phụ thuộc Z", () => {
    for (const [x, y] of [[0.5, 0.5], [-0.5, 0.5], [0.5, -0.5], [-0.5, -0.5], [0.01, -0.01], [-0.99, 0.99]]) {
      for (const z of [-1, 0, 1]) {
        const p = projectPoint({ x, y, z }, R, "flat", plot, center);
        expect(p.x >= plot.cx).toBe(x >= 0);
        expect(p.y <= plot.cy).toBe(y >= 0);
        expect(p.x).toBeCloseTo(plot.cx + x * plot.sx);
        expect(p.y).toBeCloseTo(plot.cy - y * plot.sy);
      }
    }
  });
  it("3D có thể làm điểm hiện sai phía, đây là lý do mặc định phẳng", () => {
    const p = projectPoint({ x: 0.1, y: 0.05, z: 0.9 }, R, "3d", plot, center);
    expect(p.x < center.x).toBe(true);
  });
  it("điểm ở biên ±1 vẫn nằm trong khung vẽ", () => {
    const a = projectPoint({ x: 1, y: 1, z: 0 }, R, "flat", plot, center), b = projectPoint({ x: -1, y: -1, z: 0 }, R, "flat", plot, center);
    expect(a.x).toBeLessThanOrEqual(1000); expect(a.y).toBeGreaterThanOrEqual(0);
    expect(b.x).toBeGreaterThanOrEqual(0); expect(b.y).toBeLessThanOrEqual(600);
  });
  it("khối 3D ở góc nhìn mặc định nằm trọn trong khung", () => {
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
      const p = projectPoint({ x, y, z }, { ...R, zoom: FIT_3D }, "3d", plot, center);
      expect(p.x).toBeGreaterThanOrEqual(0); expect(p.x).toBeLessThanOrEqual(1000);
      expect(p.y).toBeGreaterThanOrEqual(0); expect(p.y).toBeLessThanOrEqual(600);
    }
  });
  it("bước trục đẹp và miền chừa biên, có sàn", () => {
    expect(niceStep(3.67)).toBe(2);
    expect(niceStep(6.37)).toBe(5);
    expect(domainOf([1, -3])).toBeCloseTo(3.36);
    expect(domainOf([0.1])).toBe(1.5);
  });
});

describe("Vừa vào Cải thiện", () => {
  const w = (d: string, quadrant: "IMPROVING" | "LAGGING" | "LEADING") => ({ week: d, quadrant });
  it("đúng trong 2 tuần kể từ khi vào, quá thì không", () => {
    expect(isFreshImproving([w("2026-10-09", "LAGGING"), w("2026-10-16", "IMPROVING")])).toBe(true);
    expect(isFreshImproving([w("2026-10-02", "LAGGING"), w("2026-10-09", "IMPROVING"), w("2026-10-16", "IMPROVING"), w("2026-10-23", "IMPROVING")])).toBe(true);
    expect(isFreshImproving([w("2026-09-25", "LAGGING"), w("2026-10-02", "IMPROVING"), w("2026-10-09", "IMPROVING"), w("2026-10-16", "IMPROVING"), w("2026-10-23", "IMPROVING")])).toBe(false);
  });
  it("không có điểm vào trong dữ liệu hoặc đang ở góc khác thì không gọi là vừa vào", () => {
    expect(isFreshImproving([w("2026-10-16", "IMPROVING"), w("2026-10-23", "IMPROVING")])).toBe(false);
    expect(isFreshImproving([w("2026-10-16", "IMPROVING"), w("2026-10-23", "LEADING")])).toBe(false);
    expect(isFreshImproving([])).toBe(false);
  });
});

describe("Đặt nhãn", () => {
  const overlaps = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  it("18 điểm chụm giữa vẫn có đủ nhãn, trong khung, không chồng nhau", () => {
    const items = Array.from({ length: 18 }, (_, i) => ({ id: `s${i}`, x: 500 + Math.cos(i) * (20 + i * 6), y: 300 + Math.sin(i) * (20 + i * 5), w: 90, h: 16, priority: 0 }));
    const m = placeLabels(items, [], { W: 1000, H: 600 }, { x: 500, y: 300 });
    expect(m.size).toBe(18);
    const boxes = [...m.values()];
    for (const b of boxes) { expect(b.left).toBeGreaterThanOrEqual(0); expect(b.right).toBeLessThanOrEqual(1000); expect(b.top).toBeGreaterThanOrEqual(0); expect(b.bottom).toBeLessThanOrEqual(600); }
    let clash = 0;
    boxes.forEach((a, i) => boxes.slice(i + 1).forEach((b) => { if (overlaps(a, b)) clash++; }));
    expect(clash).toBe(0);
  });
  it("tránh vật cản; không gian quá chật vẫn không bỏ tên", () => {
    const m = placeLabels([{ id: "a", x: 100, y: 100, w: 60, h: 14, priority: 0 }], [{ left: 110, top: 80, right: 200, bottom: 120 }], { W: 400, H: 300 }, { x: 200, y: 150 });
    expect(overlaps(m.get("a")!, { left: 110, top: 80, right: 200, bottom: 120 })).toBe(false);
    const tight = placeLabels(Array.from({ length: 30 }, (_, i) => ({ id: `t${i}`, x: 50, y: 30, w: 70, h: 14, priority: 0 })), [], { W: 120, H: 60 }, { x: 60, y: 30 });
    expect(tight.size).toBe(30);
  });
  it("nhãn không đè lên chấm và vòng đánh dấu của chính nó", () => {
    const m = placeLabels([{ id: "a", x: 300, y: 200, w: 90, h: 16, priority: 0, r: 13 }], [], { W: 800, H: 500 }, { x: 400, y: 250 });
    expect(overlaps(m.get("a")!, { left: 287, top: 187, right: 313, bottom: 213 })).toBe(false);
  });
  it("nhãn ưu tiên được chọn vị trí trước, không bị nhãn khác đẩy đi", () => {
    const top = { id: "top", x: 302, y: 202, w: 80, h: 14, priority: 5 }, bounds = { W: 800, H: 500 }, c = { x: 400, y: 250 };
    const m = placeLabels([{ id: "x", x: 300, y: 200, w: 80, h: 14, priority: 0 }, top], [], bounds, c);
    const wider = placeLabels([{ id: "x", x: 300, y: 200, w: 220, h: 30, priority: 0 }, top], [], bounds, c);
    expect(wider.get("top")).toEqual(m.get("top"));
    expect(overlaps(m.get("top")!, m.get("x")!)).toBe(false);
  });
});
