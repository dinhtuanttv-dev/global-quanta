// historicalDataProvider.js — Nguồn dữ liệu nến lịch sử cho /api/scan (patternBacktest, chỉ báo, AI Vision).
//
// NGUYÊN TẮC: chỉ nến THẬT. Không có nhánh dữ liệu giả, không gọi Project A (endpoint /api/ta-vn-index/analyze đã 404).
// Thiếu cấu hình hoặc thiếu nến -> HistoricalDataConfigError, route trả 503 kèm lý do; không bao giờ lấp bằng số sinh ra.
//   HISTORICAL_DATA_SOURCE = "market_service" (trong tiến trình Gateway) | "market_gateway" (gọi HTTP tới Gateway, bản Vercel).

export class HistoricalDataConfigError extends Error {}

const SOURCE = process.env.HISTORICAL_DATA_SOURCE || "";
// Đường dẫn để trong biến: bản Vercel (api/_lib re-export file này) không đóng gói
// runtime backend (ws, @ssi.developer/ssi-sdk chỉ cài trong backend/).
const MARKET_RUNTIME_MODULE = "../market/runtime.js";
const MARKET_GATEWAY_URL = (process.env.MARKET_GATEWAY_URL || "").replace(/\/+$/, "");
const MIN_BARS_FOR_BACKTEST = 250; // ~1 năm daily — dưới mức này backtest không có ý nghĩa thống kê
const DAILY_ALIASES = new Set(["D", "1D", "DAILY", "DAY"]);

/** Chuẩn hoá tên khung: "daily", "1d", "D" -> "D". Khung khác trả null (nguồn hiện chỉ có nến ngày). */
export function normalizeTimeframe(timeframe) {
  const t = String(timeframe ?? "D").trim().toUpperCase();
  return DAILY_ALIASES.has(t) ? "D" : null;
}

/**
 * @param {string} symbol
 * @param {{ timeframe?: string, minBars?: number }} opts
 * @returns {Promise<{ candles: Array, isMock: false, source: string }>}
 */
export async function fetchHistoricalCandles(symbol, opts = {}) {
  const minBars = opts.minBars ?? MIN_BARS_FOR_BACKTEST;
  if (SOURCE !== "market_service" && SOURCE !== "market_gateway") {
    throw new HistoricalDataConfigError(
      "Chưa cấu hình HISTORICAL_DATA_SOURCE hợp lệ. Đặt market_service (trong Gateway) hoặc market_gateway (kèm MARKET_GATEWAY_URL).",
    );
  }
  if (!normalizeTimeframe(opts.timeframe)) {
    throw new HistoricalDataConfigError(`Nguồn ${SOURCE} hiện chỉ có nến ngày (daily / D), nhận ${opts.timeframe}.`);
  }
  // Lấy dư nến để đủ warm-up cho chỉ báo; giá đã điều chỉnh cổ tức để backtest không bị gãy giá.
  const params = { symbol, limit: String(Math.max(minBars + 50, 500)), adjusted: "true" };
  const body = SOURCE === "market_service"
    ? await (await import(MARKET_RUNTIME_MODULE)).getMarketRuntime().service.getOhlcv(params)
    : await fetchFromMarketGateway(params);
  const candles = (body.bars || []).filter((bar) => !bar.partial).map((bar) => ({
    time: bar.date, open: bar.open, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume,
  }));
  if (candles.length < minBars) {
    throw new HistoricalDataConfigError(
      `Chỉ nhận được ${candles.length} nến cho ${symbol} (nguồn ${body.provenance?.source ?? "?"}), cần tối thiểu ${minBars} nến.`,
    );
  }
  return { candles, isMock: false, source: `market:${body.provenance?.source ?? "unknown"}` };
}

async function fetchFromMarketGateway(params) {
  if (!MARKET_GATEWAY_URL) {
    throw new HistoricalDataConfigError("HISTORICAL_DATA_SOURCE=market_gateway nhưng thiếu MARKET_GATEWAY_URL.");
  }
  const url = `${MARKET_GATEWAY_URL}/api/market/ohlcv?${new URLSearchParams(params)}`;
  let res;
  try {
    res = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
  } catch (networkErr) {
    throw new HistoricalDataConfigError(`Không kết nối được Market Gateway: ${networkErr.message}`);
  }
  if (!res.ok) throw new HistoricalDataConfigError(`Market Gateway trả HTTP ${res.status} cho ${params.symbol}.`);
  return res.json();
}
