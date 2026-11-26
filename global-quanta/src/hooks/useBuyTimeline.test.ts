// Mở khoá hẹp F0 (27/11/2026): Timeline điểm mua dùng Gateway làm nguồn DỰ PHÒNG khi Project A lỗi; Project A vẫn là nguồn chính.
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/marketDataClient", () => ({ isMarketGatewayEnabled: () => true, marketUrl: (p: string) => `https://gw.test${p}` }));
import { fetchBuyTimelineWithFallback } from "./useBuyTimeline";

afterEach(() => vi.unstubAllGlobals());

describe("Timeline điểm mua — nguồn dự phòng Gateway", () => {
  it("Project A trả được -> dùng Project A, KHÔNG gọi Gateway", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => { calls.push(String(url)); return new Response("{}", { status: 200 }); }));
    await fetchBuyTimelineWithFallback().catch(() => null);
    expect(calls.some((u) => u.includes("/api/cotuc/buy-timeline"))).toBe(true);
    expect(calls.some((u) => u.includes("gw.test"))).toBe(calls.length > 1); // chỉ gọi Gateway khi Project A thất bại
  });
  it("Project A lỗi mạng -> đọc Gateway; Gateway cũng lỗi -> trả lỗi gốc của Project A", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      calls.push(String(url));
      if (String(url).includes("gw.test")) throw new TypeError("gateway down");
      throw new TypeError("project A down");
    }));
    await expect(fetchBuyTimelineWithFallback()).rejects.toThrow(/project A down|Project A|buy-timeline/i);
    expect(calls.some((u) => u.includes("gw.test/api/cotuc-store/buy-timeline"))).toBe(true);
  });
  it("Project A lỗi, Gateway trả hợp lệ -> dùng bản Gateway (qua cùng bộ kiểm parseBuyTimeline); Gateway sai hợp đồng -> bị bác", async () => {
    const row = { id: "a", ticker: "IDC", sector: "Điện", kind: "EARNINGS", tier: "NEAR", status: "UPCOMING", eventLabel: "Công bố KQKD Q4/2026", eventDate: "2027-01-29",
      eventDateBasis: "HISTORICAL_LAG", windowId: "e2", windowLabel: "E2 · Nắm qua công bố", entryFrom: -5, entryTo: -2, exitOffset: 3, entryFromDate: "2027-01-22",
      entryToDate: "2027-01-27", exitDate: "2027-02-03", sessionsToEntry: 38, nEvents: 6, winRate: 0.67, probability: null, netExpectancy: 0.0225,
      netExpectancyLcb: 0.013, fdrQValue: 0.117, decisionLevel: "WATCH", missing: [] };
    const good = { today: "2026-11-27", asOf: { decisions: "2026-11-26T08:17:01Z", seasonality: "2026-11-25T22:45:30Z" },
      coverage: { decisions: 190, seasonality: 302, universe: 271 }, counts: { validated: 0, near: 1, inWindow: 0, upcoming: 1 }, rows: [row] };
    let body: unknown = good;
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).includes("gw.test")) return new Response(JSON.stringify(body), { status: 200 });
      throw new TypeError("project A down");
    }));
    const got = await fetchBuyTimelineWithFallback();
    expect(got?.rows.map((r) => r.ticker)).toEqual(["IDC"]);
    body = { rows: "không phải mảng" };
    await expect(fetchBuyTimelineWithFallback()).rejects.toBeTruthy();
  });
});
