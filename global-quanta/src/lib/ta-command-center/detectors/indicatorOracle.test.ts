// A5 (Q-01/Q-03) — RSI / MACD / ADX của chart khớp ORACLE ĐỘC LẬP (backend/scripts/indicator-oracle.py, Python thuần viết lại từ định nghĩa
// gốc) trên 5 kịch bản: tăng, giảm, phẳng, xen kẽ, khởi động (thiếu dữ liệu). Sai số ≤ 1e-9; null đúng vị trí (giai đoạn khởi động).
import { describe, expect, it } from "vitest";
import oracle from "../__fixtures__/indicatorOracle.json";
import { calculateADX, calculateMACD, calculateRSI } from "./technicalOscillators";
import type { OhlcvBar } from "../types";

type Case = { bars: OhlcvBar[]; rsi: (number | null)[]; macd: (number | null)[]; signal: (number | null)[]; hist: (number | null)[]; adx: (number | null)[]; plusDI: (number | null)[]; minusDI: (number | null)[] };
const cases = oracle.cases as unknown as Record<string, Case>;
const same = (a: (number | null)[], b: (number | null)[]) => {
  expect(a.length).toBe(b.length);
  a.forEach((x, i) => { if (b[i] == null) expect(x, `vị trí ${i}`).toBeNull(); else expect(x as number, `vị trí ${i}`).toBeCloseTo(b[i] as number, 9); });
};

describe("A5 — chỉ báo khớp oracle độc lập", () => {
  for (const [name, c] of Object.entries(cases)) {
    it(`${name}: RSI 14 · MACD 12/26/9 · ADX 14 + DI±`, () => {
      same(calculateRSI(c.bars).series, c.rsi);
      const m = calculateMACD(c.bars);
      same(m.macdLine, c.macd); same(m.signalLine, c.signal); same(m.histogram, c.hist);
      const a = calculateADX(c.bars);
      same(a.series, c.adx); same(a.plusDI, c.plusDI); same(a.minusDI, c.minusDI);
    });
  }
  it("đủ 5 kịch bản (tăng / giảm / phẳng / xen kẽ / khởi động)", () => expect(Object.keys(cases)).toEqual(["up", "down", "flat", "mixed", "warmup"]));
});
