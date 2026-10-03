import { describe, expect, it } from "vitest";
import { placeLabels, LABEL_BUDGET, type LabelBox } from "./scene";
import { buildScene } from "./buildScene";
import { EMPTY_SMC, toSmcState, type SmcState } from "../AnalysisController";
import { analyze } from "../../quant-core";
import { buildFibLevels, sanitizePrimitives, type DrawnPrimitive } from "../DrawingManager";
import { pickNewer } from "../chartDrawingsStore";
import type { OhlcvBar } from "../types";
import { DEFAULT_LAYER_STATE } from "../LayerManager";

const box = (x: number, y: number, priority: number, text = "L"): LabelBox => ({ x, y, w: 40, h: 10, text, color: "#fff", priority });

describe("P3 — ngân sách nhãn (tối đa 12, không chồng nhau, ưu tiên CHoCH > Sweep > …)", () => {
  it("tối đa 12 nhãn dù có 40 ứng viên không chồng nhau", () => {
    const many = Array.from({ length: 40 }, (_, i) => box((i % 8) * 50, 20 + Math.floor(i / 8) * 20, 10));
    expect(placeLabels(many, 1000, 400)).toHaveLength(LABEL_BUDGET);
  });
  it("nhãn chồng nhau: giữ nhãn ưu tiên cao; nhãn ngoài khung bị bỏ", () => {
    const placed = placeLabels([box(100, 50, 50, "BOS"), box(110, 52, 90, "CHoCH"), box(-30, 50, 99, "ngoài"), box(100, 500, 99, "dưới")], 600, 300);
    expect(placed.map((l) => l.text)).toEqual(["CHoCH"]);
  });
  it("cùng ưu tiên: nhãn gần hiện tại (bên phải) được chọn trước", () => {
    const placed = placeLabels([box(10, 50, 50, "cũ"), box(500, 50, 50, "mới")], 600, 300, 1);
    expect(placed[0].text).toBe("mới");
  });
});

const bars: OhlcvBar[] = Array.from({ length: 80 }, (_, i) => ({
  date: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10), open: 100, high: 101, low: 99, close: 100, volume: 1000,
}));
const layers = { ...DEFAULT_LAYER_STATE, trendline: true, demandzone: true, smc: true };

describe("P3 — buildScene (toạ độ miền, thay lớp SVG)", () => {
  const smc: SmcState = {
    ...EMPTY_SMC,
    obs: [{ date: bars[10].date, type: "bullish", top: 100, bottom: 98, mitigated: false, mitigatedAt: null, status: "ACTIVE", kind: "BOS" }],
    fvgs: [{ startDate: bars[40].date, endDate: bars[42].date, type: "bullish", top: 102, bottom: 101, filled: false, filledAt: null, state: "OPEN", filledPct: 0 }],
    liquidity: [{ date: bars[50].date, price: 103, type: "EQH", touches: 2, state: "RESTING", stateDate: null }],
  };
  const base = { bars, smc, wyckoff: null, primitives: [], draft: null, elliottDraft: [], fibExtension: false, highlight: null };

  it("MẶC ĐỊNH TẮT: mọi lớp tắt -> biểu đồ chỉ có nến (0 phần tử lớp phủ), kể cả khi có hình vẽ tay", () => {
    expect(Object.entries(DEFAULT_LAYER_STATE).every(([, v]) => v === false)).toBe(true);
    const trend: DrawnPrimitive = { id: "t", toolType: "trendline", p1: { date: bars[1].date, price: 1 }, p2: { date: bars[5].date, price: 2 }, createdAt: 1 };
    expect(buildScene({ ...base, layers: DEFAULT_LAYER_STATE, primitives: [trend] }).items).toHaveLength(0);
  });

  it("SMC bật: vùng còn hiệu lực kéo tới mép phải, không nhãn 'test', không vạch CE", () => {
    const s = buildScene({ ...base, layers: { ...DEFAULT_LAYER_STATE, smc: true } });
    expect(s.items.every((i) => i.kind !== "zone" || i.t2 === null)).toBe(true);
    expect(s.items.filter((i) => i.kind === "hline")).toHaveLength(1); // chỉ đường BSL, không có vạch CE của FVG
    const labels = s.items.map((i) => ("label" in i ? i.label?.text ?? "" : ""));
    expect(labels.some((t) => /test|50%|lấp/.test(t))).toBe(false);
  });

  it("hình đang vẽ dở luôn hiện; Fib vẽ đủ các mức", () => {
    const s = buildScene({ ...base, smc: EMPTY_SMC, layers: DEFAULT_LAYER_STATE,
      draft: { toolType: "fibonacci", p1: { date: bars[5].date, price: 110 }, p2: { date: bars[15].date, price: 100 } }, fibExtension: true });
    expect(s.items.filter((i) => i.kind === "hline")).toHaveLength(10); // 7 mức + 3 mức mở rộng
  });
});

describe("P3 — sửa logic", () => {
  it("Fibonacci: 0% ở điểm kết thúc, 100% ở điểm bắt đầu — đúng cả sóng tăng và sóng giảm", () => {
    const up = buildFibLevels({ date: "a", price: 100 }, { date: "b", price: 200 }, false); // đáy -> đỉnh
    expect(up.find((l) => l.ratio === 0.236)!.price).toBeCloseTo(176.4, 6); // ngay dưới đỉnh
    const down = buildFibLevels({ date: "a", price: 200 }, { date: "b", price: 100 }, true); // đỉnh -> đáy
    expect(down.find((l) => l.ratio === 0.236)!.price).toBeCloseTo(123.6, 6); // ngay trên đáy (bản cũ: 176,4 — sai)
    expect(down.find((l) => l.ratio === 1.618)!.price).toBeCloseTo(261.8, 6);
  });

  it("toSmcState chỉ giữ vùng còn hiệu lực; sweep tách riêng; Premium/Discount neo vào swing", () => {
    let seed = 3;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    let c = 50_000;
    const b: OhlcvBar[] = Array.from({ length: 500 }, (_, i) => {
      const o = c; c = o * (1 + Math.sin(i / 30) * 0.004 + (rnd() - 0.5) * 0.04);
      return { date: new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10), open: o, high: Math.max(o, c) * 1.01, low: Math.min(o, c) * 0.99, close: c, volume: 1e6 * (0.5 + rnd()) };
    });
    const a = analyze(b);
    const s = toSmcState(a);
    expect(s.obs.every((o) => o.status === "ACTIVE")).toBe(true);
    expect(s.fvgs.every((g) => g.state === "OPEN" || g.state === "PARTIAL")).toBe(true);
    expect(s.liquidity.every((l) => l.state === "RESTING")).toBe(true);
    expect(s.sweeps.every((l) => l.state === "SWEPT")).toBe(true);
    expect(s.totals.obs).toBe(a.orderBlocks.length);
    if (s.premiumDiscount) expect([a.dealingRange!.highDate, a.dealingRange!.lowDate]).toContain(s.premiumDiscount.startDate);
  });
});

describe("P3 — lưu hình vẽ", () => {
  it("sanitizePrimitives bỏ phần tử sai dạng", () => {
    const ok: DrawnPrimitive = { id: "a", toolType: "trendline", p1: { date: "2026-01-02", price: 1 }, p2: { date: "2026-01-05", price: 2 }, createdAt: 1 };
    const out = sanitizePrimitives([ok, { id: "b", toolType: "rectangle", p1: { date: "x", price: 1 } }, { toolType: "laser" }, null]);
    expect(out).toEqual([ok]);
    expect(sanitizePrimitives("rác")).toEqual([]);
  });
  it("pickNewer: bản cập nhật sau thắng; chưa có thời điểm trên máy -> lấy đám mây", () => {
    const a = { primitives: [], updatedAt: "2026-10-03T10:00:00Z" };
    const b = { primitives: [], updatedAt: "2026-10-03T11:00:00Z" };
    expect(pickNewer(a, b)).toBe(b);
    expect(pickNewer(b, a)).toBe(b);
    expect(pickNewer(a, null)).toBe(a);
    expect(pickNewer({ primitives: [], updatedAt: null }, a)).toBe(a);
  });
});
