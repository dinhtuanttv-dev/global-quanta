// Nến phút cho TA VN-Index (TA_VNINDEX_UPGRADE_SPEC §2.1.1 khung 1m·5m·15m·1H + §2.2 Session Volume Profile).
//   - Nguồn: SSI FC Data IntradayOhlc (≥ 6 tháng lịch sử), N phiên gần nhất (mặc định 20, tối đa 30).
//   - Cùng cơ sở giá với chuỗi D (/ta-series): nhân hệ số sự kiện quyền cộng dồn cho các phiên TRƯỚC ngày GDKHQ
//     -> nến phút khớp nến ngày điều chỉnh, không có khoảng trống giả trong cửa sổ.
//   - Đánh dấu khớp lệnh định kỳ: nến 09:15 đầu phiên (có ATO, HOSE) và nến 14:45 (ATC) -> `auction`,
//     bị loại khỏi Volume Profile khớp liên tục (khớp định kỳ không có bên chủ động, dồn KL vào một mức giá).

import { canonicalSymbol, isIndexSymbol, isValidSymbol } from "../normalizer.js";
import { ValidationError } from "../errors.js";
import { expectsLiveTicks, isTradingDay, lastCompletedSessionDate, vnDate, vnParts } from "../calendar.js";
import { addDays } from "../util.js";
import { tradingDatesBack } from "../scanner/scannerJobs.js";

export const MAX_INTRADAY_SESSIONS = 30;

const hhmm = (iso) => String(iso).slice(11, 16);

/** Hệ số điều chỉnh cho một ngày = tích hệ số các đợt GDKHQ SAU ngày đó (hàm thuần). */
export function factorForDate(date, actions) {
  let k = 1;
  for (const a of actions) if (date < a.date) k *= a.factor;
  return k;
}

/** Áp hệ số + gắn cờ khớp định kỳ (hàm thuần). */
export function prepareIntradayBars(bars, actions, { isIndex = false } = {}) {
  const seenDay = new Set();
  return bars.map((b) => {
    const day = String(b.date).slice(0, 10);
    const first = !seenDay.has(day);
    seenDay.add(day);
    const t = hhmm(b.date);
    const auction = t >= "14:45" ? "ATC" : first && t <= "09:15" && !isIndex ? "ATO" : null;
    const k = isIndex ? 1 : factorForDate(day, actions);
    const r = (v) => (k === 1 ? v : Math.round(v * k * 100) / 100);
    return { date: b.date, open: r(b.open), high: r(b.high), low: r(b.low), close: r(b.close), volume: b.volume, ...(auction ? { auction } : {}) };
  });
}

export function createTaIntraday({ service, taSeries, now = Date.now }) {
  return {
    async get({ symbol: raw, days = 20 }) {
      const symbol = canonicalSymbol(raw);
      if (!isValidSymbol(symbol)) throw new ValidationError("Mã chứng khoán không hợp lệ.");
      const n = Math.min(Math.max(Number(days) || 20, 1), MAX_INTRADAY_SESSIONS);
      const provider = service.router.providers?.ssiFcV2;
      if (!provider?.isConfigured?.() || typeof provider.getIntradayRange !== "function") {
        const error = new Error("Chưa cấu hình SSI FC Data cho nến phút.");
        error.statusCode = 503;
        throw error;
      }
      const isIndex = isIndexSymbol(symbol);
      const nowDate = new Date(now());
      const today = vnDate(nowDate);
      const lastClosed = lastCompletedSessionDate(nowDate);
      const sessionLive = isTradingDay(nowDate) && vnParts(nowDate).minutes >= 9 * 60 && lastClosed < today;
      const historyEnd = sessionLive ? addDays(today, -1) : lastClosed;
      const dates = tradingDatesBack(historyEnd, sessionLive ? n - 1 : n);

      // Phiên đã đóng không đổi -> cache dài; phiên đang chạy -> 60 giây.
      const history = dates.length
        ? await service.cache.wrap(`ta-intraday-hist:${symbol}:${dates[0]}:${historyEnd}`, 6 * 60 * 60_000, () => provider.getIntradayRange(symbol, dates[0], historyEnd))
        : [];
      const live = sessionLive
        ? await service.cache.wrap(`ta-intraday-today:${symbol}:${today}`, expectsLiveTicks(nowDate) ? 60_000 : 5 * 60_000, () => provider.getIntradayOhlcv(symbol, today).catch(() => []))
        : [];

      let actions = [];
      let priceBasis = isIndex ? "INDEX_POINTS" : "NOMINAL_UNADJUSTED";
      if (!isIndex) {
        try {
          const ta = await taSeries.get({ symbol, range: "1y", limit: 300 });
          actions = (ta.corporateActions ?? []).map((a) => ({ date: a.date, factor: a.factor }));
          if (ta.priceBasis === "ADJUSTED_CUMULATIVE") priceBasis = "ADJUSTED_CUMULATIVE";
        } catch { /* không có sự kiện quyền -> giữ danh nghĩa, ghi rõ priceBasis */ }
      }
      const raw1m = [...history, ...live].filter((b) => b && b.close > 0).sort((a, b) => String(a.date).localeCompare(String(b.date)));
      const bars = prepareIntradayBars(raw1m, actions, { isIndex });
      const sessions = [...new Set(bars.map((b) => String(b.date).slice(0, 10)))];
      return {
        symbol, ticker: symbol, resolution: "1m", priceBasis, bars, sessions,
        provenance: { source: "SSI_FC_V2", asOf: bars.at(-1)?.date ?? null, live: sessionLive, auctionFlagged: bars.filter((b) => b.auction).length },
      };
    },
  };
}
