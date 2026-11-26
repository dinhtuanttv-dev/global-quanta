import { computeCandleFeatures } from "./candleFeatures.ts";
import { detectCandlePatterns } from "./candlePatterns.ts";
import { mergeParams, stableParamsHash, validateParams } from "./params.ts";
import { classifyTrend, detectConfirmedSwings, trendSeries } from "./structure.ts";
import { buildSetups } from "./setups.ts";
import { computeVolumeFeatures } from "./volume.ts";
import { buildPriceActionZones } from "./zones.ts";
import type { Bar, PriceActionContext, PriceActionResult } from "./types.ts";
import type { PAParamsOverrides } from "./params.ts";

export * from "./types.ts";
export * from "./params.ts";
export * from "./math.ts";
export * from "./candleFeatures.ts";
export * from "./candlePatterns.ts";
export * from "./structure.ts";
export * from "./zones.ts";
export * from "./setups.ts";
export * from "./mtf.ts";
export * from "./backtest.ts";
export * from "./volume.ts";
export * from "./summary.ts";

/** pa-book-2.0.0 (26/11/2026): định nghĩa mẫu hình theo sách, vùng/xu hướng không nhìn trước, lớp khối lượng, cổng lời/lỗ. */
export const PRICE_ACTION_ENGINE_VERSION = "pa-book-2.0.0";

function validateBars(bars: readonly Bar[]): { index: number; field: string; message: string }[] {
  const errors: { index: number; field: string; message: string }[] = [];
  let priorDate: string | null = null;
  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    for (const field of ["open", "high", "low", "close"] as const) {
      if (!Number.isFinite(bar[field])) errors.push({ index: i, field, message: "Giá trị phải hữu hạn" });
    }
    if (bar.volume !== null && bar.volume < 0) errors.push({ index: i, field: "volume", message: "Volume không được âm" });
    if (bar.high < Math.max(bar.open, bar.close)) errors.push({ index: i, field: "high", message: "High phải >= open và close" });
    if (bar.low > Math.min(bar.open, bar.close)) errors.push({ index: i, field: "low", message: "Low phải <= open và close" });
    if (bar.high < bar.low) errors.push({ index: i, field: "high/low", message: "High phải >= low" });
    if (!bar.date || typeof bar.date !== "string") errors.push({ index: i, field: "date", message: "Date bắt buộc là chuỗi" });
    if (priorDate !== null && bar.date <= priorDate) {
      errors.push({ index: i, field: "date", message: "Timestamp phải tăng nghiêm ngặt, không trùng" });
    }
    priorDate = bar.date;
  }
  return errors;
}

function validateContext(context: PriceActionContext): string[] {
  const errors: string[] = [];
  for (const field of ["symbol", "timeframe", "priceBasis", "source", "asOf"] as const) {
    if (!context[field] || typeof context[field] !== "string") errors.push(`context.${field} bắt buộc`);
  }
  if (context.limitPct !== null && (!Number.isFinite(context.limitPct) || context.limitPct <= 0)) {
    errors.push("context.limitPct phải dương hoặc null");
  }
  if (typeof context.isIndex !== "boolean") errors.push("context.isIndex phải là boolean");
  if (context.isClosed !== undefined && typeof context.isClosed !== "boolean") errors.push("context.isClosed phải là boolean");
  if (context.tickSize !== undefined && typeof context.tickSize !== "function") errors.push("context.tickSize phải là function(price) => tickSize");
  return errors;
}

export function analyzePriceAction(
  bars: readonly Bar[],
  context: PriceActionContext,
  overrides: PAParamsOverrides = {},
): PriceActionResult {
  const params = mergeParams(overrides);
  const { tickSize: customTickSize, ...safeContext } = context;
  const paramErrors = validateParams(params);
  const barErrors = validateBars(bars);
  const contextErrors = validateContext(context);
  const errors = [
    ...barErrors,
    ...contextErrors.map((message) => ({ index: -1, field: "context", message })),
    ...paramErrors.map((message) => ({ index: -1, field: "params", message })),
  ];
  const paramsHash = stableParamsHash(params);
  if (errors.length > 0) {
    return {
      status: "invalid",
      engineVersion: PRICE_ACTION_ENGINE_VERSION,
      paramsHash,
      context: safeContext,
      candleFeatures: [], volumeFeatures: [], patterns: [], swings: [],
      trend: { state: "undetermined", broken: false, latestHighLabel: null, latestLowLabel: null, asOfIndex: -1, asOfDate: null },
      zones: [], setups: [], latestSummary: null, warnings: [], errors,
    };
  }

  const closed = context.isClosed !== false;
  const features = computeCandleFeatures(bars, params.atrPeriod, closed);
  const analysisBars = closed ? bars : bars.slice(0, -1);
  const analysisFeatures = features.slice(0, analysisBars.length);
  const patterns = detectCandlePatterns(analysisBars, analysisFeatures, params);
  const swings = detectConfirmedSwings(
    analysisBars, analysisFeatures, params.swing.left, params.swing.right,
    customTickSize,
  );
  const trend = classifyTrend(swings, analysisBars);
  const trends = trendSeries(swings, analysisBars);
  const volumeFeatures = computeVolumeFeatures(bars, params.volume.lookback);
  const zones = buildPriceActionZones(analysisBars, analysisFeatures, swings, {
    atrTolerance: params.zone.atrTolerance,
    minTouches: params.zone.minTouches,
    maxAgeBars: params.zone.maxAgeBars,
    rejectionCloseLoc: params.zone.rejectionCloseLoc,
    limitPct: context.limitPct,
    customTickSize,
  });
  const setups = buildSetups(analysisBars, analysisFeatures, volumeFeatures.slice(0, analysisBars.length), patterns, zones, swings, trends, {
    limitPct: context.limitPct,
    maxAgeBars: params.setup.maxAgeBars,
    breakoutBufferTicks: params.setup.breakoutBufferTicks,
    minRewardRisk: params.setup.minRewardRisk,
    breakoutRvol: params.volume.breakoutRvol,
    trendRatioMin: params.volume.trendRatioMin,
    customTickSize,
  });

  const visibleIndex = analysisBars.length - 1;
  const visiblePatterns = patterns.filter((pattern) => pattern.confirmedIndex <= visibleIndex);
  const visibleZones = zones.filter((zone) => zone.confirmedIndex <= visibleIndex);
  const visibleSetups = setups.filter((setup) => setup.confirmedIndex <= visibleIndex);
  const warnings: string[] = [];
  if (!customTickSize) warnings.push("Chưa cấu hình tick size theo thị trường; các buffer theo tick bằng 0");
  if (!closed && bars.length > 0) warnings.push("Bar cuối chưa đóng: không phát pattern hoặc setup xác nhận trên bar này");
  if (analysisBars.length < params.atrPeriod) warnings.push(`Chưa đủ ${params.atrPeriod} bar để tính ATR; feature ATR-dependent là null`);
  if (analysisBars.length < params.swing.left + params.swing.right + 1) warnings.push("Chưa đủ dữ liệu để xác nhận pivot theo cấu hình swing");

  const activeZones = visibleZones.filter((zone) => zone.state === "active" || zone.state === "flipped").length;
  const formingSetups = visibleSetups.filter((setup) => setup.state === "forming").length;
  const triggeredSetups = visibleSetups.filter((setup) => setup.state === "triggered").length;
  const enough = analysisBars.length > 0 && analysisBars.length >= params.swing.left + params.swing.right + 1;
  return {
    status: enough ? "ready" : "insufficient",
    engineVersion: PRICE_ACTION_ENGINE_VERSION,
    paramsHash,
    context: safeContext,
    candleFeatures: features,
    volumeFeatures,
    patterns: visiblePatterns,
    swings: swings.filter((swing) => swing.confirmedIndex <= visibleIndex),
    trend,
    zones: visibleZones,
    setups: visibleSetups,
    latestSummary: visibleIndex >= 0 ? {
      trend: trend.state,
      latestPatterns: visiblePatterns.filter((pattern) => pattern.confirmedIndex === visibleIndex).map((pattern) => pattern.id),
      activeZones,
      formingSetups,
      triggeredSetups,
    } : null,
    warnings,
    errors: [],
  };
}
