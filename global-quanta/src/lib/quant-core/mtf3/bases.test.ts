// MTF v3 · S4 — nền giá: VCP (nhịp co giảm dần), KL cạn, pivot, phá vỡ KL lớn, rũ bỏ, chữ V bị loại; mức hỗ trợ / kháng cự; không nhìn trước.
import { describe, expect, it } from "vitest";
import type { Bar } from "../math";
import { analyze3, frameOf } from "./frame";
import { ribbonSeries } from "./ribbon";
import { baseAt, compactBase } from "./bases";
import { htfResistanceNear, levelsAt } from "./levels";

const day = (i: number) => new Date(Date.UTC(2016, 0, 4) + Math.floor(i / 5) * 7 * 86400000 + (i % 5) * 86400000).toISOString().slice(0, 10);
/** Đường gấp khúc qua các điểm; KL theo đoạn (vol). */
function path(points: [number, number, number?][]): Bar[] {
  const out: Bar[] = [];
  for (let k = 1; k < points.length; k++) {
    const [i0, p0] = points[k - 1], [i1, p1, vol = 1000] = points[k];
    for (let i = i0; i < i1; i++) {
      const c = p0 + ((p1 - p0) * (i - i0)) / (i1 - i0), o = out.length ? out[out.length - 1].close : c;
      out.push({ date: day(out.length), open: o, high: Math.max(o, c) * 1.003, low: Math.min(o, c) * 0.997, close: c, volume: vol });
    }
  }
  return out;
}

describe("MTF v3 · S4 nền giá", () => {
  // tăng mạnh 50 → 100 rồi VCP: 100 → 76 (−24%) → 96 → 86 (−10%) → 95 → 90 (−5%) → 94.5 (pivot) → bứt phá KL lớn
  const pts: [number, number, number?][] = [[0, 50], [120, 100, 1500], [140, 76, 1600], [160, 96, 1100], [172, 86, 900], [184, 95, 700], [192, 90, 450], [201, 94.5, 400], [203, 101, 3000], [207, 103, 1500]];
  const bars = path(pts);
  const f = frameOf(ribbonSeries(bars, "D"));

  it("VCP 3 nhịp co giảm dần, KL cạn bên phải, pivot = đỉnh nhịp cuối, dấu chân kỹ thuật", () => {
    const b = baseAt(f, 199)!;
    expect(b).not.toBeNull();
    expect(b.leftHigh).toBeGreaterThan(99);
    expect(b.contractions.length).toBeGreaterThanOrEqual(3);
    expect(b.vcp).toBe(true);
    expect(b.pattern).toBe("VCP");
    expect(b.dry).toBe(true);
    expect(b.pivot).toBeGreaterThan(94);
    expect(b.pivot).toBeLessThan(b.leftHigh);
    expect(b.valid).toBe(true);
    expect(b.footprint).toMatch(/^\d+W \d+\/\d+ \dT$/);
    expect(b.breakout).toBeNull();
  });

  it("phá vỡ pivot với KL ≥ 1,4 × TB50 được ghi nhận đúng phiên", () => {
    const b = baseAt(f, 203)!;
    const first = bars.findIndex((x, i) => i > 195 && x.close > b.pivot);
    expect(b.breakout?.index).toBe(first);
    expect(b.breakout!.volRatio).toBeGreaterThanOrEqual(1.4);
    const c = compactBase(f, b)!;
    expect(c.breakout?.date).toBe(bars[first].date);
    expect(c.patternLabel).toContain("VCP");
  });

  it("không nhìn trước: nền tại t trên bars[0..t] trùng nền trên toàn chuỗi", () => {
    for (const t of [150, 185, 199]) {
      const pre = frameOf(ribbonSeries(bars.slice(0, t + 1), "D"));
      expect(baseAt(pre, t)).toEqual(baseAt(f, t));
    }
  });

  it("nén thời gian chữ V bị đánh dấu không hợp lệ", () => {
    const v = path([[0, 50], [100, 100], [130, 70], [137, 98], [140, 98.5]]);
    const b = baseAt(frameOf(ribbonSeries(v, "D")), v.length - 1)!;
    expect(b.vShape).toBe(true);
    expect(b.valid).toBe(false);
    expect(b.reasons.join(" ")).toContain("chữ V");
  });

  it("mức hỗ trợ / kháng cự: vai trò theo giá hiện tại, cổng cản khung lớn", () => {
    const a = analyze3(path([[0, 50], [200, 100], [260, 80], [320, 100], [380, 82], [440, 99], [500, 85], [560, 92]]));
    const t = a.D.r.bars.length - 1, lv = levelsAt(a, t), close = a.D.r.bars[t].close;
    expect(lv.length).toBeGreaterThan(0);
    for (const l of lv) expect(l.role).toBe(l.price < close ? "support" : "resistance");
    const top = lv.find((l) => l.price > 97);
    expect(top?.touches).toBeGreaterThanOrEqual(2);
    expect(htfResistanceNear(lv, close, a.D.r.atr[t], 1)).toBeNull(); // 92 còn xa vùng 100
  });
});
