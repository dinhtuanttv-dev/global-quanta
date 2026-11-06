// LSK0/LSK1 (07/11/2026) — Lịch sự kiện doanh nghiệp: kiểu dữ liệu + hàm thuần cho giao diện (nhóm theo ngày, lợi suất, lọc, nhãn tin cậy).
export type CeGroup = "DIVIDEND" | "MEETING" | "CAPITAL" | "STATUS";
export type CeCheck = { level: "CONFIRMED_2" | "ANNOUNCED_2" | "CONFLICT" | "SINGLE"; source?: { date: string; title: string; dates?: string[] } };
export interface CorpEvent {
  id: string; t: string; type: string; cat: string; group: CeGroup; label: string; title: string; disclosed: string | null; date: string;
  ex: string | null; record: string | null; pay: string | null; meeting: string | null; end: string | null;
  cash: number | null; ratio: number | null; period: number | null; year: number | null; changed: string | null; check?: CeCheck;
}
export interface CeChange { at: string; kind: "NEW" | "CHANGED" | "REMOVED"; id: string; t: string; cat: string; label: string; field?: string; from?: string | number | null; to?: string | number | null; date: string; title: string }
export interface CorpEventsDoc { version: string; fetchedAt: string; asOf: string; from: string; to: string; events: CorpEvent[]; changes: CeChange[] }

export const TAX_CASH_DIVIDEND = 0.05; // thuế TNCN cổ tức tiền mặt 5%
export const keyDate = (e: CorpEvent) => e.ex ?? e.meeting ?? e.date;

/** Lợi suất cổ tức tiền sau thuế theo giá hiện tại (null nếu không phải tiền mặt / thiếu giá). */
export function netYield(e: CorpEvent, price: number | null | undefined): number | null {
  if (e.cat !== "CASH" || !e.cash || !price || price <= 0) return null;
  return (e.cash * (1 - TAX_CASH_DIVIDEND)) / price;
}

export const TRUST: Record<CeCheck["level"], { t: string; cls: string; title: string }> = {
  CONFIRMED_2: { t: "2 nguồn khớp ngày", cls: "text-emerald-300 border-emerald-400/40", title: "Ngày trên VNDirect trùng ngày ghi trong tin doanh nghiệp (CafeF)" },
  ANNOUNCED_2: { t: "có tin doanh nghiệp", cls: "text-sky-300 border-sky-400/40", title: "Có tin công bố của doanh nghiệp cùng loại quanh ngày công bố (CafeF), tin không ghi ngày" },
  CONFLICT: { t: "lệch nguồn", cls: "text-amber-300 border-amber-400/50", title: "Tin doanh nghiệp (CafeF) ghi ngày khác VNDirect — kiểm tra lại trước khi dùng" },
  SINGLE: { t: "1 nguồn", cls: "text-slate-400 border-white/10", title: "Chỉ có trên VNDirect (chưa thấy tin doanh nghiệp tương ứng)" },
};
export const GROUP_UI: Record<CeGroup, { t: string; cls: string }> = {
  DIVIDEND: { t: "Cổ tức", cls: "text-[#F5CE72] border-[#E8B84B]/50 bg-[#E8B84B]/10" },
  MEETING: { t: "Đại hội", cls: "text-violet-200 border-violet-400/40 bg-violet-400/10" },
  CAPITAL: { t: "Vốn", cls: "text-cyan-200 border-cyan-400/40 bg-cyan-400/10" },
  STATUS: { t: "Trạng thái", cls: "text-rose-200 border-rose-400/40 bg-rose-400/10" },
};

export interface CeFilter { groups: Set<CeGroup>; from: string; to: string; query: string; minYield: number | null; onlyTickers: Set<string> | null }
export function filterEvents(events: CorpEvent[], f: CeFilter, prices: Record<string, number>): CorpEvent[] {
  const q = f.query.trim().toUpperCase();
  return events.filter((e) => {
    const k = keyDate(e);
    if (k < f.from || k > f.to || !f.groups.has(e.group)) return false;
    if (q && !e.t.includes(q)) return false;
    if (f.onlyTickers && !f.onlyTickers.has(e.t)) return false;
    if (f.minYield != null) { const y = netYield(e, prices[e.t]); if (y == null || y < f.minYield) return false; }
    return true;
  });
}

/** Nhóm theo ngày trọng tâm (tăng dần), trong ngày: cổ tức → đại hội → vốn → trạng thái, rồi mã. */
export function groupByDay(events: CorpEvent[]): { date: string; events: CorpEvent[] }[] {
  const order: Record<CeGroup, number> = { DIVIDEND: 0, MEETING: 1, CAPITAL: 2, STATUS: 3 };
  const m = new Map<string, CorpEvent[]>();
  for (const e of events) { const k = keyDate(e); (m.get(k) ?? m.set(k, []).get(k)!).push(e); }
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, es]) => ({ date, events: es.sort((a, b) => order[a.group] - order[b.group] || a.t.localeCompare(b.t)) }));
}

const WD = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
export const weekday = (iso: string) => WD[new Date(`${iso}T00:00:00Z`).getUTCDay()];
export const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

export function calendarIcs(events: CorpEvent[], now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const esc = (s: string) => s.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, " ");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Global Quanta//Lich su kien//VI", "CALSCALE:GREGORIAN"];
  for (const e of events) {
    const d = keyDate(e).replace(/-/g, ""), d2 = addDays(keyDate(e), 1).replace(/-/g, "");
    const extra = [e.cash ? `${e.cash.toLocaleString("vi-VN")} đ/cp` : null, e.record ? `ĐKCC ${e.record}` : null, e.pay ? `thanh toán ${e.pay}` : null].filter(Boolean).join(" · ");
    lines.push("BEGIN:VEVENT", `UID:${e.id}@globalquanta`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${d2}`, `SUMMARY:${esc(`${e.t} · ${e.label}`)}`, `DESCRIPTION:${esc(`${e.title}${extra ? ` — ${extra}` : ""}`)}`, "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
