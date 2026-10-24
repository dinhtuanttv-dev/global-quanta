// R1 — tính đúng + nhãn trạng thái của RSI / ADX ở các ca biên (giá trị trên dữ liệu thường không đổi).
import { describe, expect, it } from "vitest";
import { calculateADX, calculateRSI } from "./technicalOscillators";
import type { OhlcvBar } from "../types";

const flat = (n: number, px = 10): OhlcvBar[] => Array.from({ length: n }, (_, i) => ({ date: `2026-01-${String(i + 1).padStart(2, "0")}`, open: px, high: px, low: px, close: px, volume: 0 }));
const trend = (n: number, step: number): OhlcvBar[] => Array.from({ length: n }, (_, i) => ({ date: `d${String(i).padStart(3, "0")}`, open: 10 + i * step, high: 10.5 + i * step, low: 9.5 + i * step, close: 10 + i * step, volume: 100 }));

describe("RSI — chuỗi phẳng / thiếu dữ liệu", () => {
  it("giá đứng yên (ngừng giao dịch) -> 50 + cờ flat, KHÔNG phải 100 (quá mua)", () => {
    const r = calculateRSI(flat(30));
    expect(r.latest).toBe(50);
    expect(r.flat).toBe(true);
  });
  it("chỉ tăng -> vẫn 100 (đúng định nghĩa Wilder); không phẳng", () => {
    const r = calculateRSI(trend(30, 0.2));
    expect(r.latest).toBe(100);
    expect(r.flat).toBe(false);
  });
  it("biến động rồi đứng yên ≥ 14 phiên: chỉ hết 'phẳng' khi trung bình lãi/lỗ về đúng 0 (Wilder không về 0) -> không gắn cờ", () => {
    const r = calculateRSI([...trend(20, 0.2), ...flat(20, 13.8)]);
    expect(r.flat).toBe(false);
  });
  it("thiếu dữ liệu -> null + số nến cần", () => {
    expect(calculateRSI(flat(10))).toMatchObject({ latest: null, flat: false, needBars: 15 });
  });
});

describe("ADX — thiếu dữ liệu không phải 'trend yếu'", () => {
  it("< 28 nến -> chua_du + needBars", () => {
    expect(calculateADX(trend(20, 0.1))).toMatchObject({ latest: null, trendStrength: "chua_du", needBars: 28 });
  });
  it("đủ dữ liệu, xu hướng đều -> có giá trị và nhãn độ mạnh", () => {
    const a = calculateADX(trend(80, 0.3));
    expect(a.latest).not.toBeNull();
    expect(a.trendStrength).not.toBe("chua_du");
  });
});

describe("R4 — DI± theo nến cho pane ADX", () => {
  it("xu hướng tăng đều: +DI > −DI; cùng độ dài chuỗi giá; null trước khi đủ dữ liệu", () => {
    const a = calculateADX(trend(80, 0.3));
    expect(a.plusDI).toHaveLength(80);
    expect(a.plusDI[5]).toBeNull();
    expect(a.plusDI[79]!).toBeGreaterThan(a.minusDI[79]!);
  });
});
