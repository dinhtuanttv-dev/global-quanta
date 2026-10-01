// Adapter SSI API mới (api.ssi.com.vn) qua SDK chính thức @ssi.developer/ssi-sdk.
// Chỉ dùng phần dữ liệu thị trường (không cần OTP). Tự tắt khi chưa có
// SSI_V3_API_KEY / SSI_V3_API_SECRET, nên không ảnh hưởng hệ thống hiện tại.

import { UnsupportedError } from "../errors.js";
import {
  canonicalSymbol, normalizeBars, normalizeIndexSnapshot, normalizePriceLimit, normalizeQuote,
  normalizeSecurity, ssiV2IndexId, toSsiV3Date,
} from "../normalizer.js";
import { vnDate } from "../calendar.js";
import { mapLimit } from "../util.js";

const PAGE_SIZE = 1000;
const BOARDS = ["HOSE", "HNX", "UPCOM"];

function credentials() {
  return {
    apiKey: process.env.SSI_V3_API_KEY || "",
    apiSecret: process.env.SSI_V3_API_SECRET || "",
  };
}

export function createSsiV3Provider({ loadSdk = () => import("@ssi.developer/ssi-sdk") } = {}) {
  let clientPromise;

  async function client() {
    if (!clientPromise) {
      clientPromise = (async () => {
        const sdk = await loadSdk();
        const options = {
          ...credentials(),
          timeout: Number(process.env.SSI_V3_TIMEOUT_MS) || 10_000,
          // Retry ở tầng SDK giữ thấp: tầng SourceRouter đã có fallback + circuit breaker.
          maxRetries: Number(process.env.SSI_V3_MAX_RETRIES) || 1,
          retryDelay: 1_000,
          rateLimitPerSecond: Number(process.env.SSI_V3_RATE_LIMIT_PER_SECOND) || 10,
        };
        if (process.env.SSI_V3_API_URL) options.apiUrl = process.env.SSI_V3_API_URL;
        const auth = new sdk.Auth(options);
        await auth.authenticate(); // dữ liệu thị trường không cần OTP
        return { auth, market: new sdk.Data(auth).marketData };
      })().catch((error) => {
        clientPromise = undefined; // cho phép thử lại ở lần gọi sau
        throw error;
      });
    }
    const c = await clientPromise;
    if (c.auth.tokenManager?.isTokenExpired?.()) {
      try {
        await c.auth.refresh();
      } catch {
        await c.auth.authenticate();
      }
    }
    return c.market;
  }

  async function withMarket(fn) {
    const market = await client();
    try {
      return await fn(market);
    } catch (error) {
      if (error?.name === "AuthenticationError") {
        clientPromise = undefined;
        return fn(await client());
      }
      throw error;
    }
  }

  async function pagedOhlc(method, symbol, from, to) {
    const rows = [];
    for (let page = 1; page <= 50; page++) {
      const data = await withMarket((m) => m[method](symbol, `${toSsiV3Date(from)} 00:00:00`, `${toSsiV3Date(to)} 23:59:59`, page, PAGE_SIZE));
      const list = Array.isArray(data) ? data : [];
      rows.push(...list);
      if (list.length < PAGE_SIZE) break;
    }
    return rows;
  }

  return {
    name: "ssiV3",
    source: "SSI_V3",
    isConfigured: () => Boolean(credentials().apiKey && credentials().apiSecret),

    async getSecurities({ exchange } = {}) {
      const boards = exchange ? [exchange.toUpperCase()] : BOARDS;
      const lists = await mapLimit(boards, 2, (board) => withMarket((m) => m.getSecuritiesInfoByBoard(board)));
      return lists.flat().map(normalizeSecurity).filter(Boolean);
    },

    async getIndexComponents(indexCode) {
      const list = await withMarket((m) => m.getSecuritiesInfoByIndex(ssiV2IndexId(indexCode)));
      return [...new Set((list || []).map((s) => canonicalSymbol(s.symbol)).filter(Boolean))];
    },

    async getDailyOhlcv(symbol, from, to) {
      return normalizeBars(await pagedOhlc("getOhlc1DayHistorical", canonicalSymbol(symbol), from, to));
    },

    async getIntradayOhlcv(symbol, date) {
      const rows = date === vnDate()
        ? await withMarket((m) => m.getOhlc1Minute(canonicalSymbol(symbol)))
        : await pagedOhlc("getOhlc1MinuteHistorical", canonicalSymbol(symbol), date, date);
      return normalizeBars(rows, { intraday: true });
    },

    async getIndexDaily(code, from, to) {
      // Chưa xác nhận API v3 trả OHLC cho mã chỉ số; rỗng => để nguồn kế tiếp xử lý.
      const bars = normalizeBars(await pagedOhlc("getOhlc1DayHistorical", ssiV2IndexId(code), from, to));
      if (!bars.length) throw new UnsupportedError(`SSI v3 không trả OHLC cho chỉ số ${code}.`, "ssiV3");
      return bars;
    },

    async getIndexSnapshot(code) {
      const summary = await withMarket((m) => m.getIndexSummary(ssiV2IndexId(code)));
      const snap = summary ? normalizeIndexSnapshot(summary, code) : null;
      if (!snap) throw new UnsupportedError(`SSI v3 không có index summary cho ${code}.`, "ssiV3");
      return snap;
    },

    async getQuotes(symbols) {
      const quotes = await mapLimit(symbols, 4, async (symbol) => {
        const summary = await withMarket((m) => m.getSecuritiesSummary(canonicalSymbol(symbol)));
        return summary ? normalizeQuote(summary, symbol) : null;
      });
      return quotes.filter(Boolean);
    },

    async getPriceLimits(date) {
      const rows = date === vnDate()
        ? await withMarket((m) => m.getMasterData())
        : await withMarket((m) => m.getMasterDataHistorical(toSsiV3Date(date), toSsiV3Date(date)));
      return (rows || []).map(normalizePriceLimit).filter(Boolean);
    },
  };
}
