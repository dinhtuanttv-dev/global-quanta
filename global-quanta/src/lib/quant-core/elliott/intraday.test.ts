import { describe, expect, it } from "vitest";
import { INTRADAY_ELLIOTT, intradayElliottState, isIntradayElliottTf } from "./intraday";
import type { OhlcvBar } from "../../ta-command-center/types";

/** Nến 1H giả: 5 nến / phiên, giờ VN, sóng giá rõ. */
function hourly(n: number, f: (i: number) => number): OhlcvBar[] {
  const out: OhlcvBar[] = [];
  const hours = ["09:00", "10:00", "11:00", "13:00", "14:00"];
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(2026, 7, 3 + Math.floor(i / 5)));
    const c = f(i);
    out.push({ date: `${d.toISOString().slice(0, 10)}T${hours[i % 5]}:00+07:00`, open: c, high: c * 1.002, low: c * 0.998, close: c, volume: 1000 });
  }
  return out;
}
const legsFn = (legs: number[][]) => (i: number) => {
  for (let k = 1; k < legs.length; k++) if (i <= legs[k][0]) { const [i0, p0] = legs[k - 1], [i1, p1] = legs[k]; return p0 + ((p1 - p0) * (i - i0)) / (i1 - i0); }
  return legs[legs.length - 1][1];
};

describe("DW9 — Elliott khung trong ngày", () => {
  it("chỉ 1H / 15m; thiếu nến -> null; ngưỡng zigzag co theo căn thời gian", () => {
    expect(isIntradayElliottTf("1H")).toBe(true); expect(isIntradayElliottTf("5m")).toBe(false); expect(isIntradayElliottTf("D")).toBe(false);
    expect(intradayElliottState(hourly(150, () => 100), "D")).toBeNull();
    expect(intradayElliottState(hourly(50, () => 100), "1H")).toBeNull();
    expect(INTRADAY_ELLIOTT["1H"].zigzagPct).toBeCloseTo(0.03 / Math.sqrt(5), 2);
    expect(INTRADAY_ELLIOTT["15m"].zigzagPct).toBeCloseTo(0.03 / Math.sqrt(18), 2);
  });
  it("nến 1H có cấu trúc 5 sóng -> trạng thái có nhãn khung, ngày giờ ISO, ngưỡng 1,4%", () => {
    const b = [...hourly(40, (i) => 100 + Math.sin(i / 2) * 0.4), ...hourly(110, legsFn([[0, 100], [20, 106], [30, 103], [55, 112], [65, 109], [80, 114], [92, 110], [109, 112]])).map((x, i) => ({ ...x, date: hourly(150, () => 1)[40 + i].date }))];
    const st = intradayElliottState(b, "1H")!;
    expect(st).not.toBeNull();
    expect(st.tf).toBe("1H"); expect(st.zigzagPct).toBe(0.014);
    expect(st.asOf).toBe(b[b.length - 1].date);
    expect(st.label).toMatch(/khung 1H/);
  });
});
