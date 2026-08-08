import type { OhlcvBar } from "../types";

export interface OrderBlock { date: string; type: "bullish" | "bearish"; top: number; bottom: number; }
export interface FairValueGap { startDate: string; endDate: string; type: "bullish" | "bearish"; top: number; bottom: number; }
export interface BreakOfStructure { date: string; type: "bullish" | "bearish"; brokenLevel: number; }

const STRONG_MOVE_THRESHOLD = 0.015;
const SWING_LOOKBACK = 5;

export function detectOrderBlocks(bars: OhlcvBar[]): OrderBlock[] {
  const obs: OrderBlock[] = [];
  for (let i = 0; i < bars.length - 3; i++) {
    const bar = bars[i];
    const future = bars[i + 3];
    const moveUp = (future.close - bar.close) / bar.close;
    const moveDown = (bar.close - future.close) / bar.close;
    if (bar.close < bar.open && moveUp >= STRONG_MOVE_THRESHOLD) {
      obs.push({ date: bar.date, type: "bullish", top: bar.high, bottom: bar.low });
    } else if (bar.close > bar.open && moveDown >= STRONG_MOVE_THRESHOLD) {
      obs.push({ date: bar.date, type: "bearish", top: bar.high, bottom: bar.low });
    }
  }
  return obs.slice(-10);
}

export function detectFVG(bars: OhlcvBar[]): FairValueGap[] {
  const gaps: FairValueGap[] = [];
  for (let i = 0; i < bars.length - 2; i++) {
    const c1 = bars[i], c3 = bars[i + 2];
    if (c1.high < c3.low) gaps.push({ startDate: c1.date, endDate: c3.date, type: "bullish", top: c3.low, bottom: c1.high });
    else if (c1.low > c3.high) gaps.push({ startDate: c1.date, endDate: c3.date, type: "bearish", top: c1.low, bottom: c3.high });
  }
  return gaps.slice(-10);
}

export function detectBOS(bars: OhlcvBar[]): BreakOfStructure[] {
  const results: BreakOfStructure[] = [];
  const swingHighs: { index: number; price: number }[] = [];
  const swingLows: { index: number; price: number }[] = [];

  for (let i = SWING_LOOKBACK; i < bars.length - SWING_LOOKBACK; i++) {
    const window = bars.slice(i - SWING_LOOKBACK, i + SWING_LOOKBACK + 1);
    if (window.every((b) => bars[i].high >= b.high)) swingHighs.push({ index: i, price: bars[i].high });
    if (window.every((b) => bars[i].low <= b.low)) swingLows.push({ index: i, price: bars[i].low });
  }

  for (let i = SWING_LOOKBACK; i < bars.length; i++) {
    const priorHigh = [...swingHighs].reverse().find((s) => s.index < i);
    const priorLow = [...swingLows].reverse().find((s) => s.index < i);
    if (priorHigh && bars[i].close > priorHigh.price) results.push({ date: bars[i].date, type: "bullish", brokenLevel: priorHigh.price });
    if (priorLow && bars[i].close < priorLow.price) results.push({ date: bars[i].date, type: "bearish", brokenLevel: priorLow.price });
  }
  return results.slice(-6);
}
