import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const CamSlim = require("./camSlim.cjs");
const BaseBreakout = require("./baseBreakout.cjs");

export const STRATEGY_IDS = Object.freeze(["camslim", "base-breakout"]);
export const STRATEGY_HISTORY_SESSIONS = 260;

const DISCLAIMER = "Bộ lọc kỹ thuật để tham khảo, không phải khuyến nghị đầu tư.";

function failure(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function toAdjustedBars(rows) {
  return rows.map((row) => {
    const nominalClose = Number(row.close);
    const adjustedClose = Number(row.closeAdj);
    const factor = nominalClose > 0 && adjustedClose > 0 ? adjustedClose / nominalClose : 1;
    return {
      date: row.date,
      open: Number(row.open) * factor,
      high: Number(row.high) * factor,
      low: Number(row.low) * factor,
      close: nominalClose * factor,
      volume: Number(row.volume),
    };
  });
}

function groupRows(rows) {
  const bySymbol = new Map();
  for (const row of rows) {
    if (!bySymbol.has(row.symbol)) bySymbol.set(row.symbol, []);
    bySymbol.get(row.symbol).push(row);
  }
  return bySymbol;
}

function compareResults(strategy, a, b) {
  if (strategy === "camslim") {
    return Number(b.status === "BREAKOUT") - Number(a.status === "BREAKOUT") ||
      b.metrics.score - a.metrics.score;
  }
  return b.metrics.score - a.metrics.score;
}

/**
 * Run either standalone technical screener against the Gateway's stored,
 * adjusted daily bars. No external requests are made by the strategy engine.
 */
export async function runTechnicalFilter(service, strategy) {
  if (!STRATEGY_IDS.includes(strategy)) {
    throw failure(404, `Chiến lược không hợp lệ: ${strategy}.`);
  }

  const [universeKv, storedDates] = await Promise.all([
    service.store.getKv("scanner:universe"),
    service.store.getMarketDailyDates(),
  ]);
  const universe = universeKv?.value?.tickers ?? [];
  if (!universe.length) throw failure(503, "Chưa có universe để quét (hãy chạy buildUniverse).");
  if (!storedDates.length) throw failure(503, "Chưa có dữ liệu thị trường ngày để quét.");

  const dates = storedDates.slice(-STRATEGY_HISTORY_SESSIONS);
  const dataAsOf = dates[dates.length - 1];
  const rows = await service.store.getMarketDailyRange({
    from: dates[0],
    to: dataAsOf,
    symbols: universe.map((item) => item.ticker),
  });
  const bySymbol = groupRows(rows);
  const results = [];
  const skipped = [];
  let scannedCount = 0;

  for (const item of universe) {
    const sourceBars = bySymbol.get(item.ticker) ?? [];
    if (sourceBars.length < STRATEGY_HISTORY_SESSIONS) {
      skipped.push({ ticker: item.ticker, reason: "INSUFFICIENT_BARS", bars: sourceBars.length });
      continue;
    }
    const bars = toAdjustedBars(sourceBars);
    scannedCount++;

    try {
      if (strategy === "camslim") {
        const result = CamSlim.scanSymbol(bars);
        if (!result.status) continue;
        results.push({
          ticker: item.ticker,
          status: result.status,
          date: result.date,
          metrics: result.metrics,
          checks: result.checks,
        });
      } else {
        const result = BaseBreakout.scanSymbol(bars, {
          // Vietnamese equities are stored in VND, not the 1–7 price units
          // assumed by the source AFL preset.
          minPrice: 0,
          maxPrice: 0,
        });
        if (!result.ok) continue;
        results.push({
          ticker: item.ticker,
          status: "BREAKOUT",
          date: result.date,
          metrics: result.metrics,
          checks: result.checks,
        });
      }
    } catch (error) {
      skipped.push({
        ticker: item.ticker,
        reason: "INVALID_DATA",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  results.sort((a, b) => compareResults(strategy, a, b));
  return {
    strategy,
    generatedAt: new Date().toISOString(),
    dataAsOf,
    source: "SSI Market Gateway",
    universeCount: universe.length,
    scannedCount,
    resultCount: results.length,
    results,
    skipped,
    disclaimer: DISCLAIMER,
  };
}
