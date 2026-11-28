import { describe, expect, it } from "vitest";
import { atr, mfi, obv, parabolicSar, stochRsi, stochastic, trueRange } from "./extraIndicators";
import type { OhlcvBar } from "../types";

// 4 nến tính tay được (mọi số dưới đây tính bằng tay theo đúng công thức TradingView).
const B: OhlcvBar[] = [
  { date: "2026-01-02", open: 10, high: 12, low: 10, close: 11, volume: 100 },
  { date: "2026-01-05", open: 11, high: 13, low: 11, close: 12, volume: 200 },
  { date: "2026-01-06", open: 12, high: 15, low: 12, close: 14, volume: 300 },
  { date: "2026-01-07", open: 14, high: 14, low: 13, close: 13, volume: 400 },
];

describe("TA-T4 — 6 chỉ báo mới (công thức chỉ báo dựng sẵn TradingView)", () => {
  it("True Range + ATR (RMA): giá trị đầu = TB TR, sau đó (ATR·(n−1) + TR) / n", () => {
    expect(trueRange(B)).toEqual([2, 2, 3, 1]);
    const a = atr(B, 3);
    expect(a.slice(0, 2)).toEqual([null, null]);
    expect(a[2]).toBeCloseTo(7 / 3, 10);
    expect(a[3]).toBeCloseTo(17 / 9, 10);
  });
  it("OBV: cộng KL khi tăng, trừ khi giảm, giữ khi bằng", () => {
    const bars = [11, 12, 11, 11, 13].map((c, i) => ({ date: `d${i}`, open: c, high: c, low: c, close: c, volume: (i + 1) * 100 }));
    expect(obv(bars)).toEqual([0, 200, -100, -100, 400]);
  });
  it("Stochastic: %K = vị trí giá đóng cửa trong biên độ N nến; %D = SMA của %K", () => {
    const s = stochastic(B, { length: 3, smoothK: 1, smoothD: 2 });
    expect(s.k).toEqual([null, null, 80, 50]);
    expect(s.d[3]).toBe(65);
  });
  it("MFI: không có dòng tiền âm -> 100; có cả hai -> 100 − 100/(1 + dương/âm)", () => {
    const m = mfi(B, 2);
    expect(m[2]).toBe(100);
    const pos = 13.666666666666666 * 300, neg = 13.333333333333334 * 400;
    expect(m[3]).toBeCloseTo(100 - 100 / (1 + pos / neg), 8);
  });
  it("Parabolic SAR: khởi đầu theo chiều 2 nến đầu; không vượt đáy 2 nến trước; tăng hệ số khi lập đỉnh mới", () => {
    const p = parabolicSar(B);
    expect(p.sar[1]).toBe(10);
    expect(p.sar[2]).toBe(10); // 10 + 0,02·(13 − 10) = 10,06 bị chặn bởi đáy nến 0 (10)
    expect(p.sar[3]).toBeCloseTo(10.2, 10); // hệ số 0,04 sau đỉnh mới 15
    expect(p.up.slice(1)).toEqual([true, true, true]);
  });
  it("Stoch RSI: trong miền 0–100, chưa đủ dữ liệu thì null, %D là SMA 3 của %K", () => {
    const bars = Array.from({ length: 80 }, (_, i) => { const c = 100 + 10 * Math.sin(i / 5) + i * 0.2; return { date: `d${i}`, open: c, high: c + 1, low: c - 1, close: c, volume: 1000 }; });
    const s = stochRsi(bars);
    expect(s.k[20]).toBeNull();
    const ks = s.k.filter((v): v is number => v != null);
    expect(ks.length).toBeGreaterThan(30);
    expect(Math.min(...ks)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...ks)).toBeLessThanOrEqual(100);
    const i = 70;
    expect(s.d[i]).toBeCloseTo(((s.k[i] as number) + (s.k[i - 1] as number) + (s.k[i - 2] as number)) / 3, 10);
  });
});
