import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { staleSpringSeries } from "../../../lib/quant-core/__fixtures__/wyckoffSeries";
import { convergenceAt } from "../../../lib/quant-core/convergence";
import { wyckoffFor } from "../../../lib/quant-core";
import type { ConvergenceDoc, ConvergenceRow } from "../../../hooks/useConvergenceV2";

const bars = staleSpringSeries(0).map((b) => ({ ...b, open: b.open * 1000, high: b.high * 1000, low: b.low * 1000, close: b.close * 1000, value: 1e10 }));
const conv = convergenceAt(bars)!;
const row = (over: Partial<ConvergenceRow> = {}): ConvergenceRow => ({
  ticker: "AAA", name: "AAA Corp", sector: "Bán lẻ", status: conv.status, grade: conv.grade, side: conv.side, date: conv.dataAsOf,
  metrics: { score: conv.score, close: conv.close, side: conv.side }, components: conv.components, zone: conv.zone, levels: conv.levels,
  wyckoff: conv.wyckoff, liquidityCapacity: conv.liquidity.capacity, plan: { entry: conv.close, stop: conv.close * 0.95, target: conv.close * 1.1, rr: 2 },
  version: conv.version, ...over,
});
const doc: ConvergenceDoc = {
  strategy: "convergence", engine: "convergence-v2/H1", generatedAt: "2026-10-09T08:45:00Z", dataAsOf: conv.dataAsOf,
  universeCount: 3, scannedCount: 3, resultCount: 2,
  results: [row(), row({ ticker: "BBB", side: "sell", status: "WATCH", wyckoff: { ...conv.wyckoff, cyclePhase: "E" } })],
  evidence: { label: "PENDING", reason: "Bằng chứng lịch sử đang chờ job đêm tính.", all: { n: 0 } },
  skipped: [], disclaimer: "Bộ lọc kỹ thuật để tham khảo, không phải khuyến nghị đầu tư.",
};

vi.mock("../../../hooks/useConvergenceV2", () => ({ useConvergenceV2: () => ({ data: doc, error: undefined, isLoading: false, refresh: () => {} }) }));
vi.mock("../../../hooks/useTaSeries", () => ({ useTaSeries: (t: string | null) => ({ bars: t === "VNINDEX" ? [] : bars, isLoading: false, error: undefined, priceBasis: "ADJUSTED_CUMULATIVE", corporateActions: [], warnings: [], quality: {} }) }));
vi.mock("../../../hooks/useVolumeAnalysis", () => ({ useVolumeAnalysis: () => ({ data: undefined }) }));

const { default: ConvergencePanelV2 } = await import("./ConvergencePanelV2");
const { default: WyckoffSketch } = await import("./WyckoffSketch");

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
const click = (el: Element | null) => act(() => { (el as HTMLElement).click(); });

describe("Bộ lọc Hợp lưu v2 — danh sách (H2)", () => {
  it("toàn bộ kết quả, thời điểm quét, bằng chứng đang chờ; lọc theo phía và pha", () => {
    const el = render(<ConvergencePanelV2 onSelectTicker={() => {}} />);
    expect(el.querySelectorAll('[data-testid="convergence-row"]')).toHaveLength(2);
    expect(el.querySelector('[data-testid="convergence-asof"]')?.textContent).toContain(`phiên ${conv.dataAsOf}`);
    expect(el.querySelector('[data-testid="evidence-pending"]')?.textContent).toContain("đang chờ job đêm");
    expect(el.textContent).toContain("không phải tín hiệu mua");
    click(el.querySelector('[data-testid="filter-sell"]'));
    expect([...el.querySelectorAll('[data-testid="convergence-row"]')].map((r) => r.textContent)).toEqual([expect.stringContaining("BBB")]);
    click(el.querySelector('[data-testid="filter-phase-E"]'));
    expect(el.querySelectorAll('[data-testid="convergence-row"]')).toHaveLength(1);
    click(el.querySelector('[data-testid="filter-buy"]'));
    expect(el.textContent).toContain("Không có mã nào khớp bộ lọc");
  });

  it("bấm mã -> bảng phụ (không mở biểu đồ); Esc -> đóng", () => {
    const opened: string[] = [];
    const el = render(<ConvergencePanelV2 onSelectTicker={(t) => opened.push(t)} />);
    click(el.querySelector('[aria-label="Phân tích chuyên sâu AAA"]'));
    expect(el.querySelector('[data-testid="convergence-deep-panel"]')).not.toBeNull();
    expect(opened).toEqual([]);
    act(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
    expect(el.querySelector('[data-testid="convergence-deep-panel"]')).toBeNull();
  });
});

describe("Bảng phụ Hợp lưu v2 (H3)", () => {
  it("mô phỏng Wyckoff giá thật + sơ đồ mẫu cùng pha hiện tại, chuỗi sự kiện thực tế, thành phần điểm, mức hợp lưu", () => {
    const el = render(<ConvergencePanelV2 onSelectTicker={() => {}} />);
    click(el.querySelector('[aria-label="Phân tích chuyên sâu AAA"]'));
    const p = el.querySelector('[data-testid="convergence-deep-panel"]')!;
    expect(p.querySelector('[data-testid="wyckoff-sketch"]')).not.toBeNull();
    const phase = conv.wyckoff.cyclePhase!;
    expect(p.querySelector('[data-testid="wyckoff-cycle-map"]')?.getAttribute("data-current")).toBe(phase);
    expect(p.querySelector(`[data-testid="sketch-phase-${phase}"]`)).not.toBeNull();
    expect(p.querySelector('[data-testid="deep-sequence"]')?.textContent).toMatch(/Spring#[123]/);
    expect(p.querySelectorAll('[data-testid="deep-components"] li')).toHaveLength(6);
    expect(p.querySelector('[data-testid="deep-levels"]')).not.toBeNull();
    expect(p.querySelector('[data-testid="wyckoff-plan3"]')?.hasAttribute("open")).toBe(true);
    expect(p.querySelector('[data-testid="deep-differs"]')).toBeNull(); // cùng engine, cùng dữ liệu -> khớp Gateway
  });

  it("WyckoffSketch: nhãn Spring kèm loại, mọi mức giá có nhãn chữ (chế độ gọn: liệt kê dưới biểu đồ)", () => {
    const w = wyckoffFor(bars, "v2", "D", false, null);
    const el = render(<WyckoffSketch bars={bars} w={w} conv={conv} obs={[]} fvgs={[]} ticker="AAA" />);
    const text = el.querySelector("svg")!.textContent!;
    expect(text).toMatch(/Spring#[123]/);
    // Khung hẹp (jsdom: bề rộng 0 -> chế độ gọn): nhãn mức giá liệt kê dưới biểu đồ.
    expect(el.querySelector('[data-testid="wyckoff-sketch-levels"]')?.textContent).toContain("Biên dưới range");
    expect(el.querySelector('[data-testid="wyckoff-sketch"] svg')?.getAttribute("aria-label")).toContain("tích luỹ");
  });
});

describe("Theo dõi thực tế Hợp lưu v2 (H4)", () => {
  it("bảng theo dõi hiện 4 nhóm Mua/Bán · READY/theo dõi", async () => {
    const { LiveTrackingTable } = await import("./EvidenceCard");
    const stat = { n: 35, hitRate: 0.6, baseline: 0.5, hitLow: 0.45, hitHigh: 0.73, z: 1.2, avgSignedExcess: 0.8, verdict: "none" as const };
    const g = (key: string, label: string) => ({ key, label, h3: null, h5: stat, h10: null });
    const live = { generatedAt: "x", breakout: { h3: null, h5: null, h10: null }, setup: { h3: null, h5: null, h10: null },
      groups: [g("buyReady", "Mua · READY"), g("buyWatch", "Mua · theo dõi"), g("sellReady", "Bán · READY"), g("sellWatch", "Bán · theo dõi")] };
    const el = render(<LiveTrackingTable live={live} />);
    const rowsText = [...el.querySelectorAll("tbody tr")].map((r) => r.textContent);
    expect(rowsText).toHaveLength(4);
    expect(rowsText[2]).toContain("Bán · READY");
    expect(rowsText[0]).toContain("60%");
  });
});

