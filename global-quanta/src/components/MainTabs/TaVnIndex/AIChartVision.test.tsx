// AI Chart Vision v2 — khung chính (đa khung D/W/M từ Gateway) và nút mở từ bảng phụ của bộ lọc.
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChartVisionDoc } from "../../../hooks/useChartVision";
import fixture from "./__fixtures__/chartVision.json";
import sepaFixture from "./__fixtures__/sepa.json";
import type { SepaDoc } from "../../../hooks/useSepa";
import type { OhlcvBar } from "../../../lib/ta-command-center/types";

// Sinh từ engine Gateway thật (backend/src/market/chartVision) trên chuỗi tăng giả lập.
const doc = fixture as unknown as ChartVisionDoc;
const requested: (string | null)[] = [];
vi.mock("../../../hooks/useChartVision", async (orig) => ({
  ...(await orig<typeof import("../../../hooks/useChartVision")>()),
  useChartVision: (s: string | null) => { requested.push(s); return { data: s ? doc : undefined, error: undefined, isLoading: false, isValidating: false, refresh: () => {} }; },
  usePatternGeometry: () => ({ data: undefined, error: undefined }),
}));
vi.mock("../../../services/marketDataClient", async (orig) => ({ ...(await orig<typeof import("../../../services/marketDataClient")>()), isMarketGatewayEnabled: () => true }));
const sepaDoc = sepaFixture.doc as unknown as SepaDoc;
const barsOf = sepaFixture.bars as Record<string, OhlcvBar[]>;
vi.mock("../../../hooks/useSepa", async (orig) => ({ ...(await orig<typeof import("../../../hooks/useSepa")>()), useSepa: () => ({ data: sepaDoc, error: undefined, isLoading: false, refresh: () => {} }) }));
vi.mock("../../../hooks/useTaSeries", () => ({ useTaSeries: (t: string | null) => ({ bars: t ? barsOf[t] ?? [] : [], isLoading: false, error: undefined, priceBasis: "ADJUSTED_CUMULATIVE", corporateActions: [], warnings: [], quality: {} }) }));
vi.mock("../../../hooks/useSepaIntraday", () => ({ useSepaIntraday: () => ({ live: false, error: undefined, isLoading: false, refresh: () => {}, data: undefined }) }));
vi.mock("../../../hooks/useVolumeAnalysis", () => ({ useVolumeAnalysis: () => ({ data: undefined }) }));

const { default: AIChartVisionPanel } = await import("./AIChartVision");
const { default: SepaPanel } = await import("./SepaPanel");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot> | null = null;
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ""; requested.length = 0; });
function render(ui: React.ReactElement) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  root = createRoot(el);
  act(() => root!.render(ui));
  return el;
}
const click = (el: Element | null) => act(() => { (el as HTMLElement).click(); });
const q = (el: Element, id: string) => el.querySelector(`[data-testid="${id}"]`);

describe("AI Chart Vision v2", () => {
  it("phân tích 3 khung D/W/M thật, không còn lỗi 'chưa cấu hình nguồn'; hợp lưu, kịch bản, checklist", () => {
    const el = render(<AIChartVisionPanel ticker="UPX" />);
    expect(requested[requested.length - 1]).toBe("UPX");
    expect(el.textContent).not.toContain("Chưa cấu hình");
    expect(q(el, "cv-bias")?.textContent).toBe(doc.synthesis.bias.label);
    for (const tf of ["D", "W", "M"]) expect(q(el, `cv-frame-${tf}`)).not.toBeNull();
    expect(el.querySelectorAll('[data-testid="cv-checklist"] li')).toHaveLength(doc.synthesis.checklist.length);
    expect(el.querySelectorAll('[data-testid="cv-scenarios"] li').length).toBeGreaterThan(0);
    expect(el.textContent).toContain("EXPERIMENTAL");
  });

  it("biểu đồ: mặc định chỉ vùng hỗ trợ/kháng cự gần nhất; MA và pivot bật bằng nút, ghim theo nến", () => {
    const el = render(<AIChartVisionPanel ticker="UPX" />);
    const sk = q(el, "cv-sketch")!;
    expect(sk.querySelectorAll('[data-testid="cv-ma"]')).toHaveLength(0);
    expect(sk.querySelectorAll('[data-testid="cv-pivot"]')).toHaveLength(0);
    expect(sk.querySelectorAll('[data-testid="cv-zone"]')).toHaveLength(0);
    expect(sk.querySelectorAll('[data-testid="cv-zone-near"]').length).toBeLessThanOrEqual(2);
    click(q(el, "cv-layer-ma"));
    expect(q(el, "cv-sketch")!.querySelectorAll('[data-testid="cv-ma"]')).toHaveLength(3);
    click(q(el, "cv-layer-pivots"));
    const D = doc.frames.find((f) => f.tf === "D")!;
    const dates = new Set(doc.bars.D.map((b) => b[0]));
    const visible = D.structure!.pivots.filter((p) => dates.has(p.date)).length;
    expect(q(el, "cv-sketch")!.querySelectorAll('[data-testid="cv-pivot"]')).toHaveLength(visible);
    click(q(el, "cv-tf-W"));
    expect(q(el, "cv-sketch")!.getAttribute("aria-label")).toContain("Tuần");
  });

  it("các bộ lọc chứa mã: bấm -> mở đúng tab con của bộ lọc", () => {
    const opened: string[] = [];
    const el = render(<AIChartVisionPanel ticker="UPX" onOpenScreener={(t) => opened.push(t)} />);
    const items = el.querySelectorAll('[data-testid="cv-screeners"] button');
    expect(items).toHaveLength(2);
    click(items[0]);
    click(items[1]);
    expect(opened).toEqual(["sepa", "camslim"]);
  });

  it("đổi mã tại AI Chart Vision -> đồng bộ ngược lên tab", () => {
    const changed: string[] = [];
    const el = render(<AIChartVisionPanel ticker="UPX" onRequestTickerChange={(t) => changed.push(t)} />);
    const input = q(el, "cv-input") as HTMLInputElement;
    act(() => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      set.call(input, "fpt");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => { (input.form as HTMLFormElement).requestSubmit(); });
    expect(changed).toEqual(["FPT"]);
    expect(requested[requested.length - 1]).toBe("FPT");
  });

  it("bảng phụ SEPA có nút 'AI Chart Vision' mở đúng mã", () => {
    const vision: string[] = [];
    const READY = sepaDoc.results[0];
    const el = render(<SepaPanel onSelectTicker={() => {}} onOpenVision={(t) => vision.push(t)} />);
    click(el.querySelector(`[aria-label="Phân tích chuyên sâu ${READY.ticker}"]`));
    click(q(el, "open-vision"));
    expect(vision).toEqual([READY.ticker]);
  });
});
