// historicalDataProvider.js — Nguồn dữ liệu nến lịch sử cho patternBacktest.js.
//
// NGUYÊN TẮC AN TOÀN (Giai đoạn 1): khi USE_MOCK_DATA=false, hệ thống KHÔNG
// BAO GIỜ được âm thầm rơi về generateMockHistoricalCandles(). Nếu chưa cấu
// hình nguồn thật, phải báo lỗi rõ ràng để người vận hành biết và sửa cấu
// hình — thà "không chạy" còn hơn "chạy nhưng trả số liệu giả dưới danh
// nghĩa dữ liệu thật".
//
// ĐÃ SỬA: Project A (quant-macro-scanner) khi deploy lên Vercel có bật
// Deployment Protection — mọi request không kèm đúng header
// `x-vercel-protection-bypass` sẽ bị chặn, trả về trang HTML đăng nhập
// Vercel thay vì JSON thật (đã tự gặp lỗi này khi test). Thêm header này
// khi INTERNAL_HISTORICAL_API_BYPASS_SECRET được cấu hình.

import { generateMockHistoricalCandles } from "./patternBacktest.js";

export class HistoricalDataConfigError extends Error {}

const USE_MOCK_DATA = String(process.env.USE_MOCK_DATA).toLowerCase() === "true";
// "market_service" (SSI primary, chạy trong tiến trình Express) | "market_gateway"
// (gọi HTTP tới Market Gateway — dùng cho bản Vercel serverless) |
// "internal_api" (Project A, nguồn cũ) | "" (chưa cấu hình).
const SOURCE = process.env.HISTORICAL_DATA_SOURCE || "";
// Đường dẫn để trong biến: bản Vercel (api/_lib re-export file này) không đóng gói
// runtime backend (ws, @ssi.developer/ssi-sdk chỉ cài trong backend/).
const MARKET_RUNTIME_MODULE = "../market/runtime.js";
const MARKET_GATEWAY_URL = (process.env.MARKET_GATEWAY_URL || "").replace(/\/+$/, "");
const INTERNAL_API_BASE = process.env.INTERNAL_HISTORICAL_API_BASE || "";
// Bắt buộc nếu Project A đang bật Vercel Deployment Protection (trường hợp
// gọi vào domain *.vercel.app đã deploy thật). Nếu Project A chạy local
// (npm run dev, không qua Vercel) hoặc đã tắt Protection, để trống là được.
const INTERNAL_API_BYPASS_SECRET = process.env.INTERNAL_HISTORICAL_API_BYPASS_SECRET || "";
const MIN_BARS_FOR_BACKTEST = 250; // ~1 năm daily — dưới mức này backtest không có ý nghĩa thống kê

/**
 * @param {string} symbol
 * @param {{ timeframe?: string, minBars?: number }} opts
 * @returns {Promise<{ candles: Array, isMock: boolean, source: string }>}
 */
export async function fetchHistoricalCandles(symbol, opts = {}) {
  const minBars = opts.minBars ?? MIN_BARS_FOR_BACKTEST;

  if (USE_MOCK_DATA) {
    return {
      candles: generateMockHistoricalCandles(Math.max(500, minBars)),
      isMock: true,
      source: "mock",
    };
  }

  if (SOURCE === "market_service" || SOURCE === "market_gateway") {
    const timeframe = opts.timeframe || "D";
    if (!["D", "1D"].includes(String(timeframe).toUpperCase())) {
      throw new HistoricalDataConfigError(`Nguồn ${SOURCE} hiện chỉ hỗ trợ khung ngày (timeframe=D), nhận ${timeframe}.`);
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
        `Chỉ nhận được ${candles.length} nến cho ${symbol} (nguồn ${body.provenance?.source ?? "?"}), cần tối thiểu ${minBars} nến.`
      );
    }
    return { candles, isMock: false, source: `market:${body.provenance?.source ?? "unknown"}` };
  }

  if (SOURCE === "internal_api") {
    if (!INTERNAL_API_BASE) {
      throw new HistoricalDataConfigError(
        "HISTORICAL_DATA_SOURCE=internal_api nhưng thiếu INTERNAL_HISTORICAL_API_BASE trong .env."
      );
    }
    const candles = await fetchFromInternalApi(symbol, opts, INTERNAL_API_BASE);
    if (candles.length < minBars) {
      throw new HistoricalDataConfigError(
        `Chỉ nhận được ${candles.length} nến cho ${symbol}, cần tối thiểu ${minBars} nến để backtest có ý nghĩa thống kê. ` +
          `Kiểm tra tham số giới hạn số nến ở API nguồn.`
      );
    }
    return { candles, isMock: false, source: "internal_api" };
  }

  throw new HistoricalDataConfigError(
    "USE_MOCK_DATA=false nhưng chưa cấu hình HISTORICAL_DATA_SOURCE hợp lệ. " +
      "Đặt HISTORICAL_DATA_SOURCE=market_service (SSI, khuyến nghị), market_gateway (kèm MARKET_GATEWAY_URL) " +
      "hoặc internal_api (kèm INTERNAL_HISTORICAL_API_BASE) trong .env, " +
      "hoặc đặt USE_MOCK_DATA=true để chạy demo (KHÔNG dùng cho quyết định thật)."
  );
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

async function fetchFromInternalApi(symbol, opts, baseUrl) {
  const timeframe = opts.timeframe || "D";
  const url = `${baseUrl}/api/ta-vn-index/analyze?ticker=${encodeURIComponent(symbol)}&timeframe=${encodeURIComponent(timeframe)}`;

  const headers = {};
  if (INTERNAL_API_BYPASS_SECRET) {
    headers["x-vercel-protection-bypass"] = INTERNAL_API_BYPASS_SECRET;
  }

  // Retry CHỈ ở bước gọi mạng thật (fetch) — không retry lỗi cấu hình/logic
  // phía trên (HistoricalDataConfigError), vì retry lại y hệt lỗi đó vô
  // nghĩa. Đã tự gặp thật: ConnectTimeoutError thoáng qua khi gọi Vercel
  // edge network, thử thủ công lần 2 thì qua ngay — đây là hiccup mạng
  // ngắn hạn, retry với backoff nhỏ là đủ, không cần retry nhiều lần.
  let res;
  let lastNetworkErr;
  for (let attempt = 0; attempt <= 2; attempt++) {
    try {
      res = await fetch(url, { headers });
      lastNetworkErr = null;
      break;
    } catch (networkErr) {
      lastNetworkErr = networkErr;
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 800 * 2 ** attempt));
      }
    }
  }
  if (lastNetworkErr) {
    throw new HistoricalDataConfigError(
      `Không kết nối được tới ${url} sau 3 lần thử: ${lastNetworkErr.message}`
    );
  }

  if (!res.ok) {
    throw new HistoricalDataConfigError(`Gọi ${url} thất bại: HTTP ${res.status}`);
  }

  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    // Dấu hiệu bị Vercel Deployment Protection chặn (trả về trang HTML đăng
    // nhập thay vì JSON) — báo lỗi rõ ràng thay vì để JSON.parse ném lỗi
    // mơ hồ "Unexpected token '<'".
    throw new HistoricalDataConfigError(
      `Response từ ${url} không phải JSON (Content-Type: ${contentType}). ` +
        `Nhiều khả năng bị Vercel Deployment Protection chặn — kiểm tra INTERNAL_HISTORICAL_API_BYPASS_SECRET.`
    );
  }

  const body = await res.json();
  const priceSeries = body.priceSeries;
  if (!Array.isArray(priceSeries)) {
    throw new HistoricalDataConfigError(`Response từ ${url} không có priceSeries hợp lệ.`);
  }

  if (body.isMock === true) {
    throw new HistoricalDataConfigError(
      `Project A (${url}) trả về isMock:true — chưa có dữ liệu lịch sử thật để backtest. ` +
        `Chờ đội phát triển Project A nối dữ liệu giá thật trước khi dùng nguồn này.`
    );
  }

  return priceSeries.map((bar) => ({
    time: bar.date ?? bar.time,
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
    volume: bar.volume,
  }));
}
