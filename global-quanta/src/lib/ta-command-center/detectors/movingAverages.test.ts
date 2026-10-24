// Bộ EMA 21/50/100 · MA 200 + Ichimoku — đối chiếu với cách tính trực tiếp (vòng lặp ngây thơ), không nhìn trước.
import { describe, expect, it } from "vitest";
import { MA_SET, ema, ichimoku, movingAverageSet, sma } from "./movingAverages";
import type { OhlcvBar } from "../types";

const bars: OhlcvBar[] = Array.from({ length: 260 }, (_, i) => {
  const c = 100 + Math.sin(i / 7) * 8 + i * 0.1;
  return { date: `d${String(i).padStart(3, "0")}`, open: c - 0.5, high: c + 1 + (i % 3), low: c - 1 - (i % 2), close: c, volume: 1000 };
});

describe("đường trung bình", () => {
  it("SMA = trung bình cộng đúng `period` giá gần nhất; EMA khởi tạo SMA rồi đệ quy α = 2/(n+1)", () => {
    const c = bars.map((b) => b.close);
    const s = sma(c, 200);
    expect(s[198]).toBeNull();
    expect(s[259]).toBeCloseTo(c.slice(60, 260).reduce((a, b) => a + b, 0) / 200, 9);
    const e = ema(c, 21);
    let ref = c.slice(0, 21).reduce((a, b) => a + b, 0) / 21;
    for (let i = 21; i < 260; i++) ref = c[i] * (2 / 22) + ref * (1 - 2 / 22);
    expect(e[259]).toBeCloseTo(ref, 9);
    expect(e[19]).toBeNull();
  });
  it("bộ 4 đường đúng màu yêu cầu: EMA21 xanh, EMA50 vàng, EMA100 tím, MA200 đỏ nhạt", () => {
    expect(MA_SET.map((m) => [m.id, m.color])).toEqual([["ema21", "#3b82f6"], ["ema50", "#facc15"], ["ema100", "#a855f7"], ["ma200", "#fca5a5"]]);
    const set = movingAverageSet(bars);
    expect(Object.keys(set)).toEqual(["ema21", "ema50", "ema100", "ma200"]);
    expect(set.ma200.filter((v) => v != null)).toHaveLength(61);
  });
  it("không nhìn trước: thêm nến sau không đổi giá trị các nến trước", () => {
    const full = movingAverageSet(bars), part = movingAverageSet(bars.slice(0, 230));
    for (const m of MA_SET) expect(part[m.id]).toEqual(full[m.id].slice(0, 230));
  });
});

describe("Ichimoku 9/26/52/26", () => {
  it("Tenkan/Kijun/Senkou B = trung điểm cao–thấp của 9/26/52 nến; Senkou A = (Tenkan+Kijun)/2", () => {
    const r = ichimoku(bars);
    const mid = (i: number, n: number) => { const w = bars.slice(i - n + 1, i + 1); return (Math.max(...w.map((b) => b.high)) + Math.min(...w.map((b) => b.low))) / 2; };
    for (const i of [60, 150, 259]) {
      expect(r.tenkan[i]).toBeCloseTo(mid(i, 9), 9);
      expect(r.kijun[i]).toBeCloseTo(mid(i, 26), 9);
      expect(r.spanB[i]).toBeCloseTo(mid(i, 52), 9);
      expect(r.spanA[i]).toBeCloseTo((mid(i, 9) + mid(i, 26)) / 2, 9);
    }
    expect(r.spanB[50]).toBeNull();
  });
  it("Chikou = giá đóng cửa 26 nến sau, vẽ lùi; 26 nến cuối không có; Senkou không nhìn trước", () => {
    const r = ichimoku(bars);
    expect(r.chikou[100]).toBe(bars[126].close);
    expect(r.chikou.slice(-26).every((v) => v === null)).toBe(true);
    const part = ichimoku(bars.slice(0, 200));
    expect(part.spanA).toEqual(r.spanA.slice(0, 200));
    expect(part.spanB).toEqual(r.spanB.slice(0, 200));
  });
});
