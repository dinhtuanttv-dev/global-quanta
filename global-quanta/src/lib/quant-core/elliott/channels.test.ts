import { describe, expect, it } from "vitest";
import { elliottChannels, lineAt } from "./channels";
import { elliottState, type ElliottState } from "./index";
import { buildScene } from "../../ta-command-center/chart/buildScene";
import { elliottFibItems, elliottGuideItems } from "../../ta-command-center/chart/elliottScene";
import { DEFAULT_LAYER_STATE } from "../../ta-command-center/LayerManager";
import { EMPTY_SMC } from "../../ta-command-center/AnalysisController";
import type { OhlcvBar } from "../../ta-command-center/types";

const day = (i: number) => new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10);
const pv = (i: number, price: number, type: "H" | "L", confirmed = true) => ({ i, time: day(i), type, price, confirmed, ci: confirmed ? i + 2 : null });

/** Trạng thái giả có số liệu biết trước: sóng 5 tăng đã xong (p5 xác nhận) rồi điều chỉnh A, B, C. */
function st(points: ReturnType<typeof pv>[], wave: ElliottState["wave"], pivots = points, barCount = 120): ElliottState {
  return { label: "", wave, dir: "up", degree: null, weight: null, alternatives: [], invalidation: null, levels: [], asOf: day(barCount - 1), barCount, pivots,
    scenario: { dir: "up", status: "complete", points, valid: true, violations: [], ratios: { w2: 0, w3: 0, w4: 0 }, score: 1, checks: {},
      targets: { wave5: { mode: "", levels: [], window03: { low: 0, high: 0 } } } } } as ElliottState;
}

describe("DW5 — kênh Elliott & điểm kích hoạt", () => {
  const P = [pv(0, 100, "L"), pv(10, 110, "H"), pv(20, 104, "L"), pv(40, 140, "H"), pv(50, 130, "L"), pv(70, 150, "H")];
  it("Base Channel: đường 0–2 + song song qua 1; kích hoạt = nến ĐẦU TIÊN đóng cửa vượt đường song song sau sóng 2", () => {
    const closes = Array.from({ length: 120 }, (_, i) => (i <= 25 ? 105 : i === 26 ? 125 : 130));
    const base = elliottChannels(st(P, "A"), closes).find((c) => c.kind === "base")!;
    expect(lineAt(base.main, 0)).toBeCloseTo(100); expect(lineAt(base.main, 20)).toBeCloseTo(104);
    expect(lineAt(base.parallel, 10)).toBeCloseTo(110); expect(base.parallel.slope).toBeCloseTo(base.main.slope);
    expect(base.trigger?.i).toBe(26);
    // Không vẽ lại: thêm nến sau không đổi điểm kích hoạt đã có
    expect(elliottChannels(st(P, "A"), closes.map((c, i) => (i > 60 ? c + 50 : c))).find((c) => c.kind === "base")!.trigger?.i).toBe(26);
  });
  it("Final Channel: đường 2–4 + song song qua 3; kích hoạt khi đóng cửa thủng 2–4 SAU đỉnh sóng 5", () => {
    const closes = Array.from({ length: 120 }, (_, i) => (i < 75 ? 160 : i === 75 ? 120 : 118));
    const fin = elliottChannels(st(P, "A"), closes).find((c) => c.kind === "final")!;
    expect(lineAt(fin.main, 20)).toBeCloseTo(104); expect(lineAt(fin.main, 50)).toBeCloseTo(130);
    expect(fin.trigger?.i).toBe(75);
  });
  it("Corrective Channel: nối 5 với B, song song qua A; kích hoạt khi đóng cửa vượt đường 5–B sau C", () => {
    const piv = [...P, pv(80, 135, "L"), pv(88, 145, "H"), pv(96, 128, "L")];
    const closes = Array.from({ length: 120 }, (_, i) => (i < 100 ? 130 : 160));
    const cor = elliottChannels(st(P, "post", piv), closes).find((c) => c.kind === "corrective")!;
    expect(lineAt(cor.main, 70)).toBeCloseTo(150); expect(lineAt(cor.main, 88)).toBeCloseTo(145);
    expect(lineAt(cor.parallel, 80)).toBeCloseTo(135);
    expect(cor.trigger?.i).toBe(100);
  });
  it("không có hướng / độ dài giá đóng cửa không khớp cửa sổ -> không kênh", () => {
    expect(elliottChannels(null, [])).toEqual([]);
    expect(elliottChannels(st(P, "A"), [1, 2, 3])).toEqual([]);
  });
});

function bars(n: number, f: (i: number) => number, off = 0): OhlcvBar[] {
  return Array.from({ length: n }, (_, i) => { const c = f(i); return { date: day(i + off), open: c * 0.998, high: c * 1.006, low: c * 0.994, close: c, volume: 1000 }; });
}
const legsFn = (legs: number[][]) => (i: number) => {
  for (let k = 1; k < legs.length; k++) if (i <= legs[k][0]) { const [i0, p0] = legs[k - 1], [i1, p1] = legs[k]; return p0 + ((p1 - p0) * (i - i0)) / (i1 - i0); }
  return legs[legs.length - 1][1];
};
const COMPLETE = [[0, 100], [20, 120], [30, 110], [55, 145], [65, 133], [80, 151], [92, 136], [100, 142], [110, 139]];
const series = () => [...bars(60, (i) => 100 + Math.sin(i / 3) * 1.5), ...bars(111, legsFn(COMPLETE), 60)];

describe("DW5 — lớp 'Elliott kênh & mốc' + Fib mở rộng", () => {
  it("mặc định TẮT; bật thì có kênh (segment), nhãn kênh, giá đỉnh/đáy, thẻ mô hình — mọi điểm trùng một nến", () => {
    expect(DEFAULT_LAYER_STATE.elliottGuide).toBe(false);
    const b = series(), s = elliottState(b)!;
    const base = { bars: b, smc: EMPTY_SMC, wyckoff: null, primitives: [], draft: null, elliottDraft: [], fibExtension: false, highlight: null, elliott: { primary: s } };
    expect(buildScene({ ...base, layers: DEFAULT_LAYER_STATE }).items).toHaveLength(0);
    const items = buildScene({ ...base, layers: { ...DEFAULT_LAYER_STATE, elliottGuide: true } }).items;
    const dates = new Set(b.map((x) => x.date));
    expect(items.some((x) => x.kind === "segment")).toBe(true);
    expect(items.some((x) => x.kind === "text" && /Channel/.test(x.label.text))).toBe(true);
    expect(items.some((x) => x.kind === "text" && /"IM"/.test(x.label.text))).toBe(true);
    for (const it of items) {
      if (it.kind === "segment") { expect(dates.has(it.a.t)).toBe(true); expect(dates.has(it.b.t)).toBe(true); }
      if (it.kind === "text" || it.kind === "ring") expect(dates.has(it.t)).toBe(true);
    }
    expect(elliottGuideItems(s, b.slice(0, -1))).toHaveLength(0); // kết quả lệch nến cuối -> không vẽ
  });
  it("Fib sau sóng 5: vùng (2)/(B) 50–61,8% tô màu + vùng sóng 4 bậc nhỏ + mức 78,6%", () => {
    const b = series(), s = elliottState(b)!;
    const items = elliottFibItems(s, b);
    expect(items.some((x) => x.kind === "zone" && /50–61,8%/.test(x.label?.text ?? ""))).toBe(true);
    expect(items.some((x) => x.kind === "zone" && /sóng 4/.test(x.label?.text ?? ""))).toBe(true);
    expect(items.some((x) => x.kind === "hline" && /78,6%/.test(x.label?.text ?? ""))).toBe(true);
  });
});
