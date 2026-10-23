import { describe, expect, it } from "vitest";
import { elliottNesting, motiveSubwaves } from "./nesting";
import { elliottState } from "./index";
import { elliottSubItems } from "../../ta-command-center/chart/elliottScene";
import { DEFAULT_LAYER_STATE } from "../../ta-command-center/LayerManager";
import type { OhlcvBar } from "../../ta-command-center/types";

const day = (i: number) => new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10);
const legsFn = (legs: number[][]) => (i: number) => {
  for (let k = 1; k < legs.length; k++) if (i <= legs[k][0]) { const [i0, p0] = legs[k - 1], [i1, p1] = legs[k]; return p0 + ((p1 - p0) * (i - i0)) / (i1 - i0); }
  return legs[legs.length - 1][1];
};
const candles = (n: number, f: (i: number) => number) => Array.from({ length: n }, (_, i) => { const c = f(i); return { time: day(i), open: c, high: c * 1.001, low: c * 0.999, close: c, volume: 1 }; });

describe("DW6 — sóng con bậc nhỏ", () => {
  it("sóng đẩy có 5 sóng con rõ -> i…iv tại đúng các pivot bên trong", () => {
    const c = candles(41, legsFn([[0, 100], [8, 106], [12, 103], [24, 115], [30, 111], [40, 120]]));
    const sub = motiveSubwaves(c, { i: 0, price: 100 }, { i: 40, price: 120 }, 0.03)!;
    expect(sub.map((p) => p.i)).toEqual([0, 8, 12, 24, 30, 40]);
  });
  it("sóng đẩy đi thẳng (không có sóng con) -> null, không bịa nhãn", () => {
    const c = candles(41, (i) => 100 + i * 0.5);
    expect(motiveSubwaves(c, { i: 0, price: 100 }, { i: 40, price: 120 }, 0.03)).toBeNull();
  });
});

function bars(n: number, f: (i: number) => number, off = 0): OhlcvBar[] {
  return Array.from({ length: n }, (_, i) => { const c = f(i); return { date: day(i + off), open: c * 0.998, high: c * 1.006, low: c * 0.994, close: c, volume: 1000 }; });
}
const COMPLETE = [[0, 100], [20, 120], [30, 110], [55, 145], [65, 133], [80, 151], [92, 136], [100, 142], [110, 139]];
const series = () => [...bars(60, (i) => 100 + Math.sin(i / 3) * 1.5), ...bars(111, legsFn(COMPLETE), 60)];

describe("DW6 — tích hợp", () => {
  it("5 sóng đã xong -> nhãn kép bậc lớn (1)/(A); có bối cảnh bậc lớn thì dùng nhãn đơn", () => {
    const b = series(), st = elliottState(b)!;
    const c = b.slice(b.length - st.barCount).map((x) => ({ time: x.date, open: x.open, high: x.high, low: x.low, close: x.close, volume: x.volume }));
    expect(elliottNesting(st, c, 0.03)!.higherAt5).toBe("(1)/(A)");
    expect(elliottNesting(st, c, 0.03, "impulse")!.higherAt5).toBe("(1)");
    expect(elliottNesting(st, c.slice(1), 0.03)).toBeNull();          // cửa sổ lệch -> không tính
  });
  it("lớp 'Elliott bậc nhỏ' mặc định TẮT; nhãn neo vào nến thật; có nhãn (1)/(A)", () => {
    expect(DEFAULT_LAYER_STATE.elliottSub).toBe(false);
    const b = series(), st = elliottState(b)!;
    const items = elliottSubItems(st, b);
    const dates = new Set(b.map((x) => x.date));
    expect(items.some((x) => x.kind === "text" && x.label.text === "(1)/(A)")).toBe(true);
    for (const it of items) {
      if (it.kind === "poly") { expect(it.nodeStyle).toBe("plain"); expect(it.width).toBe(0); for (const p of it.points) expect(dates.has(p.t)).toBe(true); }
      if (it.kind === "text") expect(dates.has(it.t)).toBe(true);
    }
  });
});
