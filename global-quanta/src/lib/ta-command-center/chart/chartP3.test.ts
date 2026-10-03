import { describe, expect, it } from "vitest";
import { placeLabels, LABEL_BUDGET, type LabelBox } from "./scene";
import { buildScene } from "./buildScene";
import { EMPTY_SMC, type SmcState } from "../AnalysisController";
import { sanitizePrimitives, type DrawnPrimitive } from "../DrawingManager";
import { pickNewer } from "../chartDrawingsStore";
import type { OhlcvBar } from "../types";

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
const layers = { trendline: true, demandzone: true, smc: true, vsa: false, wyckoff: false, elliott: false, aiDetectionMaster: false };

describe("P3 — buildScene (toạ độ miền, thay lớp SVG)", () => {
  it("OB ACTIVE kéo tới mép phải; OB đã mitigated dừng ở ngày mitigation; FVG mở có vạch CE; tắt lớp SMC -> không vẽ", () => {
    const smc: SmcState = {
      ...EMPTY_SMC,
      obs: [
        { date: bars[10].date, type: "bullish", top: 100, bottom: 98, mitigated: false, mitigatedAt: null, status: "ACTIVE", kind: "BOS" },
        { date: bars[20].date, type: "bearish", top: 103, bottom: 101, mitigated: true, mitigatedAt: bars[30].date, status: "MITIGATED", kind: "CHoCH" },
      ],
      fvgs: [{ startDate: bars[40].date, endDate: bars[42].date, type: "bullish", top: 102, bottom: 101, filled: false, filledAt: null, state: "OPEN", filledPct: 0 }],
    };
    const s = buildScene({ bars, smc, wyckoff: null, layers, primitives: [], draft: null, elliottDraft: [], fibExtension: false, highlight: null });
    const zones = s.items.filter((i) => i.kind === "zone") as Extract<(typeof s.items)[number], { kind: "zone" }>[];
    expect(zones[0].t2).toBeNull();
    expect(zones[1].t2).toBe(bars[30].date);
    expect(s.items.some((i) => i.kind === "hline" && i.price === 101.5)).toBe(true);
    const off = buildScene({ bars, smc, wyckoff: null, layers: { ...layers, smc: false }, primitives: [], draft: null, elliottDraft: [], fibExtension: false, highlight: null });
    expect(off.items).toHaveLength(0);
  });

  it("hình đang vẽ dở luôn hiện; Fib vẽ đủ các mức", () => {
    const s = buildScene({
      bars, smc: EMPTY_SMC, wyckoff: null, layers: { ...layers, trendline: false }, primitives: [],
      draft: { toolType: "fibonacci", p1: { date: bars[5].date, price: 110 }, p2: { date: bars[15].date, price: 100 } }, elliottDraft: [], fibExtension: true, highlight: null,
    });
    expect(s.items.filter((i) => i.kind === "hline")).toHaveLength(10); // 7 mức + 3 mức mở rộng
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
