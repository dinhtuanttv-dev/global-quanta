import { atrSeries } from "./math.ts";
import type { Bar, CandleFeature } from "./types.ts";

export function computeCandleFeatures(
  bars: readonly Bar[],
  atrPeriod: number,
  isClosed: boolean,
): CandleFeature[] {
  const atr = atrSeries(bars, atrPeriod);
  return bars.map((bar, index) => {
    const range = bar.high - bar.low;
    const body = Math.abs(bar.close - bar.open);
    const upperWick = bar.high - Math.max(bar.open, bar.close);
    const lowerWick = Math.min(bar.open, bar.close) - bar.low;
    const currentAtr = atr[index];
    return {
      index,
      range,
      atr: currentAtr,
      body,
      upperWick,
      lowerWick,
      bodyToRange: range > 0 ? body / range : null,
      closeLocation: range > 0 ? (bar.close - bar.low) / range : null,
      rangeAtr: currentAtr !== null && currentAtr > 0 ? range / currentAtr : null,
      bodyAtr: currentAtr !== null && currentAtr > 0 ? body / currentAtr : null,
      direction: bar.close > bar.open ? "bullish" : bar.close < bar.open ? "bearish" : "neutral",
      complete: isClosed || index < bars.length - 1,
    };
  });
}
