// Lớp "Mô hình giá (Pring)" — hàm thuần: chỉ vẽ phần ghim được vào nến, mặc định tắt, khung tuần quy về khóa thứ Hai.
import { describe, expect, it } from "vitest";
import { mondayOf, pringSceneItems, toChartWeekly, type PringScenePattern } from "./pringScene";
import { buildScene } from "./buildScene";
import { DEFAULT_LAYER_STATE } from "../LayerManager";

const bars = ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-07", "2026-09-08"].map((date, i) => ({ date, open: 10 + i, high: 11 + i, low: 9 + i, close: 10 + i, volume: 1 }));
const P: PringScenePattern = {
  type: "DOUBLE_BOTTOM", label: "Đáy đôi", dir: "bull", stateLabel: "Phá vỡ đã xác nhận", startDate: "2026-09-01", endDate: "2026-09-04",
  points: [{ name: "Đáy 1", date: "2026-09-01", price: 9 }, { name: "Đáy 2", date: "2026-09-04", price: 12 }, { name: "ngoài", date: "2026-08-01", price: 1 }],
  lines: [{ name: "Đỉnh hồi", p0: 12, p1: 12, d0: "2026-09-02", d1: "2026-09-04" }, { name: "lệch", p0: 1, p1: 2, d0: "2026-08-01", d1: "2026-09-04" }],
  breakout: { date: "2026-09-07", price: 14 }, failLevel: 11, targets: [15, 18, 21],
};

describe("lớp mô hình giá Pring", () => {
  it("mặc định TẮT: buildScene không vẽ gì khi chưa bật lớp", () => {
    expect(DEFAULT_LAYER_STATE.pring).toBe(false);
    const base = { bars, smc: { obs: [], fvgs: [], liquidity: [], bos: [], choch: [], sweeps: [], premiumDiscount: null } as never, wyckoff: null, primitives: [], draft: null, elliottDraft: [], fibExtension: false, highlight: null, pring: [P] };
    expect(buildScene({ ...base, layers: DEFAULT_LAYER_STATE }).items.some((x) => x.kind === "segment")).toBe(false);
    expect(buildScene({ ...base, layers: { ...DEFAULT_LAYER_STATE, pring: true } }).items.length).toBeGreaterThan(0);
  });
  it("ghim theo nến: bỏ điểm / đường không trùng nến; có phá vỡ, mục tiêu 1×, mức thất bại", () => {
    const it = pringSceneItems(bars, [P]);
    expect(it.filter((x) => x.kind === "segment")).toHaveLength(1);
    const poly = it.find((x) => x.kind === "poly");
    expect(poly && poly.kind === "poly" && poly.nodeLabels).toEqual(["Đáy 1", "Đáy 2"]);
    expect(it.some((x) => x.kind === "vline" && x.t === "2026-09-07")).toBe(true);
    expect(it.filter((x) => x.kind === "hline").map((x) => (x.kind === "hline" ? x.price : 0))).toEqual([15, 11]);
    expect(pringSceneItems(bars, [{ ...P, startDate: "2026-07-01" }])).toHaveLength(0);
  });
  it("khung tuần: ngày phiên cuối tuần -> khóa thứ Hai của nến tuần", () => {
    expect(mondayOf("2026-10-09")).toBe("2026-10-05");
    expect(mondayOf("2026-10-05")).toBe("2026-10-05");
    const w = toChartWeekly([{ ...P, startDate: "2026-09-04", endDate: "2026-09-11", breakout: { date: "2026-09-18", price: 1 } }])[0];
    expect([w.startDate, w.endDate, w.breakout?.date]).toEqual(["2026-08-31", "2026-09-07", "2026-09-14"]);
  });
});
