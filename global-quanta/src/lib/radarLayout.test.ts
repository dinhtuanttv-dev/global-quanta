import { describe, expect, it } from "vitest";
import { buildSlices, layoutRadar, radiusForScore, CX, CY, R_MAX, type LayoutInput } from "./radarLayout";

const mk = (ticker: string, score: number, group: string, smart = 60): LayoutInput => ({ ticker, score, group, smart, core: score >= 4 });
const angleOf = (x: number, y: number) => (Math.atan2(y - CY, x - CX) * 180) / Math.PI;
const inSlice = (ang: number, a0: number, a1: number) => {
  let a = ang;
  while (a < a0 - 1e-6) a += 360;
  while (a > a1 + 1e-6) a -= 360;
  return a >= a0 - 1e-6 && a <= a1 + 1e-6;
};

describe("Bố cục radar: góc = nhóm ngành, bán kính = điểm hội tụ, chống chồng lấn", () => {
  it("lát ngành phủ đủ 360°, tỉ lệ số mã, lát nhỏ vẫn ≥ ~22°", () => {
    const s = buildSlices(["A", "A", "A", "A", "A", "A", "A", "A", "B", "C"]);
    expect(s.map((x) => x.group)).toEqual(["A", "B", "C"]);
    const total = s.reduce((a, x) => a + (x.a1 - x.a0), 0);
    expect(total).toBeCloseTo(360, 6);
    expect(s[0].a0).toBe(-90);
    expect(s[2].a1 - s[2].a0).toBeGreaterThan(20);
  });

  it("mỗi mã nằm trong lát ngành của nó và quanh vòng điểm (±10px); Core gần tâm hơn Ring", () => {
    const inputs = [
      mk("AAA", 5, "Tài chính"), mk("BBB", 4, "Tài chính"), mk("CCC", 1, "Tài chính"), mk("DDD", 0, "Tài chính"),
      mk("EEE", 3, "Công nghiệp"), mk("FFF", 2, "Công nghiệp"), mk("GGG", 6, "Tiêu dùng"), mk("HHH", 0, "Tiêu dùng"),
    ];
    const { nodes, slices } = layoutRadar(inputs);
    const sl = new Map(slices.map((s) => [s.group, s]));
    for (const n of nodes) {
      const r = Math.hypot(n.x - CX, n.y - CY);
      expect(r - radiusForScore(n.score)).toBeGreaterThanOrEqual(-10.5); // nới ra ngoài khi đông, không vào trong
      expect(r).toBeLessThanOrEqual(R_MAX);
      const s = sl.get(n.group)!;
      expect(inSlice(angleOf(n.x, n.y), s.a0, s.a1)).toBe(true);
    }
    const r = (t: string) => { const n = nodes.find((x) => x.ticker === t)!; return Math.hypot(n.x - CX, n.y - CY); };
    expect(r("GGG")).toBeLessThan(r("AAA"));
    expect(r("AAA")).toBeLessThan(r("CCC"));
  });

  it("60 mã cùng một ngành: không còn cặp chấm đè lên nhau; chỉ hiện nhãn cho Core + mã điểm cao nhất; kết quả xác định", () => {
    const inputs = Array.from({ length: 60 }, (_, i) => mk(`M${String(i).padStart(2, "0")}`, i % 3, "Tài chính", 40 + (i % 50)));
    const a = layoutRadar(inputs);
    let overlaps = 0;
    for (let i = 0; i < a.nodes.length; i++) for (let j = i + 1; j < a.nodes.length; j++) {
      const p = a.nodes[i], q = a.nodes[j];
      if (Math.hypot(p.x - q.x, p.y - q.y) < p.dot + q.dot) overlaps++;
    }
    expect(overlaps).toBe(0);
    expect(a.nodes.filter((n) => n.showLabel).length).toBe(26);
    const b = layoutRadar(inputs);
    expect(b.nodes.map((n) => [n.x.toFixed(3), n.y.toFixed(3)])).toEqual(a.nodes.map((n) => [n.x.toFixed(3), n.y.toFixed(3)]));
  });

  it("60 mã trải 5 nhóm ngành, điểm 0–6: không chồng lấn", () => {
    const groups = ["Tài chính", "Bất động sản", "Công nghiệp", "Tiêu dùng", "Năng lượng"];
    // Thực tế radarModel chỉ cho tối đa 5 mã Core (vòng tròn lớn); các mã điểm ≥ 4 còn lại là chấm thường.
    const inputs = Array.from({ length: 60 }, (_, i) => ({ ...mk(`N${String(i).padStart(2, "0")}`, (i * 5) % 7, groups[(i * 3) % 5], 30 + (i * 13) % 70), core: i < 5 && (i * 5) % 7 >= 4 }));
    const { nodes } = layoutRadar(inputs);
    let overlaps = 0;
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      if (Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y) < nodes[i].dot + nodes[j].dot) overlaps++;
    }
    expect(overlaps).toBe(0);
  });
});
