// Adapter SSI FastConnect Data v2 (fc-data.ssi.com.vn) — dùng lại token/REST
// client đã có ở services/ssiFastConnect.js.

import { getMarketData } from "../../services/ssiFastConnect.js";
import { UnsupportedError } from "../errors.js";
import {
  canonicalSymbol, normalizeBars, normalizeIndexSnapshot, normalizePriceLimit, normalizeQuote,
  normalizeSecurity, ssiV2IndexId, toNum, toSsiV2Date,
} from "../normalizer.js";
import { expectsLiveTicks, lastTradingDate, vnDate } from "../calendar.js";
import { dateWindows, mapLimit } from "../util.js";

const PAGE_SIZE = 1000; // SSI chỉ nhận 10, 20, 50, 100, 1000
const MARKETS = ["HOSE", "HNX", "UPCOM"];

function maxRangeDays() {
  // Tài liệu SSI giới hạn khoảng ngày cho một số endpoint; mặc định 30 ngày cho an toàn.
  const n = Number(process.env.SSI_V2_MAX_RANGE_DAYS);
  return Number.isFinite(n) && n > 0 ? n : 30;
}

// SSI trả status lỗi với message "There is no data" khi kết quả rỗng: đó là
// dữ liệu rỗng hợp lệ, không phải sự cố (không được làm mở circuit breaker).
const isNoData = (error) => /no data/i.test(String(error?.message || ""));

const isTransient = (error) => ["TimeoutError", "AbortError"].includes(error?.name) || /timeout|aborted|ECONNRESET|fetch failed/i.test(String(error?.message));

/** Gọi SSI, thử lại tối đa 2 lần (1s, 3s) khi timeout/lỗi mạng tạm thời. */
async function callWithRetry(call, endpoint, query) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await call(endpoint, query);
    } catch (error) {
      if (attempt >= 2 || !isTransient(error)) throw error;
      await new Promise((r) => setTimeout(r, attempt === 0 ? 1_000 : 3_000));
    }
  }
}

async function fetchAllPages(endpoint, query, call) {
  const rows = [];
  for (let pageIndex = 1; pageIndex <= 50; pageIndex++) {
    let body;
    try {
      body = await callWithRetry(call, endpoint, { ...query, pageIndex: String(pageIndex), pageSize: String(PAGE_SIZE) });
    } catch (error) {
      if (isNoData(error)) break;
      throw error;
    }
    const data = Array.isArray(body?.data) ? body.data : [];
    rows.push(...data);
    const total = toNum(body?.totalRecord);
    if (data.length < PAGE_SIZE || (total !== null && rows.length >= total)) break;
  }
  return rows;
}

export function createSsiFcV2Provider({ call = getMarketData } = {}) {
  const rangeQuery = (from, to) => ({ fromDate: toSsiV2Date(from), toDate: toSsiV2Date(to) });

  async function rangeRows(endpoint, baseQuery, from, to) {
    const windows = dateWindows(from, to, maxRangeDays());
    const chunks = await mapLimit(windows, 2, ([start, end]) =>
      fetchAllPages(endpoint, { ...baseQuery, ...rangeQuery(start, end), ascending: "true" }, call));
    return chunks.flat();
  }

  async function dailyStockPrice(symbol, from, to) {
    return rangeRows("DailyStockPrice", { symbol }, from, to);
  }

  return {
    name: "ssiFcV2",
    source: "SSI_FC_V2",
    isConfigured: () => Boolean(process.env.SSI_CONSUMER_ID && process.env.SSI_CONSUMER_SECRET),

    /**
     * Endpoint Securities của SSI chỉ trả một phần danh mục (thực tế: vài mã mới
     * niêm yết), nên ghép thêm danh sách mã có giao dịch từ DailyStockPrice toàn
     * sàn của phiên gần nhất (chỉ lấy cổ phiếu mã 3 ký tự).
     */
    async getSecurities({ exchange } = {}) {
      const markets = exchange ? [exchange.toUpperCase()] : MARKETS;
      const date = lastTradingDate();
      const bySymbol = new Map();
      for (const market of markets) {
        const [listed, priced] = await Promise.all([
          fetchAllPages("Securities", { market }, call),
          fetchAllPages("DailyStockPrice", { market, ...rangeQuery(date, date) }, call),
        ]);
        for (const row of priced) {
          const symbol = canonicalSymbol(row.Symbol ?? row.symbol);
          if (/^[A-Z][A-Z0-9]{2}$/.test(symbol)) bySymbol.set(symbol, { symbol, exchange: market, name: null, nameEn: null, sector: null, listedShares: null });
        }
        for (const row of listed) {
          const sec = normalizeSecurity(row);
          if (sec) bySymbol.set(sec.symbol, { ...sec, exchange: sec.exchange ?? market });
        }
      }
      if (!bySymbol.size) throw new UnsupportedError("SSI FC v2 không trả danh mục mã.", "ssiFcV2");
      return [...bySymbol.values()].sort((a, b) => a.symbol.localeCompare(b.symbol));
    },

    async getIndexComponents(indexCode) {
      const rows = await fetchAllPages("IndexComponents", { indexCode: ssiV2IndexId(indexCode) }, call);
      const symbols = rows.flatMap((row) => (row.IndexComponent || row.indexComponent || [])
        .map((c) => canonicalSymbol(c.StockSymbol ?? c.stockSymbol)));
      return [...new Set(symbols.filter(Boolean))];
    },

    async getDailyOhlcv(symbol, from, to) {
      return normalizeBars(await rangeRows("DailyOhlc", { symbol: canonicalSymbol(symbol) }, from, to));
    },

    /** Giá đã điều chỉnh: dùng ClosePriceAdjusted / ClosePrice của DailyStockPrice làm hệ số cho cả OHLC. */
    async getDailyOhlcvAdjusted(symbol, from, to) {
      const rows = await dailyStockPrice(canonicalSymbol(symbol), from, to);
      const bars = [];
      for (const row of rows) {
        const [bar] = normalizeBars([row]);
        if (!bar) continue;
        const adjClose = toNum(row.ClosePriceAdjusted ?? row.closePriceAdjusted);
        const factor = adjClose && bar.close ? adjClose / bar.close : 1;
        bars.push({
          ...bar,
          open: bar.open * factor,
          high: bar.high * factor,
          low: bar.low * factor,
          close: adjClose ?? bar.close,
        });
      }
      return bars.sort((a, b) => a.date.localeCompare(b.date));
    },

    /**
     * Giá DANH NGHĨA của DailyStockPrice: giá khớp + giá tham chiếu (Sở GDCK đã điều chỉnh vào ngày GDKHQ theo quy chế)
     * + giá bình quân (cơ sở tham chiếu của HNX/UPCoM). Dùng để TỰ dựng chuỗi điều chỉnh (adjustedHistory.js) —
     * ClosePriceAdjusted của SSI có lỗi thực tế (VD VNM 03/03/2026 trả giá cũ của 04/12/2025).
     */
    async getDailyStockPriceNominal(symbol, from, to) {
      const rows = await dailyStockPrice(canonicalSymbol(symbol), from, to);
      const out = new Map();
      for (const row of rows) {
        const [bar] = normalizeBars([row]);
        if (!bar || !(bar.close > 0)) continue;
        const ref = toNum(row.RefPrice ?? row.refPrice);
        const avg = toNum(row.AveragePrice ?? row.averagePrice);
        out.set(bar.date, { date: bar.date, close: bar.close, ref: ref > 0 ? ref : null, avg: avg > 0 ? avg : null, volume: bar.volume ?? null });
      }
      return [...out.values()].sort((a, b) => a.date.localeCompare(b.date));
    },

    async getIntradayOhlcv(symbol, date) {
      // Trường Value của IntradayOhlc thực tế bằng giá khớp, không phải giá trị giao dịch.
      const bars = normalizeBars(await rangeRows("IntradayOhlc", { symbol: canonicalSymbol(symbol) }, date, date), { intraday: true });
      return bars.map((bar) => ({ ...bar, value: null }));
    },

    /** Nến phút của một khoảng ngày (cửa sổ 30 ngày/request, phân trang 1000). */
    async getIntradayRange(symbol, from, to) {
      const bars = normalizeBars(await rangeRows("IntradayOhlc", { symbol: canonicalSymbol(symbol) }, from, to), { intraday: true });
      return bars.map((bar) => ({ ...bar, value: null }));
    },

    /** DailyOhlc không có chỉ số; DailyIndex chỉ có giá đóng cửa (open/high/low = close). */
    async getIndexDaily(code, from, to) {
      const rows = await rangeRows("DailyIndex", { indexId: ssiV2IndexId(code) }, from, to);
      return normalizeBars(rows.map((row) => ({
        TradingDate: row.TradingDate ?? row.tradingDate,
        Close: row.IndexValue ?? row.indexValue,
        Volume: row.Totalmatchvol ?? row.TotalMatchVol ?? row.totalMatchVol,
        Value: row.Totalmatchval ?? row.TotalMatchVal ?? row.totalMatchVal,
      }))).map((bar) => ({ ...bar, closeOnly: true }));
    },

    async getIndexSnapshot(code) {
      const date = lastTradingDate();
      const rows = await fetchAllPages("DailyIndex", { indexId: ssiV2IndexId(code), ...rangeQuery(date, date) }, call);
      const snap = rows.map((row) => normalizeIndexSnapshot(row, code)).filter(Boolean).pop();
      if (!snap) throw new UnsupportedError(`SSI FC v2 không có DailyIndex cho ${code} ngày ${date}.`, "ssiFcV2");
      return snap;
    },

    /** v2 không có REST quote realtime; DailyStockPrice của phiên gần nhất dùng làm snapshot. */
    async getQuotes(symbols) {
      const date = lastTradingDate();
      // Trong phiên, DailyStockPrice của hôm nay có thể chưa có/chưa cập nhật:
      // không trả giá cũ dưới danh nghĩa giá hiện tại, để nguồn kế tiếp xử lý.
      const live = expectsLiveTicks();
      const today = vnDate();
      const quotes = await mapLimit(symbols, 3, async (symbol) => {
        const rows = await dailyStockPrice(symbol, date, date);
        const quote = rows.length ? normalizeQuote(rows[rows.length - 1], symbol) : null;
        if (live && quote && !String(quote.time ?? "").startsWith(today)) return null;
        return quote;
      });
      const found = quotes.filter(Boolean);
      if (!found.length && symbols.length) throw new UnsupportedError("SSI FC v2 chưa có giá phiên hiện tại qua REST.", "ssiFcV2");
      return found;
    },

    async getPriceLimits(date) {
      const lists = await mapLimit(MARKETS, 2, (market) =>
        fetchAllPages("DailyStockPrice", { market, ...rangeQuery(date, date) }, call));
      return lists.flat().map(normalizePriceLimit).filter(Boolean);
    },
  };
}
