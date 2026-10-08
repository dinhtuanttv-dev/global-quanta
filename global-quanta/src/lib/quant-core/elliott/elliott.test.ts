import { describe, expect, it } from "vitest";
import { confirmedPivotsAt, elliottState, pivotsOf } from "./index";
import type { OhlcvBar } from "../../ta-command-center/types";

const day = (i: number) => new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10);
function bars(n: number, f: (i: number) => number): OhlcvBar[] {
  return Array.from({ length: n }, (_, i) => { const c = f(i); return { date: day(i), open: c * 0.998, high: c * 1.006, low: c * 0.994, close: c, volume: 1000 + (i % 9) * 50 }; });
}

describe("quant-core Elliott", () => {
  it("pivot có chỉ số xác nhận; trên bars[0..t] = toàn chuỗi lọc ci ≤ t (không nhìn trước)", () => {
    const b = bars(300, (i) => 100 + Math.sin(i / 6) * 8 + Math.sin(i / 23) * 4 + i * 0.05);
    const full = pivotsOf(b);
    expect(full.filter((p) => p.ci != null).every((p) => p.ci! > p.i)).toBe(true);
    for (const t of [120, 200, 299]) {
      const part = pivotsOf(b.slice(0, t + 1)).filter((p) => p.ci != null);
      expect(part.map((p) => `${p.i}${p.type}`)).toEqual(confirmedPivotsAt(full, t).map((p) => `${p.i}${p.type}`));
    }
  });

  it("dựng 5 sóng tăng + A, B đã xác nhận -> đếm đúng 0–5 và đang ở sóng C, có mốc vô hiệu và mức Fibonacci", () => {
    // 0 → 1 (+20) → 2 (−10) → 3 (+35) → 4 (−12) → 5 (+18) → A (−15) → B (+6)
    const legs = [[0, 100], [20, 120], [30, 110], [55, 145], [65, 133], [80, 151], [92, 136], [100, 142], [110, 139]];
    const f = (i: number) => {
      for (let k = 1; k < legs.length; k++) if (i <= legs[k][0]) { const [i0, p0] = legs[k - 1], [i1, p1] = legs[k]; return p0 + ((p1 - p0) * (i - i0)) / (i1 - i0); }
      return legs[legs.length - 1][1];
    };
    const pre = bars(60, (i) => 100 + Math.sin(i / 3) * 1.5);
    const main = bars(111, f).map((b, i) => ({ ...b, date: day(60 + i) }));
    const s = elliottState([...pre, ...main]);
    expect(s).not.toBeNull();
    expect(s!.scenario.points.map((p) => p.i - 60)).toEqual([0, 20, 30, 55, 65, 80]);
    expect(s!.wave).toBe("C");
    expect(s!.label).toContain("Sóng C");
    expect(s!.levels.length).toBeGreaterThan(0);
    expect(s!.invalidation?.price).toBeGreaterThan(0);
  });

  it("không đủ dữ liệu -> null", () => {
    expect(elliottState(bars(30, () => 100))).toBeNull();
  });
});
