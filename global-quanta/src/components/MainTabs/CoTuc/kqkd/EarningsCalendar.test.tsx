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

describe("LC3 phản ứng giá", () => {
  it("bảng 5 nhóm SUE + chênh nhóm 5 − nhóm 1; cột phản ứng giá: đã công bố (3 phiên) và chưa công bố (10 phiên, cảnh báo KL)", async () => {
    const { default: EventStudyPanel } = await import("./EventStudyPanel");
    const ci = (m: number) => ({ n: 100, mean: m, lo: m - 0.005, hi: m + 0.005 });
    const g = (m: number) => ({ n: 100, pre: ci(0), ann: ci(m), post: ci(-0.01), path: Array.from({ length: 71 }, (_, k) => (k >= 10 ? m : 0)), nPath: 100, leakPrice: 0.08, leakVolume: 0.2, reactVolume: 0.2 });
    const a = { version: "ES-v1", label: "MÔ TẢ", windows: { pre: [-10, -1], ann: [0, 2], post: [3, 60], est: [-130, -11] }, pathFrom: -10, events: 500, precise: 500, quarters: ["2024-03-31", "2026-06-30"], all: g(0.003), dataDated: g(0), quintiles: { 1: g(-0.008), 2: g(-0.005), 3: g(0.005), 4: g(0.009), 5: g(0.018) }, spread: { pre: 0.012, ann: 0.026, post: -0.013 }, baseRate: 0.0228, method: "m" };
    render(<EventStudyPanel a={a as never} />);
    expect(screen.getByTestId("lc-es-table").textContent).toContain("+2,6%");
    expect(screen.getByTestId("lc-es-table").textContent).toContain("Nhóm 5");
  });
});
