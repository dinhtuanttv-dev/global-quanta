import { describe, expect, it } from "vitest";
import { alignLine, alignMarkers, candleTimes, cleanCandles, plausiblePrice } from "./sanitize";

const bar = (time: string, o: number, h: number, l: number, c: number) => ({ time, open: o, high: h, low: l, close: c, volume: 1 });

describe("Làm sạch dữ liệu biểu đồ Elite 10", () => {
  it("nến: bỏ giá không hữu hạn, sửa cao/thấp, sắp theo thời gian, bỏ trùng (giữ bản sau)", () => {
    const out = cleanCandles([
      bar("2026-10-08", 10, 11, 9, 10.5), bar("2026-10-06", 9, 9.5, 8, 9.2),
      { time: "2026-10-07", open: null, high: 10, low: 9, close: 9.8, volume: 1 } as never,
      bar("2026-10-08", 10, 10.2, 9.9, 12),
    ] as never);
    expect(out.map((b) => b.time)).toEqual(["2026-10-06", "2026-10-08"]);
    expect(out[1].close).toBe(12);
    expect(out[1].high).toBe(12); // cao ≥ đóng
  });

  it("series đường: chỉ mốc có nến (không chèn Chủ nhật vào trục thời gian), bỏ giá trị không hữu hạn", () => {
    const times = candleTimes(cleanCandles([bar("2026-07-03", 1, 1, 1, 1), bar("2026-07-06", 1, 1, 1, 1)] as never));
    const line = alignLine([
      { time: "2026-07-05", value: 5 }, { time: "2026-07-06", value: 6 }, { time: "2026-07-03", value: undefined as unknown as number },
    ] as never, times);
    expect(line).toEqual([{ time: "2026-07-06", value: 6 }]);
  });

  it("marker chỉ ở mốc có nến", () => {
    const times = new Set(["2026-10-08"]);
    const m = alignMarkers([{ time: "2026-10-05", position: "aboveBar", color: "#fff", shape: "circle" }, { time: "2026-10-08", position: "aboveBar", color: "#fff", shape: "circle" }] as never, times);
    expect(m.map((x) => x.time)).toEqual(["2026-10-08"]);
  });

  it("đường giá vô lý (kịch bản 29.700 trên VN-Index ~1.700) không vẽ; giá hợp lý thì vẽ", () => {
    const vn = [bar("2026-10-07", 1760, 1765, 1740, 1753), bar("2026-10-08", 1749, 1764, 1738, 1738)] as never;
    expect(plausiblePrice(29700, vn)).toBe(false);
    expect(plausiblePrice(1700, vn)).toBe(true);
    expect(plausiblePrice(NaN, vn)).toBe(false);
    expect(plausiblePrice(null, vn)).toBe(false);
  });
});
