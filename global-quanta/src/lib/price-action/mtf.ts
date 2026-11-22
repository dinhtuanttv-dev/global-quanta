import type { Bar, PASwing, TrendState } from "./types.ts";
import { trendStateAt } from "./structure.ts";

export interface HigherTimeframeInput {
  timeframe: string;
  bars: readonly Bar[];
  /** Explicit close/availability timestamps; no session calendar is inferred. */
  availableAt: readonly string[];
  swings: readonly PASwing[];
}

export interface AlignedTrend {
  sourceTimeframe: string;
  state: TrendState;
  sourceBarIndex: number | null;
  sourceConfirmedAt: string | null;
  asOf: string;
}

export function alignHigherTimeframeTrend(
  lowerBars: readonly Bar[],
  lowerAvailableAt: readonly string[],
  higher: HigherTimeframeInput,
): AlignedTrend[] {
  if (lowerAvailableAt.length !== lowerBars.length) {
    throw new Error("lowerAvailableAt length must equal lower timeframe bars length");
  }
  for (let i = 1; i < lowerAvailableAt.length; i++) {
    if (lowerAvailableAt[i] <= lowerAvailableAt[i - 1]) {
      throw new Error("lower timeframe availableAt timestamps must increase strictly");
    }
  }
  if (higher.availableAt.length !== higher.bars.length) {
    throw new Error("availableAt length must equal higher timeframe bars length");
  }
  for (let i = 1; i < higher.availableAt.length; i++) {
    if (higher.availableAt[i] <= higher.availableAt[i - 1]) {
      throw new Error("higher timeframe availableAt timestamps must increase strictly");
    }
  }

  let cursor = -1;
  return lowerBars.map((_lower, lowerIndex) => {
    const asOf = lowerAvailableAt[lowerIndex];
    while (cursor + 1 < higher.availableAt.length && higher.availableAt[cursor + 1] <= asOf) cursor++;
    if (cursor < 0) {
      return { sourceTimeframe: higher.timeframe, state: "undetermined", sourceBarIndex: null, sourceConfirmedAt: null, asOf };
    }
    const knownSwings = higher.swings.filter((swing) => swing.confirmedIndex <= cursor);
    const latestConfirmIndex = knownSwings.reduce<number | null>(
      (latest, swing) => latest === null || swing.confirmedIndex > latest ? swing.confirmedIndex : latest,
      null,
    );
    return {
      sourceTimeframe: higher.timeframe,
      state: trendStateAt(higher.swings, cursor),
      sourceBarIndex: cursor,
      sourceConfirmedAt: latestConfirmIndex === null ? null : higher.availableAt[latestConfirmIndex],
      asOf,
    };
  });
}

export function combineTrendStates(states: readonly TrendState[]): TrendState {
  if (states.length === 0 || states.every((state) => state === "undetermined")) return "undetermined";
  if (states.includes("mixed")) return "mixed";
  if (states.includes("undetermined")) return "undetermined";
  const unique = new Set(states);
  return unique.size === 1 ? states[0] : "mixed";
}
