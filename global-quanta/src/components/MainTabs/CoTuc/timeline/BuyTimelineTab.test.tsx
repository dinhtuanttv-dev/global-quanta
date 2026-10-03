import { act } from "react";
import { createRoot } from "react-dom/client";
import { SWRConfig } from "swr";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseBuyTimeline } from "../../../../lib/cotuc/buy-timeline";
import { ddmm, fmtOffset, fmtRatioPct } from "../../../../lib/cotuc/format";
import { BuyTimelineTab } from "./BuyTimelineTab";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Dòng lấy từ lần chạy chỉ-đọc trên dữ liệu thật 03/10/2026 (BMP, FPT, MWG), trạng thái đặt theo "hôm nay" 05/10.
const row = (over: Record<string, unknown>) => ({
  id: "x", ticker: "FPT", sector: "Công nghệ", kind: "DIVIDEND", tier: "NEAR", status: "UPCOMING", eventLabel: "GDKHQ", eventDate: "2026-11-20",
  eventDateBasis: "ESTIMATED", windowId: "w3", windowLabel: "W3 · Trước GDKHQ (an toàn)", entryFrom: -25, entryTo: -15, exitOffset: 3,
  entryFromDate: "2026-10-16", entryToDate: "2026-10-30", exitDate: "2026-11-25", sessionsToEntry: 9, nEvents: 9, winRate: 0.78, probability: null,
  netExpectancy: 0.024, netExpectancyLcb: 0.017, fdrQValue: 0.11, decisionLevel: "AVOID", missing: ["q-value 0.11 > 0.1"], ...over,
});
const payload = {
  today: "2026-10-05",
  asOf: { decisions: "2026-10-05T02:00:00Z", seasonality: "2026-10-04T23:45:00Z" },
  coverage: { decisions: 260, seasonality: 240, universe: 281 },
  counts: { validated: 1, near: 2, inWindow: 1, upcoming: 2 },
  rows: [
    row({ id: "a", ticker: "BMP", kind: "EARNINGS", tier: "VALIDATED", status: "IN_WINDOW", eventLabel: "Công bố KQKD Q3/2026", eventDate: "2026-10-19", eventDateBasis: "HISTORICAL_LAG",
      windowId: "e2", windowLabel: "E2 · Nắm qua công bố", entryFrom: -5, entryTo: -2, exitOffset: 3, entryFromDate: "2026-10-05", entryToDate: "2026-10-15", sessionsToEntry: 0,
      probability: 0.64, decisionLevel: null, missing: [] }),
    row({ id: "b" }),
    row({ id: "c", ticker: "MWG", status: "PASSED", entryFromDate: "2026-08-31", entryToDate: "2026-09-16", exitDate: "2026-10-12" }),
    { id: "bad", ticker: "" },
  ],
};

async function mount(node: React.ReactNode) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  await act(async () => { createRoot(el).render(<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{node}</SWRConfig>); });
  for (let i = 0; i < 6; i++) await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
  return el;
}

afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = ""; });

describe("định dạng dùng chung", () => {
  it("phần trăm có dấu, ngày, offset phiên", () => {
    expect(fmtRatioPct(0.024, { signed: true })).toBe("+2.4%");
    expect(fmtRatioPct(-0.01, { signed: true })).toBe("−1.0%");
    expect(fmtRatioPct(null)).toBe("—");
    expect(ddmm("2026-10-07")).toBe("07/10");
    expect(fmtOffset(-25)).toBe("T−25");
    expect(fmtOffset(3)).toBe("T+3");
  });
});

describe("parseBuyTimeline", () => {
  it("bỏ riêng dòng sai hợp đồng", () => {
    const r = parseBuyTimeline(payload);
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.data.rows).toHaveLength(3); expect(r.data.dropped).toBe(1); }
  });
});

describe("BuyTimelineTab", () => {
  it("nhóm theo ngày, đang-trong-vùng đứng đầu, ẩn dòng đã qua mặc định, mở mã khi bấm", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(JSON.stringify(String(url).includes("buy-timeline") ? payload : { asOf: null, count: 0, states: [] }), { status: 200 })));
    const onSelect = vi.fn();
    const el = await mount(<BuyTimelineTab onSelectTicker={onSelect} />);
    const rows = [...el.querySelectorAll('[data-testid="timeline-row"]')];
    expect(rows.map((r) => r.getAttribute("data-status"))).toEqual(["IN_WINDOW", "UPCOMING"]);
    expect(el.textContent).toContain("Đang trong vùng mua");
    expect(el.textContent).toContain("T6 16/10/2026");
    expect(el.textContent).toContain("Còn thiếu: q-value 0.11 > 0.1");
    expect(el.textContent).toContain("✓ Đạt kiểm định");
    expect(el.textContent).not.toMatch(/NaN|undefined/);
    await act(async () => { (rows[0].querySelector("button") as HTMLButtonElement).click(); });
    expect(onSelect).toHaveBeenCalledWith("BMP");
  });

  it("lọc chỉ KQKD và tắt 'gần đạt'", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(JSON.stringify(String(url).includes("buy-timeline") ? payload : { asOf: null, count: 0, states: [] }), { status: 200 })));
    const el = await mount(<BuyTimelineTab />);
    const tab = [...el.querySelectorAll('button[role="tab"]')].find((b) => b.textContent === "Mùa vụ KQKD") as HTMLButtonElement;
    await act(async () => { tab.click(); });
    expect(el.querySelectorAll('[data-testid="timeline-row"]')).toHaveLength(1);
    const near = [...el.querySelectorAll("label")].find((l) => l.textContent?.includes("gần đạt"))!.querySelector("input") as HTMLInputElement;
    await act(async () => { near.click(); });
    expect(el.querySelectorAll('[data-testid="timeline-row"]')[0].getAttribute("data-tier")).toBe("VALIDATED");
  });
});
