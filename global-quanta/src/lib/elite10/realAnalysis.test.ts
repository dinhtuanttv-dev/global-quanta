import { describe, expect, it } from "vitest";
import { bollinger, computeIndicatorBars, dmiWilder, emaSeriesNullable, rsiWilder, smaSeries } from "./indicators";
import { buildEliteAnalysis, toWeekly } from "./realAnalysis";
import type { OhlcBar } from "../../types/taVnIndex";

const day = (i: number) => new Date(Date.UTC(2024, 0, 1) + i * 86_400_000).toISOString().slice(0, 10);
/** Chuỗi ngày làm việc (bỏ T7/CN) có xu hướng + dao động xác định. */
function series(n: number, f: (i: number) => number) {
  const out: { date: string; open: number; high: number; low: number; close: number; volume: number }[] = [];
  for (let i = 0, k = 0; out.length < n; i++) {
    const d = new Date(Date.UTC(2024, 0, 1) + i * 86_400_000);
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
    const c = f(k++);
    out.push({ date: d.toISOString().slice(0, 10), open: c * 0.995, high: c * 1.01, low: c * 0.985, close: c, volume: 1e6 + (k % 7) * 1e5 });
  }
  return out;
}

describe("E0 chỉ báo (công thức chuẩn, null khi chưa đủ nến)", () => {
  it("SMA/EMA/Bollinger/RSI trên chuỗi đơn giản", () => {
    expect(smaSeries([1, 2, 3, 4], 2)).toEqual([null, 1.5, 2.5, 3.5]);
    const e = emaSeriesNullable([2, 4, 6, 8], 2);
    expect(e[0]).toBeNull();
    expect(e[1]).toBe(3); // khởi tạo = SMA
    expect(e[2]).toBeCloseTo(6 * (2 / 3) + 3 / 3, 10);
    const bb = bollinger(Array(25).fill(10), 20, 2);
    expect(bb.upper[24]).toBe(10);
    expect(bb.lower[24]).toBe(10);
    const up = rsiWilder(Array.from({ length: 30 }, (_, i) => 10 + i), 14);
    expect(up[13]).toBeNull();
    expect(up[29]).toBe(100);
    expect(rsiWilder(Array(30).fill(5), 14)[29]).toBe(50);
  });

  it("ADX cao và +DI > −DI trong xu hướng tăng đều; MACD dương", () => {
    const bars: OhlcBar[] = Array.from({ length: 120 }, (_, i) => ({ time: day(i), open: 100 + i, high: 101 + i, low: 99 + i, close: 100.5 + i, volume: 1 }));
    const d = dmiWilder(bars, 14);
    expect(d.adx[27]).not.toBeNull();
    expect(d.adx[26]).toBeNull();
    expect(d.adx[119]!).toBeGreaterThan(50);
    expect(d.plusDi[119]!).toBeGreaterThan(d.minusDi[119]!);
    const ci = computeIndicatorBars(bars);
    expect(ci[119].macdLine!).toBeGreaterThan(0);
    expect(ci[119].sma200).toBeNull(); // chưa đủ 200 nến -> không điền số
  });
});

describe("E0 dựng phân tích thật cho Elite 10", () => {
  const bars = series(400, (k) => 50 + 10 * Math.sin(k / 15) + k * 0.05);

  it("không còn số mẫu: chỉ báo theo giá thật, khác nhau giữa hai mã", () => {
    const a = buildEliteAnalysis("AAA", "D", bars)!;
    const b = buildEliteAnalysis("BBB", "D", series(400, (k) => 20 + 3 * Math.cos(k / 9)))!;
    expect(a.priceSeries).toHaveLength(400);
    expect(a.rsi.value.source).toBe("HARD_DATA");
    expect(a.rsi.value.value).not.toBe(b.rsi.value.value);
    expect(a.rsi.value.value).not.toBe(58.3);
    expect(a.adx.adx.value).not.toBe(24.5);
    expect(a.trendline).toEqual([]);
    expect(a.events).toEqual([]);
    expect(a.wyckoff.phase).toBeNull();
    for (const z of a.smc.zones) {
      expect(["order_block_bullish", "order_block_bearish", "fvg"]).toContain(z.kind);
      expect(z.priceTop).toBeGreaterThanOrEqual(z.priceBottom);
    }
    expect(a.smc.zones.every((z) => !z.id.includes("mock"))).toBe(true);
  });

  it("khung tuần gộp đúng; chuỗi quá ngắn -> null (không dựng dữ liệu giả)", () => {
    const w = toWeekly(bars.map((x) => ({ time: x.date, open: x.open, high: x.high, low: x.low, close: x.close, volume: x.volume })));
    expect(w.length).toBe(80);
    expect(w[0].volume).toBe(bars.slice(0, 5).reduce((s, x) => s + x.volume, 0));
    expect(w[0].close).toBe(bars[4].close);
    expect(buildEliteAnalysis("AAA", "W", bars)!.priceSeries).toHaveLength(80);
    expect(buildEliteAnalysis("AAA", "D", bars.slice(0, 20))).toBeNull();
  });
});
