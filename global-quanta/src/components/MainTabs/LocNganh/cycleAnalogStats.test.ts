import { describe, expect, it } from "vitest";
import type { CycleV2Neighbor } from "../../../types/cycleFingerprintV2";
import { amplitudeMismatch, summarizeAnalogs, weightedQuantile, windowMovePct } from "./cycleAnalogStats";

const n = (d20: number | null, weight: number | null = 1) => ({ weight, excess: { d10: null, d20, d40: null, d60: null } }) as unknown as CycleV2Neighbor;

describe("Thống kê giai đoạn tương tự", () => {
  it("phân vị có trọng số đúng, kể cả trọng số lệch", () => {
    expect(weightedQuantile([{ v: 1, w: 1 }, { v: 2, w: 1 }, { v: 3, w: 1 }], 0.5)).toBe(2);
    expect(weightedQuantile([{ v: 1, w: 9 }, { v: 100, w: 1 }], 0.5)).toBe(1);
    expect(weightedQuantile([], 0.5)).toBeNull();
    expect(weightedQuantile([{ v: 5, w: 0 }], 0.5)).toBeNull();
  });
  it("một giai đoạn ngoại lệ +130% không kéo lệch trung vị", () => {
    const s = summarizeAnalogs([n(1), n(2), n(-1), n(0.5), n(130)], "d20");
    expect(s.median).toBe(1);
    expect(s.p90).toBe(130);
    expect(s.p10).toBe(-1);
    expect(s.shareUp).toBeCloseTo(0.8);
    expect(s.n).toBe(5);
  });
  it("giá trị thiếu không tính thành 0; không có dữ liệu thì trả null", () => {
    const s = summarizeAnalogs([n(null), n(-2), n(4, null)], "d20");
    expect(s.n).toBe(2);
    expect(s.shareUp).toBeCloseTo(0.5);
    expect(summarizeAnalogs([n(null)], "d20").median).toBeNull();
    expect(summarizeAnalogs([n(null)], "d20").shareUp).toBeNull();
  });
  it("biên độ: FPT −20,6% với HSL −48,7% là lệch; mức nhỏ thì không", () => {
    expect(windowMovePct([100, 90, 79.4])).toBeCloseTo(-20.6);
    expect(windowMovePct([100])).toBeNull();
    expect(amplitudeMismatch(-20.6, -48.7)).toBe(true);
    expect(amplitudeMismatch(-20.6, -30)).toBe(false);
    expect(amplitudeMismatch(2, 10)).toBe(false);
    expect(amplitudeMismatch(null, -50)).toBe(false);
  });
});
