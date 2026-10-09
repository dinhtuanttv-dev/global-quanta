import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SepaDoc } from "../../../hooks/useSepa";
import type { OhlcvBar } from "../../../lib/ta-command-center/types";
import fixture from "./__fixtures__/sepa.json";

// Dữ liệu sinh từ engine Gateway thật (backend/src/market/strategies/sepa, khớp 1:1 gói Python) trên vũ trụ giả lập.
const doc = fixture.doc as unknown as SepaDoc;
const barsOf = fixture.bars as Record<string, OhlcvBar[]>;
const [READY, ALERT] = doc.results;
const REJECT = doc.results.find((r) => r.list === "LOẠI")!;

vi.mock("../../../hooks/useSepa", async (orig) => ({ ...(await orig<typeof import("../../../hooks/useSepa")>()), useSepa: () => ({ data: doc, error: undefined, isLoading: false, refresh: () => {} }) }));
vi.mock("../../../hooks/useTaSeries", () => ({ useTaSeries: (t: string | null) => ({ bars: t ? barsOf[t] ?? [] : [], isLoading: false, error: undefined, priceBasis: "ADJUSTED_CUMULATIVE", corporateActions: [], warnings: [], quality: {} }) }));
vi.mock("../../../hooks/useVolumeAnalysis", () => ({ useVolumeAnalysis: () => ({ data: undefined }) }));

const { default: SepaPanel } = await import("./SepaPanel");
const { sizePosition } = await import("./SepaDeepPanel");
const { default: SubTabNavigation } = await import("./SubTabNavigation");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot> | null = null;
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ""; try { localStorage.clear(); } catch { /* */ } });
function render(ui: React.ReactElement) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  root = createRoot(el);
  act(() => root!.render(ui));
  return el;
}
const click = (el: Element | null) => act(() => { (el as HTMLElement).click(); });
const q = (el: Element, id: string) => el.querySelector(`[data-testid="${id}"]`);

describe("SEPA Minervini — danh sách (SP4)", () => {
  it("có tab con SEPA Minervini", () => {
    const el = render(<SubTabNavigation activeTab="sepa" onTabChange={() => {}} />);
    expect(el.textContent).toContain("SEPA Minervini");
  });

  it("mặc định 3 danh sách (ẩn LOẠI), sức khỏe thị trường, dấu chân kiểu sổ tay; lọc LOẠI / mô hình", () => {
    const el = render(<SepaPanel onSelectTicker={() => {}} />);
    const rows = () => [...el.querySelectorAll('[data-testid="sepa-row"]')].map((r) => r.textContent);
    expect(rows()).toHaveLength(2);
    expect(rows()[0]).toContain(READY.ticker);
    expect(q(el, "sepa-market-verdict")?.textContent).toBe(doc.market!.sepa!.danh_gia);
    expect(q(el, "sepa-asof")?.textContent).toContain(`phiên ${doc.dataAsOf}`);
    // SP3: thẻ bằng chứng với bảng giả thuyết (kể cả thất bại) và nhãn tín hiệu S2
    expect(q(el, "sepa-evidence")?.textContent).toContain("EXPERIMENTAL");
    click(q(el, "sepa-evidence-toggle"));
    const ev = q(el, "sepa-evidence-table")!.textContent!;
    expect(ev).toContain("S1");
    expect(ev).toContain("KHÔNG ĐẠT");
    expect(ev).toContain("ĐẠT");
    expect(el.querySelectorAll('[data-testid="sepa-s2"]').length).toBe(READY.status === "BREAKOUT" && READY.pattern?.breakout?.KL_pha_vo_dat ? 1 : 0);
    expect(q(el, "sepa-footprint-cell")?.textContent).toBe(READY.metrics.footprint);
    expect(el.textContent).toContain("không phải khuyến nghị mua");
    click(q(el, "sepa-filter-LOẠI"));
    expect(rows()).toEqual([expect.stringContaining(REJECT.ticker)]);
    click(q(el, "sepa-filter-active"));
    click(q(el, "sepa-pattern-VCP"));
    expect(rows()).toEqual([expect.stringContaining(READY.ticker)]);
  });
});

describe("SEPA — bảng phụ phân tích chuyên sâu", () => {
  it("bấm mã -> bảng phụ (không mở biểu đồ); mô phỏng ghim nến, dấu chân Hình 10.6, Trend Template, 4 giai đoạn, rủi ro; Esc -> đóng", () => {
    const opened: string[] = [];
    const el = render(<SepaPanel onSelectTicker={(t) => opened.push(t)} />);
    click(el.querySelector(`[aria-label="Phân tích chuyên sâu ${READY.ticker}"]`));
    const deep = q(el, "sepa-deep-panel")!;
    expect(deep).not.toBeNull();
    expect(opened).toEqual([]);
    expect(q(deep, "sepa-deep-list")?.textContent).toBe("SẴN SÀNG MUA");
    // các lần thu hẹp VCP: mỗi T một đoạn, ghim đúng ngày có nến
    const cons = READY.pattern!.details.thu_hep_chi_tiet!;
    const dates = new Set(barsOf[READY.ticker].map((b) => b.date));
    expect(cons.every((c) => dates.has(c.ngay_dinh) && dates.has(c.ngay_day))).toBe(true);
    expect(deep.querySelectorAll('[data-testid="sepa-contraction"]')).toHaveLength(cons.length);
    expect(q(deep, "sepa-breakout-mark")).not.toBeNull();
    expect(q(deep, "sepa-footprint")?.getAttribute("aria-label")).toContain(READY.pattern!.footprint);
    expect(q(deep, "sepa-shapes")?.getAttribute("aria-label")).toBe(`Dạng thu hẹp ${cons.length}T`);
    expect(deep.querySelectorAll('[data-testid="sepa-tt"] li')).toHaveLength(8);
    expect(q(deep, "sepa-stage-map")?.getAttribute("aria-label")).toContain(`GĐ${READY.stage!.stage}`);
    expect(q(deep, "sepa-roi")).not.toBeNull();
    expect(q(deep, "sepa-r-ladder")).not.toBeNull();
    act(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
    expect(q(el, "sepa-deep-panel")).toBeNull();
  });

  it("quy mô vị thế theo vốn người dùng = kế hoạch của Gateway với vốn tham chiếu; đổi vốn -> đổi khối lượng", () => {
    const p = READY.plan!;
    expect(sizePosition(p.entry, p.stop, doc.equityRef, doc.risk).shares).toBe(p.shares);
    const el = render(<SepaPanel onSelectTicker={() => {}} />);
    click(el.querySelector(`[aria-label="Phân tích chuyên sâu ${READY.ticker}"]`));
    const before = q(el, "sepa-plan")?.textContent;
    const input = q(el, "sepa-equity") as HTMLInputElement;
    act(() => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      set.call(input, String(doc.equityRef / 10));
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(q(el, "sepa-plan")?.textContent).not.toBe(before);
    expect(q(el, "sepa-plan")?.textContent).toContain(`${sizePosition(p.entry, p.stop, doc.equityRef / 10, doc.risk).shares.toLocaleString("vi-VN")} cp`);
  });

  it("mô hình khác VCP: mô phỏng nền (không có đoạn T), vẫn có Trend Template và kế hoạch", () => {
    const el = render(<SepaPanel onSelectTicker={() => {}} />);
    click(el.querySelector(`[aria-label="Phân tích chuyên sâu ${ALERT.ticker}"]`));
    const deep = q(el, "sepa-deep-panel")!;
    expect(q(deep, "sepa-sketch")).not.toBeNull();
    expect(deep.querySelectorAll('[data-testid="sepa-contraction"]')).toHaveLength(0);
    expect(deep.querySelectorAll('[data-testid="sepa-tt"] li')).toHaveLength(8);
  });

  it("dòng LOẠI: bảng phụ rút gọn — Trend Template và lý do, không tải nến", () => {
    const el = render(<SepaPanel onSelectTicker={() => {}} />);
    click(q(el, "sepa-filter-LOẠI"));
    click(el.querySelector(`[aria-label="Phân tích chuyên sâu ${REJECT.ticker}"]`));
    const deep = q(el, "sepa-deep-panel")!;
    expect(deep.textContent).toContain("Vì sao LOẠI");
    expect(q(deep, "sepa-sketch")).toBeNull();
    expect(deep.querySelectorAll('[data-testid="sepa-tt"] li')).toHaveLength(8);
  });
});
