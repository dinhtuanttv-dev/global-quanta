import { describe, expect, it } from "vitest";
import { buildScene, type SceneInput } from "./buildScene";
import { DEFAULT_LAYER_STATE } from "../LayerManager";
import type { OhlcvBar } from "../types";

const bars = Array.from({ length: 30 }, (_, i) => ({ date: `2026-01-${String(i + 1).padStart(2, "0")}`, open: 100, high: 101, low: 99, close: 100 + i, volume: 1 })) as OhlcvBar[];
const base = { bars, smc: {} as SceneInput["smc"], wyckoff: null, primitives: [], draft: null, elliottDraft: [] } as unknown as SceneInput;
const msGarch = [{ day: 1, p10: 0.98, p50: 1, p90: 1.02 }, { day: 20, p10: 0.9, p50: 1, p90: 1.1 }];

describe("Lớp MS-GARCH và Bollinger trên scene", () => {
  it("tắt lớp thì scene không đổi dù có dữ liệu", () => {
    const off = buildScene({ ...base, layers: DEFAULT_LAYER_STATE, msGarch, bollinger: { upper: [1, 2], lower: [0, 1] } });
    expect(off.items.some((x) => x.kind === "cone" || x.kind === "cloud")).toBe(false);
  });
  it("bật MS-GARCH: nón neo vào nến cuối theo giá trên chart, không theo giá API", () => {
    const on = buildScene({ ...base, layers: { ...DEFAULT_LAYER_STATE, msgarch: true }, msGarch });
    const c = on.items.find((x) => x.kind === "cone");
    if (c?.kind !== "cone") throw new Error("không có cone");
    expect(c.from).toBe(bars[29].date);
    expect(c.fromPrice).toBe(129);
    expect(c.steps[1]).toEqual({ k: 20, lo: 129 * 0.9, mid: 129, hi: 129 * 1.1 });
  });
  it("không có dữ liệu (khung khác ngày, đang xem lại) thì không vẽ", () => {
    const on = buildScene({ ...base, layers: { ...DEFAULT_LAYER_STATE, msgarch: true }, msGarch: null });
    expect(on.items.some((x) => x.kind === "cone")).toBe(false);
  });
  it("bật Bollinger: nền chỉ giữa các nến có đủ hai dải", () => {
    const on = buildScene({ ...base, layers: { ...DEFAULT_LAYER_STATE, bollinger: true }, bollinger: { upper: [null, 110, 112], lower: [null, 90, 88] } });
    const c = on.items.find((x) => x.kind === "cloud");
    if (c?.kind !== "cloud") throw new Error("không có cloud");
    expect(c.points).toEqual([{ k: 1, a: 110, b: 90 }, { k: 2, a: 112, b: 88 }]);
  });
});
