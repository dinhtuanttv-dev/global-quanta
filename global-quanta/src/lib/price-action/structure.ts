import { tickAt } from "./math.ts";
import type { Bar, CandleFeature, PASwing, TrendContext, TrendState } from "./types.ts";

interface PivotCandidate {
  index: number;
  confirmedIndex: number;
  kind: "high" | "low";
  price: number;
}

export function detectConfirmedSwings(
  bars: readonly Bar[],
  features: readonly CandleFeature[],
  left: number,
  right: number,
  customTickSize?: (price: number) => number,
): PASwing[] {
  const candidates: PivotCandidate[] = [];
  for (let i = left; i + right < bars.length; i++) {
    let high = true;
    let low = true;
    for (let j = i - left; j < i && (high || low); j++) {
      if (bars[j].high >= bars[i].high) high = false;
      if (bars[j].low <= bars[i].low) low = false;
    }
    for (let j = i + 1; j <= i + right && (high || low); j++) {
      if (bars[j].high > bars[i].high) high = false;
      if (bars[j].low < bars[i].low) low = false;
    }
    if (high) candidates.push({ index: i, confirmedIndex: i + right, kind: "high", price: bars[i].high });
    if (low) candidates.push({ index: i, confirmedIndex: i + right, kind: "low", price: bars[i].low });
  }
  candidates.sort((a, b) => a.confirmedIndex - b.confirmedIndex || a.index - b.index);

  const swings: PASwing[] = [];
  let priorHigh: PivotCandidate | null = null;
  let priorLow: PivotCandidate | null = null;
  for (const pivot of candidates) {
    const atr = features[pivot.confirmedIndex]?.atr ?? 0;
    const tolerance = Math.max(2 * tickAt(pivot.price, customTickSize), 0.05 * atr);
    const prior = pivot.kind === "high" ? priorHigh : priorLow;
    let label: PASwing["label"] = "unclassified";
    if (prior) {
      const delta = pivot.price - prior.price;
      if (Math.abs(delta) <= tolerance) label = "equal";
      else if (pivot.kind === "high") label = delta > 0 ? "HH" : "LH";
      else label = delta > 0 ? "HL" : "LL";
    }
    const swing: PASwing = {
      kind: pivot.kind,
      price: pivot.price,
      label,
      originIndex: pivot.index,
      confirmedIndex: pivot.confirmedIndex,
      originDate: bars[pivot.index].date,
      confirmedDate: bars[pivot.confirmedIndex].date,
    };
    swings.push(swing);
    if (pivot.kind === "high") priorHigh = pivot;
    else priorLow = pivot;
  }
  return swings;
}

function latestKindLabel(swings: readonly PASwing[], kind: "high" | "low"): PASwing["label"] | null {
  const recent = swings.filter((swing) => swing.kind === kind).slice(-1)[0];
  if (!recent) return null;
  if (kind === "high" && (recent.label === "HH" || recent.label === "LH" || recent.label === "equal")) return recent.label;
  if (kind === "low" && (recent.label === "HL" || recent.label === "LL" || recent.label === "equal")) return recent.label;
  return "unclassified";
}

export function classifyTrend(swings: readonly PASwing[], bars: readonly Bar[]): TrendContext {
  const high = latestKindLabel(swings, "high");
  const low = latestKindLabel(swings, "low");
  let state: TrendState = "undetermined";
  if ((high === "HH" && low === "HL")) state = "bullish";
  else if (high === "LH" && low === "LL") state = "bearish";
  else if (high !== null && low !== null) state = "mixed";
  const asOfIndex = bars.length - 1;
  return {
    state,
    latestHighLabel: high === "HH" || high === "LH" || high === "equal" ? high : null,
    latestLowLabel: low === "HL" || low === "LL" || low === "equal" ? low : null,
    asOfIndex,
    asOfDate: bars[asOfIndex]?.date ?? null,
  };
}

export function trendStateAt(swings: readonly PASwing[], index: number): TrendState {
  const known = swings.filter((swing) => swing.confirmedIndex <= index);
  const high = latestKindLabel(known, "high");
  const low = latestKindLabel(known, "low");
  if (high === "HH" && low === "HL") return "bullish";
  if (high === "LH" && low === "LL") return "bearish";
  if (high !== null && low !== null) return "mixed";
  return "undetermined";
}
