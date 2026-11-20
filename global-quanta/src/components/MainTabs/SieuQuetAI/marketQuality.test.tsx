import { describe, expect, it } from "vitest";
import { postureAllowed, vnWhen, wilson } from "./marketQuality";
import { sparkSegments } from "./TradingMatrix/StateCharts";

const ev = { rule: "PO-r2", openBand: false, dayBand: true, probabilities: false, noPanicSell: false, noChase: false, sample: { tested: 1, from: "", to: "" }, openCoverage: 0, dayCoverage: 0, brierSkill: 0, history: [] };

describe("Khoảng tin cậy Wilson", () => {
  it("khớp giá trị chuẩn: 5/10 → [23,66; 76,34]", () => {
    const ci = wilson(50, 10)!;
    expect(ci.lo).toBeCloseTo(23.66, 1);
    expect(ci.hi).toBeCloseTo(76.34, 1);
  });
  it("sổ tiến 11/14 (78,6%) → [52,4; 92,4]", () => {
    const ci = wilson(78.6, 14)!;
    expect(ci.lo).toBeCloseTo(52.4, 0);
    expect(ci.hi).toBeCloseTo(92.4, 0);
  });
  it("biên 0% và 100% vẫn có khoảng hợp lệ, không vượt [0, 100]", () => {
    expect(wilson(0, 14)!.lo).toBe(0);
    expect(wilson(0, 14)!.hi).toBeGreaterThan(0);
    expect(wilson(100, 14)!.hi).toBe(100);
    expect(wilson(100, 14)!.lo).toBeLessThan(100);
  });
  it("thiếu số hoặc n = 0 thì không bịa khoảng", () => {
    expect(wilson(null, 14)).toBeNull();
    expect(wilson(50, 0)).toBeNull();
    expect(wilson(Number.NaN, 5)).toBeNull();
  });
  it("n lớn thì khoảng hẹp lại", () => {
    const a = wilson(80, 14)!, b = wilson(80, 376)!;
    expect(b.hi - b.lo).toBeLessThan(a.hi - a.lo);
  });
});

describe("Cổng tư thế", () => {
  it("không cổng nào đạt thì không kịch bản nào được hiện tư thế", () => {
    expect(["neg", "mid", "pos"].map((id) => postureAllowed(id as "neg", ev))).toEqual([false, false, false]);
  });
  it("G4 chỉ mở Tiêu cực, G5 chỉ mở Tích cực, G3 mở cả ba", () => {
    expect(postureAllowed("neg", { ...ev, noPanicSell: true })).toBe(true);
    expect(postureAllowed("pos", { ...ev, noPanicSell: true })).toBe(false);
    expect(postureAllowed("pos", { ...ev, noChase: true })).toBe(true);
    expect(postureAllowed("mid", { ...ev, noChase: true })).toBe(false);
    expect(postureAllowed("mid", { ...ev, probabilities: true })).toBe(true);
  });
});

describe("Giờ Việt Nam có thứ", () => {
  it("21:59 UTC thứ Sáu là 04:59 thứ Bảy giờ VN", () => {
    expect(vnWhen("2026-11-20T21:59:58.000Z")).toBe("T7 04:59 21/11");
  });
  it("không có giờ thì gạch", () => {
    expect(vnWhen(null)).toBe("—");
    expect(vnWhen("không phải ngày")).toBe("—");
  });
});

describe("Sparkline ngắt tại điểm thiếu", () => {
  it("[1, null, 3] thành 2 đoạn, không nối qua và không có điểm 0", () => {
    const s = sparkSegments([1, null, 3], 76, 22, 1, 2);
    expect(s.length).toBe(2);
    expect(s[0].length).toBe(1);
    expect(s[1][0][0]).toBe(76);
  });
  it("chuỗi đủ thì một đoạn liền", () => {
    expect(sparkSegments([1, 2, 3, 4], 76, 22, 1, 3).length).toBe(1);
  });
});
