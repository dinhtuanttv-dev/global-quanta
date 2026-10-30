import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { cleanup, fireEvent, render, screen } from "../../../test/rtl-lite";
import type { EventRadarEvent } from "../../../hooks/useEventRadar";

const ev = (over: Partial<EventRadarEvent>): EventRadarEvent => ({
  eventId: "e1", clusterId: null, source: "VIETSTOCK", sourceLabel: "Vietstock", sourceAuthority: "editorial_media", usageTermsStatus: "review_required",
  verificationStatus: "unconfirmed", title: "FPT báo lãi quý 3", summary: "", url: "https://vietstock.vn/a", attachment: null,
  publishedAt: "2026-10-29T03:00:00.000Z", firstSeenAt: "2026-10-29T03:05:00.000Z", updatedAt: null, eventType: "EARNINGS", eventLabel: "Kết quả kinh doanh",
  tickers: ["FPT"], entityMatch: "code", entityConfidence: 0.9, severity: "material", severityScore: 2, corroboratingSources: [], corroborationCount: 1,
  documentCount: 1, sourceDocuments: [], revision: 1, reactionStatus: "not_calculated", ...over,
});
const events = [
  ev({}),
  ev({ eventId: "m1", title: "Fed giữ nguyên lãi suất", eventType: "MONETARY_POLICY", tickers: [], publishedAt: "2026-10-30T01:00:00.000Z" }),
  ev({ eventId: "m2", title: "Chuyên gia World Bank bàn mô hình tăng trưởng", eventType: "MACRO_NEWS", tickers: [], publishedAt: "2026-10-30T02:00:00.000Z" }),
];
const radar = { generatedAt: "2026-10-30T03:00:00.000Z", events, sources: {}, meta: { storage: { kind: "file", durability: "x", configuredPath: true, singleWriter: true }, disclosureCoverage: "", pollIntervalMs: 300000, disclaimer: "" } };

vi.mock("../../../hooks/useEventRadar", () => ({ useEventRadar: () => ({ data: radar, error: undefined, isLoading: false, refresh: async () => undefined, enabled: true }) }));
const calls: string[] = [];
vi.mock("../../../services/marketDataClient", () => ({
  fetchMarketJson: async (path: string) => { calls.push(path); return path.includes("leadership") ? { status: "insufficient_data", reason: "Thiếu dữ liệu ngành." } : { symbol: "FPT", status: "market_closed", mode: "x", sessionLive: false, asOf: null, ageMs: null, reason: "Ngoài phiên.", observation: null, alert: null, eventContext: [], method: { version: "esa-v1", baseline: "", normalization: "", minimumHistorySessions: 20, probabilityAvailable: false }, disclaimer: "" }; },
  isMarketGatewayEnabled: () => true,
}));
vi.mock("../../../services/api", async (orig) => ({ ...(await orig<object>()), getAccessToken: async () => null }));

import EventRadarWorkspace from "./EventRadarWorkspace";
import { macroEvents } from "./eventResearch/MacroEventsPanel";
import { seedFromEvent } from "./eventResearch/researchFormat";

beforeEach(() => { calls.length = 0; try { window.localStorage.clear(); } catch { /* */ } });
afterEach(cleanup);

describe("Event Radar 2 phần (30/10/2026 — chuyển Quant Edge / ESA / vĩ mô từ Siêu quét AI)", () => {
  it("mặc định mở Radar; phần chuyên sâu chưa tải (không gọi H2/ESA) cho tới khi mở", () => {
    render(<EventRadarWorkspace />);
    expect(screen.getByText("Event Radar · Sự kiện → phản ứng → drift")).toBeTruthy();
    expect(screen.queryByTestId("h2-panel")).toBeNull();
    expect(calls.filter((c) => c.includes("leadership") || c.includes("/esa/"))).toEqual([]);
  });

  it("nút Phân tích chuyên sâu trên thẻ sự kiện có mã -> mở phần 2, điền sẵn mã + ngày VN + thời điểm công bố; nhớ phần đang mở", async () => {
    render(<EventRadarWorkspace />);
    const buttons = Array.from(document.querySelectorAll("button")).filter((b) => b.textContent === "Phân tích chuyên sâu →");
    expect(buttons.length).toBe(1); // chỉ sự kiện có mã (FPT); tin vĩ mô không mã không có nút
    fireEvent.click(buttons[0]);
    expect(screen.getByTestId("h1-panel")).toBeTruthy();
    expect((document.querySelector('input[aria-label="Mã chứng khoán"]') as HTMLInputElement).value).toBe("FPT");
    expect((document.querySelector('input[aria-label="Ngày sự kiện"]') as HTMLInputElement).value).toBe("2026-10-29");
    expect(screen.getByTestId("h1-seed-note").textContent).toContain("giờ đăng của nguồn");
    expect(window.localStorage.getItem("gq.eventRadar.section.v1")).toBe("research");
    await act(async () => { await new Promise((r) => setTimeout(r, 800)); }); // ESA chờ người dùng ngừng gõ
    expect(calls).toContain("/api/market/research/esa/FPT");
    expect(calls).toContain("/api/market/research/leadership");
  });

  it("Sự kiện vĩ mô: chỉ nhóm vĩ mô, mới nhất trước, có bộ lọc nhóm", () => {
    expect(macroEvents(events).map((e) => e.eventId)).toEqual(["m2", "m1"]);
    window.localStorage.setItem("gq.eventRadar.section.v1", "research");
    render(<EventRadarWorkspace />);
    expect(screen.getAllByTestId("macro-event").length).toBe(2);
    fireEvent.click(Array.from(document.querySelectorAll("button")).find((b) => b.textContent?.startsWith("Chính sách tiền tệ"))!);
    expect(screen.getAllByTestId("macro-event").map((li) => li.textContent).join()).toContain("Fed giữ nguyên lãi suất");
    expect(screen.getAllByTestId("macro-event").length).toBe(1);
  });

  it("seedFromEvent: không có giờ đăng -> dùng giờ Gateway phát hiện; ngày theo giờ VN", () => {
    const s = seedFromEvent(ev({ publishedAt: null, firstSeenAt: "2026-10-29T18:30:00.000Z" }));
    expect(s).toMatchObject({ symbol: "FPT", eventDate: "2026-10-30", eventTimeSource: "gateway_first_seen" });
  });
});
