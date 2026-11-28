import { describe, expect, it } from "vitest";
import { DEFAULT_CHART_PREFS, readChartPrefs } from "./chartPrefs";

describe("TA-T3 — tuỳ chọn hiển thị chart", () => {
  it("mặc định = hành vi cũ: nến, thang thường, KL pane riêng", () => {
    expect(readChartPrefs(null)).toEqual({ type: "candle", scale: "normal", inverted: false, volOverlay: false });
  });
  it("đọc đúng giá trị hợp lệ; giá trị lạ / hỏng -> mặc định từng trường", () => {
    expect(readChartPrefs(JSON.stringify({ type: "heikin", scale: "log", inverted: true, volOverlay: true }))).toEqual({ type: "heikin", scale: "log", inverted: true, volOverlay: true });
    expect(readChartPrefs(JSON.stringify({ type: "renko", scale: "x", inverted: "yes" }))).toEqual(DEFAULT_CHART_PREFS);
    expect(readChartPrefs("{hỏng")).toEqual(DEFAULT_CHART_PREFS);
  });
});
