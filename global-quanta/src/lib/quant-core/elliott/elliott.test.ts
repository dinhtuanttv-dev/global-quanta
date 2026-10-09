import { describe, expect, it } from "vitest";
import { confirmedPivotsAt, elliottState, pivotsOf } from "./index";
import { analyze, analyzeCorrection, DEFAULTS, elliottOscillator, statWave2, zigzag } from "./elliottGet.js";
import type { OhlcvBar } from "../../ta-command-center/types";

const day = (i: number) => new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10);
function bars(n: number, f: (i: number) => number): OhlcvBar[] {
  return Array.from({ length: n }, (_, i) => { const c = f(i); return { date: day(i), open: c * 0.998, high: c * 1.006, low: c * 0.994, close: c, volume: 1000 + (i % 9) * 50 }; });
}

describe("quant-core Elliott", () => {
  it("pivot có chỉ số xác nhận; trên bars[0..t] = toàn chuỗi lọc ci ≤ t (không nhìn trước)", () => {
    const b = bars(300, (i) => 100 + Math.sin(i / 6) * 8 + Math.sin(i / 23) * 4 + i * 0.05);
    const full = pivotsOf(b);
    expect(full.filter((p) => p.ci != null).every((p) => p.ci! > p.i)).toBe(true);
    for (const t of [120, 200, 299]) {
      const part = pivotsOf(b.slice(0, t + 1)).filter((p) => p.ci != null);
      expect(part.map((p) => `${p.i}${p.type}`)).toEqual(confirmedPivotsAt(full, t).map((p) => `${p.i}${p.type}`));
    }
  });

  it("dựng 5 sóng tăng + A, B đã xác nhận -> đếm đúng 0–5 và đang ở sóng C, có mốc vô hiệu và mức Fibonacci", () => {
    // 0 → 1 (+20) → 2 (−10) → 3 (+35) → 4 (−12) → 5 (+18) → A (−15) → B (+6)
    const legs = [[0, 100], [20, 120], [30, 110], [55, 145], [65, 133], [80, 151], [92, 136], [100, 142], [110, 139]];
    const f = (i: number) => {
      for (let k = 1; k < legs.length; k++) if (i <= legs[k][0]) { const [i0, p0] = legs[k - 1], [i1, p1] = legs[k]; return p0 + ((p1 - p0) * (i - i0)) / (i1 - i0); }
      return legs[legs.length - 1][1];
    };
    const pre = bars(60, (i) => 100 + Math.sin(i / 3) * 1.5);
    const main = bars(111, f).map((b, i) => ({ ...b, date: day(60 + i) }));
    const s = elliottState([...pre, ...main]);
    expect(s).not.toBeNull();
    expect(s!.scenario!.points.map((p) => p.i - 60)).toEqual([0, 20, 30, 55, 65, 80]);
    expect(s!.wave).toBe("C");
    expect(s!.label).toContain("Sóng C");
    expect(s!.degree).not.toBeNull();
    expect(s!.levels.length).toBeGreaterThan(0);
    expect(s!.invalidation?.price).toBeGreaterThan(0);
  });

  it("không đủ dữ liệu -> null", () => {
    expect(elliottState(bars(30, () => 100))).toBeNull();
  });
});

// Dựng nến từ các mốc [chỉ số, giá] (nội suy tuyến tính), biên độ nến hẹp ±0,2% để zigzag mịn (1,2%) không bắt nhiễu.
function path(legs: [number, number][], offset = 0) {
  const n = legs[legs.length - 1][0] + 1;
  return Array.from({ length: n }, (_, i) => {
    let c = legs[legs.length - 1][1];
    for (let k = 1; k < legs.length; k++) if (i <= legs[k][0]) { const [i0, p0] = legs[k - 1], [i1, p1] = legs[k]; c = p0 + ((p1 - p0) * (i - i0)) / (i1 - i0); break; }
    return { time: day(offset + i), open: c, high: c * 1.002, low: c * 0.998, close: c, volume: 1000 };
  });
}
const IMPULSE: [number, number][] = [[0, 100], [20, 120], [30, 110], [55, 145], [65, 133], [80, 151]];
function correctionOf(legs: [number, number][]) {
  const pre = Array.from({ length: 60 }, (_, i) => ({ time: day(i), open: 100, high: 100.2, low: 99.8, close: 100, volume: 1000 }));
  const c = [...pre, ...path([...IMPULSE, ...legs], 60)];
  const pv = zigzag(c, DEFAULTS.zigzag);
  const k5 = pv.findIndex((p: { i: number }) => p.i === 60 + 80);
  return analyzeCorrection(c, elliottOscillator(c), pv, k5, 1, DEFAULTS as never);
}

describe("Elliott — E1 đúng sách GET", () => {
  it("bảng sóng 2 (T-37): 73% là 50–60%; 60–62% sách không nêu", () => {
    expect(statWave2(0.55)).toEqual({ bucket: "50–60%", pct: 73 });
    expect(statWave2(0.61)).toEqual({ bucket: "60–62%", pct: null });
    expect(statWave2(0.7).pct).toBe(15);
  });

  it("zigzag: sóng A có 5 sóng con (T-27) -> cấu trúc khớp; C vượt cuối A", () => {
    // A: 151 -> 146 -> 148,5 -> 141 -> 143,5 -> 136 (5 sóng con); B hồi 50% (143,5); C 130; nảy 136 để xác nhận C
    const r = correctionOf([[86, 146], [89, 148.5], [95, 141], [98, 143.5], [104, 136], [112, 143.5], [124, 130], [130, 136]])!;
    expect(r.kind).toBe("zigzag");
    expect(r.aWaves).toBe(5);
    expect(r.structureOk).toBe(true);
    expect(r.cBeyondA).toBe(true);
  });

  it("flat: B về gần đỉnh trước, sóng A 3 sóng con -> khớp; zigzag mà A chỉ 3 sóng con -> structureOk=false", () => {
    const flat = correctionOf([[86, 146], [89, 148.5], [96, 141], [110, 150.6], [124, 141.5], [130, 147]])!;
    expect(flat.kind).toBe("flat");
    expect(flat.aWaves).toBe(3);
    expect(flat.structureOk).toBe(true);
    const zz3 = correctionOf([[86, 146], [89, 148.5], [96, 141], [104, 146], [118, 135], [124, 141]])!;
    expect(zz3.kind).toBe("zigzag");
    expect(zz3.aWaves).toBe(3);
    expect(zz3.structureOk).toBe(false);
  });

  it("tam giác ở sóng B (T-30): a–e thu hẹp, hội tụ -> triangle-B, thrust cùng hướng sóng A", () => {
    const r = correctionOf([[92, 140], [100, 150], [108, 142], [115, 148.5], [121, 143.5], [127, 148.2], [140, 130], [146, 136]])!;
    expect(r.kind).toBe("triangle-B");
    expect(r.thrust?.direction).toBe("down");
  });

  it("sóng 3 có dao động mạnh nhất (T-13/T-17) được kiểm; trọng số không còn gọi là xác suất", () => {
    const pre = Array.from({ length: 60 }, (_, i) => ({ time: day(i), open: 100, high: 100.2, low: 99.8, close: 100, volume: 1000 }));
    const c = [...pre, ...path([...IMPULSE, [92, 136], [100, 142], [110, 139]], 60)];
    const best = analyze(c).best!;
    expect(best.checks.wave3Strongest?.pass).toBe(true);
    const s = elliottState(c.map((b) => ({ date: b.time, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume })))!;
    expect("probability" in s).toBe(false);
    expect(s.weight == null || (s.weight > 0 && s.weight <= 1)).toBe(true);
  });
});

