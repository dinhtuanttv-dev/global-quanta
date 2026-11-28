// @vitest-environment node
// C11 — trung tâm cảnh báo: mô tả điều kiện, cảnh báo giá chạm (chiều theo giá hiện tại), giá cắt EMA / SMA, giá cắt hình vẽ.
import { describe, expect, it } from "vitest";
import type { DrawnPrimitive } from "../DrawingManager";
import { alertGroup, conditionText, drawingAlert, maAlert, priceAlert } from "./alertCenter";

const dates = Array.from({ length: 20 }, (_, i) => `2026-10-${String(i + 1).padStart(2, "0")}`);

describe("C11 — trung tâm cảnh báo", () => {
  it("giá chạm: trên giá hiện tại -> ≥, dưới -> ≤", () => {
    expect(priceAlert(110, 100).condition).toEqual({ type: "level", price: 110, side: "above" });
    expect(priceAlert(90, 100).condition).toEqual({ type: "level", price: 90, side: "below" });
    expect(conditionText(priceAlert(1650.4, 1700).condition)).toBe("Giá ≤ 1.650");
  });

  it("giá cắt EMA / SMA: điều kiện ma khung ngày, loại indicator", () => {
    const d = maAlert("ema", 50, "below");
    expect(d).toMatchObject({ kind: "indicator", timeframe: "D", condition: { type: "ma", ma: "ema", period: 50, side: "below" } });
    expect(conditionText(d.condition)).toBe("Giá thủng xuống dưới EMA 50");
    expect(alertGroup("indicator")).toBe("indicator");
    expect(alertGroup("invalidation")).toBe("elliott");
  });

  it("giá cắt hình vẽ: đường ngang -> mức; vùng -> zone; đường xu hướng -> line (chiều = phía giá chưa ở); khung giờ -> không hỗ trợ", () => {
    const hl = { id: "h", toolType: "shape", kind: "hline", points: [{ date: dates[3], price: 120 }], createdAt: 1 } as DrawnPrimitive;
    expect(drawingAlert(hl, 100, "D", dates)?.condition).toEqual({ type: "level", price: 120, side: "above" });
    const rect = { id: "r", toolType: "rectangle", p1: { date: dates[1], price: 90 }, p2: { date: dates[5], price: 80 }, createdAt: 1 } as DrawnPrimitive;
    expect(drawingAlert(rect, 100, "D", dates)?.condition).toEqual({ type: "zone", low: 80, high: 90 });
    // đường đi lên 100 -> 110 trong 10 nến, tại nến cuối (19) ≈ 119; giá 125 đang TRÊN đường -> báo khi thủng xuống
    const tl = { id: "t", toolType: "trendline", p1: { date: dates[9], price: 110 }, p2: { date: dates[0], price: 101 }, createdAt: 1 } as DrawnPrimitive;
    const d = drawingAlert(tl, 125, "D", dates)!;
    expect(d.condition).toEqual({ type: "line", a: { date: dates[0], price: 101 }, b: { date: dates[9], price: 110 }, side: "below" });
    expect(drawingAlert(tl, 105, "W", dates)?.condition).toMatchObject({ side: "above" });
    expect(drawingAlert(tl, 105, "1H", dates)).toBeNull();
    const fib = { id: "f", toolType: "fibonacci", p1: { date: dates[0], price: 1 }, p2: { date: dates[2], price: 2 }, levels: [], createdAt: 1 } as DrawnPrimitive;
    expect(drawingAlert(fib, 100, "D", dates)).toBeNull();
  });
});
