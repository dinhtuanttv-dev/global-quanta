import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { WyckoffPanel } from "./MethodPanels";
import { buildPrompt } from "./SmartNotePanel";
import { analyze, classifyWyckoffV2, wyckoffTimeframePolicy } from "../../../lib/quant-core";
import { buildScene } from "../../../lib/ta-command-center/chart/buildScene";
import { DEFAULT_LAYER_STATE } from "../../../lib/ta-command-center/LayerManager";
import { classicAccumulationSeries, staleSpringSeries } from "../../../lib/quant-core/__fixtures__/wyckoffSeries";

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

describe("Thẻ Wyckoff Cycle — hiện hành / lịch sử / chưa đủ bằng chứng", () => {
  it("cấu trúc cũ hết hiệu lực -> 'Chưa xác định pha hiện tại', huy hiệu Lịch sử, range ghi rõ là lịch sử, có lý do", () => {
    const bars = staleSpringSeries(90);
    const w = analyze(bars, { timeframe: "D" }).wyckoff;
    const el = render(<WyckoffPanel result={w} barCount={bars.length} timeframe="D" />);
    expect(el.querySelector('[data-testid="wyckoff-phase"]')?.textContent).toBe("Chưa xác định pha hiện tại");
    expect(el.querySelector('[data-testid="wyckoff-status"]')?.textContent).toBe("Lịch sử · hết hiệu lực");
    expect(el.querySelector('[data-testid="wyckoff-range"]')?.textContent).toContain("Range lịch sử");
    expect(el.querySelector('[data-testid="wyckoff-historical"]')?.textContent).toContain("Spring");
    expect(el.textContent).not.toMatch(/\d+% \(không phải xác suất\)/); // không hiển thị "độ tin cậy %"
  });

  it("cấu trúc đang hoạt động: pha + Phase, sự kiện có ngày xảy ra và ngày xác nhận khác nhau", () => {
    const bars = classicAccumulationSeries();
    const a = analyze(bars, { timeframe: "D" });
    const el = render(<WyckoffPanel result={a.wyckoffAlt} barCount={bars.length} timeframe="D" compare={a.wyckoff} />);
    expect(el.querySelector('[data-testid="wyckoff-status"]')?.textContent).toBe("Đang hoạt động");
    expect(el.querySelector('[data-testid="wyckoff-phase"]')?.textContent).toContain("Phase E");
    expect(el.querySelector('[data-testid="wyckoff-events"]')?.textContent).toContain("xác nhận");
    expect(el.querySelector('[data-testid="wyckoff-checks"]')?.textContent).toContain("không phải xác suất");
    expect(el.querySelector('[data-testid="wyckoff-compare"]')).not.toBeNull();
  });

  it("Smart Note không mô tả cấu trúc cũ như pha hiện tại", () => {
    const w = classifyWyckoffV2(staleSpringSeries(90));
    const prompt = buildPrompt({ ticker: "FPT", wyckoff: w, smc: { obs: [], fvgs: [], bos: [], choch: [], totals: { obs: 0, fvgs: 0, bos: 0, choch: 0, liquidity: 0, sweeps: 0 } } as never, vsa: [], rsi: { latest: null } as never, macd: { latest: { histogram: null } } as never, adx: { latest: null } as never });
    expect(prompt).toContain("CHƯA XÁC ĐỊNH pha hiện tại");
    expect(prompt).not.toContain("Spring (Phase C);");
  });
});

describe("Wyckoff — khung thời gian, chỉ số, lớp vẽ", () => {
  it("1m/5m tắt, 15m/1H/W/M có cảnh báo, D không cảnh báo; VN-Index có cảnh báo chỉ số", () => {
    expect(wyckoffTimeframePolicy("1m").enabled).toBe(false);
    expect(wyckoffTimeframePolicy("15m").note).toMatch(/khung nhỏ/);
    expect(wyckoffTimeframePolicy("W").note).toMatch(/chưa kiểm định/);
    expect(wyckoffTimeframePolicy("D").note).toBeNull();
    const bars = classicAccumulationSeries();
    const off = analyze(bars, { timeframe: "5m" }).wyckoff;
    expect(off.phase).toBe("undetermined");
    expect(off.statusReason).toMatch(/tắt ở khung 5m/);
    expect(analyze(bars, { timeframe: "D", isIndex: true }).wyckoff.caveats?.join(" ")).toMatch(/không giao dịch trực tiếp/);
  });

  it("lớp vẽ: range lịch sử có nhãn '(lịch sử)'; sự kiện xác nhận muộn có '✓dd/mm'", () => {
    const layers = { ...DEFAULT_LAYER_STATE, wyckoff: true };
    const stale = staleSpringSeries(90);
    const s1 = buildScene({ bars: stale, smc: null, wyckoff: analyze(stale).wyckoff, layers, primitives: [], draft: null, elliottDraft: [], fibExtension: false, highlight: null } as never);
    expect(s1.items.some((i) => i.kind === "zone" && i.label?.text === "Wyckoff range (lịch sử)")).toBe(true);
    const bars = classicAccumulationSeries();
    const s2 = buildScene({ bars, smc: null, wyckoff: analyze(bars).wyckoffAlt, layers, primitives: [], draft: null, elliottDraft: [], fibExtension: false, highlight: null } as never);
    expect(s2.items.some((i) => i.kind === "zone" && i.label?.text === "Wyckoff range")).toBe(true);
    expect(s2.items.some((i) => i.kind === "vline" && /✓\d\d\/\d\d/.test(i.label?.text ?? ""))).toBe(true);
  });

  it("v2: Spring có ngày xác nhận = phiên đóng cửa trở lại trong range", () => {
    const w = classifyWyckoffV2(staleSpringSeries(0));
    const spring = w.events.find((e) => e.event === "Spring")!;
    expect(spring.confirmedIndex).not.toBeNull();
    expect(spring.confirmedIndex!).toBeGreaterThanOrEqual(spring.index);
  });
});

describe("Wyckoff — bằng chứng VSA (W1)", () => {
  it("thẻ hiện mục Bằng chứng VSA: Spring #loại, nến xác nhận SOS, đặc điểm range; ghi rõ chỉ hiển thị", () => {
    const bars = classicAccumulationSeries();
    const w = analyze(bars, { timeframe: "D" }).wyckoffAlt!;
    const el = render(<WyckoffPanel result={w} barCount={bars.length} timeframe="D" />);
    const ev = el.querySelector('[data-testid="wyckoff-evidence"]');
    expect(ev).not.toBeNull();
    expect(ev!.textContent).toMatch(/Spring #[123]/);
    expect(el.querySelector('[data-testid="wyckoff-ev-confirm"]')?.textContent).toMatch(/SOS .* nến sau/);
    expect(ev!.textContent).toContain("chưa tính vào pha");
  });

  it("lớp vẽ: nhãn Spring kèm #loại; cấu trúc lịch sử không vẽ Creek/ICE", () => {
    const layers = { ...DEFAULT_LAYER_STATE, wyckoff: true };
    const bars = classicAccumulationSeries();
    const s = buildScene({ bars, smc: null, wyckoff: analyze(bars).wyckoffAlt, layers, primitives: [], draft: null, elliottDraft: [], fibExtension: false, highlight: null } as never);
    expect(s.items.some((i) => i.kind === "vline" && /^Spring#[123]/.test(i.label?.text ?? ""))).toBe(true);
    const stale = staleSpringSeries(90);
    const h = buildScene({ bars: stale, smc: null, wyckoff: analyze(stale).wyckoff, layers, primitives: [], draft: null, elliottDraft: [], fibExtension: false, highlight: null } as never);
    expect(h.items.some((i) => i.kind === "poly" && /Creek|ICE/.test(i.label?.text ?? ""))).toBe(false);
  });

  it("lớp Wyckoff tắt -> không vẽ gì của Wyckoff (mặc định OFF)", () => {
    const bars = classicAccumulationSeries();
    const s = buildScene({ bars, smc: null, wyckoff: analyze(bars).wyckoffAlt, layers: DEFAULT_LAYER_STATE, primitives: [], draft: null, elliottDraft: [], fibExtension: false, highlight: null } as never);
    expect(s.items.some((i) => "label" in i && /Wyckoff|Creek|ICE|JAC|BUEC|Spring/.test(i.label?.text ?? ""))).toBe(false);
  });
});

describe("Wyckoff — 9 phép thử (W2)", () => {
  it("thẻ hiện '9 phép thử mua: x/y đạt · không phải xác suất' và mục tiêu ước lượng; cấu trúc lịch sử không hiện", () => {
    const bars = classicAccumulationSeries();
    const w = analyze(bars, { timeframe: "D" }).wyckoffAlt!;
    const el = render(<WyckoffPanel result={w} barCount={bars.length} timeframe="D" />);
    const t = el.querySelector('[data-testid="wyckoff-tests"]');
    expect(t?.textContent).toMatch(/9 phép thử mua: \d\/\d đạt/);
    expect(t?.textContent).toContain("không phải xác suất");
    expect(el.querySelector('[data-testid="wyckoff-targets"]')?.textContent).toContain("1×");
    act(() => root?.unmount()); root = null; document.body.innerHTML = "";
    const stale = staleSpringSeries(90);
    const el2 = render(<WyckoffPanel result={analyze(stale).wyckoff} barCount={stale.length} timeframe="D" />);
    expect(el2.querySelector('[data-testid="wyckoff-tests"]')).toBeNull();
  });

  it("lớp vẽ: mục tiêu ước lượng 1× (đường ngang) với cấu trúc đang hoạt động", () => {
    const layers = { ...DEFAULT_LAYER_STATE, wyckoff: true };
    const bars = classicAccumulationSeries();
    const s = buildScene({ bars, smc: null, wyckoff: analyze(bars).wyckoffAlt, layers, primitives: [], draft: null, elliottDraft: [], fibExtension: false, highlight: null } as never);
    expect(s.items.some((i) => i.kind === "hline" && i.label?.text === "Mục tiêu ước lượng 1×")).toBe(true);
  });
});

describe("Wyckoff — bản đồ chu kỳ & kế hoạch 3 lần (W3)", () => {
  it("thẻ: sơ đồ chu kỳ tô sáng pha hiện tại; kế hoạch ghi 'minh hoạ, không phải khuyến nghị' và giới hạn KL", () => {
    const bars = classicAccumulationSeries();
    const w = analyze(bars, { timeframe: "D" }).wyckoffAlt!;
    const el = render(<WyckoffPanel result={w} barCount={bars.length} timeframe="D" />);
    expect(el.querySelector('[data-testid="wyckoff-cycle-map"]')?.getAttribute("data-current")).toBe("E");
    expect(el.querySelector('[data-testid="wyckoff-plan3"]')?.textContent).toContain("không phải khuyến nghị");
    expect(el.querySelector('[data-testid="wyckoff-liquidity"]')?.textContent).toContain("15% KL TB20");
  });
  it("lớp vẽ: dải Phase A–E dưới range, đoạn hiện tại có nhãn '(hiện tại)'; lịch sử không vẽ", () => {
    const layers = { ...DEFAULT_LAYER_STATE, wyckoff: true };
    const bars = classicAccumulationSeries();
    const s = buildScene({ bars, smc: null, wyckoff: analyze(bars).wyckoffAlt, layers, primitives: [], draft: null, elliottDraft: [], fibExtension: false, highlight: null } as never);
    expect(s.items.some((i) => i.kind === "zone" && i.label?.text === "Phase E (hiện tại)")).toBe(true);
    const stale = staleSpringSeries(90);
    const h = buildScene({ bars: stale, smc: null, wyckoff: analyze(stale).wyckoff, layers, primitives: [], draft: null, elliottDraft: [], fibExtension: false, highlight: null } as never);
    expect(h.items.some((i) => i.kind === "zone" && /^Phase /.test(i.label?.text ?? ""))).toBe(false);
  });
});

