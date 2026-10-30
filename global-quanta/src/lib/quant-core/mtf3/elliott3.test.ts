// MTF v3 · S3 — hợp lưu Elliott × dải EMA: bất biến cấu trúc kết quả, ngày ghim đúng chuỗi, mục tiêu đúng phía, đồng thuận cắt lỗ.
import { describe, expect, it } from "vitest";
import type { Bar } from "../math";
import { analyze3 } from "./frame";
import { elliott3, ELLIOTT3 } from "./elliott3";

function walk(n: number, seed: number, drift: number): Bar[] {
  let s = seed, p = 30000;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const out: Bar[] = [];
  for (let k = 0; out.length < n; k++) {
    const dt = new Date(Date.UTC(2019, 0, 7) + k * 86400000);
    if (dt.getUTCDay() % 6 === 0) continue;
    const r = drift + 0.02 * (rnd() + rnd() + rnd() - 1.5) + 0.004 * Math.sin(out.length / 30);
    const o = p, c = p * (1 + r);
    out.push({ date: dt.toISOString().slice(0, 10), open: o, high: Math.max(o, c) * (1 + rnd() * 0.008), low: Math.min(o, c) * (1 - rnd() * 0.008), close: c, volume: 1e6 });
    p = c;
  }
  return out;
}

describe("MTF v3 · S3 Elliott × EMA", () => {
  for (const [seed, drift] of [[3, 0.0012], [9, -0.0008], [21, 0.0004]] as const) {
    it(`bất biến kết quả (seed ${seed})`, () => {
      const bars = walk(1200, seed, drift), e = elliott3(bars, analyze3(bars));
      expect(["strong", "partial", "none"]).toContain(e.confluence);
      if (e.waveEnd) {
        const w = e.waveEnd;
        if (w.date) expect(bars.some((b) => b.date === w.date)).toBe(true);
        if (w.band) expect(w.band[0]).toBeLessThanOrEqual(w.band[1]);
        if (w.retrace != null) {
          const [lo, hi] = w.wave === "2" ? ELLIOTT3.w2Retrace : ELLIOTT3.w4Retrace;
          expect(w.inFibZone).toBe(w.retrace >= lo && w.retrace <= hi);
        }
        expect(e.confluence === "strong").toBe(!!(w.inFibZone && w.inEmaBand));
      } else expect(e.confluence).toBe("none");
      const close = bars[bars.length - 1].close;
      for (const t of e.targets) expect(e.day?.dir === "down" ? t.price < close : t.price > close).toBe(true);
      if (e.nested3) expect(e.day?.wave === "3" && e.week?.wave === "3").toBe(true);
      if (e.stopAgreement) expect(e.invalidation?.side).toBe("below");
    });
  }
});
