import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MatrixOverview } from "../../../../hooks/useTradingMatrix";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const state: { data?: MatrixOverview; error?: Error; isLoading: boolean; calls: string[] } = { isLoading: false, calls: [] };
vi.mock("../../../../hooks/useTradingMatrix", () => ({
  useTradingMatrix: (scope: string, enabled = true) => { if (!enabled) return { data: undefined, error: undefined, isLoading: false }; state.calls.push(scope); return { data: state.data, error: state.error, isLoading: state.isLoading }; },
  useMatrixSectors: () => ({ data: undefined, error: undefined, isLoading: true }),
  useMatrixMovers: () => ({ data: undefined, error: undefined, isLoading: false }),
  useMatrixImpact: () => ({ data: undefined, error: undefined, isLoading: false }),
  useMatrixSignals: () => ({ data: undefined, error: undefined, isLoading: true }),
  useMatrixOps: () => ({ data: undefined, error: undefined, isLoading: false }),
}));
const { default: TradingMatrixPanel } = await import("./TradingMatrixPanel");

const fixture = (over: Partial<MatrixOverview> = {}): MatrixOverview => ({
  version: "matrix/M1 1.0.0", asOf: "2026-10-22T03:00:00Z", horizon: "daily",
  session: { phase: "CONTINUOUS_AM", label: "Khớp liên tục sáng", tradingDate: "2026-10-21", live: true },
  scope: { id: "VNINDEX", label: "Toàn sàn HOSE", eligible: 372, observed: 370 },
  regime: { label: "TRANSITION", rule: "UPTREND", horizon: "daily", asOf: "2026-10-21", probabilities: { bear: 0.3, neutral: 0.38, bull: 0.32 }, probabilityGap: 0.06, hmmAsOf: "2026-10-21", stageOdds: { stage: "UP", age: 9, up: 0.04, down: 0.12, label: "ĐÃ KIỂM ĐỊNH", dayStage: "UP", typical: { median: 9, p75: 16 } }, definition: "Quy tắc công khai" },
  breadth: {
    daily: { asOf: "2026-10-21", aboveMa20Pct: 54.3, aboveMa50Pct: 48.1, advancers: 150, decliners: 160, unchanged: 60, medianReturn: -0.12, newHighs: 4, newLows: 9, eligibleCount: 372, observedCount: 370, excludedCount: 29, excluded: { suspended: 20, shortHistory: 9 }, scopeSize: 401, coverage: 0.93 },
    intraday: { index: "VNINDEX", advancers: 147, decliners: 164, unchanged: 57, ceilings: 2, floors: 3, observedCount: 368, asOf: "2026-10-22T02:59:00Z", source: "SSI_FC_V2", note: null },
    trend: Array.from({ length: 20 }, (_, i) => ({ date: `2026-09-${String(i + 1).padStart(2, "0")}`, aboveMa20Pct: 40 + i, n: 372 })),
  },
  flow: { state: "ACCUMULATION", sources: ["FOREIGN_EOD"], partial: true, note: "Ước lượng thống kê", foreign: { asOf: "2026-10-21", net: 2e11, net5: 5e11, streak: 3, settled: true }, ife: null },
  volatility: { asOf: "2026-10-21", atr14: 18.2, atrPct: 1.1, atrPercentile: 62, realizedVol20: 18.4, rangeZ: 0.8, note: null },
  scenarios: [], riskFlags: [], sourceAsOf: {},
  dataHealth: { status: "PARTIAL", sources: [
    { id: "daily", label: "Dữ liệu ngày (SSI, kho cục bộ)", kind: "daily", status: "LIVE", asOf: "2026-10-21" },
    { id: "research", label: "Nghiên cứu VN-Index", kind: "daily", status: "UNAVAILABLE", asOf: null, detail: "Job nghiên cứu chưa chạy" },
  ] },
  ...over,
});

let el: HTMLDivElement;
const render = async () => { el = document.createElement("div"); document.body.appendChild(el); const root = createRoot(el); await act(async () => root.render(<TradingMatrixPanel />)); return root; };
beforeEach(() => { state.data = undefined; state.error = undefined; state.isLoading = false; state.calls = []; try { localStorage.clear(); } catch { /* jsdom */ } });
afterEach(() => { el?.remove(); });

const pt = (date: string, x: number, y: number, o: Record<string, number> = {}) => ({ date, x, y, b20: 34.7, b50: 28.8, b200: 40, mo: -80, moZ: -1, pg5: 1, db5: -21, idx1: -0.8, idx5: -1.8, idx20: 0.2, sigma: 13.9, yzPct: 10, fnr1: -3, fnr5: -2.5, fnrZ: -2, ldZ: -3, flow: -2.5, foreign: -6e11, value: 1e13, neff: 42, n: 430, ...o });
const withState = (over: Partial<MatrixOverview> = {}) => fixture({
  state: { rule: "MS-r1", asOf: "2026-10-30", x: -1.5, y: -0.6, zone: { side: "down", stress: "low", id: "down-low" }, zoneChanged: true, zonePrev: { id: "mid-low" },
    headline: [{ key: "trend", tab: "scenario", text: "Xu hướng giảm" }, { key: "vol", tab: "scenario", text: "biến động thấp" }, { key: "breadth", tab: "sectors", text: "độ rộng 34,7%" }, { key: "flow", tab: "flow", text: "khối ngoại bán ròng" }],
    current: pt("2026-10-30", -1.5, -0.6) as never, previous: pt("2026-10-29", -1, -0.5, { b20: 45.6 }) as never,
    deltas: { b20: -10.9, b50: -3, mo: -20, sigma: 0.5, fnr5: -0.5, neff: 2, x: -0.5, y: -0.1 },
    path: [pt("2026-10-28", -0.5, 0.4), pt("2026-10-29", -1, -0.5, { b20: 45.6 }), pt("2026-10-30", -1.5, -0.6)] as never, method: { sigma: "YZ", zWindow: 250, buffer: 0.25 } },
  m4: { rule: "M4-r1", asOf: "2026-10-30", episodes: 0, current: [{ id: "SC4", title: "Độ rộng rơi nhanh", state: "WATCH", since: "2026-10-30" }], timeline: [{ date: "2026-10-30", SC1: "INACTIVE", SC2: "INACTIVE", SC3: "INACTIVE", SC4: "WATCH" } as never] },
  scenarioTimeline: [{ date: "2026-10-30", SC1: "INACTIVE", SC2: "COOLDOWN", SC3: "WATCH" }],
  ...over,
});
const click = async (sel: string) => { await act(async () => (el.querySelector(sel) as HTMLElement).click()); };
const openDetail = async () => act(async () => (Array.from(el.querySelectorAll("button")).find((b) => b.textContent?.includes("Chi tiết")) as HTMLButtonElement).click());

describe("Trạng thái thị trường", () => {
  it("thu gọn: một dòng kết luận và 4 chỉ số; không còn câu giải thích hay thuật ngữ nội bộ", async () => {
    state.data = withState();
    await render();
    const t = el.textContent ?? "";
    expect(el.querySelector("[data-testid=mx-headline]")?.textContent).toContain("Xu hướng giảm");
    for (const id of ["mx-tile-breadth", "mx-tile-flow", "mx-tile-vol", "mx-tile-neff"]) expect(el.querySelector(`[data-testid=${id}]`)).toBeTruthy();
    expect(el.querySelector("[data-testid=mx-tile-breadth]")?.textContent).toContain("34,7%");
    expect(el.querySelector("[data-testid=mx-tile-vol]")?.textContent).toContain("Thấp");
    expect(el.querySelector("[data-testid=mx-tile-neff]")?.textContent).toContain("42 trụ");
    for (const word of ["Gateway", "HMM", "z5", "champion", "Brier", "holdout", "THỰC NGHIỆM", "Kiểm định"]) expect(t).not.toContain(word);
    expect(el.querySelector("[data-testid=mx-state-map]")).toBeNull();
  });

  it("lỗi toàn bộ thì báo không khả dụng; thiếu trạng thái thì nói chưa đủ dữ liệu, không đoán", async () => {
    state.data = fixture();
    await render();
    expect(el.querySelector("[data-testid=mx-headline]")?.textContent).toContain("Chưa đủ dữ liệu");
    el.remove();
    state.data = undefined; state.error = new Error("HTTP 502");
    await render();
    expect(el.querySelector("[role=alert]")?.textContent).toContain("Không khả dụng");
  });

  it("đổi phạm vi gọi lại dữ liệu theo phạm vi; nguồn lỗi hiện cảnh báo gọn mở tab Bằng chứng", async () => {
    state.data = withState();
    await render();
    await click("[data-mx-scope=VN30]");
    expect(state.calls).toContain("VN30");
    await click("[data-testid=mx-health-warn]");
    expect(el.querySelector("[data-testid=mx-tab-evidence]")).toBeTruthy();
    expect(el.querySelectorAll("[data-testid=mx-sources] li").length).toBe(2);
    expect(el.querySelectorAll("[data-testid=mx-grade]").length).toBeGreaterThan(5);
    expect(el.querySelector("[data-testid=mx-tab-evidence]")?.textContent).toContain("Tự doanh: chưa có nguồn");
  });

  it("mở Chi tiết: bản đồ 2D, xem lại theo phiên đổi được số, đúng 7 tab", async () => {
    state.data = withState();
    await render();
    await openDetail();
    expect(el.querySelector("[data-testid=mx-state-map]")).toBeTruthy();
    expect(Array.from(el.querySelectorAll("[data-mx-tab]")).map((b) => b.textContent)).toEqual(["Thay đổi", "Trụ chỉ số", "Ngành", "Mã nổi bật", "Kịch bản", "Dòng tiền", "Bằng chứng"]);
    expect(el.querySelector("[data-testid=mx-asof]")?.textContent).toContain("30/10");
    const range = el.querySelector("[data-testid=mx-replay]") as HTMLInputElement;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(range, "1"); range.dispatchEvent(new Event("input", { bubbles: true })); });
    expect(el.querySelector("[data-testid=mx-asof]")?.textContent).toContain("29/10");
    expect(el.querySelector("[data-testid=mx-asof]")?.textContent).toContain("đang xem lại");
    expect(el.querySelector("[data-testid=mx-tile-breadth]")?.textContent).toContain("45,6%");
  });

  it("các tab: thay đổi có trước và nay; dòng tiền vẽ cột; kịch bản có thanh theo ngày; bấm cụm kết luận mở đúng tab", async () => {
    state.data = withState();
    await render();
    await openDetail();
    expect(el.querySelector("[data-testid=mx-chg-b20]")?.textContent).toContain("45,6%");
    expect(el.querySelector("[data-testid=mx-chg-b20]")?.textContent).toContain("−10,9");
    expect(el.querySelector("[data-testid=mx-tab-change]")?.textContent).toContain("đổi từ");
    await click("[data-testid=mx-hl-flow]");
    expect(el.querySelector("[data-testid=mx-flow-bars]")).toBeTruthy();
    await click("[data-mx-tab=scenario]");
    expect(el.querySelector("[data-testid=mx-strip]")).toBeTruthy();
    await click("[data-mx-tab=evidence]");
    expect(el.querySelector("[data-testid=mx-strip-m4]")).toBeTruthy();
  });

  it("Thay đổi: bấm trụ chọn mã; Kịch bản: bấm mã liên quan chọn mã", async () => {
    const picked: string[] = [];
    state.data = withState({
      links: { impact: { date: "2026-10-21", check: null, up: [{ symbol: "VCB", points: 9.1, changePct: 4.2, industry: "Ngân hàng" }], down: [{ symbol: "VHM", points: -2.3, changePct: -1.1, industry: "Bất động sản" }], top5Share: 48 }, sectors: null, lastSignal: null },
      scenarios: [{ id: "SC2", title: "Chỉ số dẫn dắt", meaning: "m", state: "WATCH", since: "2026-10-21", displayState: "Theo dõi", evidence: [], contradictions: [], groups: {}, ruleVersion: "M3-r1", validation: { verdict: "FAIL", summary: "OOS không đạt", label: "THỰC NGHIỆM" }, related: { kind: "tickers", note: "Trụ kéo chỉ số", items: ["VCB"] } }],
    });
    el = document.createElement("div"); document.body.appendChild(el);
    await act(async () => createRoot(el).render(<TradingMatrixPanel onSelectTicker={(t) => picked.push(t)} />));
    await openDetail();
    await click("[data-testid=mx-chg-pillars] [aria-label='Chọn VCB']");
    await click("[data-mx-tab=scenario]");
    await click("[data-testid=mx-scenario-SC2] [aria-label='Chọn VCB']");
    expect(picked).toEqual(["VCB", "VCB"]);
  });
});

describe("Thác nước VN-Index", () => {
  it("bắc cầu đúng: các cột cộng dồn bằng tổng, phần còn lại không mất điểm", async () => {
    const { buildWaterfall } = await import("./StateCharts");
    const items = [["A", 3], ["B", 2], ["C", -4], ["D", -1], ["E", 0.5], ["F", -0.25]].map(([symbol, points]) => ({ symbol, points })) as never;
    const { bars, total } = buildWaterfall(items, 2);
    expect(total).toBeCloseTo(0.25);
    expect(bars.map((b) => b.key)).toEqual(["A", "B", "C", "D", "__rest"]);
    expect(bars[bars.length - 1].v).toBeCloseTo(0.25);
    bars.forEach((b, i) => { if (i) expect(b.from).toBeCloseTo(bars[i - 1].to); });
    expect(bars[bars.length - 1].to).toBeCloseTo(total);
    expect(buildWaterfall(items, 2, 0.5).total).toBeCloseTo(0.5);
  });
});
