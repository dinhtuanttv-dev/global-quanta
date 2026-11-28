import { describe, expect, it } from "vitest";
import { heikinAshi } from "./heikinAshi";

describe("TA-T3 — Heikin Ashi (chỉ để vẽ)", () => {
  it("công thức chuẩn: close = OHLC/4, open = trung bình HA trước, high/low bao thân", () => {
    const ha = heikinAshi([
      { open: 10, high: 12, low: 9, close: 11 },
      { open: 11, high: 13, low: 10, close: 12 },
    ]);
    expect(ha[0]).toEqual({ open: 10.5, close: 10.5, high: 12, low: 9 });
    expect(ha[1].close).toBe(11.5);
    expect(ha[1].open).toBe(10.5);
    expect(ha[1].high).toBe(13);
    expect(ha[1].low).toBe(10);
  });
  it("rỗng -> rỗng", () => expect(heikinAshi([])).toEqual([]));
});
