// ⏱ DẢI VÙNG MUA (30/10/2026) — "Gantt" vùng mua cho Bảng quyết định Elite 10, cùng cách trình bày Timeline điểm mua tối ưu (tab Cổ tức):
// trục = PHIÊN GIAO DỊCH thật (lịch nghỉ của Gateway) dùng chung cho mọi hàng; mỗi hàng: kỳ nắm giữ Elite 10 phiên (từ phiên vào theo quy
// tắc), các vùng mua của Timeline (cổ tức / KQKD; Đạt kiểm định đặc, Gần đạt nét đứt, Đã qua mờ), mốc sự kiện (GDKHQ / công bố KQKD),
// mốc thoát của vùng, HÔM NAY. Vùng ngoài trục -> ghi ngày + số phiên. Hàm thuần (có test); chỉ hiển thị, không đổi cách chọn mã.
import type { TimelineRow } from "../cotuc/buy-timeline";
import { ELITE_HOLD_SESSIONS, nextSessionAfter } from "./buyTimingCell";

export interface LaneAxis { dates: string[]; todayIdx: number | null; entryIdx: number | null; holdTo: number | null }
export interface LaneZone {
  row: TimelineRow; i0: number; i1: number; clipLeft: boolean; clipRight: boolean;
  eventIdx: number | null; exitIdx: number | null;
}
export interface LaneFar { row: TimelineRow; side: "before" | "after" }
export interface BuyLane { zones: LaneZone[]; far: LaneFar[] }

/** Trục chung: từ `before` phiên trước phiên vào tới `after` phiên sau (cắt theo lịch có sẵn). */
export function laneAxis(sessions: readonly string[], decisionDate: string, today: string, before = 5, after = 15): LaneAxis {
  const s = [...new Set(sessions)].sort();
  const entry = nextSessionAfter(decisionDate, s);
  const e = entry ? s.indexOf(entry) : -1;
  const lo = Math.max(0, (e >= 0 ? e : s.findIndex((d) => d >= today)) - before);
  const dates = s.slice(lo, Math.max(lo + 1, (e >= 0 ? e : lo) + after + 1));
  const idx = (d: string | null) => (d && dates.includes(d) ? dates.indexOf(d) : null);
  const ei = idx(entry);
  return { dates, todayIdx: idx(today) ?? (today > (dates[dates.length - 1] ?? "") ? null : dates.findIndex((d) => d >= today)), entryIdx: ei, holdTo: ei == null ? null : Math.min(dates.length - 1, ei + ELITE_HOLD_SESSIONS - 1) };
}

/** Vị trí ngày trên trục: đúng phiên -> chỉ số; ngày nghỉ / ước tính -> phiên giao dịch kế tiếp; ngoài trục -> null. */
export function dateIndex(dates: readonly string[], d: string | null | undefined): number | null {
  if (!d || !dates.length || d < dates[0] || d > dates[dates.length - 1]) return null;
  const i = dates.findIndex((x) => x >= d);
  return i < 0 ? null : i;
}

/** Vùng mua của MỘT mã trên trục (mọi vùng Timeline của mã, cả hai loại sự kiện), thứ tự: trong vùng -> sắp tới -> đã qua. */
export function buyLane(ticker: string, rows: readonly TimelineRow[], axis: LaneAxis): BuyLane {
  const dates = axis.dates, first = dates[0], last = dates[dates.length - 1];
  const rank = (r: TimelineRow) => (r.status === "IN_WINDOW" ? 0 : r.status === "UPCOMING" ? 1 : 2) * 10 + (r.tier === "VALIDATED" ? 0 : 1);
  const mine = rows.filter((r) => r.ticker === ticker.toUpperCase()).sort((a, b) => rank(a) - rank(b) || a.entryFromDate.localeCompare(b.entryFromDate));
  const zones: LaneZone[] = [], far: LaneFar[] = [];
  for (const r of mine) {
    if (!first || r.entryToDate < first) { far.push({ row: r, side: "before" }); continue; }
    if (r.entryFromDate > last) { far.push({ row: r, side: "after" }); continue; }
    const i0 = dateIndex(dates, r.entryFromDate < first ? first : r.entryFromDate)!;
    const toIdx = r.entryToDate > last ? dates.length - 1 : dates.findIndex((x) => x > r.entryToDate) - 1;
    const i1 = Math.max(i0, toIdx < 0 ? dates.length - 1 : toIdx);
    zones.push({ row: r, i0, i1, clipLeft: r.entryFromDate < first, clipRight: r.entryToDate > last, eventIdx: dateIndex(dates, r.eventDate), exitIdx: dateIndex(dates, r.exitDate) });
  }
  return { zones, far };
}
