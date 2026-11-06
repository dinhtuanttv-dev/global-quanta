import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "../../../../test/rtl-lite";
// Hợp đồng dữ liệu: dựng payload bằng CHÍNH bộ tính lịch của Gateway (LC-v1).
// @ts-expect-error — module JS của backend, không có khai báo kiểu
import { buildCalendar } from "../../../../../backend/src/market/fundamentals/earningsCalendar.js";
import type { KqkdCalendar } from "../../../../lib/kqkd/types";

const wk = (d: string) => [0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay());
const add = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const qEnd = (y: number, q: number) => { const m = q * 3; return `${y}-${String(m).padStart(2, "0")}-${m === 3 || m === 12 ? 31 : 30}`; };
function rec(ticker: string, lag: number, upto = "2026-06-30") {
  const quarters = [];
  for (let y = 2020; y <= 2026; y++) for (let q = 1; q <= 4; q++) { const f = qEnd(y, q); if (f > upto) break; quarters.push({ fiscal: f, created: add(f, lag), v: { npatParent: 1 } }); }
  return { ticker, tpl: "corp", quarters };
}
const recs = [rec("AAA", 20, "2026-09-30"), rec("BBB", 28), rec("CCC", 60), rec("DDD", 25)];
const opts = { today: "2026-10-27", isHoliday: wk, disclosuresOf: (t: string) => (t === "DDD" ? [["2026-10-20", "DDD: Báo cáo tài chính quý 3/2026"]] : []), resultOf: () => ({ fiscal: "2026-09-30", npatYoY: { value: 0.25, status: "NORMAL" }, sueCore: 2.4 }) };
const data: KqkdCalendar = { asOf: "2026-10-27", disclosuresFetchedAt: "2026-10-27T05:00:00Z", current: buildCalendar(recs, { ...opts, fiscal: "2026-09-30" }), next: buildCalendar(recs, { ...opts, fiscal: "2026-12-31" }) };

vi.mock("../../../../hooks/useKqkd", () => ({
  useKqkdCalendar: () => ({ data, error: null, isLoading: false }),
  useKqkdSummary: () => ({ data: { rows: [] }, error: null, isLoading: false }),
  useKqkdTicker: () => ({ data: null, error: null, isLoading: true }),
}));
import EarningsCalendar, { calendarIcs } from "./EarningsCalendar";

afterEach(() => cleanup());

describe("LC5 Lịch công bố KQKD", () => {
  it("thẻ, đường tiến độ, lưới lịch, bảng trạng thái, lọc theo ngày và trạng thái, mùa kế tiếp", () => {
    render(<EarningsCalendar />);
    expect(screen.getByTestId("lc-panel").textContent).toContain("Lịch công bố KQKD — Q3/2026");
    expect(screen.getByTestId("lc-tiles").textContent).toContain("1/4");
    expect(screen.getByTestId("lc-deadlines").textContent).toContain("14/11/2026");
    expect(screen.getByTestId("lc-curve").getAttribute("data-testid")).toBe("lc-curve");
    expect(screen.getAllByTestId("lc-row")).toHaveLength(4);
    expect(screen.getByTestId("lc-table").textContent).toContain("Có BCTC, chờ số");
    expect(screen.getByTestId("lc-table").textContent).toContain("+25%");
    fireEvent.click(screen.getByTestId("lc-filter-late"));
    expect(screen.getAllByTestId("lc-row").map((r) => r.querySelector("button")!.textContent)).toEqual(["CCC"]);
    fireEvent.click(screen.getByTestId("lc-filter-all"));
    const aaa = data.current.rows.find((r) => r.t === "AAA")!;
    fireEvent.click(screen.getByTestId(`lc-day-${aaa.date}`));
    const sameDay = data.current.rows.filter((r) => (r.date ?? r.expected) === aaa.date).map((r) => r.t).sort();
    expect(sameDay).toEqual(["AAA", "DDD"]); // AAA công bố 20/10, DDD có tin BCTC 20/10
    expect(screen.getAllByTestId("lc-row").map((r) => r.querySelector("button")!.textContent).sort()).toEqual(sameDay);
    fireEvent.click(screen.getByTestId("lc-day-clear"));
    fireEvent.click(screen.getByTestId("lc-season-next"));
    expect(screen.getByTestId("lc-panel").textContent).toContain("Q4/2026");
    expect(screen.getByTestId("lc-tiles").textContent).toContain("0/4");
  });

  it("tệp .ics: sự kiện cả ngày cho mã sắp công bố, có UID và ngày dự kiến", () => {
    const ics = calendarIcs(data.next.rows, data.next);
    expect(ics.startsWith("BEGIN:VCALENDAR")).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(4);
    const aaa = data.next.rows.find((r) => r.t === "AAA")!;
    expect(ics).toContain(`DTSTART;VALUE=DATE:${aaa.expected!.replace(/-/g, "")}`);
    expect(ics).toContain("UID:kqkd-2026-12-31-AAA@dinhtuan-ck");
  });
});

describe("LC5 thứ tự bảng", () => {
  it("quá hạn → có BCTC chờ số → sắp công bố → đã công bố (mới nhất trước)", async () => {
    const { sortRows } = await import("./EarningsCalendar");
    const r = (t: string, status: string, date: string | null, expected: string | null) => ({ t, status, date, expected }) as never;
    const out = [r("A", "REPORTED", "2026-10-10", null), r("B", "UPCOMING", null, "2026-11-03"), r("C", "REPORTED", "2026-10-20", null), r("D", "OVERDUE", null, "2026-10-30"), r("E", "DISCLOSED", "2026-10-29", null), r("F", "UPCOMING", null, "2026-11-01")].sort(sortRows).map((x: { t: string }) => x.t);
    expect(out).toEqual(["D", "E", "F", "B", "C", "A"]);
  });
});
