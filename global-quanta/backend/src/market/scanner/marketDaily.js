// Dữ liệu ngày TOÀN THỊ TRƯỜNG từ SSI FC Data v2 DailyStockPrice (theo sàn):
// một lần gọi ~9 request cho cả HOSE/HNX/UPCoM thay vì ~300 request theo mã.
// Có OHLC gốc, giá đóng cửa điều chỉnh, KL/GT khớp và thoả thuận, khối ngoại.
// Lưu ý: TotalBuyTradeVol/TotalSellTradeVol (mua/bán chủ động) luôn = 0 ở FC v2.

import { getMarketData } from "../../services/ssiFastConnect.js";
import { toNum, toSsiV2Date, toIsoDate } from "../normalizer.js";
import { sleep } from "../util.js";

export const MARKETS = ["HOSE", "HNX", "UPCOM"];
const STOCK_SYMBOL = /^[A-Z][A-Z0-9]{2}$/; // cổ phiếu: 3 ký tự (loại CW, ETF, trái phiếu, bản ghi rác)

/** Chuẩn hoá một dòng DailyStockPrice; null nếu không phải cổ phiếu hợp lệ. */
export function normalizeDailyRow(raw, exchange) {
  const symbol = String(raw.Symbol ?? raw.symbol ?? "").trim().toUpperCase();
  if (!STOCK_SYMBOL.test(symbol)) return null;
  const date = toIsoDate(raw.TradingDate ?? raw.tradingDate);
  const close = toNum(raw.ClosePrice);
  const ceiling = toNum(raw.CeilingPrice);
  const floor = toNum(raw.FloorPrice);
  const refPrice = toNum(raw.RefPrice);
  if (!date || !(close > 0) || !(ceiling > 0) || !(floor > 0) || !(refPrice > 0)) return null;
  const open = toNum(raw.OpenPrice) || close;
  const high = Math.max(toNum(raw.HighestPrice) || close, open, close);
  const low = Math.min(toNum(raw.LowestPrice) || close, open, close);
  return {
    symbol, date, exchange,
    open, high, low, close,
    closeAdj: toNum(raw.ClosePriceAdjusted) || close,
    refPrice, ceiling, floor,
    volume: toNum(raw.TotalMatchVol) ?? 0,
    value: toNum(raw.TotalMatchVal) ?? 0,
    dealVolume: toNum(raw.TotalDealVol) ?? 0,
    dealValue: toNum(raw.TotalDealVal) ?? 0,
    foreignBuyVol: toNum(raw.ForeignBuyVolTotal) ?? 0,
    foreignSellVol: toNum(raw.ForeignSellVolTotal) ?? 0,
    foreignBuyVal: toNum(raw.ForeignBuyValTotal) ?? 0,
    foreignSellVal: toNum(raw.ForeignSellValTotal) ?? 0,
    foreignRoom: toNum(raw.ForeignCurrentRoom),
  };
}

/** Lấy toàn bộ cổ phiếu của cả 3 sàn cho một ngày (YYYY-MM-DD). */
export async function fetchMarketDay(date, { call = getMarketData, pauseMs = 150 } = {}) {
  const rows = [];
  let requests = 0;
  for (const market of MARKETS) {
    for (let pageIndex = 1; pageIndex <= 10; pageIndex++) {
      let body;
      try {
        body = await call("DailyStockPrice", {
          market, fromDate: toSsiV2Date(date), toDate: toSsiV2Date(date),
          pageIndex: String(pageIndex), pageSize: "1000",
        });
      } catch (error) {
        if (/no data/i.test(String(error?.message))) break; // ngày nghỉ / sàn không có dữ liệu
        throw error;
      }
      requests++;
      const data = Array.isArray(body?.data) ? body.data : [];
      for (const raw of data) {
        const row = normalizeDailyRow(raw, market);
        if (row) rows.push(row);
      }
      if (data.length < 1000) break;
      if (pauseMs) await sleep(pauseMs);
    }
  }
  return { date, rows, requests };
}
