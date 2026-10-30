// MTF v3 · S1 — dải MA: khớp đường EMA của biểu đồ, không nhìn trước, MA200 tuần để trống khi thiếu, nén → mở rộng.
import { describe, expect, it } from "vitest";
import type { Bar } from "../math";
import { ema as chartEma, sma as chartSma } from "../../ta-command-center/detectors/movingAverages";
import { aggregate, closedIndex, ema, sma } from "./series";
import { compactRibbon3, contextAt, orderTau, ribbon3, ribbonSeries } from "./ribbon";

function walk(n: number, seed = 3, drift = 0.0006, vol = 0.016): Bar[] {
  let s = seed, p = 20000;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const out: Bar[] = [];
  const d0 = Date.UTC(2015, 0, 5);
  for (let i = 0, k = 0; out.length < n; k++) {
    const dt = new Date(d0 + k * 86400000), dow = dt.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    const r = drift + vol * (rnd() + rnd() + rnd() - 1.5);
    const o = p, c = p * (1 + r), h = Math.max(o, c) * (1 + rnd() * 0.01), l = Math.min(o, c) * (1 - rnd() * 0.01);
    out.push({ date: dt.toISOString().slice(0, 10), open: o, high: h, low: l, close: c, volume: 1e5 * (1 + rnd()) });
    p = c; i++;
  }
  return out;
}

describe("MTF v3 · S1 dải MA", () => {
  const bars = walk(1500);
  it("EMA / SMA trùng khớp đường vẽ trên biểu đồ (cùng hạt giống SMA)", () => {
    const c = bars.map((b) => b.close);
    for (const p of [21, 50, 100]) {
      const a = ema(c, p), b = chartEma(c, p);
      for (let i = 0; i < c.length; i += 37) expect(Number.isFinite(a[i]) ? a[i] : null).toBeCloseTo((b[i] ?? null) as number, 6);
    }
    const a = sma(c, 200), b = chartSma(c, 200);
    expect(a[199]).toBeCloseTo(b[199]!, 6);
    expect(Number.isNaN(a[198])).toBe(true);
  });

  it("thứ tự Kendall τ: +1 xếp lớp tăng hoàn hảo, −1 giảm, bỏ đường chưa có", () => {
    expect(orderTau([4, 3, 2, 1])).toBe(1);
    expect(orderTau([1, 2, 3, 4])).toBe(-1);
    expect(orderTau([3, 2, 1, NaN])).toBe(1);
    expect(orderTau([2, 3, 1, NaN])).toBeCloseTo(1 / 3, 6);
    expect(orderTau([1, NaN, NaN, NaN])).toBeNull();
  });

  it("MA200 tuần để trống khi chưa đủ 200 tuần; tháng chưa có EMA100", () => {
    const r = ribbon3(bars); // ~300 tuần, ~70 tháng
    expect(r.W.bars.length).toBeGreaterThan(200);
    expect(Number.isNaN(r.W.ma200[198])).toBe(true);
    expect(Number.isFinite(r.W.ma200[r.W.bars.length - 1])).toBe(true);
    expect(r.M.bars.length).toBeLessThan(100);
    expect(r.M.ema100.every((x) => Number.isNaN(x))).toBe(true);
    // tháng vẫn có thứ tự xếp lớp trên EMA21 / EMA50
    expect(Number.isFinite(r.M.order[r.M.bars.length - 1])).toBe(true);
    expect(Math.abs(r.M.order[r.M.bars.length - 1])).toBe(1);
    const short = ribbon3(bars.slice(0, 600)); // ~120 tuần
    expect(short.W.ma200.every((x) => Number.isNaN(x))).toBe(true);
    expect(contextAt(short, 599).W.ma200).toBeNull();
  });

  it("khung lớn chỉ dùng kỳ ĐÃ ĐÓNG: nến ngày không thấy tuần / tháng của chính nó", () => {
    const w = aggregate(bars, "W"), idx = closedIndex(bars, w, "W");
    for (let i = 0; i < bars.length; i += 11) if (idx[i] >= 0) expect(w[idx[i]].date < bars[i].date).toBe(true);
    const m = aggregate(bars, "M"), mi = closedIndex(bars, m, "M");
    for (let i = 0; i < bars.length; i += 13) if (mi[i] >= 0) expect(m[mi[i]].date.slice(0, 7) < bars[i].date.slice(0, 7)).toBe(true);
  });

  it("không nhìn trước: ảnh chụp tại t trên bars[0..t] trùng ảnh chụp trên toàn chuỗi", () => {
    const full = ribbon3(bars);
    for (const t of [400, 777, 1111, 1499]) {
      const pre = ribbon3(bars.slice(0, t + 1));
      expect(contextAt(pre, t)).toEqual(contextAt(full, t));
    }
  });

  it("nén → mở rộng: dải hẹp lâu rồi bung lên tạo ĐÚNG MỘT sự kiện +1 ở nến đầu; nhiễu dải ~0 không tính", () => {
    let sd = 11, p = 20000;
    const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
    const raw: Omit<Bar, "date">[] = [];
    for (let i = 0; i < 400; i++) { const c = 20000 + (rnd() - 0.5) * 80; raw.push({ open: p, high: Math.max(p, c) + 20, low: Math.min(p, c) - 20, close: c, volume: 1 }); p = c; }
    for (let k = 0; k < 40; k++) { const c = p * 1.012; raw.push({ open: p, high: c * 1.003, low: p * 0.998, close: c, volume: 2 }); p = c; }
    const s = ribbonSeries(raw.map((b, i) => ({ ...b, date: new Date(Date.UTC(2015, 0, 1) + i * 86400000).toISOString().slice(0, 10) })), "D");
    const ev = s.expand.map((x, i) => [x, i] as const).filter(([x]) => x !== 0);
    expect(ev).toHaveLength(1);
    expect(ev[0][0]).toBe(1);
    expect(ev[0][1]).toBeGreaterThanOrEqual(400);
    expect(s.phase[ev[0][1]]).toBe("expanding");
    expect(s.width[ev[0][1]]).toBeGreaterThanOrEqual(0.5);
  });

  it("bản gọn: chuỗi 4 đường theo khung + ngữ cảnh ba khung", () => {
    const c = compactRibbon3(ribbon3(bars), { window: 120 });
    expect(c.lines.D.dates.length).toBe(120);
    expect(c.lines.W.ema21.length).toBe(c.lines.W.dates.length);
    expect(c.context!.D.date).toBe(bars[bars.length - 1].date);
    expect(Math.abs(c.context!.align)).toBeLessThanOrEqual(3);
  });
});
