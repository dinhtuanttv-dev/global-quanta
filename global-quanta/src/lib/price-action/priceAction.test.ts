// pa-book-2 — test nghiệm thu (PRICE_ACTION_CODE_SPEC §16): định nghĩa theo sách, không nhìn trước (phát lại theo tiền tố),
// khối lượng không dùng phiên hiện tại làm nền, thiếu khối lượng không thành 0, vào lệnh sát trần bị loại.
import { describe, expect, it } from "vitest";
import { analyzePriceAction, computeVolumeFeatures, detectCandlePatterns, computeCandleFeatures, mergeParams, eventStudy, trendSeries, detectConfirmedSwings, type Bar } from "./index.ts";

const P = mergeParams();
const ctx = (n: number) => ({ symbol: "TST", timeframe: "D", priceBasis: "ADJ", source: "test", asOf: `d${n}`, isIndex: false, limitPct: 0.07, tickSize: () => 10 });
const day = (i: number) => `2020-${String(Math.floor(i / 28) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`;
const bar = (i: number, o: number, h: number, l: number, c: number, v = 1000): Bar => ({ date: day(i), open: o, high: h, low: l, close: c, volume: v });
/** Chuỗi ngẫu nhiên có hạt giống — đủ dài để có swing, vùng, setup. */
function walk(n: number, seed = 7): Bar[] {
  let s = seed, p = 20000;
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  const out: Bar[] = [];
  for (let i = 0; i < n; i++) {
    const o = p, c = Math.max(1000, p * (1 + (rnd() - 0.5) * 0.06));
    const h = Math.max(o, c) * (1 + rnd() * 0.02), l = Math.min(o, c) * (1 - rnd() * 0.02);
    out.push(bar(i, o, h, l, c, Math.round(1000 + rnd() * 3000)));
    p = c;
  }
  return out;
}
const ids = (bars: Bar[]) => detectCandlePatterns(bars, computeCandleFeatures(bars, 14, true), P).filter((p) => p.confirmedIndex === bars.length - 1).map((p) => `${p.id}:${p.direction}`);

describe("Mẫu hình theo định nghĩa sách", () => {
  it("pin bar: đuôi dưới ≥ 60% biên độ, đuôi trên ≤ 15%; thân bằng 0 vẫn là pin; mua khi phá đỉnh, cắt lỗ dưới đuôi", () => {
    const base = Array.from({ length: 20 }, (_, i) => bar(i, 100, 102, 98, 100));
    const pins = detectCandlePatterns([...base, bar(20, 101, 101.2, 95, 101)], computeCandleFeatures([...base, bar(20, 101, 101.2, 95, 101)], 14, true), P).filter((p) => p.id === "PIN_BAR");
    expect(pins[0]).toMatchObject({ direction: "bullish", triggerLevel: 101.2, stopLevel: 95 });
    expect(ids([...base, bar(20, 100, 101, 95, 99)])).not.toContain("PIN_BAR:bullish"); // đuôi trên 1/6 > 15%
  });
  it("nến đảo chiều: đáy thấp hơn nến trước nhưng đóng cửa tăng; đảo chiều chủ chốt phải nhận chìm thân nến trước", () => {
    const a = bar(0, 100, 101, 97, 98);
    expect(ids([a, bar(1, 98, 100, 96, 99)])).toContain("REVERSAL_BAR:bullish");
    expect(ids([a, bar(1, 97.5, 101, 97, 100.5)])).toContain("KEY_REVERSAL_BAR:bullish");
    expect(ids([a, bar(1, 99, 101, 97, 100.5)])).not.toContain("KEY_REVERSAL_BAR:bullish"); // không mở dưới thân trước
  });
  it("inside / outside bar phải nằm / bao TOÀN BỘ (cạnh bằng không tính); inside bar kích hoạt ở đỉnh nến mẹ", () => {
    const m = bar(0, 100, 105, 95, 102);
    expect(ids([m, bar(1, 101, 105, 96, 100)])).not.toContain("INSIDE_BAR:two_sided");
    const ins = detectCandlePatterns([m, bar(1, 101, 104, 96, 100)], computeCandleFeatures([m, bar(1, 101, 104, 96, 100)], 14, true), P).find((p) => p.id === "INSIDE_BAR");
    expect(ins).toMatchObject({ triggerLevel: 105, stopLevel: 95, role: "continuation" });
  });
  it("đảo chiều 3 thanh và nến đuối sức (gap xuống không lấp)", () => {
    expect(ids([bar(0, 104, 105, 99, 100), bar(1, 100, 101, 97, 98), bar(2, 99, 103, 98, 102)])).toContain("THREE_BAR_REVERSAL:bullish");
    expect(ids([bar(0, 104, 105, 100, 101), bar(1, 97, 99, 96, 98.5)])).toContain("EXHAUSTION_CANDIDATE:bullish");
    expect(ids([bar(0, 104, 105, 100, 101), bar(1, 97, 100.5, 96, 99)])).not.toContain("EXHAUSTION_CANDIDATE:bullish"); // gap đã lấp
  });
});

describe("Khối lượng", () => {
  it("RVOL không lấy phiên hiện tại làm nền; thiếu khối lượng -> null, không thành 0", () => {
    const bars = Array.from({ length: 22 }, (_, i) => bar(i, 100, 101, 99, 100 + (i % 2), 1000));
    bars[21] = { ...bars[21], volume: 3000 };
    expect(computeVolumeFeatures(bars, 20)[21].rvol).toBe(3);
    bars[10] = { ...bars[10], volume: Number.NaN };
    const v = computeVolumeFeatures(bars, 20);
    expect(v[10].volume).toBeNull(); expect(v[21].rvol).toBeNull();
  });
});

describe("Không nhìn trước", () => {
  it("phát lại theo tiền tố: setup/vùng biết tại phiên k trùng giữa chạy đủ và chạy tới k", () => {
    const bars = walk(420);
    const full = analyzePriceAction(bars, ctx(420));
    expect(full.setups.length).toBeGreaterThan(5);
    for (const k of [150, 230, 310, 399]) {
      const part = analyzePriceAction(bars.slice(0, k + 1), ctx(k));
      // Trạng thái tại k của mọi setup sinh tới k: chạy đủ phải cho cùng kết quả nếu chỉ xét các chuyển trạng thái ≤ k.
      const known = (s: (typeof full.setups)[number]) => `${s.kind}|${s.patternId}|${s.direction}|${s.confirmedIndex}|${s.entryReference}|${s.invalidationLevel}`;
      const a = full.setups.filter((s) => s.confirmedIndex <= k).map(known).sort();
      const b = part.setups.map(known).sort();
      expect(a).toEqual(b);
      const done = (s: (typeof full.setups)[number]) => s.state !== "forming" && s.stateIndex <= k;
      expect(full.setups.filter((s) => s.confirmedIndex <= k && done(s)).map((s) => `${known(s)}|${s.state}|${s.stateIndex}`).sort())
        .toEqual(part.setups.filter(done).map((s) => `${known(s)}|${s.state}|${s.stateIndex}`).sort());
    }
  });
  it("xu hướng tăng bị phá khi giá đóng cửa dưới swing low cấu trúc gần nhất (sách)", () => {
    const bars = walk(300, 11);
    const feats = computeCandleFeatures(bars, 14, true);
    const swings = detectConfirmedSwings(bars, feats, 5, 5);
    const series = trendSeries(swings, bars);
    for (let i = 0; i < bars.length; i++) {
      const lo = swings.filter((s) => s.kind === "low" && s.confirmedIndex <= i).slice(-1)[0];
      if (series[i].state === "bullish" && lo) {
        const after = bars.slice(lo.confirmedIndex + 1, i + 1);
        expect(after.every((b) => b.close >= lo.price)).toBe(true);
      }
    }
  });
});

describe("Kiểm định sự kiện", () => {
  it("vào lệnh ở giá mở phiên sau; mở cửa sát giá trần -> loại, không giả định khớp", () => {
    const bars = Array.from({ length: 30 }, (_, i) => bar(i, 100, 101, 99, 100));
    bars[11] = bar(11, 107, 107, 106, 107);
    const setup = { id: "s", direction: "bullish", state: "triggered", stateIndex: 10, stateDate: bars[10].date } as never;
    const r = eventStudy(bars, [setup], { horizons: [5], feeBpsPerSide: 0, slippageBpsPerSide: 0, limitPct: 0.07 });
    expect(r.observations[0]).toMatchObject({ status: "censored" });
    const ok = eventStudy(bars, [setup], { horizons: [5], feeBpsPerSide: 0, slippageBpsPerSide: 0, limitPct: null });
    expect(ok.observations[0]).toMatchObject({ status: "observed", entryPrice: 107 });
  });
});
