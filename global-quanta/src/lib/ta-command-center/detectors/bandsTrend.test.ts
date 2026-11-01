import { describe, expect, it } from "vitest";
import { bollingerBands, superTrend } from "./bandsTrend";
import type { OhlcvBar } from "../types";

const bar = (i: number, close: number, spread = 1): OhlcvBar => ({ date: `2026-01-${String(i + 1).padStart(2, "0")}`, open: close, high: close + spread, low: close - spread, close, volume: 100 }) as OhlcvBar;

/** Tính tay, không dùng cách trượt tổng của hàm chính. */
function naiveBb(closes: number[], period: number, mult: number, i: number) {
  const w = closes.slice(i - period + 1, i + 1), m = w.reduce((a, x) => a + x, 0) / period;
  const sd = Math.sqrt(w.reduce((a, x) => a + (x - m) ** 2, 0) / period);
  return { mid: m, upper: m + mult * sd, lower: m - mult * sd };
}

describe("Bollinger", () => {
  const closes = Array.from({ length: 60 }, (_, i) => 100 + 10 * Math.sin(i / 3) + i * 0.2);
  const bars = closes.map((c, i) => bar(i, c));
  it("khớp công thức tính tay, dùng độ lệch chuẩn tổng thể", () => {
    const r = bollingerBands(bars, { period: 20, mult: 2 });
    for (const i of [19, 35, 59]) {
      const e = naiveBb(closes, 20, 2, i);
      expect(r.mid[i]).toBeCloseTo(e.mid, 8);
      expect(r.upper[i]).toBeCloseTo(e.upper, 8);
      expect(r.lower[i]).toBeCloseTo(e.lower, 8);
    }
    expect(r.mid[18]).toBeNull();
  });
  it("giá phẳng thì dải trùng đường giữa, không ra NaN", () => {
    const r = bollingerBands(Array.from({ length: 25 }, (_, i) => bar(i, 50)), { period: 20, mult: 2 });
    expect(r.upper[24]).toBeCloseTo(50, 6);
    expect(r.lower[24]).toBeCloseTo(50, 6);
  });
  it("không nhìn tương lai: bỏ nến sau không đổi giá trị trước đó", () => {
    const full = bollingerBands(bars, { period: 20, mult: 2 }), part = bollingerBands(bars.slice(0, 40), { period: 20, mult: 2 });
    for (let i = 0; i < 40; i++) expect(part.upper[i]).toBe(full.upper[i]);
  });
});

describe("SuperTrend", () => {
  const trend = [...Array.from({ length: 40 }, (_, i) => 100 + i), ...Array.from({ length: 40 }, (_, i) => 139 - i * 1.5)].map((c, i) => bar(i, c, 1.5));
  const r = superTrend(trend, { period: 10, mult: 3 });
  it("xu hướng tăng ở dưới giá, đổi chiều khi giá cắt xuống, xu hướng giảm ở trên giá", () => {
    expect(r.dir[35]).toBe(1);
    expect(r.line[35]!).toBeLessThan(trend[35].close);
    expect(r.dir[75]).toBe(-1);
    expect(r.line[75]!).toBeGreaterThan(trend[75].close);
  });
  it("dải chỉ siết lại khi xu hướng giữ nguyên", () => {
    for (let i = 11; i < 38; i++) if (r.dir[i] === 1 && r.dir[i - 1] === 1) expect(r.line[i]!).toBeGreaterThanOrEqual(r.line[i - 1]!);
    for (let i = 60; i < 80; i++) if (r.dir[i] === -1 && r.dir[i - 1] === -1) expect(r.line[i]!).toBeLessThanOrEqual(r.line[i - 1]!);
  });
  it("mỗi nến chỉ thuộc một màu; chưa đủ nến thì rỗng", () => {
    for (let i = 0; i < trend.length; i++) expect(r.up[i] != null && r.down[i] != null).toBe(false);
    expect(r.line[8]).toBeNull();
    expect(superTrend(trend.slice(0, 5), { period: 10, mult: 3 }).line.every((x) => x == null)).toBe(true);
  });
  it("không nhìn tương lai", () => {
    const part = superTrend(trend.slice(0, 50), { period: 10, mult: 3 });
    for (let i = 0; i < 50; i++) expect(part.line[i]).toBe(r.line[i]);
  });
});
