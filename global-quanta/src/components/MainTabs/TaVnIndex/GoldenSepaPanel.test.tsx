import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SepaDoc } from "../../../hooks/useSepa";
import type { OhlcvBar } from "../../../lib/ta-command-center/types";
import fixture from "./__fixtures__/sepa.json";

const doc = fixture.doc as unknown as SepaDoc;
const barsOf = fixture.bars as Record<string, OhlcvBar[]>;
const [READY, ALERT] = doc.results;
const REJECT = doc.results.find((r) => r.list === "LOẠI")!;

vi.mock("../../../hooks/useSepa", async (orig) => ({ ...(await orig<typeof import("../../../hooks/useSepa")>()), useSepa: () => ({ data: doc, error: undefined, isLoading: false, refresh: () => {} }) }));
vi.mock("../../../hooks/useTechnicalFilter", () => ({
  useTechnicalFilter: (s: string) => ({
    data: { dataAsOf: doc.dataAsOf, results: s === "camslim" ? [{ ticker: READY.ticker, status: "BREAKOUT", grade: "A", metrics: { score: 77 } }] : s === "base-breakout" ? [{ ticker: READY.ticker, status: "SETUP", grade: "B", metrics: { score: 60 } }] : [] },
    error: undefined, isLoading: false, refresh: () => {},
  }),
}));
vi.mock("../../../hooks/useConvergenceV2", () => ({
  useConvergenceV2: () => ({ data: { dataAsOf: doc.dataAsOf, results: [
    { ticker: ALERT.ticker, side: "buy", status: "READY", wyckoff: { cyclePhase: "D" }, metrics: { score: 66 } },
    { ticker: READY.ticker, side: "sell", status: "WATCH", wyckoff: { cyclePhase: "B" }, metrics: { score: 50 } },
  ] }, error: undefined, isLoading: false, refresh: () => {} }),
}));
vi.mock("../../../hooks/usePatterns", () => ({
  usePatterns: () => ({ data: { dataAsOf: doc.dataAsOf, results: [
    { ticker: ALERT.ticker, patterns: [{ dir: "bull", state: "CONFIRMED", label: "Đáy đôi", timeframe: "D", stateLabel: "Phá vỡ đã xác nhận" }] },
    { ticker: READY.ticker, patterns: [{ dir: "bear", state: "CONFIRMED", label: "Nêm tăng", timeframe: "D", stateLabel: "Phá vỡ đã xác nhận" }, { dir: "bull", state: "FORMING", label: "Tam giác tăng", timeframe: "W", stateLabel: "Đang hình thành" }] },
  ] }, error: undefined, isLoading: false, refresh: () => {} }),
}));
vi.mock("../../../hooks/useTaSeries", () => ({ useTaSeries: (t: string | null) => ({ bars: t ? barsOf[t] ?? [] : [], isLoading: false, error: undefined, priceBasis: "ADJUSTED_CUMULATIVE", corporateActions: [], warnings: [], quality: {} }) }));
vi.mock("../../../hooks/useSepaIntraday", () => ({ useSepaIntraday: () => ({ live: true, error: undefined, isLoading: false, refresh: () => {}, data: {
  version: "sepa/SP6", asOf: "2026-10-12T03:00:00Z", date: "2026-10-12", session: "LO", minutesElapsed: 60, sessionMinutes: 255, scanDataAsOf: "2026-10-09", candidates: 2,
  counts: { breakout: 1, lowVol: 0, near: 1, extended: 0 }, rule: "Giá vượt pivot, KL ≥ 1,4× TB50",
  rows: [
    { ticker: "RW8", list: "CẢNH BÁO MUA", pivot: 100, price: 101, distPct: 1, projRatio: 2.1, state: "BREAKOUT", label: "Phá vỡ đạt KL dự phóng", reliable: true, since: "2026-10-12T02:55:00Z" },
    { ticker: "ZZZ", list: "THEO DÕI", pivot: 50, price: 40, distPct: -20, projRatio: 0.5, state: "BELOW", label: "Dưới pivot", reliable: true },
  ] } }) }));
vi.mock("../../../hooks/useVolumeAnalysis", () => ({ useVolumeAnalysis: () => ({ data: undefined }) }));

const { default: GoldenSepaPanel } = await import("./GoldenSepaPanel");
const { default: SubTabNavigation } = await import("./SubTabNavigation");

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
const rows = (el: Element) => [...el.querySelectorAll('[data-testid="golden-sepa-row"]')].map((r) => r.textContent ?? "");

describe("Golden SEPA (SP5) — thay Golden Filter × Top 20", () => {
  it("tab đổi tên: không còn 'Golden Filter x Top 20'", () => {
    const el = render(<SubTabNavigation activeTab="golden" onTabChange={() => {}} />);
    expect(el.textContent).toContain("Golden SEPA");
    expect(el.textContent).not.toContain("Top 20");
  });

  it("chỉ mã thuộc 3 danh sách SEPA (không LOẠI); xác nhận chéo CAN SLIM / Base Breakout / Hợp lưu phía mua / Mô hình giá Pring tăng đang hiệu lực; không có điểm tự đặt", () => {
    const el = render(<GoldenSepaPanel onSelectTicker={() => {}} />);
    const r = rows(el);
    expect(r).toHaveLength(2);
    expect(r.some((x) => x.includes(REJECT.ticker))).toBe(false);
    const confirms = [...el.querySelectorAll('[data-testid="golden-sepa-confirms"]')].map((c) => c.textContent);
    expect(confirms[0]).toContain("2/4"); // READY: CS + BB; Hợp lưu phía BÁN, Pring giảm / đang hình thành không tính
    expect(confirms[0]).toContain("CS");
    expect(confirms[0]).not.toContain("MH");
    expect(confirms[1]).toContain("2/4"); // ALERT: Hợp lưu phía mua + Pring tăng đã xác nhận
    expect(confirms[1]).toContain("MH");
    expect(el.textContent).toContain("không cộng điểm tự đặt");
    click(el.querySelector('[data-testid="golden-min-2"]'));
    expect(rows(el)).toHaveLength(2);
  });

  it("bấm mã -> bảng phụ SEPA + dải xác nhận chéo (không mở biểu đồ); Esc -> đóng", () => {
    const opened: string[] = [];
    const el = render(<GoldenSepaPanel onSelectTicker={(t) => opened.push(t)} />);
    click(el.querySelector(`[aria-label="Phân tích chuyên sâu ${READY.ticker}"]`));
    expect(el.querySelector('[data-testid="sepa-deep-panel"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="golden-sepa-confirm-strip"]')?.textContent).toContain("CAN SLIM · phá vỡ · hạng A");
    expect(opened).toEqual([]);
    act(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
    expect(el.querySelector('[data-testid="sepa-deep-panel"]')).toBeNull();
  });
});
