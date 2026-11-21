import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const calls: string[] = [];
vi.mock("../services/marketDataClient", () => ({
  fetchMarketJson: (path: string) => { calls.push(path); return Promise.resolve(gw); },
}));
const { buildPulse, useGlobalStream, GATEWAY_POLL_MS } = await import("./useGlobalStream");

const gw = {
  source: "gateway", timestamp: "g", missing: [],
  macro: { dxy: 101.8, vix: 16, treasury_10y: 5.1, gold: 4197, oil_brent: 105.9, oil_wti: 95.8, risk_on_score: 66, risk_status: "RISK_ON", breakdown: { dxyScore: 100, vixScore: 90, treasuryScore: 0 }, fetched_at: "g", quotes: {} },
  markets: [{ id: "^GSPC", symbol: "^GSPC", name: "S&P", market: "S&P", value: 6000, change_percent: 0.3, fetched_at: "g", date: "2026-10-15" }],
} as never;

describe("buildPulse — một nguồn duy nhất: Gateway", () => {
  it("Gateway có -> giá ngày + chỉ số từ Gateway; trường tháng cũ của Project A để trống, không tự điền", () => {
    const r = buildPulse(gw);
    expect(r.source).toBe("gateway");
    expect(r.payload!.macro!.dxy).toBe(101.8);
    expect(r.payload!.macro!.risk_on_score).toBe(66);
    expect(r.payload!.macro!.rubber_price).toBeNull();
    expect(r.payload!.macro!.baltic_dry_index).toBeNull();
    expect(r.payload!.markets!.map((m) => m.symbol)).toEqual(["^GSPC"]);
  });
  it("Gateway lỗi -> không có dữ liệu (không còn dự phòng số cũ của Project A)", () => {
    expect(buildPulse(null)).toEqual({ payload: null, source: null });
    expect(buildPulse({ ...(gw as object), macro: null } as never)).toEqual({ payload: null, source: null });
  });
});

describe("useGlobalStream — không SSE, dừng khi ẩn tab", () => {
  let el: HTMLDivElement; let hidden = false;
  const ES = vi.fn();
  beforeEach(() => {
    vi.useFakeTimers(); calls.length = 0; hidden = false;
    vi.stubGlobal("EventSource", ES);
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (hidden ? "hidden" : "visible") });
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); el?.remove(); });

  it("không mở EventSource; hỏi Gateway mỗi 60 giây khi tab hiện, ngừng khi tab ẩn, tải lại ngay khi quay lại", async () => {
    let out: ReturnType<typeof useGlobalStream> | null = null;
    const Probe = () => { out = useGlobalStream(); return null; };
    el = document.createElement("div"); document.body.appendChild(el);
    await act(async () => { createRoot(el).render(createElement(Probe)); });
    expect(ES).not.toHaveBeenCalled();
    expect(calls).toEqual(["/api/world/pulse"]);
    expect(out!.connected).toBe(true);
    expect(out!.data?.macro?.dxy).toBe(101.8);

    await act(async () => { vi.advanceTimersByTime(GATEWAY_POLL_MS); });
    expect(calls.length).toBe(2);

    hidden = true;
    await act(async () => { vi.advanceTimersByTime(GATEWAY_POLL_MS * 3); });
    expect(calls.length).toBe(2);

    hidden = false;
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(calls.length).toBe(3);
  });
});
