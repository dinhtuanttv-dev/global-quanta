import { describe, expect, it } from "vitest";
import { clusterLevels, convergenceAt, CONVERGENCE } from "./convergence";
import { analyze } from "./index";
import { classicAccumulationSeries, staleSpringSeries } from "./__fixtures__/wyckoffSeries";

describe("Hợp lưu v2 — engine", () => {
  it("chỉ nhận cấu trúc Wyckoff ĐANG HOẠT ĐỘNG; cấu trúc lịch sử -> null", () => {
    const stale = staleSpringSeries(90);
    expect(analyze(stale).wyckoff.status).toBe("historical");
    expect(convergenceAt(stale)).toBeNull();
  });

  it("6 thành phần, tổng điểm tối đa 100, điểm = tổng điểm thành phần, hạng theo ngưỡng", () => {
    // Spring vừa xảy ra, chưa bị phá -> cấu trúc v2 đang hoạt động, phía mua.
    const r = convergenceAt(staleSpringSeries(0))!;
    expect(r).not.toBeNull();
    expect(r.side).toBe("buy");
    expect(r.components.map((c) => c.key)).toEqual(["wyckoff", "zone", "effort", "rs", "tests", "liquidity"]);
    expect(r.components.reduce((s, c) => s + c.max, 0)).toBe(100);
    expect(Math.abs(r.score - r.components.reduce((s, c) => s + c.points, 0))).toBeLessThan(1);
    expect(r.grade).toBe(r.score >= CONVERGENCE.gradeA ? "A" : r.score >= CONVERGENCE.gradeB ? "B" : "C");
  });

  it("mọi mức OB / FVG trong vùng hợp lưu cùng chiều với Wyckoff (phía mua: chỉ OB/FVG tăng)", () => {
    for (const bars of [staleSpringSeries(0), classicAccumulationSeries()]) {
      const r = convergenceAt(bars);
      if (!r) continue;
      for (const l of r.levels.filter((x) => x.kind === "ob" || x.kind === "fvg")) expect(l.label).toContain(r.side === "buy" ? "tăng" : "giảm");
    }
  });

  it("gom mức giá ±1,5%: hai mức gần nhau thành một cụm có 2 loại nguồn", () => {
    const c = clusterLevels([
      { kind: "wyckoff", label: "Hỗ trợ", price: 100, weight: 1 },
      { kind: "ob", label: "OB", price: 101, weight: 1 },
      { kind: "poc", label: "POC", price: 110, weight: 0.7 },
    ]);
    expect(c).toHaveLength(2);
    expect([...c[0].kinds].sort()).toEqual(["ob", "wyckoff"]);
    expect(c[0].price).toBeCloseTo(100.5, 5);
  });

  it("tất định: cùng chuỗi -> cùng kết quả; ngày dữ liệu = nến cuối", () => {
    const bars = staleSpringSeries(5);
    const n = bars.length - 5;
    const a = convergenceAt(bars.slice(0, n)), b = convergenceAt(bars.slice(0, n));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    if (a) expect(a.dataAsOf).toBe(bars[n - 1].date);
  });
});
