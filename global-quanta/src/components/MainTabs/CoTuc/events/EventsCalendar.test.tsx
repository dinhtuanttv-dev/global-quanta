import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { calendarIcs, dividendHabits, dividendHistory, filterEvents, ganttRows, groupByDay, monthCells, netYield, shiftMonth, type CorpEvent } from "../../../../lib/events/calendar";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const ev = (o: Partial<CorpEvent>): CorpEvent => ({ id: o.t! + (o.cat ?? ""), t: "VNM", type: "DIVIDEND", cat: "CASH", group: "DIVIDEND", label: "Cổ tức tiền", title: "Trả cổ tức", disclosed: "2026-10-28", date: "2026-11-11", ex: "2026-11-11", record: "2026-11-12", pay: "2026-11-26", meeting: null, end: null, cash: 2500, ratio: 25, period: 1, year: 2026, changed: null, ...o });
const doc = {
  version: "CE-v1", fetchedAt: "2026-11-07T00:40:00Z", asOf: "2026-11-07", from: "2026-10-31", to: "2027-12-12",
  events: [ev({ t: "VNM", check: { level: "ANNOUNCED_2", source: { date: "2026-11-02", title: "VNM: Thông báo ngày ĐKCC" } } }), ev({ t: "TNG", cash: 500, ex: "2026-11-10", date: "2026-11-10", changed: "2026-11-09", check: { level: "SINGLE" } }),
    ev({ t: "GVR", type: "MEETING", cat: "AGM", group: "MEETING", label: "Họp ĐHCĐ", ex: null, meeting: "2026-12-29", date: "2026-12-29", cash: null }),
    ev({ t: "IDJ", type: "alert", cat: "WARNING", group: "STATUS", label: "Diện cảnh báo", ex: null, date: "2026-11-20", cash: null })],
  changes: [{ at: "2026-11-06T10:00:00Z", kind: "CHANGED" as const, id: "x", t: "TNG", cat: "CASH", label: "Cổ tức tiền", field: "ex", from: "2026-11-09", to: "2026-11-10", date: "2026-11-10", title: "Trả cổ tức" }],
};
vi.mock("../../../../hooks/useCorpEvents", () => ({ useCorpEvents: () => ({ data: doc, error: null, isLoading: false }), useCorpEventsTicker: (t: string | null) => (t ? { ticker: t, events: hist } : null), useExStudyMarket: () => ({ version: "XD-v1", builtAt: "2026-11-06T12:45:00Z", events: 138, aggregate: { all: { n: 138, dropRatioMedian: 1, dropRatio: { n: 138, mean: 0.94, lo: 0.69, hi: 1.18 }, fillWithin20: 0.65, fillDaysMedian: 5, neverFilled60: 0.25, carPre: { n: 138, mean: 0.011, lo: -0.0004, hi: 0.0219 }, carAnn: { n: 138, mean: -0.004, lo: -0.01, hi: 0.003 }, carPost: { n: 129, mean: -0.001, lo: -0.03, hi: 0.03 } }, byYield: {} } }),
  useExStudyTicker: () => ({ version: "XD-v1", builtAt: "x", summary: { n: 2, dropRatioMedian: 0.9, fillDaysMedian: 4, fillWithin20: 1, events: [{ ex: "2025-06-10", cash: 3000, yieldCum: 0.05, dropRatio: 0.9, fillDays: 4, pending: false, carPre: 0.01, carAnn: -0.02, carPost: 0.03 }] }, market: null }),
  usePlanNews: () => ({ ticker: "VNM", rows: [{ date: "2026-04-20", title: "ĐHĐCĐ Vinamilk: thông qua cổ tức 40%", status: "APPROVED", kind: "CASH", pct: 40, dps: null, none: false, yearInTitle: null }] }),
  useDividendHabits: () => ({ version: "DF-v1", label: "MÔ TẢ", test: "DF-r1 KHÔNG ĐẠT", asOf: "2026-11-07", days: 30, rows: [{ t: "BMP", usual: "2026-11-13", paidYears: 4, years: 4, lastEx: "2025-11-17", lastCash: 6500 }, { t: "PLX", usual: "2026-11-09", paidYears: 1, years: 4, lastEx: "2022-11-09", lastCash: 1200 }] }) }));
const hist = [2022, 2023, 2024, 2025].map((y, i) => ev({ t: "VNM", id: `h${y}`, year: y, ex: `${y + 1}-06-1${i}`, date: `${y + 1}-06-1${i}`, disclosed: `${y + 1}-05-2${i}`, cash: 3000 + i * 500 }));
import EventsCalendar from "./EventsCalendar";

describe("LSK0/LSK1 Lịch sự kiện", () => {
  afterEach(() => { document.body.innerHTML = ""; });
  it("hàm thuần: lợi suất sau thuế, lọc, nhóm theo ngày, .ics", () => {
    expect(netYield(ev({}), 62500)).toBeCloseTo(0.038, 4);
    expect(netYield(ev({ cat: "STOCK" }), 62500)).toBeNull();
    const f = filterEvents(doc.events, { groups: new Set(["DIVIDEND", "MEETING"]), from: "2026-11-07", to: "2026-12-07", query: "", minYield: null, onlyTickers: null }, {});
    expect(f.map((e) => e.t)).toEqual(["VNM", "TNG"]);
    expect(filterEvents(doc.events, { groups: new Set(["DIVIDEND"]), from: "2026-11-07", to: "2027-01-01", query: "", minYield: 0.02, onlyTickers: null }, { VNM: 62500, TNG: 50000 }).map((e) => e.t)).toEqual(["VNM"]);
    expect(groupByDay(f).map((d) => d.date)).toEqual(["2026-11-10", "2026-11-11"]);
    expect(monthCells("2026-11")[0].date).toBe("2026-10-26"); expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(ganttRows(doc.events).map((r) => r.t)).toEqual(["TNG", "VNM", "GVR"]);
    expect(dividendHistory(hist).map((h) => h.cash)).toEqual([3000, 3500, 4000, 4500]);
    expect(dividendHabits(hist, 2026)).toEqual({ streak: 4, leadDays: 21, usualMonths: [6] });
    const ics = calendarIcs(f, new Date("2026-11-07T00:00:00Z"));
    expect(ics).toContain("DTSTART;VALUE=DATE:20261110"); expect(ics).toContain("SUMMARY:TNG · Cổ tức tiền");
  });
  it("hiển thị: nhóm ngày, số tiền + lợi suất, đổi ngày, độ tin cậy, nhật ký; bấm mã mở chi tiết; bật nhóm Trạng thái", async () => {
    const el = document.createElement("div"); document.body.appendChild(el);
    const opened: string[] = [];
    await act(async () => { createRoot(el).render(<EventsCalendar livePrices={{ VNM: 62500 }} onSelectTicker={(t) => opened.push(t)} />); });
    const rows = el.querySelectorAll('[data-testid="ce-row"]');
    expect(rows.length).toBe(2); // 30 ngày, nhóm mặc định: VNM + TNG (ĐHCĐ 29/12 ngoài 30 ngày, cảnh báo tắt)
    expect(rows[0].textContent).toContain("đổi từ 09/11/2026");
    expect(rows[1].textContent).toContain("2.500 đ"); expect(rows[1].textContent).toContain("3,8%");
    expect(rows[1].textContent).toContain("có tin doanh nghiệp");
    expect(el.querySelector('[data-testid="ce-changes"]')!.textContent).toContain("GDKHQ 2026-11-09 → 2026-11-10");
    expect(el.querySelectorAll('[data-testid="ce-habit-row"]').length).toBe(1); // mặc định chỉ mã đã trả ≥ 2 năm
    expect(el.querySelector('[data-testid="ce-habits"]')!.textContent).toContain("MÔ TẢ");
    expect(el.querySelector('[data-testid="ce-exstudy"]')!.textContent).toContain("138 lần trả tiền mặt");
    await act(async () => { (el.querySelector('[data-testid="ce-h-90"]') as HTMLButtonElement).click(); });
    expect(el.querySelectorAll('[data-testid="ce-row"]').length).toBe(3);
    await act(async () => { (el.querySelector('[data-testid="ce-g-STATUS"]') as HTMLButtonElement).click(); });
    expect(el.querySelectorAll('[data-testid="ce-row"]').length).toBe(4);
    await act(async () => { (el.querySelectorAll('[data-testid="ce-row"]')[1].querySelector("button") as HTMLButtonElement).click(); });
    const dr = el.querySelector('[data-testid="ce-drawer"]')!;
    expect(dr.textContent).toContain("VNM"); expect(el.querySelector('[data-testid="ce-streak"]')!.textContent).toBe("4");
    expect(el.querySelector('[data-testid="ce-ex-ticker"]')!.textContent).toContain("4 phiên");
    expect(el.querySelector('[data-testid="ce-plan-news"]')!.textContent).toContain("Đã thông qua");
    expect(el.querySelector('[data-testid="ce-hist"]')!.textContent).toContain("2025");
    await act(async () => { ([...dr.querySelectorAll("button")].find((b) => b.textContent === "Mở hồ sơ mã") as HTMLButtonElement).click(); });
    expect(opened).toEqual(["VNM"]); expect(el.querySelector('[data-testid="ce-drawer"]')).toBeNull();
    await act(async () => { (el.querySelector('[data-testid="ce-view-month"]') as HTMLButtonElement).click(); });
    expect(el.querySelectorAll('[data-testid="ce-cell"]').length).toBe(42);
    expect(el.querySelector('[data-testid="ce-month-label"]')!.textContent).toBe("Tháng 11/2026");
    const cell11 = [...el.querySelectorAll('[data-testid="ce-cell"]')].find((c) => c.textContent!.startsWith("11") && c.textContent!.includes("VNM"))!;
    await act(async () => { (cell11.querySelector("button") as HTMLButtonElement).click(); });
    expect(el.querySelector('[data-testid="ce-day-chip"]')!.textContent).toContain("11/11/2026");
    expect(el.querySelectorAll('[data-testid="ce-row"]').length).toBe(1);
    await act(async () => { (el.querySelector('[data-testid="ce-day-chip"]') as HTMLButtonElement).click(); });
    await act(async () => { (el.querySelector('[data-testid="ce-view-gantt"]') as HTMLButtonElement).click(); });
    expect(el.querySelectorAll('[data-testid="ce-gantt-row"]').length).toBe(3);
    try { localStorage.removeItem("gq.events.view.v1"); } catch { /* */ }
  });
});
