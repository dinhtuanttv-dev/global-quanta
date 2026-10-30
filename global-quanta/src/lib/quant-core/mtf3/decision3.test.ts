// MTF v3 · S5 — lớp quyết định: thiết lập, cổng cấm vào, kế hoạch R:R ≥ 2 (cắt lỗ dưới mức kỹ thuật), vào muộn, không nhìn trước.
import { describe, expect, it } from "vitest";
import type { Bar } from "../math";
import { analyze3 } from "./frame";
import { decisionAt, DECISION } from "./decision3";

const day = (i: number) => new Date(Date.UTC(2015, 0, 5) + Math.floor(i / 5) * 7 * 86400000 + (i % 5) * 86400000).toISOString().slice(0, 10);
function path(points: [number, number, number?][]): Bar[] {
  const out: Bar[] = [];
  for (let k = 1; k < points.length; k++) {
    const [i0, p0] = points[k - 1], [i1, p1, vol = 1000] = points[k];
    for (let i = i0; i < i1; i++) {
      const c = p0 + ((p1 - p0) * (i - i0)) / (i1 - i0), o = out.length ? out[out.length - 1].close : c;
      out.push({ date: day(out.length), open: o, high: Math.max(o, c) * 1.004, low: Math.min(o, c) * 0.996, close: c, volume: vol });
    }
  }
  return out;
}

describe("MTF v3 · S5 lớp quyết định", () => {
  // xu hướng tăng dài có điều chỉnh có cấu trúc + một đợt chạy dốc cuối (quá đà)
  const pts: [number, number, number?][] = [[0, 100]];
  let p = 100, i = 0;
  for (let k = 0; k < 24; k++) {
    i += 25; p *= 1.2; const P = p; pts.push([i, P]);
    for (const [len, f] of [[6, 0.92], [6, 0.96], [6, 0.88], [6, 0.93], [6, 0.9]] as [number, number][]) { i += len; pts.push([i, P * f]); }
    p = P * 0.9;
  }
  const bars = path(pts), a = analyze3(bars);

  it("mọi phiên: trạng thái nhất quán với thiết lập / cổng / kế hoạch", () => {
    let setupDays = 0, blockedDays = 0;
    for (let t = 400; t < bars.length; t += 3) {
      const d = decisionAt(a, t);
      if (!d.active) expect(d.state).toBe("wait");
      if (d.state === "setup") {
        setupDays++;
        expect(d.gates.every((g) => !g.hit)).toBe(true);
        expect(d.plan?.ok).toBe(true);
        expect(d.late).toBe(false);
      }
      if (d.state === "blocked") blockedDays++;
      if (d.plan) {
        expect(d.plan.stop).toBeLessThan(d.plan.entry);
        expect(d.plan.entry - d.plan.stop).toBeGreaterThanOrEqual(DECISION.minStopAtr * a.D.r.atr[t] - 0.02);
        expect(d.plan.target1).toBeGreaterThan(d.plan.entry);
        expect(d.plan.ok).toBe(d.plan.rr1 >= DECISION.minRr);
        expect(Math.abs(d.plan.rr1 - (d.plan.target1 - d.plan.entry) / (d.plan.entry - d.plan.stop))).toBeLessThan(0.02);
      }
    }
    expect(setupDays + blockedDays).toBeGreaterThan(0);
  });

  it("cổng quá đà bật khi giá lệch ≥ 3 ATR trên EMA50", () => {
    const steep = path([[0, 100], [300, 140], [330, 220]]);
    const s = analyze3(steep), t = steep.length - 1;
    const d = decisionAt(s, t);
    expect(s.D.r.dev50[t]).toBeGreaterThanOrEqual(3);
    expect(d.gates.find((g) => g.key === "over")!.hit).toBe(true);
    expect(d.state).not.toBe("setup");
  });

  it("không nhìn trước: quyết định tại t trên bars[0..t] trùng toàn chuỗi", () => {
    for (const t of [700, 900, bars.length - 1]) expect(decisionAt(analyze3(bars.slice(0, t + 1)), t)).toEqual(decisionAt(a, t));
  });
});
