import { describe, expect, it } from "vitest";
import { relativeStrength, trendChannel, wyckoffNineTests } from "./wyckoffTests";
import { analyze, classifyWyckoffV2 } from "./index";
import { classicAccumulationSeries, staleSpringSeries } from "./__fixtures__/wyckoffSeries";
import type { Bar } from "./math";

const day = (i: number) => new Date(Date.UTC(2024, 0, 1) + i * 86_400_000).toISOString().slice(0, 10);
const V = 1_000_000;
const mk = (closes: number[], vol = V): Bar[] => closes.map((c, i) => ({ date: day(i), open: i ? closes[i - 1] : c, high: Math.max(c, i ? closes[i - 1] : c) + 0.5, low: Math.min(c, i ? closes[i - 1] : c) - 0.5, close: c, volume: vol }));

describe("Kênh xu hướng (tr.77–83)", () => {
  // Giảm dạng sóng (đỉnh hạ dần) 60 nến -> đi ngang 30 nến -> vượt lên.
  const closes = [
    ...Array.from({ length: 60 }, (_, k) => 150 - k * 0.8 + 4 * Math.sin((2 * Math.PI * k) / 12)),
    ...Array.from({ length: 30 }, (_, k) => 103 + 2 * Math.sin((2 * Math.PI * k) / 8)),
    ...Array.from({ length: 15 }, (_, k) => 105 + k * 1.2),
  ];
  const bars = mk(closes);
  it("đường cung nối 2 đỉnh hạ dần trước range; phá khi đóng cửa trên đường; nhân quả", () => {
    const ch = trendChannel(bars, 60, "down")!;
    expect(ch).not.toBeNull();
    expect(ch.line.a.price).toBeGreaterThan(ch.line.b.price);
    expect(ch.line.a.index).toBeLessThanOrEqual(60);
    expect(ch.broken).not.toBeNull();
    // Cắt dữ liệu ngay trước nến phá: chưa phá.
    expect(trendChannel(bars.slice(0, ch.broken!.index), 60, "down")?.broken ?? null).toBeNull();
    // Đường song song nằm dưới đường cung.
    expect(ch.parallel.a.price).toBeLessThan(ch.line.a.price);
  });
});

describe("Sức mạnh tương đối so với VN-Index (tr.21–27)", () => {
  it("mã tăng khi chỉ số giảm -> mạnh hơn; mã giữ đáy cao hơn khi chỉ số tạo đáy thấp hơn", () => {
    const stock = mk(Array.from({ length: 50 }, (_, k) => 100 + k * 0.2));
    const index = mk(Array.from({ length: 50 }, (_, k) => 1200 - k * 2));
    const rs = relativeStrength(stock, index)!;
    expect(rs.diffPct).toBeGreaterThan(0);
    expect(rs.stockHigherLow).toBe(true);
    expect(rs.indexLowerLow).toBe(true);
  });
  it("không có chỉ số / ngày không khớp -> null", () => {
    const stock = mk(Array.from({ length: 50 }, (_, k) => 100 + k));
    expect(relativeStrength(stock, null)).toBeNull();
    expect(relativeStrength(stock, mk([1, 2, 3]))).toBeNull();
  });
});

describe("9 phép thử mua / bán", () => {
  it("cấu trúc tích luỹ đang hoạt động -> phía mua, đủ 9 mục; thiếu chỉ số -> mục 4 'chưa đo được'", () => {
    const bars = classicAccumulationSeries();
    const a = analyze(bars, { timeframe: "D" });
    const t = a.wyckoffAlt!.tests!;
    expect(t.side).toBe("buy");
    expect(t.items).toHaveLength(9);
    expect(t.items.find((x) => x.key === "rs")!.ok).toBeNull();
    expect(t.items.find((x) => x.key === "climax")!.ok).toBe(true);
    expect(t.passed).toBeLessThanOrEqual(t.avail);
    expect(t.targets.map((x) => x.k)).toEqual([1, 1.5, 2]);
  });

  it("có VN-Index (khung D, mã cổ phiếu) -> đo được mục 4; chỉ số hoặc khung W -> bỏ qua", () => {
    const bars = classicAccumulationSeries();
    const index = bars.map((b, i) => ({ ...b, open: 1000 - i, high: 1001 - i, low: 999 - i, close: 1000 - i }));
    expect(analyze(bars, { timeframe: "D", benchmark: index }).wyckoffAlt!.tests!.items.find((x) => x.key === "rs")!.ok).toBe(true);
    expect(analyze(bars, { timeframe: "D", benchmark: index, isIndex: true }).wyckoffAlt!.tests!.items.find((x) => x.key === "rs")!.ok).toBeNull();
  });

  it("cấu trúc lịch sử / hết hiệu lực -> không có 9 phép thử", () => {
    const w = classifyWyckoffV2(staleSpringSeries(90));
    expect(w.status).toBe("historical");
    expect(wyckoffNineTests(staleSpringSeries(90), w, null)).toBeNull();
  });
});
