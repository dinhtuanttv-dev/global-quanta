import type { PAParams } from "./params.ts";
import type { Bar, CandleFeature, Direction, PAPattern, PatternId } from "./types.ts";

function makePattern(
  bars: readonly Bar[],
  id: PatternId,
  direction: PAPattern["direction"],
  originIndex: number,
  confirmedIndex: number,
  evidence: PAPattern["evidence"],
  caveats: string[] = [],
): PAPattern {
  return {
    id,
    direction,
    state: "confirmed",
    originIndex,
    confirmedIndex,
    originDate: bars[originIndex].date,
    confirmedDate: bars[confirmedIndex].date,
    priceLow: Math.min(...bars.slice(originIndex, confirmedIndex + 1).map((bar) => bar.low)),
    priceHigh: Math.max(...bars.slice(originIndex, confirmedIndex + 1).map((bar) => bar.high)),
    evidence,
    source: "DERIVED",
    caveats,
  };
}

function pinDirection(feature: CandleFeature, params: PAParams): Direction | null {
  if (feature.bodyToRange === null || feature.closeLocation === null) return null;
  if (feature.body === 0 || feature.bodyToRange > params.pinBar.maxBodyRange) return null;
  const bull = feature.lowerWick >= params.pinBar.minDominantWickBody * feature.body
    && feature.upperWick <= params.pinBar.maxOppositeWickBody * feature.body
    && feature.closeLocation >= params.pinBar.bullCloseLoc;
  const bear = feature.upperWick >= params.pinBar.minDominantWickBody * feature.body
    && feature.lowerWick <= params.pinBar.maxOppositeWickBody * feature.body
    && feature.closeLocation <= params.pinBar.bearCloseLoc;
  if (bull === bear) return null;
  return bull ? "bullish" : "bearish";
}

export function detectCandlePatterns(
  bars: readonly Bar[],
  features: readonly CandleFeature[],
  params: PAParams,
): PAPattern[] {
  const patterns: PAPattern[] = [];
  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    const f = features[i];
    if (!f.complete) continue;

    if (f.bodyToRange !== null && f.closeLocation !== null && f.rangeAtr !== null) {
      if (f.direction === "bullish"
        && f.bodyToRange >= params.trendBar.minBodyRange
        && f.rangeAtr >= params.trendBar.minRangeAtr
        && f.closeLocation >= params.trendBar.bullCloseLoc) {
        patterns.push(makePattern(bars, "TREND_BAR", "bullish", i, i, {
          bodyToRange: f.bodyToRange, rangeAtr: f.rangeAtr, closeLocation: f.closeLocation,
        }));
      } else if (f.direction === "bearish"
        && f.bodyToRange >= params.trendBar.minBodyRange
        && f.rangeAtr >= params.trendBar.minRangeAtr
        && f.closeLocation <= params.trendBar.bearCloseLoc) {
        patterns.push(makePattern(bars, "TREND_BAR", "bearish", i, i, {
          bodyToRange: f.bodyToRange, rangeAtr: f.rangeAtr, closeLocation: f.closeLocation,
        }));
      }
    }

    const pin = pinDirection(f, params);
    if (pin) {
      patterns.push(makePattern(bars, "PIN_BAR", pin, i, i, {
        bodyToRange: f.bodyToRange,
        lowerWickToBody: f.body > 0 ? f.lowerWick / f.body : null,
        upperWickToBody: f.body > 0 ? f.upperWick / f.body : null,
        closeLocation: f.closeLocation,
        definition: "pin-v1",
      }, ["Pattern hình dạng; chưa tự xác nhận đảo chiều"]));
      patterns.push(makePattern(bars, "REVERSAL_BAR", pin, i, i, {
        definition: "pin-shaped-rejection-v1",
      }, ["REVERSAL_BAR dùng định nghĩa pin-shaped-rejection-v1"]));
    }

    if (i >= 1) {
      const previous = bars[i - 1];
      if (bar.high <= previous.high && bar.low >= previous.low
        && (bar.high < previous.high || bar.low > previous.low)) {
        patterns.push(makePattern(bars, "INSIDE_BAR", "two_sided", i, i, {
          parentIndex: i - 1, parentHigh: previous.high, parentLow: previous.low,
        }));
      }
      if (bar.high >= previous.high && bar.low <= previous.low
        && (bar.high > previous.high || bar.low < previous.low)) {
        const direction = bar.close > bar.open && f.closeLocation !== null && f.closeLocation >= 0.5
          ? "bullish"
          : bar.close < bar.open && f.closeLocation !== null && f.closeLocation <= 0.5
            ? "bearish"
            : "two_sided";
        patterns.push(makePattern(bars, "OUTSIDE_BAR", direction, i, i, {
          parentIndex: i - 1, parentHigh: previous.high, parentLow: previous.low,
        }));
      }

      const priorDirection = previous.close > previous.open ? "bullish" : previous.close < previous.open ? "bearish" : "neutral";
      const priorWindow = bars.slice(Math.max(0, i - 6), i - 1);
      const madePriorLow = priorWindow.length > 0 && previous.low <= Math.min(...priorWindow.map((item) => item.low));
      const madePriorHigh = priorWindow.length > 0 && previous.high >= Math.max(...priorWindow.map((item) => item.high));
      if (priorDirection === "bearish" && bar.close > previous.high && bar.close > bar.open
        && (!params.reversal.requirePriorExtreme || madePriorLow)) {
        patterns.push(makePattern(bars, "TWO_BAR_REVERSAL", "bullish", i - 1, i, {
          priorDirection, priorHigh: previous.high, close: bar.close,
          requirePriorExtreme: params.reversal.requirePriorExtreme, madePriorExtreme: madePriorLow,
        }));
      } else if (priorDirection === "bullish" && bar.close < previous.low && bar.close < bar.open
        && (!params.reversal.requirePriorExtreme || madePriorHigh)) {
        patterns.push(makePattern(bars, "TWO_BAR_REVERSAL", "bearish", i - 1, i, {
          priorDirection, priorLow: previous.low, close: bar.close,
          requirePriorExtreme: params.reversal.requirePriorExtreme, madePriorExtreme: madePriorHigh,
        }));
      }
    }

    if (i >= 6) {
      const window = features.slice(i - 6, i + 1).map((item) => item.range);
      const minRange = Math.min(...window);
      if (f.range === minRange) {
        patterns.push(makePattern(bars, "NR7", "two_sided", i, i, {
          windowBars: 7,
          range: f.range,
          tie: window.filter((value) => value === minRange).length > 1,
        }, ["NR7 không tự xác định hướng"]));
      }
    }
  }

  // Explicitly reserved pattern names remain disabled until their definitions are approved.
  return patterns.sort((a, b) => a.confirmedIndex - b.confirmedIndex
    || a.originIndex - b.originIndex || a.id.localeCompare(b.id));
}

export function patternAt(
  patterns: readonly PAPattern[],
  index: number,
  id: PatternId,
  direction?: Direction,
): PAPattern | undefined {
  return patterns.find((pattern) => pattern.confirmedIndex === index
    && pattern.id === id
    && (direction === undefined || pattern.direction === direction));
}
