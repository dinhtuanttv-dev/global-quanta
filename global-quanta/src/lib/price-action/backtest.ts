import type { Bar, Direction, PASetup } from "./types.ts";

export interface EventStudyOptions {
  horizons: readonly number[];
  feeBpsPerSide: number;
  slippageBpsPerSide: number;
}

export interface EventObservation {
  setupId: string;
  direction: Direction;
  triggerIndex: number;
  entryIndex: number | null;
  exitIndex: number | null;
  horizon: number;
  status: "observed" | "censored";
  reason: string | null;
  entryPrice: number | null;
  exitPrice: number | null;
  netReturn: number | null;
  mfe: number | null;
  mae: number | null;
}

export interface EventStudyResult {
  assumptions: {
    fill: "next-bar-open";
    feeBpsPerSide: number;
    slippageBpsPerSide: number;
    overlapEventsMayNotBeIndependent: true;
  };
  observations: EventObservation[];
  summary: {
    horizon: number;
    observed: number;
    censored: number;
    meanNetReturn: number | null;
    medianNetReturn: number | null;
    positiveRate: number | null;
    meanMfe: number | null;
    meanMae: number | null;
  }[];
}

export function eventStudy(
  bars: readonly Bar[],
  setups: readonly PASetup[],
  options: EventStudyOptions,
): EventStudyResult {
  if (options.horizons.some((horizon) => !Number.isInteger(horizon) || horizon < 1)) {
    throw new Error("horizons must contain positive integers");
  }
  if (!Number.isFinite(options.feeBpsPerSide) || options.feeBpsPerSide < 0
    || !Number.isFinite(options.slippageBpsPerSide) || options.slippageBpsPerSide < 0) {
    throw new Error("fee and slippage must be finite non-negative basis points per side");
  }

  const triggered = setups.filter((setup) => setup.state === "triggered");
  const observations: EventObservation[] = [];
  const costFraction = 2 * (options.feeBpsPerSide + options.slippageBpsPerSide) / 10_000;
  for (const setup of triggered) {
    for (const horizon of options.horizons) {
      const triggerIndex = setup.stateIndex;
      if (!Number.isInteger(triggerIndex) || triggerIndex < 0
        || triggerIndex >= bars.length || bars[triggerIndex]?.date !== setup.stateDate) {
        observations.push({
          setupId: setup.id, direction: setup.direction, triggerIndex, entryIndex: null, exitIndex: null, horizon,
          status: "censored", reason: "Trigger index/date không khớp chuỗi bars đầu vào",
          entryPrice: null, exitPrice: null, netReturn: null, mfe: null, mae: null,
        });
        continue;
      }
      const entryIndex = triggerIndex + 1;
      const exitIndex = entryIndex + horizon - 1;
      const entry = bars[entryIndex];
      const exit = bars[exitIndex];
      if (!entry || !exit || !(entry.open > 0) || !(exit.close > 0)) {
        observations.push({
          setupId: setup.id, direction: setup.direction, triggerIndex, entryIndex: entry ? entryIndex : null,
          exitIndex: exit ? exitIndex : null, horizon, status: "censored", reason: "Thiếu bar entry/exit hoặc giá không dương",
          entryPrice: null, exitPrice: null, netReturn: null, mfe: null, mae: null,
        });
        continue;
      }
      const path = bars.slice(entryIndex, exitIndex + 1);
      if (path.some((bar) => !Number.isFinite(bar.high) || !Number.isFinite(bar.low) || bar.high <= 0 || bar.low <= 0)) {
        observations.push({
          setupId: setup.id, direction: setup.direction, triggerIndex, entryIndex, exitIndex, horizon,
          status: "censored", reason: "OHLC không dương/hợp lệ cho phép tính return tương đối",
          entryPrice: null, exitPrice: null, netReturn: null, mfe: null, mae: null,
        });
        continue;
      }
      const high = Math.max(...path.map((bar) => bar.high));
      const low = Math.min(...path.map((bar) => bar.low));
      const gross = setup.direction === "bullish" ? exit.close / entry.open - 1 : entry.open / exit.close - 1;
      const mfe = setup.direction === "bullish" ? high / entry.open - 1 : entry.open / low - 1;
      const mae = setup.direction === "bullish" ? low / entry.open - 1 : entry.open / high - 1;
      observations.push({
        setupId: setup.id, direction: setup.direction, triggerIndex, entryIndex, exitIndex, horizon,
        status: "observed", reason: null, entryPrice: entry.open, exitPrice: exit.close,
        netReturn: gross - costFraction, mfe, mae,
      });
    }
  }

  const summary = options.horizons.map((horizon) => {
    const sample = observations.filter((row) => row.horizon === horizon);
    const values = sample.filter((row) => row.status === "observed").map((row) => row.netReturn as number);
    const ordered = [...values].sort((a, b) => a - b);
    const mean = (items: number[]) => items.length ? items.reduce((sum, value) => sum + value, 0) / items.length : null;
    const median = ordered.length === 0 ? null : ordered.length % 2
      ? ordered[(ordered.length - 1) / 2]
      : (ordered[ordered.length / 2 - 1] + ordered[ordered.length / 2]) / 2;
    return {
      horizon,
      observed: values.length,
      censored: sample.length - values.length,
      meanNetReturn: mean(values),
      medianNetReturn: median,
      positiveRate: values.length ? values.filter((value) => value > 0).length / values.length : null,
      meanMfe: mean(sample.filter((row) => row.mfe !== null).map((row) => row.mfe as number)),
      meanMae: mean(sample.filter((row) => row.mae !== null).map((row) => row.mae as number)),
    };
  });

  return {
    assumptions: {
      fill: "next-bar-open",
      feeBpsPerSide: options.feeBpsPerSide,
      slippageBpsPerSide: options.slippageBpsPerSide,
      overlapEventsMayNotBeIndependent: true,
    },
    observations,
    summary,
  };
}
