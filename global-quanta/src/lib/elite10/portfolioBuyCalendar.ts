// MP-a (20/11/2026, tài liệu 19) — "Lịch vùng mua của danh mục": mỗi mã đang giữ một dòng, đọc từ Timeline điểm mua của Elite
// (useEliteTiming = Timeline Gateway, vùng cổ tức W1–W5 thay bằng Săn cổ tức TO-v1). Hàm thuần, không I/O, không tính số mới:
// chỉ chọn, sắp xếp và gắn nhãn các dòng Timeline đã có (kỳ vọng ròng, cận dưới, tỷ lệ thắng, n, q của engine).
import type { TimelineRow } from "../cotuc/buy-timeline";

export type CalSource = "TIMELINE" | "TO";
export interface CalRow {
  ticker: string; kind: "DIVIDEND" | "EARNINGS"; tier: "VALIDATED" | "NEAR" | "EXPLORATORY"; status: "IN_WINDOW" | "UPCOMING" | "PASSED";
  source: CalSource; eventLabel: string; eventDate: string; estimated: boolean;
  entryFromDate: string; entryToDate: string; exitDate: string; sessionsToEntry: number;
  nEvents: number; winRate: number; netExpectancy: number; netExpectancyLcb: number; fdrQValue: number | null; notes: string[];
}
export interface CalLine { ticker: string; rows: CalRow[] }
export interface PortfolioBuyCalendar { lines: CalLine[]; withZone: number; universe: { rows: number; validated: number } }

/** Mẫu dưới ngưỡng này: in thêm "mẫu rất nhỏ" (tài liệu 19, mục 1.3). */
export const SMALL_SAMPLE = 10;
const STATUS_ORDER: Record<CalRow["status"], number> = { IN_WINDOW: 0, UPCOMING: 1, PASSED: 2 };
const KNOWN_DATE = new Set(["CONFIRMED", "ANNOUNCED"]);

const toCal = (r: TimelineRow): CalRow => {
  const source: CalSource = r.tier === ("EXPLORATORY" as TimelineRow["tier"]) ? "TO" : "TIMELINE";
  return {
    ticker: r.ticker, kind: r.kind, tier: r.tier as CalRow["tier"], status: r.status, source, eventLabel: r.eventLabel, eventDate: r.eventDate,
    estimated: !KNOWN_DATE.has(r.eventDateBasis), entryFromDate: r.entryFromDate, entryToDate: r.entryToDate, exitDate: r.exitDate,
    sessionsToEntry: r.sessionsToEntry, nEvents: r.nEvents, winRate: r.winRate, netExpectancy: r.netExpectancy, netExpectancyLcb: r.netExpectancyLcb,
    // Vùng TO chưa kiểm định: engine ghi fdrQValue = 1 làm chỗ trống -> không in q.
    fdrQValue: source === "TO" ? null : r.fdrQValue, notes: r.missing ?? [],
  };
};
const byTime = (a: CalRow, b: CalRow) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
  || (a.status === "PASSED" ? b.entryFromDate.localeCompare(a.entryFromDate) : a.entryFromDate.localeCompare(b.entryFromDate));

/**
 * Dòng của từng mã (đúng thứ tự `tickers` khi hoà): mã có vùng đang mở trước, rồi vùng sắp tới gần nhất, rồi chỉ có vùng đã qua, cuối cùng
 * mã không có vùng. Trong một mã: đang mở -> sắp tới (gần trước) -> đã qua (mới trước). `universe` đếm trên mọi dòng Timeline (trừ TO).
 */
export function portfolioBuyCalendar(tickers: readonly string[], rows: readonly TimelineRow[] | null | undefined): PortfolioBuyCalendar {
  const all = rows ?? [];
  const timeline = all.filter((r) => r.tier !== ("EXPLORATORY" as TimelineRow["tier"]));
  const by = new Map<string, CalRow[]>();
  for (const r of all) { const t = r.ticker.toUpperCase(); if (!by.has(t)) by.set(t, []); by.get(t)!.push(toCal(r)); }
  const lines = [...new Set(tickers.map((t) => t.toUpperCase()))].map((t, i) => ({ ticker: t, i, rows: (by.get(t) ?? []).sort(byTime) }));
  const rank = (l: { rows: CalRow[] }) => (l.rows.length ? STATUS_ORDER[l.rows[0].status] : 3);
  lines.sort((a, b) => rank(a) - rank(b) || (a.rows[0] && b.rows[0] && rank(a) < 2 ? a.rows[0].entryFromDate.localeCompare(b.rows[0].entryFromDate) : 0) || a.i - b.i);
  return {
    lines: lines.map(({ ticker, rows: rs }) => ({ ticker, rows: rs })),
    withZone: lines.filter((l) => l.rows.length > 0).length,
    universe: { rows: timeline.length, validated: timeline.filter((r) => r.tier === "VALIDATED").length },
  };
}
