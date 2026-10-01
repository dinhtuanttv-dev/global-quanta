// Lấy dữ liệu cho dòng phụ "phân tích khối lượng": 60 phiên ngày (kho), nến phút hôm
// nay + 5 phiên trước (SSI IntradayOhlc, lưu đệm), quote realtime (stream) nếu đang
// trong phiên. Nến phút của phiên đã đóng không đổi nên được lưu đệm 12 giờ.

import { buildVolumeAnalysis } from "./volumeAnalysis.js";
import { canonicalSymbol, isValidSymbol } from "../normalizer.js";
import { ValidationError } from "../errors.js";
import { expectsLiveTicks, isTradingDay, vnDate, vnParts } from "../calendar.js";

const DAILY_SESSIONS = 60;
const PROFILE_SESSIONS = 5;

export async function getVolumeAnalysis(service, rawSymbol, { now = Date.now } = {}) {
  const symbol = canonicalSymbol(rawSymbol);
  if (!isValidSymbol(symbol)) throw new ValidationError("Mã chứng khoán không hợp lệ.");
  const store = service.store;
  const dates = (await store.getMarketDailyDates()).slice(-DAILY_SESSIONS);
  if (!dates.length) {
    const error = new Error("Chưa có dữ liệu ngày toàn thị trường (chưa chạy backfillMarketDaily).");
    error.statusCode = 503;
    throw error;
  }
  const daily = await store.getMarketDailyRange({ from: dates[0], to: dates.at(-1), symbols: [symbol] });
  if (!daily.length) {
    const error = new Error(`Không có dữ liệu ngày cho ${symbol}.`);
    error.statusCode = 404;
    throw error;
  }

  const nowDate = new Date(now());
  const today = vnDate(nowDate);
  const sessionStarted = isTradingDay(nowDate) && vnParts(nowDate).minutes >= 9 * 60;
  const intradayDay = sessionStarted ? today : daily.at(-1).date;
  const pastDays = dates.filter((d) => d < intradayDay).slice(-PROFILE_SESSIONS);

  const intraday = (date, ttlMs) => service.cache.wrap(`intraday-vol:${symbol}:${date}`, ttlMs, async () => {
    try {
      return (await service.router.run("ohlcvIntraday", "getIntradayOhlcv", [symbol, date])).data;
    } catch {
      return [];
    }
  });
  const [intradayToday, ...intradayPast] = await Promise.all([
    intraday(intradayDay, expectsLiveTicks(nowDate) ? 60_000 : 30 * 60_000),
    ...pastDays.map((d) => intraday(d, 12 * 60 * 60_000)),
  ]);

  // Trong phiên: dữ liệu ngày của hôm nay chưa có (đồng bộ lúc 15:20) -> ghép từ quote realtime.
  const live = service.hub?.getQuote(symbol) ?? null;
  const rows = [...daily];
  if (sessionStarted && rows.at(-1).date < today && live?.price && String(live.time ?? "").startsWith(today)) {
    rows.push({
      symbol, date: today, exchange: rows.at(-1).exchange,
      open: live.open ?? live.price, high: live.high ?? live.price, low: live.low ?? live.price,
      close: live.price, closeAdj: live.price, volume: live.totalVolume ?? 0, value: live.totalValue ?? 0,
      dealVolume: 0, dealValue: 0, foreignBuyVol: 0, foreignSellVol: 0, foreignBuyVal: 0, foreignSellVal: 0,
      foreignRoom: rows.at(-1).foreignRoom, partial: true,
    });
  }

  const analysis = buildVolumeAnalysis({ symbol, daily: rows, intradayToday, intradayPast });
  return {
    ...analysis,
    partialToday: Boolean(rows.at(-1).partial),
    provenance: { daily: "SSI_FC_V2 (DailyStockPrice)", intraday: "SSI_FC_V2 (IntradayOhlc)", live: live?.provenance?.source ?? null },
  };
}
