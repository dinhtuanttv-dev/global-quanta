// Pattern Scanner v2 (Pring, P4) — danh sách + bảng phụ; dữ liệu sinh từ engine Gateway thật (pring/P4) trên chuỗi giá thật của 12 mã.
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PatternDetailFull, PatternsDoc } from "../../../hooks/usePatterns";
import fixture from "./__fixtures__/patterns.json";

const doc = fixture.doc as unknown as PatternsDoc;
const details = fixture.details as unknown as Record<string, PatternDetailFull>;
vi.mock("../../../hooks/usePatterns", async (orig) => ({
  ...(await orig<typeof import("../../../hooks/usePatterns")>()),
  usePatterns: () => ({ data: doc, error: undefined, isLoading: false, refresh: () => {} }),
  usePatternDetail: (s: string | null) => ({ data: s ? details[s] : undefined, error: undefined, isLoading: false }),
}));
const { default: PatternScannerPanel } = await import("./PatternScannerPanel");
const { default: SubTabNavigation } = await import("./SubTabNavigation");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot> | null = null;
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ""; });
function render(ui: React.ReactElement) {
  const el = document.createElement("div"); document.body.appendChild(el);
  root = createRoot(el); act(() => root!.render(ui)); return el;
}
const click = (el: Element | null) => act(() => { (el as HTMLElement).click(); });
const q = (el: Element, id: string) => el.querySelector(`[data-testid="${id}"]`);
const rowsOf = (el: Element) => Array.from(el.querySelectorAll('[data-testid="pattern-row"]'));
const [BULL, BEAR] = Object.keys(details);

describe("Pattern Scanner v2 — danh sách", () => {
  it("tab con vẫn tên Pattern Scanner; thẻ kiểm định P3 ghi EXPERIMENTAL và 4 nhóm", () => {
    expect(render(<SubTabNavigation activeTab="pattern" onTabChange={() => {}} />).textContent).toContain("Pattern Scanner");
    act(() => root?.unmount());
    const el = render(<PatternScannerPanel onSelectTicker={() => {}} />);
    const ev = q(el, "pattern-evidence")!;
    expect(ev.textContent).toContain("EXPERIMENTAL");
    for (const g of ["G1", "G2", "G3", "G4"]) expect(ev.textContent).toContain(g);
    expect(q(el, "pattern-live")?.textContent).toContain("SCR_PAT_BUY");
  });

  it("mặc định: mô hình TĂNG đang hiệu lực; xếp theo trạng thái (Gateway), không theo điểm", () => {
    const el = render(<PatternScannerPanel onSelectTicker={() => {}} />);
    const expected = doc.results.filter((r) => r.patterns.some((p) => p.dir === "bull" && ["BREAKOUT", "CONFIRMED", "PULLBACK"].includes(p.state))).map((r) => r.ticker);
    expect(rowsOf(el).map((r) => r.querySelector("button")!.textContent)).toEqual(expected);
    click(q(el, "pattern-dir-bear")); click(q(el, "pattern-state-all"));
    const bear = doc.results.filter((r) => r.patterns.some((p) => p.dir === "bear")).map((r) => r.ticker);
    expect(rowsOf(el).map((r) => r.querySelector("button")!.textContent)).toEqual(bear);
  });

  it("bấm mã -> bảng phụ (không mở biểu đồ): mô phỏng ghim theo nến, sơ đồ mẫu, checklist, vòng đời, kiểm định nhóm; Esc -> đóng", () => {
    const opened: string[] = [], vision: string[] = [];
    const el = render(<PatternScannerPanel onSelectTicker={(t) => opened.push(t)} onOpenVision={(t) => vision.push(t)} />);
    click(q(el, "pattern-state-all"));
    click(el.querySelector(`[aria-label="Phân tích chuyên sâu ${BULL}"]`));
    const deep = q(el, "pattern-deep-panel")!;
    expect(deep).not.toBeNull();
    expect(opened).toEqual([]);
    const sk = q(deep, "pring-sketch")!;
    expect(sk).not.toBeNull();
    // mọi điểm mô hình vẽ được phải nằm trên nến trả về (ghim theo nến)
    // mô hình đang chọn = mô hình đầu tiên của mã khớp bộ lọc (tăng, mọi trạng thái)
    const d = details[BULL], sum = doc.results.find((r) => r.ticker === BULL)!.patterns.find((x) => x.dir === "bull")!;
    const p = [...d.daily, ...d.weekly].find((x) => x.timeframe === sum.timeframe && x.type === sum.type && x.startDate === sum.startDate)!;
    expect(q(deep, "pattern-deep-label")?.textContent).toContain(p.label);
    const dates = new Set((p.timeframe === "W" ? d.bars.weekly : d.bars.daily).map((b) => b[0]));
    expect(sk.querySelectorAll('[data-testid="pring-point"]').length).toBe(p.points.filter((x) => dates.has(x.date)).length);
    expect(sk.querySelectorAll('[data-testid="pring-line"]').length).toBeGreaterThan(0);
    expect(q(deep, "pring-schematic")?.getAttribute("aria-label")).toContain("Pring");
    expect(deep.querySelectorAll('[data-testid="pattern-checks"] li').length).toBe(p.checks.length);
    expect(q(deep, "pattern-timeline")).not.toBeNull();
    expect(q(deep, "pattern-validation")?.textContent).toMatch(/Ngoài mẫu/);
    click(q(deep, "open-vision"));
    expect(vision).toEqual([BULL]);
    act(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
    expect(q(el, "pattern-deep-panel")).toBeNull();
  });

  it("mô hình giảm: sơ đồ mẫu lật chiều; chọn mô hình khác trong bảng phụ", () => {
    const el = render(<PatternScannerPanel onSelectTicker={() => {}} />);
    click(q(el, "pattern-dir-bear")); click(q(el, "pattern-state-all"));
    click(el.querySelector(`[aria-label="Phân tích chuyên sâu ${BEAR}"]`));
    const deep = q(el, "pattern-deep-panel")!;
    expect(q(deep, "pattern-deep-label")?.className).toContain("rose");
    const picker = q(deep, "pattern-picker");
    if (picker) {
      const btns = picker.querySelectorAll("button");
      click(btns[btns.length - 1]);
      expect(btns[btns.length - 1].getAttribute("aria-pressed")).toBe("true");
    }
  });
});
