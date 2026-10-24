import { describe, expect, it } from "vitest";
import { placeLabels, LABEL_BUDGET, type LabelBox } from "./scene";
import { buildScene, preConfirm } from "./buildScene";
import { EMPTY_SMC, toSmcState, type SmcState } from "../AnalysisController";
import { analyze } from "../../quant-core";
import { buildFibLevels, sanitizePrimitives, type DrawnPrimitive } from "../DrawingManager";
import { mergePrimitives, resolveOnLoad } from "../chartDrawingsStore";
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
    // Phần đậm (có nhãn) kéo tới mép phải; đoạn mờ trước xác nhận (FVG: nến 1 -> nến 3) dừng tại nến xác nhận, không nhãn.
    expect(s.items.every((i) => i.kind !== "zone" || !i.label || i.t2 === null)).toBe(true);
    const pre = s.items.filter((i) => i.kind === "zone" && i.t2 !== null);
    expect(pre).toEqual([expect.objectContaining({ t1: bars[40].date, t2: bars[42].date, dash: [1, 3] })]);
    expect(s.items.find((i) => i.kind === "zone" && i.label?.text === "FVG")).toMatchObject({ t1: bars[42].date });
    expect(s.items.filter((i) => i.kind === "hline")).toHaveLength(1); // chỉ đường BSL, không có vạch CE của FVG
    const labels = s.items.map((i) => ("label" in i ? i.label?.text ?? "" : ""));
    expect(labels.some((t) => /test|50%|lấp/.test(t))).toBe(false);
  });

  it("R2 point-in-time: OB / thanh khoản có ngày xác nhận -> đoạn mờ tới nến xác nhận, phần đậm + nhãn từ nến xác nhận", () => {
    const smc2: SmcState = {
      ...smc,
      obs: [{ ...smc.obs[0], confirmedDate: bars[14].date }],
      liquidity: [{ ...smc.liquidity[0], confirmedDate: bars[53].date }],
    };
    const s = buildScene({ ...base, smc: smc2, layers: { ...DEFAULT_LAYER_STATE, smc: true } });
    const ob = s.items.filter((i) => i.kind === "zone" && i.top === 100);
    expect(ob).toEqual([
      expect.objectContaining({ t1: bars[10].date, t2: bars[14].date, dash: [1, 3] }),
      expect.objectContaining({ t1: bars[14].date, t2: null, label: expect.objectContaining({ text: "OB ▲" }) }),
    ]);
    const bsl = s.items.filter((i) => i.kind === "hline");
    expect(bsl.map((i) => [i.t1, i.t2])).toEqual([[bars[50].date, bars[53].date], [bars[53].date, null]]);
    // Không có ngày xác nhận (dữ liệu cũ) -> như trước: vẽ từ nến gốc.
    expect(preConfirm([], "2026-01-05", null, { price: 1 }, "#fff")).toBe("2026-01-05");
  });

  it("R3: nhãn Volume Profile (ước tính OHLCV · số nến) và AVWAP (ngày neo, cách neo)", () => {
    const prof = { bins: [{ low: 99, high: 101, volume: 10 }], binSize: 2, totalVolume: 10, maxVolume: 10, poc: 100, pocIndex: 0, vah: 101, val: 99, hvn: [], lvn: [],
      method: "triangular" as const, fromDate: bars[0].date, toDate: bars[59].date };
    const s = buildScene({ ...base, smc: EMPTY_SMC, layers: { ...DEFAULT_LAYER_STATE, vprofile: true, avwap: true },
      profile: { composite: prof, sessions: [] }, avwap: { anchorDate: bars[5].date, points: [{ date: bars[5].date, vwap: 100, sigma: 1 }, { date: bars[6].date, vwap: 100.5, sigma: 1 }] } } as never);
    const labels = s.items.map((i) => ("label" in i ? i.label?.text ?? "" : "")).filter(Boolean);
    expect(labels).toContain("POC ≈ ước tính OHLCV · 60 nến");
    expect(labels.find((t) => t.startsWith("AVWAP"))).toBe(`AVWAP · neo ${bars[5].date.slice(0, 10)} (tự động: đầu dải giao dịch) · ±1σ ±2σ`);
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
  it("A2 resolveOnLoad: máy không có thay đổi chưa đồng bộ -> bản đám mây; có -> gộp theo id (không so giờ máy khách)", () => {
    const t = (id: string, createdAt: number): DrawnPrimitive => ({ id, toolType: "trendline", p1: { date: "2026-01-05", price: 1 }, p2: { date: "2026-01-06", price: 2 }, createdAt });
    const cloud = { primitives: [t("a", 1), t("c", 3)], updatedAt: "2026-10-03T10:00:00.000Z" };
    expect(resolveOnLoad({ primitives: [t("x", 9)], updatedAt: "2026-10-03T09:00:00.000Z", dirty: false }, cloud)).toEqual({ ...cloud, dirty: false });
    const local = { primitives: [{ ...t("a", 1), name: "sửa trên máy" }, t("b", 2)], updatedAt: null, dirty: true };
    const r = resolveOnLoad(local, cloud);
    expect(r.dirty).toBe(true);
    expect(r.primitives.map((p) => p.id)).toEqual(["a", "b", "c"]);
    expect(r.primitives[0].name).toBe("sửa trên máy");
    expect(resolveOnLoad(local, null)).toBe(local);
    expect(mergePrimitives([], [])).toEqual([]);
  });
});
