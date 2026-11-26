import { analyzePriceAction, PATTERN_VI, PRICE_ACTION_ENGINE_VERSION, summarizeBuy, type Bar } from "../price-action/index";
import type { PriceActionEvidence, TimelinePriceEvidence } from "./snapshot";

export type PriceBars = (Omit<Bar, "close"> & { close?: number | null; partial?: boolean })[];
type Venue = "HOSE" | "HNX" | "UPCOM";
export type ResearchInstrument = { ticker: string; exchange?: string | null; name?: string | null };
const INDICES = new Set(["VNINDEX", "VN30", "HNXINDEX", "HNX30", "UPCOMINDEX", "VN100"]);
const marketClock = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

function venueOf(exchange: string | null | undefined): Venue | null {
  const value = (exchange ?? "").trim().toUpperCase().replace(/[^A-Z]/g, "");
  if (value === "HOSE" || value === "HSX") return "HOSE";
  if (value === "HNX") return "HNX";
  return value === "UPCOM" || value === "UPCO" ? "UPCOM" : null;
}

function isClosedBar(date: string, observedAt: string) {
  const observation = new Date(observedAt);
  if (!Number.isFinite(observation.getTime())) return false;
  const parts = Object.fromEntries(marketClock.formatToParts(observation).map(({ type, value }) => [type, value]));
  const dateObserved = `${parts.year}-${parts.month}-${parts.day}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && (date < dateObserved || date === dateObserved && Number(parts.hour) * 60 + Number(parts.minute) >= 915);
}

export function closedResearchChart(bars: PriceBars, priceBasis: string | null, warnings: string[], observedAt: string): TimelinePriceEvidence | null {
  if (!priceBasis || !bars.length) return null;
  return { priceBasis, warnings, bars: bars.slice(-31).flatMap(({ date, close, partial }) =>
    !partial && typeof close === "number" && Number.isFinite(close) && close > 0 && isClosedBar(date, observedAt) ? [{ date, close }] : []).slice(-30) };
}

export function observeResearchPrice({
  ticker, rawBars, priceBasis, instrument, observedAt, loading = false, priceError = null, instrumentError = null,
  warnings = [], repairDates = [],
}: {
  ticker: string; rawBars: PriceBars; priceBasis: string | null; instrument: ResearchInstrument | null; observedAt: string;
  loading?: boolean; priceError?: string | null; instrumentError?: string | null; warnings?: string[]; repairDates?: string[];
}) {
  const isIndex = INDICES.has(ticker);
  const venue = venueOf(instrument?.exchange);
  const bars = rawBars.filter((bar): bar is Bar & { partial?: boolean } => [bar.open, bar.high, bar.low, bar.close, bar.volume].every((value) => value !== null && Number.isFinite(value))
    && typeof bar.close === "number" && bar.low > 0 && bar.volume >= 0 && bar.low <= Math.min(bar.open, bar.close) && bar.high >= Math.max(bar.open, bar.close));
  const lastBar = bars[bars.length - 1];
  const closed = Boolean(lastBar && !lastBar.partial && isClosedBar(lastBar.date, observedAt));
  const result = lastBar && !isIndex ? analyzePriceAction(bars, {
    symbol: ticker, timeframe: "D", priceBasis: priceBasis ?? "unknown",
    source: "Market Gateway /api/market/ta-series", asOf: lastBar.date, isIndex: false,
    limitPct: venue === "HOSE" ? .07 : venue === "HNX" ? .10 : venue === "UPCOM" ? .15 : null,
    isClosed: closed,
    ...(venue ? { tickSize: (price: number) => venue === "HOSE" ? price < 10_000 ? 10 : price < 50_000 ? 50 : 100 : 100 } : {}),
  }) : null;
  const latestDate = result?.trend.asOfDate ?? lastBar?.date ?? null;
  const buy = summarizeBuy(result);
  const triggered = buy.triggeredToday, pending = buy.pending, setup = buy.setup;
  const firstInWindow = bars[Math.max(0, bars.length - 60)]?.date;
  const repairInWindow = Boolean(firstInWindow && lastBar && repairDates.some((date) => date >= firstInWindow && date <= lastBar.date));
  const basisTrusted = Boolean(priceBasis && !/unknown|unadjusted/i.test(priceBasis));
  const confirmed = Boolean(buy.confirmed && venue && closed && basisTrusted && !priceError && !instrumentError && !repairInWindow);
  const status: PriceActionEvidence["state"] = isIndex ? "NOT_APPLICABLE" : loading ? "LOADING" :
    !result || result.status !== "ready" || priceError || instrumentError || !basisTrusted ? "INSUFFICIENT" :
      confirmed ? "TRIGGERED" : triggered ? "INSUFFICIENT" : pending ? "FORMING" :
        result.setups.some((item) => item.direction === "bullish" && item.state === "invalidated") ? "INVALIDATED" :
          result.setups.some((item) => item.direction === "bullish" && item.state === "expired") ? "EXPIRED" : "UNKNOWN";
  const evidence: PriceActionEvidence = {
    ticker, state: status, trend: result?.trend.state ?? null, asOf: latestDate, priceBasis, venue, barClosed: lastBar ? closed : null, confirmed,
    setup: setup ? { id: setup.id, kind: setup.kind, stateDate: setup.stateDate, entryReference: setup.entryReference, invalidationLevel: setup.invalidationLevel, target: setup.targetReferences[0]?.price ?? null,
      patternId: setup.patternId, state: setup.state, rewardRisk: setup.rewardRisk, rewardRiskOk: setup.rewardRiskOk, volume: setup.volume } : null,
    patterns: result?.patterns.filter((pattern) => pattern.confirmedDate === latestDate && pattern.role !== "context").map((pattern) => PATTERN_VI[pattern.id]).slice(0, 3) ?? [],
    blockers: [
      !venue ? "Chưa xác định sàn và bước giá." : null, !basisTrusted ? "Chưa có cơ sở giá đã điều chỉnh phù hợp." : null,
      lastBar && !closed ? "Nến ngày cuối chưa đóng." : null, repairInWindow ? "Có nến hiệu chỉnh trong cửa sổ 60 phiên gần nhất." : null,
      priceError ? "Không tải được chuỗi giá." : null, instrumentError ? "Không xác minh được mã qua danh sách thị trường." : null,
    ].filter((value): value is string => Boolean(value)),
    source: "Market Gateway /api/market/ta-series", methodVersion: PRICE_ACTION_ENGINE_VERSION,
    loading, error: priceError ?? instrumentError, tickerVerified: Boolean(instrument), instrumentName: instrument?.name ?? null,
    qualityWarnings: warnings.slice(0, 8),
  };
  return { evidence, result, setup, isIndex };
}
