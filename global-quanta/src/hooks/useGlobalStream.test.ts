import { describe, expect, it } from "vitest";
import { mergePulse } from "./useGlobalStream";

const sse = {
  macro: { id: "a", dxy: 99, vix: 30, treasury_10y: 4.5, gold: 1, oil_brent: 2, oil_wti: 3, rubber_price: 2.7, fertilizer_urea_price: 390, risk_on_score: 10, risk_status: "RISK_OFF", breakdown: { dxyScore: 0, vixScore: 0, treasuryScore: 0 }, fetched_at: "2026-10-16T06:00:00Z" },
  markets: [{ id: "x", symbol: "^N225", name: "N", market: "N", value: 1, change_percent: 0, fetched_at: "t" }],
  timestamp: "t",
} as never;
const gw = {
  source: "gateway", timestamp: "g", missing: [],
  macro: { dxy: 101.8, vix: 16, treasury_10y: 5.1, gold: 4197, oil_brent: 105.9, oil_wti: 95.8, risk_on_score: 66, risk_status: "RISK_ON", breakdown: { dxyScore: 100, vixScore: 90, treasuryScore: 0 }, fetched_at: "g", quotes: {} },
  markets: [{ id: "^GSPC", symbol: "^GSPC", name: "S&P", market: "S&P", value: 6000, change_percent: 0.3, fetched_at: "g", date: "2026-10-15" }],
} as never;

describe("W6 mergePulse — một nguồn cho mỗi con số", () => {
  it("Gateway có -> giá ngày + chỉ số từ Gateway, trường tháng từ Project A", () => {
    const r = mergePulse(sse, gw);
    expect(r.source).toBe("gateway");
    expect(r.payload!.macro!.dxy).toBe(101.8);
    expect(r.payload!.macro!.risk_on_score).toBe(66);
    expect(r.payload!.macro!.rubber_price).toBe(2.7);
    expect(r.payload!.markets!.map((m) => m.symbol)).toEqual(["^GSPC"]);
  });
  it("Gateway lỗi -> dự phòng nguyên bản Project A; không có gì -> null", () => {
    expect(mergePulse(sse, null)).toEqual({ payload: sse, source: "project-a" });
    expect(mergePulse(null, null)).toEqual({ payload: null, source: null });
    const only = mergePulse(null, gw);
    expect(only.payload!.macro!.rubber_price).toBeNull();
  });
});
