import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MatrixOverview } from "../../../../hooks/useTradingMatrix";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const state: { data?: MatrixOverview; error?: Error; isLoading: boolean; calls: string[] } = { isLoading: false, calls: [] };
vi.mock("../../../../hooks/useTradingMatrix", () => ({
  useTradingMatrix: (scope: string) => { state.calls.push(scope); return { data: state.data, error: state.error, isLoading: state.isLoading }; },
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

describe("Trading Matrix M1", () => {
  it("6 ô có mẫu số, ngày / trong phiên tách riêng, nhãn + ký hiệu (không chỉ màu), thiếu nguồn ghi rõ", async () => {
    state.data = fixture();
    await render();
    const t = el.textContent ?? "";
    for (const id of ["mx-regime", "mx-breadth", "mx-flow", "mx-vol", "mx-session", "mx-health"]) expect(el.querySelector(`[data-testid=${id}]`)).toBeTruthy();
    expect(t).toContain("◆ Chuyển pha");
    expect(t).toContain("54,3% trên MA20");
    expect(t).toContain("n = 372/401 mã · loại 29");
    expect(t).toContain("Trong phiên: ↑147 ↓164 =57");
    expect(t).toContain("(thiếu nguồn)");
    expect(t).toContain("Thiếu một phần");
    expect(t).toContain("Nghiên cứu VN-Index");
  });

  it("thiếu dữ liệu -> 'Chưa đủ dữ liệu', không giả trung tính; lỗi toàn bộ -> báo không khả dụng nhưng không chặn bảng", async () => {
    state.data = fixture({ regime: { label: "UNKNOWN", horizon: "daily", probabilities: null, probabilityGap: null, hmmAsOf: null, stageOdds: null, reason: "Chưa đủ 60 phiên VN-Index." }, volatility: null, flow: { state: "UNKNOWN", sources: [], partial: true, note: "", foreign: null, ife: null } });
    await render();
    expect(el.textContent).toContain("? Chưa đủ dữ liệu");
    expect(el.textContent).toContain("Chưa đủ 60 phiên VN-Index.");
    expect(el.textContent).toContain("Chưa có nguồn");
    el.remove();
    state.data = undefined; state.error = new Error("HTTP 502");
    await render();
    expect(el.querySelector("[role=alert]")?.textContent).toContain("Bảng Siêu Quét bên dưới vẫn hoạt động");
  });

  it("đổi phạm vi gọi lại dữ liệu theo phạm vi; Chi tiết hiện xu hướng độ rộng, nguồn, xác suất chuyển giai đoạn có nhãn kiểm định", async () => {
    state.data = fixture();
    await render();
    await act(async () => (el.querySelector("[data-mx-scope=VN30]") as HTMLButtonElement).click());
    expect(state.calls.at(-1)).toBe("VN30");
    await act(async () => (Array.from(el.querySelectorAll("button")).find((b) => b.textContent?.includes("Chi tiết")) as HTMLButtonElement).click());
    const d = el.querySelector("[data-testid=mx-details]")!;
    expect(d.textContent).toContain("Đỉnh / đáy 52 tuần mới");
    expect(d.textContent).toContain("ĐÃ KIỂM ĐỊNH");
    expect(d.textContent).toContain("Tự doanh: không có nguồn dữ liệu");
    expect(el.querySelectorAll("[data-testid=mx-sources] li").length).toBe(2);
    expect(el.querySelectorAll("figure svg rect").length).toBe(20);
  });
});
