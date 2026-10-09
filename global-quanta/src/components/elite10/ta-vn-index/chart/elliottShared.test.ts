import { describe, expect, it } from "vitest";
import { computeElliottStructure } from "./ElliottWaveSeries";
import { elliottState } from "../../../../lib/quant-core/elliott";
import type { OhlcBar } from "../../../../types/taVnIndex";

const day = (i: number) => new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10);
const bar = (i: number, c: number): OhlcBar => ({ time: day(i), open: c * 0.998, high: c * 1.006, low: c * 0.994, close: c, volume: 1000 });
const L = [[0, 100], [20, 120], [30, 110], [55, 145], [65, 133], [80, 151], [92, 136], [100, 142], [110, 139]];
const f = (i: number) => { for (let k = 1; k < L.length; k++) if (i <= L[k][0]) { const [i0, p0] = L[k - 1], [i1, p1] = L[k]; return p0 + ((p1 - p0) * (i - i0)) / (i1 - i0); } return 139; };
const series = [...Array.from({ length: 60 }, (_, i) => bar(i, 100 + Math.sin(i / 3) * 1.5)), ...Array.from({ length: 111 }, (_, i) => bar(60 + i, f(i)))];

describe("E6 — Elite 10 dùng chung engine Elliott GET", () => {
  it("đếm 0–5 + A, B trùng engine tab TA; nhãn khoanh tròn, trọng số tương đối (không gọi là xác suất)", () => {
    const r = computeElliottStructure(series);
    const st = elliottState(series.map((b) => ({ date: b.time, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume })))!;
    expect(r.isValidImpulse).toBe(true);
    expect(r.pivots.slice(0, 6).map((p) => p.time)).toEqual(st.scenario!.points.map((p) => p.time));
    expect(r.pivots.map((p) => p.label).slice(0, 8)).toEqual(["⓪", "①", "②", "③", "④", "⑤", "Ⓐ", "Ⓑ"]);
    expect(r.pivots.filter((p) => p.isHigh).map((p) => p.label)).toEqual(expect.arrayContaining(["①", "③", "⑤"]));
    expect(r.summary).toContain("trọng số tương đối");
    expect(r.summary).not.toMatch(/xác suất/);
  });
  it("không có cấu trúc còn hiệu lực -> không vẽ (không ghép 6 pivot cuối như bản cũ)", () => {
    const flat = Array.from({ length: 200 }, (_, i) => bar(i, 100 + Math.sin(i / 2) * 0.3));
    expect(computeElliottStructure(flat).pivots).toHaveLength(0);
    expect(computeElliottStructure(series.slice(0, 40)).pivots).toHaveLength(0);
  });
});
