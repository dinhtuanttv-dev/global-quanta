import { describe, expect, it } from "vitest";
import { analyze } from "./index";
import { phaseSegments, tradePlan3 } from "./wyckoffPlan";
import { classicAccumulationSeries, staleSpringSeries } from "./__fixtures__/wyckoffSeries";

describe("Dòng thời gian Phase A–E (W3)", () => {
  it("tích luỹ chuẩn: A → B → C → D → E theo thứ tự, liền nhau, không chồng lấn; đoạn cuối là hiện tại", () => {
    const bars = classicAccumulationSeries();
    const segs = analyze(bars, { timeframe: "D" }).wyckoffAlt!.phases!;
    expect(segs.map((s) => s.phase)).toEqual(["A", "B", "C", "D", "E"]);
    for (let i = 1; i < segs.length; i++) {
      expect(segs[i].startIndex).toBeGreaterThan(segs[i - 1].startIndex);
      expect(segs[i - 1].endIndex).toBeLessThan(segs[i].startIndex + 1);
    }
    expect(segs.filter((s) => s.current).map((s) => s.phase)).toEqual(["E"]);
  });
  it("bất biến khi thêm nến: các pha đã hoàn tất giữ nguyên ngày bắt đầu (chỉ pha hiện tại kéo dài)", () => {
    const bars = classicAccumulationSeries();
    let prev: { phase: string; startDate: string; current: boolean }[] | null = null;
    for (let n = bars.length - 12; n <= bars.length; n++) {
      const segs = analyze(bars.slice(0, n), { timeframe: "D" }).wyckoffAlt!.phases ?? [];
      if (prev) for (const p of prev.filter((x) => !x.current)) expect(segs.find((x) => x.phase === p.phase)?.startDate).toBe(p.startDate);
      prev = segs;
    }
  });

  it("cấu trúc lịch sử -> không có dòng thời gian", () => {
    const bars = staleSpringSeries(90);
    expect(phaseSegments(bars, analyze(bars).wyckoff)).toEqual([]);
  });
});

describe("Kế hoạch 3 lần (W3)", () => {
  it("phía mua: 3 lần 30/30/40%, lần 1 từ Spring; KL tối đa = 15% KL TB20, bội số 100", () => {
    const bars = classicAccumulationSeries();
    const p = analyze(bars, { timeframe: "D" }).wyckoffAlt!.tranches!;
    expect(p.side).toBe("buy");
    expect(p.tranches.map((t) => t.sizePct)).toEqual([0.3, 0.3, 0.4]);
    expect(p.tranches[0].label).toMatch(/Spring/);
    expect(p.maxShares! % 100).toBe(0);
    const adv = bars.slice(-20).reduce((s, b) => s + b.volume, 0) / 20;
    expect(p.maxShares!).toBeLessThanOrEqual(adv * 0.15);
    expect(p.note).toMatch(/KHÔNG phải khuyến nghị/);
  });
  it("chỉ số -> không có kế hoạch; cấu trúc lịch sử -> null", () => {
    const bars = classicAccumulationSeries();
    expect(analyze(bars, { timeframe: "D", isIndex: true }).wyckoffAlt!.tranches).toBeNull();
    const stale = staleSpringSeries(90);
    expect(tradePlan3(stale, analyze(stale).wyckoff)).toBeNull();
  });
});

describe("Kế hoạch 3 lần — tuần tự", () => {
  it("lần sau không bao giờ 'đã xảy ra' trước lần trước; lần trước chờ -> lần sau chờ", () => {
    for (const bars of [classicAccumulationSeries(), classicAccumulationSeries().slice(0, -14)]) {
      const p = analyze(bars, { timeframe: "D" }).wyckoffAlt!.tranches;
      if (!p) continue;
      const [t1, t2, t3] = p.tranches;
      if (t1.status !== "done") expect(t2.status).not.toBe("done");
      if (t2.status !== "done") expect(t3.status).not.toBe("done");
      if (t1.date && t2.date) expect(t2.date > t1.date).toBe(true);
      if (t2.date && t3.date) expect(t3.date > t2.date).toBe(true);
    }
  });
});
