// T1 (18/11/2026) — "Lịch 10 phiên tới" của Bảng quyết định Elite HL: sự kiện ĐÃ CÔNG BỐ và mốc dự kiến của các mã trong danh mục và
// hàng chờ, ghép từ hồ sơ PFA-v1 (sự kiện CE-v1, lịch công bố KQKD) và nguồn thời điểm Elite (Săn cổ tức TO-v1, vùng mùa vụ KQKD).
// CHỈ HIỂN THỊ — không đổi danh mục / tỷ trọng. Vùng Timeline chỉ hiện khi đạt kiểm định (KQKD) hoặc là cửa sổ TO (THĂM DÒ). Hàm thuần.
import type { TimelineRow } from "../cotuc/buy-timeline";
import type { ProfileFa } from "./profileFaTypes";
import type { DilutionPhase } from "./decisionTypes";
import { isToRow } from "./toTiming";

export const HL_CAL_HORIZON = 10;
export type CalKind = "EX_CASH" | "EX_STOCK" | "RIGHTS" | "MEETING" | "LISTING" | "OTHER" | "KQKD" | "TO" | "SEASON" | "NEW_SHARES";
export type CalBasis = "ANNOUNCED" | "EXPECTED" | "EXPLORATORY" | "VALIDATED_ESTIMATED" | "VALIDATED";
export interface CalItem {
  date: string; ticker: string; inPortfolio: boolean; kind: CalKind; label: string; detail: string;
  sessionsAway: number | null; basis: CalBasis;
}
export interface HlCalendar { asOf: string; endDate: string; items: CalItem[]; tickers: number; withProfile: number }

const dm = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "—");
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const money = (v: number | null | undefined) => (v == null ? "" : `${Math.round(v).toLocaleString("vi-VN")}đ/cp`);

/** Phiên thứ `horizon` sau asOf theo lịch Gateway (có ngày nghỉ); thiếu lịch -> asOf + 14 ngày. */
export function calendarEnd(asOf: string, sessions: readonly string[], horizon = HL_CAL_HORIZON): string {
  const after = sessions.filter((s) => s > asOf);
  return after.length >= horizon ? after[horizon - 1] : addDays(asOf, 14);
}
/** Số phiên từ asOf (không tính) tới date (tính) theo lịch Gateway; ngoài lịch -> fallback. */
export function sessionsBetween(asOf: string, date: string, sessions: readonly string[], fallback: number | null = null): number | null {
  if (date <= asOf) return 0;
  const after = sessions.filter((s) => s > asOf);
  if (!after.length || date > after[after.length - 1]) return fallback;
  return after.filter((s) => s <= date).length;
}

const EVENT: Record<string, [CalKind, (e: ProfileFaEvent) => string]> = {
  CASH: ["EX_CASH", (e) => `GDKHQ cổ tức tiền ${money(e.cash)}`],
  STOCK: ["EX_STOCK", (e) => `GDKHQ cổ tức cổ phiếu${e.ratio != null ? ` ${e.ratio}%` : ""}`],
  BONUS: ["EX_STOCK", (e) => `GDKHQ cổ phiếu thưởng${e.ratio != null ? ` ${e.ratio}%` : ""}`],
  RIGHTS: ["RIGHTS", (e) => `GDKHQ quyền mua / phát hành thêm${e.ratio != null ? ` ${e.ratio}%` : ""}`],
  AGM_RECORD: ["MEETING", () => "Chốt quyền họp ĐHCĐ"], AGM: ["MEETING", () => "Họp ĐHCĐ"], POLL: ["MEETING", () => "Lấy ý kiến cổ đông"],
  ADD_LISTING: ["LISTING", () => "Niêm yết bổ sung"],
};
type ProfileFaEvent = NonNullable<ProfileFa["events"]>["upcoming"][number];

export function buildHlCalendar({ asOf, sessions, portfolio, queue, profiles, timeline, dilution = null, horizon = HL_CAL_HORIZON }: {
  asOf: string; sessions: readonly string[]; portfolio: readonly string[]; queue: readonly string[];
  profiles: ReadonlyMap<string, ProfileFa | null>; timeline: readonly TimelineRow[] | null; dilution?: Readonly<Record<string, DilutionPhase>> | null; horizon?: number;
}): HlCalendar {
  const endDate = calendarEnd(asOf, sessions, horizon);
  const inP = new Set(portfolio), all = [...new Set([...portfolio, ...queue])];
  const items: CalItem[] = [];
  const push = (it: Omit<CalItem, "inPortfolio" | "sessionsAway"> & { sessionsAway?: number | null }) => {
    if (it.date < asOf || it.date > endDate) return;
    items.push({ ...it, inPortfolio: inP.has(it.ticker), sessionsAway: it.sessionsAway ?? sessionsBetween(asOf, it.date, sessions) });
  };
  let withProfile = 0;
  for (const t of all) {
    const p = profiles.get(t);
    if (!p || p.missing) continue;
    withProfile++;
    for (const e of p.events?.upcoming ?? []) {
      if (!e.date) continue;
      const [kind, label] = EVENT[e.cat] ?? ["OTHER", () => e.label];
      push({ date: e.date, ticker: t, kind, label: label(e), detail: [e.pay ? `trả tiền ${dm(e.pay)}` : "", e.disclosed ? `công bố ${dm(e.disclosed)}` : ""].filter(Boolean).join(" · "), basis: "ANNOUNCED", sessionsAway: sessionsBetween(asOf, e.date, sessions, e.sessionsAway) });
    }
    // KQKD: quý hiện hành chưa công bố hoặc quý tới — mốc DỰ KIẾN theo độ trễ công bố của chính mã.
    for (const c of [p.calendar?.current, p.calendar?.next]) {
      if (!c || c.status === "REPORTED" || !c.band) continue;
      const start = c.band[0] < asOf ? asOf : c.band[0];
      if (start > endDate) continue;
      push({ date: start, ticker: t, kind: "KQKD", label: "KQKD dự kiến công bố", detail: `khoảng ${dm(c.band[0])}–${dm(c.band[1])}`, basis: "EXPECTED" });
    }
  }
  // PX0: ngày cổ phiếu mới (đợt pha loãng ≥ 10%) giao dịch được — nguồn cung về; đã công bố hoặc ước tính theo độ trễ lịch sử.
  for (const t of all) {
    const p = dilution?.[t]; if (!p || p.listed) continue;
    const cat = p.cat === "STOCK" ? "cổ tức CP" : p.cat === "BONUS" ? "CP thưởng" : "quyền mua";
    push({ date: p.listing, ticker: t, kind: "NEW_SHARES", label: `Cổ phiếu mới (${cat} ${p.ratio}%) giao dịch được`, detail: `GDKHQ ${dm(p.ex)}${p.listingBasis === "ANNOUNCED" ? "" : ` · ước tính theo ${p.listingBasis === "ESTIMATED_OWN" ? "các đợt trước của mã" : "thị trường"}`}`, basis: p.listingBasis === "ANNOUNCED" ? "ANNOUNCED" : "EXPECTED" });
  }
  // Nguồn thời điểm Elite: Săn cổ tức TO-v1 (THĂM DÒ) và vùng mùa vụ KQKD ĐẠT KIỂM ĐỊNH; vùng "gần đạt" không hiện.
  for (const r of timeline ?? []) {
    const t = r.ticker.toUpperCase(); if (!all.includes(t)) continue;
    if (r.status === "PASSED") continue;
    const to = isToRow(r);
    if (!to && r.tier !== "VALIDATED") continue;
    const date = r.status === "IN_WINDOW" ? asOf : r.entryFromDate;
    push({
      date, ticker: t, kind: to ? "TO" : "SEASON",
      label: to ? `Săn cổ tức: vào ${dm(r.entryFromDate)}→${dm(r.entryToDate)}, bán ${dm(r.exitDate)}` : `Vùng mùa vụ KQKD ${dm(r.entryFromDate)}→${dm(r.entryToDate)}`,
      detail: r.status === "IN_WINDOW" ? "đang mở" : `mở sau ${r.sessionsToEntry} phiên`,
      basis: to ? "EXPLORATORY" : r.eventDateBasis === "ESTIMATED" ? "VALIDATED_ESTIMATED" : "VALIDATED",
      sessionsAway: r.status === "IN_WINDOW" ? 0 : r.sessionsToEntry,
    });
  }
  items.sort((a, b) => a.date.localeCompare(b.date) || Number(b.inPortfolio) - Number(a.inPortfolio) || a.ticker.localeCompare(b.ticker));
  return { asOf, endDate, items, tickers: all.length, withProfile };
}
