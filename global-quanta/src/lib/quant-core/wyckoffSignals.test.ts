import { describe, expect, it } from "vitest";
import { analyze } from "./index";
import { wyckoffSignals } from "./wyckoffSignals";
import { WYCKOFF_SIGNAL_VALIDATION } from "./wyckoffSignalValidation";
import { classicAccumulationSeries, staleSpringSeries } from "./__fixtures__/wyckoffSeries";

describe("Tín hiệu Wyckoff (W4)", () => {
  it("tích luỹ chuẩn: có tín hiệu chuyển pha theo pha hiện tại, kèm kết quả kiểm định; mới nhất đứng đầu", () => {
    const bars = classicAccumulationSeries();
    const w = analyze(bars, { timeframe: "D" }).wyckoffAlt!;
    const sig = w.signals!;
    expect(sig.some((x) => x.key === "PH-buy:E")).toBe(true);
    for (const x of sig) {
      expect(x.validation).toBe(WYCKOFF_SIGNAL_VALIDATION[x.key]);
      expect(x.knownDate >= x.date).toBe(true);
    }
    for (let i = 1; i < sig.length; i++) expect(sig[i].ageBars).toBeGreaterThanOrEqual(sig[i - 1].ageBars);
  });

  it("kết quả kiểm định ghi đúng thực tế: chưa tín hiệu nào đạt; Lần 1 và vào Phase C bị đánh dấu ngược kỳ vọng", () => {
    expect(Object.values(WYCKOFF_SIGNAL_VALIDATION).every((v) => v.status === "EXPERIMENTAL")).toBe(true);
    expect(WYCKOFF_SIGNAL_VALIDATION.T1.adverse).toBe(true);
    expect(WYCKOFF_SIGNAL_VALIDATION["PH-buy:C"].adverse).toBe(true);
  });

  it("nhân quả: tín hiệu ở dữ liệu cắt tại nến n không có ngày biết được sau nến n", () => {
    const bars = classicAccumulationSeries();
    for (let n = bars.length - 10; n <= bars.length; n++) {
      const cut = bars.slice(0, n);
      for (const x of analyze(cut, { timeframe: "D" }).wyckoffAlt!.signals ?? []) expect(x.knownDate <= cut[cut.length - 1].date).toBe(true);
    }
  });

  it("cấu trúc lịch sử -> không có tín hiệu", () => {
    const stale = staleSpringSeries(90);
    expect(wyckoffSignals(stale, analyze(stale).wyckoff)).toEqual([]);
  });
});
