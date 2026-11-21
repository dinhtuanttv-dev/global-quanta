// Hậu kiểm (L4): ngày của phiên thứ N sau một ngày, theo lịch giao dịch Việt Nam truyền vào (makeVnTradingCalendar — thuần, không I/O).
import type { TradingCalendar } from "./types";

const DAY = 86_400_000;
const toDayNumber = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY);
const toIso = (n: number) => new Date(n * DAY).toISOString().slice(0, 10);

/** Phiên giao dịch thứ `n` SAU ngày `fromIso` (không tính chính ngày đó). */
export function addTradingSessions(fromIso: string, n: number, cal: TradingCalendar): string {
  let d = toDayNumber(fromIso), k = 0;
  for (let guard = 0; k < n && guard < 400; guard++) { d += 1; if (cal.isTradingDay(d)) k += 1; }
  return toIso(d);
}
export function reviewDates(fromIso: string, sessions: readonly number[], cal: TradingCalendar): Record<number, string> {
  return Object.fromEntries(sessions.map((n) => [n, addTradingSessions(fromIso, n, cal)]));
}
