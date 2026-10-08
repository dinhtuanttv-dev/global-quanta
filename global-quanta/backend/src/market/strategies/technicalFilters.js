// Bộ lọc kỹ thuật độc lập của tab TA VN-Index (CAMSLIM Cup & Handle, Base Breakout) — Screener Engine v2 / S1.
//
// Dữ liệu (S1):
//   - Chuỗi giá ĐIỀU CHỈNH CỘNG DỒN ~3 năm, cùng cơ sở giá với /api/market/ta-series, đọc kho, không gọi SSI
//     (screenerSeries.js). market_daily chỉ có từ 2025-09 và close_adj chỉ phản ánh đợt quyền gần nhất của SSI.
//   - Ngưỡng theo VND: giá ≥ 5.000đ, GTGD bình quân 20 phiên ≥ 5 tỷ (áp chung trước khi chạy chiến lược;
//     các ngưỡng giá/thanh khoản trong preset gốc của chiến lược tính theo đơn vị khác nên đặt về 0).
//   - Quét một lần sau ATC (job scanStrategies) và lưu KV `strategies:<id>`; API đọc KV.

import { createRequire } from "node:module";
import { mapLimit } from "../util.js";

const require = createRequire(import.meta.url);
const CamSlim = require("./camSlim.cjs");
import { buildEvidence, marketContext, scanBaseBreakoutV2 } from "./baseBreakoutV2.js";

export const STRATEGY_IDS = Object.freeze(["camslim", "base-breakout"]);
/** Số phiên tối thiểu: MA200 + đỉnh 250 phiên của CAMSLIM. */
export const STRATEGY_MIN_BARS = 260;
export const STRATEGY_RANGE = "3y";
export const strategyKvKey = (strategy) => `strategies:${strategy}`;

const DISCLAIMER = "Bộ lọc kỹ thuật để tham khảo, không phải khuyến nghị đầu tư.";
const LIQUIDITY_SESSIONS = 20;

export function screenerCriteria(env = process.env) {
  const num = (v, d) => (v !== "" && v != null && Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : d);
  return {
    minPrice: num(env.SCREENER_MIN_PRICE, 5_000),
    minAvgValue20: num(env.SCREENER_MIN_AVG_VALUE, 5_000_000_000),
    range: STRATEGY_RANGE,
    priceBasis: "ADJUSTED_CUMULATIVE",
  };
}

// Ngưỡng của preset gốc tính theo đơn vị giá/khối lượng khác VN -> tắt, dùng cổng thanh khoản VND chung.
const CAMSLIM_OPTIONS = Object.freeze({ minPrice: 0, minAvgVol: 0, minDollarVol: 0 });

function failure(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

/**
 * Cổng giá + thanh khoản theo VND. Giá phiên cuối của chuỗi điều chỉnh lùi = giá danh nghĩa;
 * GTGD ưu tiên `value` (VND danh nghĩa của sàn), thiếu thì close × volume.
 */
export function liquidityGate(bars, criteria) {
  const last = bars.at(-1);
  const tail = bars.slice(-LIQUIDITY_SESSIONS);
  const values = tail.map((b) => (Number(b.value) > 0 ? Number(b.value) : Number(b.close) * Number(b.volume))).filter(Number.isFinite);
  const avgValue20 = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  const price = Number(last?.close) || 0;
  const reason = price < criteria.minPrice ? "LOW_PRICE" : avgValue20 < criteria.minAvgValue20 ? "ILLIQUID" : null;
  return { ok: !reason, reason, price, avgValue20: Math.round(avgValue20) };
}

/** Ngày dữ liệu chung = ngày cuối phổ biến nhất (mã tạm ngừng giao dịch có ngày cuối cũ hơn). */
function commonLastDate(seriesList) {
  const count = new Map();
  for (const s of seriesList) {
    const d = s.bars.at(-1)?.date;
    if (d) count.set(d, (count.get(d) ?? 0) + 1);
  }
  let best = null;
  for (const [d, n] of count) if (!best || n > best[1] || (n === best[1] && d > best[0])) best = [d, n];
  return best?.[0] ?? null;
}

function runStrategy(strategy, bars, ctx) {
  if (strategy === "camslim") {
    const r = CamSlim.scanSymbol(bars, CAMSLIM_OPTIONS);
    return r.status ? { status: r.status, date: r.date, metrics: r.metrics, checks: r.checks } : null;
  }
  const r = scanBaseBreakoutV2(bars, ctx);
  return r.status ? { status: r.status, grade: r.grade, date: r.date, metrics: r.metrics, checks: r.checks, components: r.components, plan: r.plan } : null;
}

function compareResults(strategy, a, b) {
  return Number(b.status === "BREAKOUT") - Number(a.status === "BREAKOUT") || b.metrics.score - a.metrics.score;
}

/**
 * Chạy các bộ lọc trên universe với MỘT lần tải dữ liệu.
 * @param service       { store }
 * @param seriesSource  { prepare(symbols) => Promise<loadSeries> } — trong runtime là screenerSeries (chỉ đọc kho)
 * @param loadSeries    hoặc truyền thẳng (symbol) => Promise<{ bars, priceBasis }>
 * @returns {Record<strategy, doc>}
 */
export async function runTechnicalFilters(service, { seriesSource, loadSeries, strategies = STRATEGY_IDS, concurrency = 6, criteria = screenerCriteria(), withEvidence = true, now = Date.now } = {}) {
  for (const s of strategies) if (!STRATEGY_IDS.includes(s)) throw failure(404, `Chiến lược không hợp lệ: ${s}.`);
  if (typeof loadSeries !== "function" && typeof seriesSource?.prepare !== "function") throw failure(503, "Chưa cấu hình nguồn chuỗi giá điều chỉnh.");

  const universe = (await service.store.getKv("scanner:universe"))?.value?.tickers ?? [];
  if (!universe.length) throw failure(503, "Chưa có universe để quét (hãy chạy buildUniverse).");
  loadSeries ??= await seriesSource.prepare(universe.map((item) => item.ticker));

  const skipped = [];
  const loaded = (await mapLimit(universe, concurrency, async (item) => {
    try {
      const series = await loadSeries(item.ticker);
      const bars = (series?.bars ?? []).filter((b) => !b.partial && b.open > 0 && b.high > 0 && b.low > 0 && b.close > 0)
        .map((b) => ({ ...b, high: Math.max(b.high, b.open, b.close), low: Math.min(b.low, b.open, b.close) }));
      return { item, bars, priceBasis: series?.priceBasis ?? "UNKNOWN" };
    } catch (error) {
      skipped.push({ ticker: item.ticker, reason: "LOAD_FAILED", message: error instanceof Error ? error.message : String(error) });
      return null;
    }
  })).filter(Boolean);

  const dataAsOf = commonLastDate(loaded);
  let market = { marketUp: () => null, lastDate: null };
  try { if (typeof loadSeries.index === "function") market = marketContext(await loadSeries.index()); } catch { /* thiếu VN-Index -> M = null */ }
  if (!dataAsOf) throw failure(503, "Chưa tải được chuỗi giá của mã nào trong universe.");

  const eligible = [];
  const priceBasis = {};
  for (const s of loaded) {
    const { item, bars } = s;
    priceBasis[s.priceBasis] = (priceBasis[s.priceBasis] ?? 0) + 1;
    if (bars.length < STRATEGY_MIN_BARS) { skipped.push({ ticker: item.ticker, reason: "INSUFFICIENT_BARS", bars: bars.length }); continue; }
    if (bars.at(-1).date !== dataAsOf) { skipped.push({ ticker: item.ticker, reason: "STALE", lastDate: bars.at(-1).date }); continue; }
    const gate = liquidityGate(bars, criteria);
    if (!gate.ok) { skipped.push({ ticker: item.ticker, reason: gate.reason, price: gate.price, avgValue20: gate.avgValue20 }); continue; }
    eligible.push({ ...s, gate });
  }

  const generatedAt = new Date(now()).toISOString();
  const out = {};
  for (const strategy of strategies) {
    const results = [];
    const errors = [];
    for (const { item, bars, gate, priceBasis: basis } of eligible) {
      try {
        const r = runStrategy(strategy, bars, market);
        if (r) {
          results.push({
            ticker: item.ticker, name: item.name ?? null, sector: item.sector ?? null, ...r,
            liquidity: { price: gate.price, avgValue20: gate.avgValue20 }, priceBasis: basis, bars: bars.length,
          });
        }
      } catch (error) {
        errors.push({ ticker: item.ticker, reason: "INVALID_DATA", message: error instanceof Error ? error.message : String(error) });
      }
    }
    results.sort((a, b) => compareResults(strategy, a, b));
    // Bằng chứng lịch sử (S2: Base Breakout) — mọi mã đã tải, cổng thanh khoản áp TẠI từng thời điểm (tránh thiên lệch sống sót).
    const evidence = strategy === "base-breakout" && withEvidence
      ? buildEvidence(loaded.map((s) => s.bars), { minAvgValue20: criteria.minAvgValue20, ctx: market })
      : null;
    out[strategy] = {
      strategy,
      engine: strategy === "base-breakout" ? "screener-v2/S2" : "screener-v2/S1",
      ...(evidence ? { evidence } : {}),
      ...(strategy === "base-breakout" ? { market: { indexAsOf: market.lastDate, up: market.marketUp(dataAsOf), rule: "VN-Index đóng cửa trên MA20" } } : {}),
      generatedAt,
      dataAsOf,
      source: "SSI Market Gateway · giá điều chỉnh cộng dồn",
      criteria,
      priceBasis,
      universeCount: universe.length,
      scannedCount: eligible.length - errors.length,
      resultCount: results.length,
      results,
      skipped: [...skipped, ...errors].sort((a, b) => a.ticker.localeCompare(b.ticker)),
      disclaimer: DISCLAIMER,
    };
  }
  return out;
}

export async function runTechnicalFilter(service, strategy, options = {}) {
  if (!STRATEGY_IDS.includes(strategy)) throw failure(404, `Chiến lược không hợp lệ: ${strategy}.`);
  return (await runTechnicalFilters(service, { ...options, strategies: [strategy] }))[strategy];
}
