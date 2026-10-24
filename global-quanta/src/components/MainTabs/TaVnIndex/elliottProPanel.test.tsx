import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SWRConfig } from "swr";

vi.stubEnv("VITE_MARKET_GATEWAY_ENABLED", "true");
vi.stubEnv("VITE_MARKET_API_BASE_URL", "https://gw.test");
const { default: ElliottProPanel, alertsForScenario } = await import("./ElliottProPanel");
const { default: DrawingPalette } = await import("./DrawingPalette");
const { default: LayerToggleBar } = await import("./LayerToggleBar");
const { DEFAULT_LAYER_STATE } = await import("../../../lib/ta-command-center/LayerManager");
const { buildWaveTree } = await import("../../../lib/quant-core/elliott/v3/waveTree");
const { evaluateLifecycle, scenariosFromTree } = await import("../../../lib/quant-core/elliott/v3/scenarios");
const { EP5_BACKTEST } = await import("../../../lib/quant-core/elliott/v3/backtestResults");
import type { EwScenario } from "../../../lib/quant-core/elliott/v3/scenarios";
import type { OhlcvBar } from "../../../lib/ta-command-center/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot> | null = null;
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ""; vi.unstubAllGlobals(); });
beforeEach(() => { localStorage.clear(); localStorage.setItem("gq_session_v2", JSON.stringify({ access_token: "acc", refresh_token: "r", expires_at: Date.now() + 600_000, user: { id: "u1", email: "a@b.c", admin: false, mustChangePassword: false } })); });
const mount = async (ui: React.ReactElement) => {
  const el = document.createElement("div"); document.body.appendChild(el); root = createRoot(el);
  await act(async () => { root!.render(<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{ui}</SWRConfig>); });
  await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
  return el;
};
const day = (i: number) => new Date(Date.UTC(2023, 0, 2 + i)).toISOString().slice(0, 10);
function fixture() {
  let x = 100, seed = 11;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const bars: OhlcvBar[] = Array.from({ length: 700 }, (_, i) => { x *= 1 + (rnd() - 0.48) * 0.05; return { date: day(i), open: x, high: x * 1.01, low: x * 0.99, close: x, volume: 1 }; });
  const c = bars.map((b) => ({ time: b.date, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume }));
  const tree = buildWaveTree(c);
  const scenarios = scenariosFromTree(buildWaveTree(c, { confirmedOnly: true }), c, "SIM").map((sc) => ({ sc, lc: evaluateLifecycle(sc, c) }));
  return { bars, tree, scenarios };
}

describe("EP4 — bảng Elliott Pro", () => {
  it("6 tab; Tổng quan có Tuần + Ngày; Hiệu quả có bảng kiểm định lịch sử + kết luận; Của tôi / Theo sách hiển thị nội dung truyền vào", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ alerts: [], events: [], unread: 0, disclaimer: "", rows: [], total: 0, byState: {}, verdict: "chưa đủ mẫu", firstLogged: null, score: { n: 0, hits: 0, hitRate: null, expectedRate: null, z: null }, prereg: { minN: 100, zPass: 1.96, hypothesis: "" } }) })));
    const { bars, tree, scenarios } = fixture();
    const onToggle = vi.fn();
    const el = await mount(<ElliottProPanel ticker="SIM" timeframe="D" tree={tree} scenarios={scenarios} dailyBars={bars} layerOn={false} onToggleLayer={onToggle} mode="chart" onMode={() => {}}
      mine={<p data-testid="mine-slot">mine</p>} book={<p data-testid="book-slot">book</p>} />);
    expect(el.querySelectorAll("[data-testid^=elliott-pro-tab-]")).toHaveLength(6);
    expect(el.querySelector("[data-testid=elliott-pro-overview]")!.textContent).toMatch(/Tuần[\s\S]*Ngày/);
    expect(el.textContent).toMatch(new RegExp(EP5_BACKTEST.label));
    act(() => (el.querySelector("[data-testid=elliott-pro-toggle]") as HTMLButtonElement).click());
    expect(onToggle).toHaveBeenCalledTimes(1);
    await act(async () => { (el.querySelector("[data-testid=elliott-pro-tab-performance]") as HTMLButtonElement).click(); });
    expect(el.querySelector("[data-testid=elliott-backtest]")!.textContent).toMatch(/ĐẠT/);
    await act(async () => { (el.querySelector("[data-testid=elliott-pro-tab-mine]") as HTMLButtonElement).click(); });
    expect(el.querySelector("[data-testid=mine-slot]")).not.toBeNull();
    await act(async () => { (el.querySelector("[data-testid=elliott-pro-tab-book]") as HTMLButtonElement).click(); });
    expect(el.querySelector("[data-testid=book-slot]")).not.toBeNull();
    await act(async () => { (el.querySelector("[data-testid=elliott-pro-tab-rules]") as HTMLButtonElement).click(); });
    expect(el.querySelector("[data-testid=elliott-pro-rules]")).not.toBeNull();
  });

  it("'Theo dõi kịch bản' tạo đúng 3 cảnh báo: kích hoạt · mục tiêu 1 · vô hiệu (đúng phía); đường B–D chuyển sang điều kiện đường của khung D", () => {
    const sc = { id: "x", template: "triangleThrust", role: "primary", level: 2, dir: 1, title: "Bật khỏi tam giác", anchors: [], createdAt: "2026-10-01", provisional: false,
      trigger: { price: 105, line: { a: { time: "2026-09-01", price: 110 }, b: { time: "2026-09-20", price: 106 } }, text: "B–D" },
      targets: [{ price: 120, label: "100% A" }, { price: 130, label: "161,8%" }], invalidation: { price: 98, text: "thủng 98" }, expiry: { waitBars: 60, runBars: 120 } } as EwScenario;
    const a = alertsForScenario(sc, "FPT", "D");
    expect(a.map((x) => x.condition)).toEqual([
      { type: "line", a: { date: "2026-09-01", price: 110 }, b: { date: "2026-09-20", price: 106 }, side: "above" },
      { type: "level", price: 120, side: "above" },
      { type: "level", price: 98, side: "below" },
    ]);
    expect(alertsForScenario(sc, "FPT", "1H")[0].condition).toEqual({ type: "level", price: 105, side: "above" });
    expect(alertsForScenario({ ...sc, dir: -1, invalidation: { price: 112, text: "" } }, "FPT", "W")[2].condition).toEqual({ type: "level", price: 112, side: "above" });
  });

  it("đã bỏ công cụ vẽ Elliott 0–5 + nút Gợi ý; thanh lớp chỉ còn Elliott Pro / của tôi / vẽ tay cũ (lớp GET cũ ở tab Theo sách)", async () => {
    const pal = await mount(<DrawingPalette activeTool={null} onSelectTool={() => {}} elliottEnabled={false} fibExtensionMode={false} onToggleFibExtension={() => {}} />);
    expect(pal.querySelector('[title="Elliott Wave (6 điểm)"]')).toBeNull();
    expect(pal.textContent).not.toMatch(/gợi ý/i);
    act(() => root?.unmount()); root = null;
    const bar = await mount(<LayerToggleBar state={DEFAULT_LAYER_STATE} onToggle={() => {}} onToggleMaster={() => {}} />);
    const layers = [...bar.querySelectorAll("[data-layer]")].map((b) => b.getAttribute("data-layer"));
    expect(layers).toContain("elliottPro"); expect(layers).toContain("elliottMine"); expect(layers).toContain("elliott");
    for (const k of ["elliottAuto", "elliottOsc", "elliottFib", "elliottProj", "elliottGuide", "elliottSub"]) expect(layers).not.toContain(k);
  });
});
