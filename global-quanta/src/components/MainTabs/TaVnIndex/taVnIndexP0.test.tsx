import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { SMCPanel, WyckoffPanel } from "./MethodPanels";
import { buildPrompt } from "./SmartNotePanel";
import { AnalysisController } from "../../../lib/ta-command-center/AnalysisController";
import { AIEngine } from "../../../lib/ta-command-center/AIEngine";
import { SMC_DISPLAY_LIMIT } from "../../../lib/ta-command-center/AnalysisController";
import { analyze } from "../../../lib/quant-core";
import { classifyWyckoffPhase, describeRangeCriteria, WYCKOFF_PHASE_LABEL, type WyckoffPhase, type WyckoffResult } from "../../../lib/ta-command-center/detectors/wyckoffDetector";
import { calculateADX, calculateMACD, calculateRSI } from "../../../lib/ta-command-center/detectors/technicalOscillators";
import type { OhlcvBar } from "../../../lib/ta-command-center/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** 250 nến tất định (random walk có hạt giống) — đủ dài để số OB/FVG vượt giới hạn hiển thị. */
function bars(n = 250, seed = 7): OhlcvBar[] {
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const out: OhlcvBar[] = [];
  let close = 50_000;
  const d = new Date("2025-10-01T00:00:00Z");
  for (let i = 0; i < n; i++) {
    d.setUTCDate(d.getUTCDate() + (d.getUTCDay() === 5 ? 3 : 1));
    const open = close;
    close = Math.max(5_000, Math.round(open * (1 + (rnd() - 0.5) * 0.06)));
    const high = Math.max(open, close) * (1 + rnd() * 0.015);
    const low = Math.min(open, close) * (1 - rnd() * 0.015);
    out.push({ date: d.toISOString().slice(0, 10), open, high, low, close, volume: Math.round(1e6 * (0.4 + rnd() * 1.6)) });
  }
  return out;
}

const roots: ReturnType<typeof createRoot>[] = [];
async function render(node: React.ReactNode) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  roots.push(root);
  await act(async () => { root.render(node); });
  return el;
}
afterEach(() => { act(() => { for (const r of roots.splice(0)) r.unmount(); }); document.body.innerHTML = ""; });

const wyckoff = (phase: WyckoffPhase, extra: Partial<WyckoffResult> = {}): WyckoffResult => ({
  ...classifyWyckoffPhase([]), phase, confidenceScore: 40,
  rangeHigh: 61_400, rangeLow: 54_600, rangeStartDate: "2026-05-27", rangeEndDate: "2026-08-10", ...extra,
});

describe("TA VN-Index P0 — Wyckoff hiển thị đủ mọi pha", () => {
  it("mọi pha (gồm Distribution/Markdown) có nhãn; ô Wyckoff không còn trống", async () => {
    const phases: WyckoffPhase[] = ["accumulation", "spring", "test", "markup", "distribution", "decline", "undetermined"];
    for (const p of phases) expect(WYCKOFF_PHASE_LABEL[p], p).toBeTruthy();
    const el = await render(<WyckoffPanel result={wyckoff("decline")} barCount={250} />);
    expect(el.querySelector('[data-testid="wyckoff-phase"]')?.textContent).toBe("Markdown");
    expect(el.textContent).toContain("không phải xác suất");
    expect(el.querySelector('[data-provenance="INFERRED"]')).not.toBeNull();
  });

  it("mô tả điều kiện range lấy đúng tham số thuật toán (15%, cửa sổ 50 phiên)", async () => {
    expect(describeRangeCriteria(250)).toContain("15%");
    expect(describeRangeCriteria(250)).toContain("50 phiên");
    const el = await render(<WyckoffPanel result={wyckoff("undetermined", { rangeHigh: null, rangeLow: null })} barCount={90} />);
    expect(el.textContent).toContain("cửa sổ 30 phiên");
    expect(el.textContent).not.toContain("12%");
  });

  it("Smart Note gửi AI nhãn pha thật, không còn 'undefined', gắn DERIVED/INFERRED thay HARD_DATA", () => {
    const b = bars();
    const controller = new AnalysisController(b);
    const prompt = buildPrompt({
      ticker: "VNM", wyckoff: wyckoff("decline"), smc: controller.getSmc(), vsa: controller.getVsa(),
      rsi: calculateRSI(b), macd: calculateMACD(b), adx: calculateADX(b),
    });
    expect(prompt).toContain("Markdown");
    expect(prompt).not.toContain("undefined");
    expect(prompt).not.toContain("HARD_DATA");
    expect(prompt).toContain(`${controller.getSmc().totals.obs} Order Block`);
    controller.destroy();
  });
});

describe("TA VN-Index P0 — SMC đếm số thật, không phải giới hạn hiển thị", () => {
  it("tổng OB/FVG vượt giới hạn vẽ; ô SMC hiển thị tổng thật", async () => {
    const b = bars();
    const c = analyze(b).counts;
    const totals = { obs: c.orderBlocks, fvgs: c.fvgs, bos: c.bos, choch: c.choch, liquidity: c.liquidity, sweeps: c.sweeps };
    expect(totals.obs).toBeGreaterThan(SMC_DISPLAY_LIMIT.obs);
    expect(totals.fvgs).toBeGreaterThan(SMC_DISPLAY_LIMIT.fvgs);

    const controller = new AnalysisController(b);
    const smc = controller.getSmc();
    expect(smc.totals).toEqual(totals);
    // Chỉ vẽ vùng CÒN HIỆU LỰC (yêu cầu 03/10): OB chưa test, FVG còn mở — tối đa giới hạn hiển thị.
    expect(smc.obs.length).toBeLessThanOrEqual(SMC_DISPLAY_LIMIT.obs);
    expect(smc.obs.every((o) => o.status === "ACTIVE")).toBe(true);
    expect(smc.fvgs.every((g) => g.state === "OPEN" || g.state === "PARTIAL")).toBe(true);
    const el = await render(<SMCPanel obs={smc.obs} fvgs={smc.fvgs} bos={smc.bos} choch={smc.choch} totals={smc.totals} barCount={b.length} />);
    expect(el.textContent).toContain(`${totals.obs} OB · ${totals.fvgs} FVG · ${totals.bos} BOS · ${totals.choch} CHoCH`);
    expect(el.textContent).toContain(`Toàn bộ ${b.length} nến`);
    expect(el.querySelector('[data-provenance="DERIVED"]')).not.toBeNull();
    controller.destroy();
  });
});

describe("TA VN-Index P0 — Confluence Log không gắn HARD cho điểm theo luật", () => {
  it("Zone vẽ tay: INFERRED + 'Điểm luật x/99'; Trendline/Fib: DERIVED, không có % giả", () => {
    const b = bars();
    const controller = new AnalysisController(b);
    const smc = controller.getSmc();
    const engine = new AIEngine();
    const zone = engine.analyzeAndCrossReference(
      { id: "z", toolType: "rectangle", p1: { date: b[100].date, price: 60_000 }, p2: { date: b[140].date, price: 40_000 } } as never,
      smc, controller.getVsa(), b[b.length - 1].close, controller.getWyckoff(), b,
    )[0];
    expect(zone.dataQuality).toBe("INFERRED");
    expect(zone.message).toMatch(/Điểm luật \d+\/99/);
    expect(zone.message).not.toMatch(/AI xac nhan|AI xác nhận/);

    const line = engine.analyzeAndCrossReference(
      { id: "t", toolType: "trendline", p1: { date: b[0].date, price: 50_000 }, p2: { date: b[249].date, price: 55_000 } } as never,
      smc, controller.getVsa(), b[b.length - 1].close,
    )[0];
    expect(line.dataQuality).toBe("DERIVED");
    expect(line.confidence).toBeNull(); // trước đây gán cứng 85%
    controller.destroy();
  });
});
