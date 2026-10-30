// MTF v3 · S1 — dải EMA ba khung: thứ tự xếp lớp, pha, quá đà, MA200 tuần để trống, đồng thuận + mở rộng lồng khung.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "../../../../test/rtl-lite";
import RibbonStrip from "./RibbonStrip";
import type { RibbonContext, RibbonSnapshot } from "../../../../hooks/useStructure3";

const snap = (tf: "D" | "W" | "M", o: Partial<RibbonSnapshot> = {}): RibbonSnapshot => ({
  tf, date: "2026-10-30", bars: 300, close: 100, ema21: 98, ema50: 95, ema100: 90, ma200: 85, order: 1, orderAge: 12, width: 2, widthPct: 55,
  dev50: 1.2, gap: 2.5, slope: { e21: 0.1, e50: 0.05, e100: 0.03, ma200: 0.01 }, phase: "normal", over: 0, lastExpand: null, inBand: false, ...o,
});

describe("RibbonStrip", () => {
  afterEach(() => cleanup());
  it("ba khung, xếp lớp / đan xen, pha, quá đà, MA200 để trống khi thiếu", () => {
    const ctx: RibbonContext = {
      D: snap("D", { phase: "expanding", widthPct: 34, lastExpand: { ago: 2, dir: 1 } }),
      W: snap("W", { ma200: null, bars: 180, order: 0.333, over: 1, dev50: 3.4 }),
      M: snap("M", { order: -1, orderAge: 4, phase: "squeeze", widthPct: 12, ma200: null, ema100: null, bars: 70 }),
      align: 1, nested: "up",
    };
    render(<RibbonStrip ctx={ctx} />);
    expect(screen.getByTestId("ribbon-order-D").textContent).toContain("Xếp lớp tăng · 12 phiên");
    expect(screen.getByTestId("ribbon-order-W").textContent).toContain("Đan xen");
    expect(screen.getByTestId("ribbon-order-M").textContent).toContain("Xếp lớp giảm · 4 tháng");
    expect(screen.getByTestId("ribbon-phase-D").textContent).toContain("Đang mở rộng · 34%");
    expect(screen.getByTestId("ribbon-phase-M").textContent).toContain("Nén");
    expect(screen.getByTestId("ribbon-tf-W").textContent).toContain("Quá đà tăng");
    expect(screen.getByTestId("ribbon-tf-D").textContent).toContain("phiên 30/10/2026");
    expect(screen.getByTestId("ribbon-tf-W").textContent).toContain("chưa đủ 200 tuần (180)");
    expect(screen.getByTestId("ribbon-align").textContent).toBe("+1");
    expect(screen.getByTestId("ribbon-nested").textContent).toContain("↑");
  });
});
