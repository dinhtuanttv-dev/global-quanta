import type { OhlcvBar } from "./types";

// Khung thời gian (TA_VNINDEX_UPGRADE_SPEC §2.1.1): 1m · 5m · 15m · 1H (gộp từ nến 1 phút SSI theo PHIÊN, không gộp qua
// giờ nghỉ trưa) · D · W · M (gộp từ nến ngày điều chỉnh).
export type Timeframe = "1m" | "5m" | "15m" | "1H" | "D" | "W" | "M";
export const INTRADAY_TIMEFRAMES: readonly Timeframe[] = ["1m", "5m", "15m", "1H"];
export const isIntradayTf = (tf: Timeframe) => INTRADAY_TIMEFRAMES.includes(tf);
const MINUTES: Record<string, number> = { "1m": 1, "5m": 5, "15m": 15, "1H": 60 };

export type IntradayBar = OhlcvBar & { auction?: string };

function aggregate(dailyBars: OhlcvBar[], keyOf: (date: string) => string): OhlcvBar[] {
  const groups = new Map<string, OhlcvBar[]>();
  for (const bar of dailyBars) {
    const key = keyOf(bar.date);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(bar);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, bars]) => ({
      date: key,
      open: bars[0].open,
      high: Math.max(...bars.map((b) => b.high)),
      low: Math.min(...bars.map((b) => b.low)),
      close: bars[bars.length - 1].close,
      volume: bars.reduce((s, b) => s + b.volume, 0),
    }));
}

export function aggregateToWeekly(dailyBars: OhlcvBar[]): OhlcvBar[] {
  return aggregate(dailyBars, (d) => {
    const date = new Date(d + "T00:00:00Z");
    const day = date.getUTCDay();
    date.setUTCDate(date.getUTCDate() + (day === 0 ? -6 : 1 - day));
    return date.toISOString().slice(0, 10);
  });
}

/** Tháng: ngày đại diện = phiên giao dịch ĐẦU TIÊN của tháng (có nến thật, ghim đúng vào trục thời gian). */
export function aggregateToMonthly(dailyBars: OhlcvBar[]): OhlcvBar[] {
  const firstOfMonth = new Map<string, string>();
  for (const b of dailyBars) if (!firstOfMonth.has(b.date.slice(0, 7))) firstOfMonth.set(b.date.slice(0, 7), b.date);
  return aggregate(dailyBars, (d) => firstOfMonth.get(d.slice(0, 7))!);
}

/**
 * Gộp nến 1 phút thành N phút theo PHIÊN: buổi sáng neo 09:00, buổi chiều neo 13:00 (không gộp qua giờ nghỉ trưa).
 * Nến mang thời điểm BẮT ĐẦU của nhóm (giờ VN, có múi +07:00). Nhóm chứa khớp định kỳ giữ cờ auction.
 */
export function aggregateIntraday(bars1m: IntradayBar[], minutes: number): IntradayBar[] {
  if (minutes <= 1) return bars1m;
  const groups = new Map<string, IntradayBar[]>();
  for (const b of bars1m) {
    const day = b.date.slice(0, 10);
    const hh = Number(b.date.slice(11, 13));
    const mm = Number(b.date.slice(14, 16));
    const t = hh * 60 + mm;
    const anchor = t < 12 * 60 ? 9 * 60 : 13 * 60;
    const start = anchor + Math.floor((t - anchor) / minutes) * minutes;
    const key = `${day}T${String(Math.floor(start / 60)).padStart(2, "0")}:${String(start % 60).padStart(2, "0")}:00+07:00`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(b);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, list]) => ({
    date,
    open: list[0].open,
    high: Math.max(...list.map((b) => b.high)),
    low: Math.min(...list.map((b) => b.low)),
    close: list[list.length - 1].close,
    volume: list.reduce((s, b) => s + b.volume, 0),
    ...(list.some((b) => b.auction) ? { auction: list.find((b) => b.auction)!.auction } : {}),
  }));
}

export class TimeframeController {
  private currentTimeframe: Timeframe = "D";
  private dailyBars: OhlcvBar[] = [];
  private intraday1m: IntradayBar[] = [];

  setDailyBars(bars: OhlcvBar[]): void { this.dailyBars = bars; }
  setIntradayBars(bars: IntradayBar[]): void { this.intraday1m = bars; }
  getIntradayBars(): IntradayBar[] { return this.intraday1m; }
  hasIntraday(): boolean { return this.intraday1m.length > 0; }
  getTimeframe(): Timeframe { return this.currentTimeframe; }
  setTimeframe(tf: Timeframe): void { this.currentTimeframe = tf; }

  getBarsForCurrentTimeframe(): OhlcvBar[] {
    const tf = this.currentTimeframe;
    if (tf === "W") return aggregateToWeekly(this.dailyBars);
    if (tf === "M") return aggregateToMonthly(this.dailyBars);
    if (isIntradayTf(tf)) return aggregateIntraday(this.intraday1m, MINUTES[tf]);
    return this.dailyBars;
  }
}
