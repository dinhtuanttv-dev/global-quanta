import { describe, expect, it } from "vitest";
import { displayLevel, ELLIOTT_PRO_LABEL_BUDGET, elliottProItems, elliottProSummary, primaryScenario, type ElliottProMode, type ScenarioView } from "./elliottProScene";
import { buildScene } from "./buildScene";
import { DEFAULT_LAYER_STATE } from "../LayerManager";
import { EMPTY_SMC } from "../AnalysisController";
import { buildWaveTree } from "../../quant-core/elliott/v3/waveTree";
import { evaluateLifecycle, scenariosFromTree } from "../../quant-core/elliott/v3/scenarios";
import type { OhlcvBar } from "../types";

const day = (i: number) => new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10);
function fixture(seed = 11, n = 600) {
  let x = 100;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const bars: OhlcvBar[] = Array.from({ length: n }, (_, i) => { x *= 1 + (rnd() - 0.48) * 0.05; return { date: day(i), open: x, high: x * 1.01, low: x * 0.99, close: x, volume: 1 }; });
  const c = bars.map((b) => ({ time: b.date, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume }));
  const tree = buildWaveTree(c)!;
  const scenarios: ScenarioView[] = [...scenariosFromTree(buildWaveTree(c, { confirmedOnly: true }), c, "SIM"), ...scenariosFromTree(tree, c, "SIM").filter((s) => s.provisional)]
    .map((sc) => ({ sc, lc: evaluateLifecycle(sc, c) }));
  return { bars, tree, scenarios };
}
const base = (bars: OhlcvBar[]) => ({ bars, smc: EMPTY_SMC, wyckoff: null, primitives: [], draft: null, elliottDraft: [], fibExtension: false, highlight: null });

describe("EP3 — lớp Elliott Pro", () => {
  it("mặc định TẮT; bật thì vẽ + ngân sách nhãn theo chế độ", () => {
    expect(DEFAULT_LAYER_STATE.elliottPro).toBe(false);
    const { bars, tree, scenarios } = fixture();
    const inp = { tree, scenarios, mode: "chart" as ElliottProMode };
    expect(buildScene({ ...base(bars), layers: DEFAULT_LAYER_STATE, elliottPro: inp }).items).toHaveLength(0);
    const sc = buildScene({ ...base(bars), layers: { ...DEFAULT_LAYER_STATE, elliottPro: true }, elliottPro: inp });
    expect(sc.items.length).toBeGreaterThan(0);
    expect(sc.labelBudget).toBe(ELLIOTT_PRO_LABEL_BUDGET.chart);
  });
  it("ba chế độ: Gọn ⊂ Phác đồ ⊂ Chuyên sâu (số phần tử tăng dần); Gọn không có đường tương lai", () => {
    const { bars, tree, scenarios } = fixture();
    const n = (mode: ElliottProMode) => elliottProItems({ tree, scenarios, mode }, bars);
    expect(n("compact").length).toBeLessThanOrEqual(n("chart").length);
    expect(n("chart").length).toBeLessThanOrEqual(n("deep").length);
    expect(n("compact").some((x) => x.kind === "future")).toBe(false);
  });
  it("ghim vào nến: mọi điểm (trừ đường tương lai) trùng một nến của khung đang xem; đường tương lai neo nến cuối", () => {
    const { bars, tree, scenarios } = fixture();
    const dates = new Set(bars.map((b) => b.date));
    for (const it of elliottProItems({ tree, scenarios, mode: "deep" }, bars)) {
      if (it.kind === "poly") for (const p of it.points) expect(dates.has(p.t)).toBe(true);
      if (it.kind === "segment") { expect(dates.has(it.a.t)).toBe(true); expect(dates.has(it.b.t)).toBe(true); }
      if (it.kind === "hline") expect(dates.has(it.t1)).toBe(true);
      if (it.kind === "text" || it.kind === "ring") expect(dates.has(it.t)).toBe(true);
      if (it.kind === "future") expect(it.from).toBe(bars[bars.length - 1].date);
    }
  });
  it("gộp mức giá trùng (±0,15%): không có hai đường ngang cùng giá", () => {
    const { bars, tree, scenarios } = fixture();
    const prices = elliottProItems({ tree, scenarios, mode: "deep" }, bars).filter((x) => x.kind === "hline").map((x) => (x.kind === "hline" ? x.price : 0)).sort((a, b) => a - b);
    for (let k = 1; k < prices.length; k++) expect(prices[k] - prices[k - 1]).toBeGreaterThan(0.0015 * prices[k] - 1e-9);
  });
  it("nhãn vô hiệu / mục tiêu ưu tiên cao hơn nhãn thông tin; nhãn sóng chính vẽ trực tiếp (không qua ngân sách)", () => {
    const { bars, tree, scenarios } = fixture();
    const items = elliottProItems({ tree, scenarios, mode: "chart" }, bars);
    const inv = items.find((x) => x.kind === "hline" && /Vô hiệu/.test(x.label?.text ?? ""));
    const info = items.find((x) => x.kind === "future");
    if (inv && info && inv.kind === "hline" && info.kind === "future") expect(inv.label!.priority).toBeGreaterThan(info.label!.priority);
    expect(items.some((x) => x.kind === "poly" && x.nodeLabels && x.nodeStyle !== "plain")).toBe(displayLevel(tree) > 0);
  });
  it("dòng tóm tắt: vị trí + kịch bản chính (trạng thái, kích hoạt, MT, vô hiệu); kịch bản chính ưu tiên đã xác nhận còn hiệu lực", () => {
    const { tree, scenarios } = fixture();
    const s = elliottProSummary({ tree, scenarios, mode: "chart" })!;
    expect(s).toMatch(/^EW · /);
    const p = primaryScenario(scenarios);
    if (p) expect(s).toMatch(/kích hoạt .* · MT .* · vô hiệu /);
    expect(elliottProSummary({ tree: null, scenarios: [], mode: "chart" })).toBeNull();
    expect(primaryScenario([])).toBeNull();
  });
});
