import type { OhlcvBar } from "./types";

export type Timeframe = "D" | "W";

export function aggregateToWeekly(dailyBars: OhlcvBar[]): OhlcvBar[] {
  if (dailyBars.length === 0) return [];
  const weeks = new Map<string, OhlcvBar[]>();

  dailyBars.forEach((bar) => {
    const date = new Date(bar.date + "T00:00:00Z");
    const day = date.getUTCDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const monday = new Date(date);
    monday.setUTCDate(date.getUTCDate() + diffToMonday);
    const key = monday.toISOString().slice(0, 10);
    if (!weeks.has(key)) weeks.set(key, []);
    weeks.get(key)!.push(bar);
  });

  const weeklyBars: OhlcvBar[] = [];
  Array.from(weeks.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([weekStart, bars]) => {
      weeklyBars.push({
        date: weekStart,
        open: bars[0].open,
        high: Math.max(...bars.map((b) => b.high)),
        low: Math.min(...bars.map((b) => b.low)),
        close: bars[bars.length - 1].close,
        volume: bars.reduce((s, b) => s + b.volume, 0),
      });
    });
  return weeklyBars;
}

export class TimeframeController {
  private currentTimeframe: Timeframe = "D";
  private dailyBars: OhlcvBar[] = [];

  setDailyBars(bars: OhlcvBar[]): void { this.dailyBars = bars; }
  getTimeframe(): Timeframe { return this.currentTimeframe; }
  setTimeframe(tf: Timeframe): void { this.currentTimeframe = tf; }

  getBarsForCurrentTimeframe(): OhlcvBar[] {
    if (this.currentTimeframe === "W") return aggregateToWeekly(this.dailyBars);
    return this.dailyBars;
  }
}
