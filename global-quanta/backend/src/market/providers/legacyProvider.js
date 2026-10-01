// Nguồn dự phòng: các API cũ của Project A (tuan-quant-scanner) và Yahoo Finance.
// Gọi phía server nên không còn bị CORS như khi trình duyệt gọi thẳng Yahoo.

import { UnsupportedError } from "../errors.js";
import { canonicalSymbol, isIndexSymbol, normalizeBars, normalizeQuote, normalizeSecurity } from "../normalizer.js";
import { daysBetween, fetchJson, mapLimit } from "../util.js";
import { vnDate } from "../calendar.js";

const YAHOO_CHART = "https://query1.finance.yahoo.com/v8/finance/chart";

function base() {
  return (process.env.LEGACY_MARKET_API_BASE || "https://tuan-quant-scanner-psi.vercel.app").replace(/\/+$/, "");
}

function headers() {
  // Project A có thể bật Vercel Deployment Protection (xem historicalDataProvider.js).
  const secret = process.env.INTERNAL_HISTORICAL_API_BYPASS_SECRET;
  return secret ? { "x-vercel-protection-bypass": secret } : {};
}

/** Project A /api/ohlcv nhận range kiểu Yahoo. */
function yahooRange(from) {
  const days = daysBetween(from, vnDate());
  if (days <= 31) return "1mo";
  if (days <= 93) return "3mo";
  if (days <= 186) return "6mo";
  if (days <= 366) return "1y";
  if (days <= 731) return "2y";
  if (days <= 1827) return "5y";
  return "max";
}

const inRange = (from, to) => (bar) => bar.date.slice(0, 10) >= from && bar.date.slice(0, 10) <= to;

export function createLegacyProvider({ fetchImpl = globalThis.fetch } = {}) {
  const get = (path) => fetchJson(`${base()}${path}`, { headers: headers(), fetchImpl });

  async function projectAOhlcv(symbol, from, to) {
    const days = Math.max(daysBetween(from, to) + 5, 30);
    const json = await get(`/api/ohlcv?ticker=${encodeURIComponent(symbol)}&range=${yahooRange(from)}&limit=${days}`);
    const rows = json?.bars ?? json?.data ?? json?.priceSeries ?? (Array.isArray(json) ? json : []);
    return normalizeBars(rows).filter(inRange(from, to));
  }

  async function yahooQuote(symbol) {
    const json = await fetchJson(`${YAHOO_CHART}/${encodeURIComponent(`${symbol}.VN`)}?interval=1d&range=1d`, { fetchImpl });
    const meta = json?.chart?.result?.[0]?.meta;
    if (!meta?.regularMarketPrice) return null;
    return normalizeQuote({
      symbol,
      price: meta.regularMarketPrice,
      previousClose: meta.previousClose ?? meta.chartPreviousClose,
    }, symbol);
  }

  return {
    name: "legacy",
    source: "LEGACY",
    isConfigured: () => String(process.env.LEGACY_MARKET_ENABLED ?? "true").toLowerCase() !== "false",

    async getSecurities() {
      const json = await get("/api/universe");
      return (json?.tickers ?? []).map(normalizeSecurity).filter(Boolean);
    },

    async getIndexComponents() {
      throw new UnsupportedError("Nguồn cũ không có danh sách thành phần chỉ số.", "legacy");
    },

    getDailyOhlcv: projectAOhlcv,

    async getIntradayOhlcv() {
      throw new UnsupportedError("Nguồn cũ không có nến trong phiên.", "legacy");
    },

    getIndexDaily: projectAOhlcv,

    async getIndexSnapshot(code) {
      const canon = canonicalSymbol(code);
      const [breadth, bars] = await Promise.allSettled([
        canon === "VNINDEX" ? get("/api/market-data/breadth") : Promise.resolve(null),
        projectAOhlcv(canon, new Date(Date.now() - 20 * 86_400_000).toISOString().slice(0, 10), vnDate()),
      ]);
      const series = bars.status === "fulfilled" ? bars.value : [];
      const last = series.at(-1);
      const prev = series.at(-2);
      if (!last) throw bars.reason ?? new Error(`Nguồn cũ không có dữ liệu chỉ số ${canon}.`);
      const b = breadth.status === "fulfilled" ? breadth.value : null;
      const change = prev ? last.close - prev.close : null;
      return {
        code: canon,
        value: last.close,
        change,
        changePct: change !== null && prev?.close ? (change / prev.close) * 100 : null,
        totalVolume: last.volume ?? null,
        totalValue: last.value ?? null,
        advances: b?.advancers ?? null,
        declines: b?.decliners ?? null,
        noChanges: null,
        ceilings: null,
        floors: null,
        session: null,
        date: last.date,
        time: null,
      };
    },

    async getQuotes(symbols) {
      const equities = symbols.map(canonicalSymbol).filter((s) => !isIndexSymbol(s));
      let quotes = [];
      try {
        const json = await get(`/api/proxy/yahoo?symbols=${equities.join(",")}`);
        quotes = Object.entries(json || {})
          .filter(([, info]) => info && info.price !== null && info.price !== undefined)
          .map(([symbol, info]) => normalizeQuote({ symbol, ...info }, symbol))
          .filter(Boolean);
      } catch {
        // Proxy Project A lỗi -> gọi thẳng Yahoo từ server (không bị CORS).
      }
      const have = new Set(quotes.map((q) => q.symbol));
      const missing = equities.filter((s) => !have.has(s));
      if (missing.length) {
        const direct = await mapLimit(missing, 5, (s) => yahooQuote(s).catch(() => null));
        quotes.push(...direct.filter(Boolean));
      }
      if (!quotes.length && equities.length) throw new Error("Nguồn cũ không trả được giá nào.");
      return quotes;
    },
  };
}
