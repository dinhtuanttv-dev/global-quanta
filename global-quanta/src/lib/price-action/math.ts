import type { Bar } from "./types.ts";

export function trueRange(bars: readonly Bar[], index: number): number {
  const bar = bars[index];
  if (index === 0) return bar.high - bar.low;
  const previousClose = bars[index - 1].close;
  return Math.max(
    bar.high - bar.low,
    Math.abs(bar.high - previousClose),
    Math.abs(bar.low - previousClose),
  );
}

/** Wilder ATR; first value is the arithmetic mean of the first `period` TR values. */
export function atrSeries(bars: readonly Bar[], period: number): (number | null)[] {
  const result: (number | null)[] = Array(bars.length).fill(null);
  if (!Number.isInteger(period) || period < 1) return result;
  let seed = 0;
  let atr = 0;
  for (let i = 0; i < bars.length; i++) {
    const tr = trueRange(bars, i);
    if (i < period) {
      seed += tr;
      if (i === period - 1) {
        atr = seed / period;
        result[i] = atr;
      }
      continue;
    }
    atr = (atr * (period - 1) + tr) / period;
    result[i] = atr;
  }
  return result;
}

export function tickAt(price: number, custom?: (price: number) => number): number {
  // No universal tick schedule exists; require a market-specific callback.
  const size = custom ? custom(price) : 0;
  return Number.isFinite(size) && size > 0 ? size : 0;
}

export function candleCloseLocation(high: number, low: number, close: number): number | null {
  const range = high - low;
  return range > 0 ? (close - low) / range : null;
}

export function roundPrice(value: number): number {
  return Math.round(value * 1e10) / 1e10;
}

export function isLimitLocked(bars: readonly Bar[], index: number, limitPct: number | null): boolean {
  if (!limitPct || index <= 0) return false;
  const previousClose = bars[index - 1].close;
  if (!(previousClose > 0)) return false;
  const bar = bars[index];
  const move = Math.abs(bar.close / previousClose - 1);
  return move >= limitPct - 0.003 && (bar.close === bar.high || bar.close === bar.low);
}
