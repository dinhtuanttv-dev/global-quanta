import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import ElliottWavePanel, { ElliottDeepPanel } from "./ElliottWavePanel";
import { engineElliottPoints } from "./TVChartPanel";
import { elliottMtf } from "../../../lib/quant-core/elliott/mtf";
import { elliottOscData, elliottState } from "../../../lib/quant-core/elliott";
import { buildScene } from "../../../lib/ta-command-center/chart/buildScene";
import { elliottSceneItems } from "../../../lib/ta-command-center/chart/elliottScene";
import { DEFAULT_LAYER_STATE } from "../../../lib/ta-command-center/LayerManager";
import { EMPTY_SMC } from "../../../lib/ta-command-center/AnalysisController";
import { aggregateToWeekly } from "../../../lib/ta-command-center/TimeframeController";
import type { OhlcvBar } from "../../../lib/ta-command-center/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot> | null = null;
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ""; });
function render(ui: React.ReactElement) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  root = createRoot(el);
  act(() => root!.render(ui));
  return el;
}

const day = (i: number) => new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10);
function bars(n: number, f: (i: number) => number, off = 0): OhlcvBar[] {
  return Array.from({ length: n }, (_, i) => { const c = f(i); return { date: day(i + off), open: c * 0.998, high: c * 1.006, low: c * 0.994, close: c, volume: 1000 + (i % 9) * 50 }; });
}
const legsFn = (legs: number[][]) => (i: number) => {
  for (let k = 1; k < legs.length; k++) if (i <= legs[k][0]) { const [i0, p0] = legs[k - 1], [i1, p1] = legs[k]; return p0 + ((p1 - p0) * (i - i0)) / (i1 - i0); }
  return legs[legs.length - 1][1];
};
// 5 sóng tăng + A, B đã xác nhận -> đang ở sóng C (cùng mẫu với elliott.test.ts)
const COMPLETE = [[0, 100], [20, 120], [30, 110], [55, 145], [65, 133], [80, 151], [92, 136], [100, 142], [110, 139]];
const series = () => [...bars(60, (i) => 100 + Math.sin(i / 3) * 1.5), ...bars(111, legsFn(COMPLETE), 60)];

describe("E5 — lớp Elliott tự động trên biểu đồ", () => {
  it("mặc định TẮT: lớp elliottAuto / elliottOsc = false; tắt thì không vẽ, bật thì có đường đếm sóng 0–5 + A/B", () => {
    expect(DEFAULT_LAYER_STATE.elliottAuto).toBe(false);
    expect(DEFAULT_LAYER_STATE.elliottOsc).toBe(false);
    const b = series(), st = elliottState(b)!;
    const base = { bars: b, smc: EMPTY_SMC, wyckoff: null, primitives: [], draft: null, elliottDraft: [], fibExtension: false, highlight: null, elliott: { primary: st } };
    expect(buildScene({ ...base, layers: DEFAULT_LAYER_STATE }).items).toHaveLength(0);
    const items = buildScene({ ...base, layers: { ...DEFAULT_LAYER_STATE, elliottAuto: true } }).items;
    const poly = items.find((x) => x.kind === "poly" && x.nodeLabels);
    expect(poly && poly.kind === "poly" && poly.nodeLabels!.slice(0, 6)).toEqual(["0", "1", "2", "3", "4", "5"]);
    expect(poly && poly.kind === "poly" && poly.nodeLabels!.slice(6, 8)).toEqual(["A", "B"]);
    expect(items.some((x) => x.kind === "hline" && x.label?.text === "Mục tiêu điều chỉnh: sóng 4")).toBe(true);
    expect(items.some((x) => x.kind === "hline" && x.label?.text === "Vô hiệu")).toBe(true);
  });

  it("ghim vào nến: mọi điểm trùng một nến của khung đang xem; khung không chứa ngày đó -> bỏ cả đường", () => {
    const b = series(), st = elliottState(b)!;
    const dates = new Set(b.map((x) => x.date));
    const items = elliottSceneItems({ bars: b, primary: st });
    for (const it of items) {
      if (it.kind === "poly") for (const p of it.points) expect(dates.has(p.t)).toBe(true);
      if (it.kind === "hline") expect(dates.has(it.t1)).toBe(true);
    }
    // Khung tuần (ngày thứ Hai) không chứa các ngày pivot của khung ngày -> không vẽ đường ngày lệch nến.
    const wk = aggregateToWeekly(b);
    expect(elliottSceneItems({ bars: wk, primary: st }).filter((x) => x.kind === "poly")).toHaveLength(0);
  });

  it("dữ liệu Elliott Oscillator: SMA5 − SMA35 của (H+L)/2, bỏ 34 nến đầu; dải 80% ≥ 0 / ≤ 0", () => {
    const b = series(), d = elliottOscData(b);
    expect(d).toHaveLength(b.length - 34);
    expect(d[0].date).toBe(b[34].date);
    const mid = (k: number) => (b[k].high + b[k].low) / 2, avg = (a: number, n: number, e: number) => { let s = 0; for (let k = e - n + 1; k <= e; k++) s += mid(k); return s / n; };
    expect(d[0].osc).toBeCloseTo(avg(0, 5, 34) - avg(0, 35, 34), 9);
    expect(d.every((x) => x.up >= 0 && x.lo <= 0)).toBe(true);
  });

  it("Gợi ý vẽ: 6 điểm 0–5 của engine, trùng nến; không có kịch bản -> null (dùng gợi ý Zigzag cũ)", () => {
    const b = series(), st = elliottState(b)!;
    const pts = engineElliottPoints(st, b)!;
    expect(pts).toHaveLength(6);
    expect(pts.map((p) => p.date)).toEqual(st.scenario!.points.map((p) => p.time));
    expect(engineElliottPoints({ ...st, scenario: null }, b)).toBeNull();
  });
});

describe("E5 — thẻ Elliott hai khung + phác đồ", () => {
  const daily = (() => { const out: OhlcvBar[] = []; const d = new Date("2023-01-02T00:00:00Z"); let i = 0;
    while (out.length < 750) { const u = d.getUTCDay(); if (u >= 1 && u <= 5) { const p = 100 + 30 * Math.sin(i / 40) + i * 0.08; out.push({ date: d.toISOString().slice(0, 10), open: p, high: p * 1.01, low: p * 0.99, close: p, volume: 1e6 }); i++; } d.setUTCDate(d.getUTCDate() + 1); }
    return out; })();

  it("có dòng Tuần và Ngày, quan hệ hai khung, nhãn trọng số không gọi là xác suất; nút bật/tắt gọi đúng lớp", () => {
    const mtf = elliottMtf(daily);
    const onAuto = vi.fn(), onOsc = vi.fn(), onSuggest = vi.fn();
    const el = render(<ElliottWavePanel mtf={mtf} timeframe="D" autoOn={false} oscOn={false} onToggleAuto={onAuto} onToggleOsc={onOsc} onSuggest={onSuggest} detailOpen={false} onToggleDetail={() => {}} />);
    expect(el.querySelector('[data-testid="elliott-row-W"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="elliott-row-D"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="elliott-relation"]')?.textContent).toBe(mtf.relationText);
    expect(el.textContent).not.toMatch(/xác suất/i);
    expect(el.querySelectorAll('[data-testid="elliott-osc-count"]').length).toBe(mtf.osc.week ? 2 : 1); // E2: đếm theo dao động mỗi khung
    expect(el.querySelector('[data-testid="elliott-toggle-auto"]')?.getAttribute("aria-pressed")).toBe("false");
    act(() => (el.querySelector('[data-testid="elliott-toggle-auto"]') as HTMLButtonElement).click());
    act(() => (el.querySelector('[data-testid="elliott-toggle-osc"]') as HTMLButtonElement).click());
    act(() => (el.querySelector('[data-testid="elliott-suggest"]') as HTMLButtonElement).click());
    expect([onAuto.mock.calls.length, onOsc.mock.calls.length, onSuggest.mock.calls.length]).toEqual([1, 1, 1]);
  });

  it("khung intraday: nút Gợi ý vô hiệu (chỉ D / W)", () => {
    const el = render(<ElliottWavePanel mtf={elliottMtf(daily)} timeframe="15m" autoOn={false} oscOn={false} onToggleAuto={() => {}} onToggleOsc={() => {}} onSuggest={() => {}} detailOpen={false} onToggleDetail={() => {}} />);
    expect((el.querySelector('[data-testid="elliott-suggest"]') as HTMLButtonElement).disabled).toBe(true);
  });

  it("phác đồ chi tiết: đổi khung Tuần/Ngày, có sơ đồ mẫu, bảng kiểm định VN", () => {
    const mtf = elliottMtf(daily);
    const el = render(<ElliottDeepPanel mtf={mtf} daily={daily} weekly={aggregateToWeekly(daily)} ticker="TEST" onClose={() => {}} />);
    expect(el.querySelector('[data-testid="elliott-validation"]')?.textContent).toContain("không tín hiệu nào có lợi thế");
    act(() => (el.querySelector('[data-testid="elliott-frame-D"]') as HTMLButtonElement).click());
    expect(el.querySelector('[data-testid="elliott-frame-D"]')?.getAttribute("aria-selected")).toBe("true");
    if (mtf.day && mtf.day.wave !== "none") {
      expect(el.querySelector('[data-testid="elliott-sketch"]')?.getAttribute("data-frame")).toBe("D");
      expect(el.querySelector('[data-testid="elliott-schematic"]')).not.toBeNull();
    }
    act(() => (el.querySelector('[data-testid="elliott-frame-W"]') as HTMLButtonElement).click());
    if (mtf.week && mtf.week.wave !== "none") expect(el.querySelector('[data-testid="elliott-sketch"]')?.getAttribute("data-frame")).toBe("W");
  });
});
