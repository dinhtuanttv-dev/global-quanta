// Dựng mô hình chu kỳ khối lượng trong phiên cho một mã:
//   - Lịch sử: nến phút 120 phiên từ SSI IntradayOhlc (cửa sổ 30 ngày, ~5 trang/tháng),
//     gom 17 khung, lưu đệm tới hết ngày (không đổi trong ngày).
//   - Hôm nay: nến phút phiên hiện tại, lưu đệm 60s trong phiên (đủ "realtime" cho
//     khung 15', không cần mở thêm kết nối stream tới SSI).
// Giới hạn số mã được dựng lịch sử đồng thời để không dồn tải lên SSI.

import { buildIntradayCycle, sessionToBuckets } from "./intradayModel.js";
import { canonicalSymbol, isValidSymbol, isIndexSymbol } from "../normalizer.js";
import { ValidationError } from "../errors.js";
import { expectsLiveTicks, isTradingDay, lastCompletedSessionDate, vnDate, vnParts } from "../calendar.js";
import { addDays } from "../util.js";
import { tradingDatesBack } from "./scannerJobs.js";

export const HISTORY_SESSIONS = Number(process.env.INTRADAY_CYCLE_SESSIONS) || 120;
const MAX_CONCURRENT_BUILDS = 2;
let running = 0;
const waiters = [];

async function withSlot(fn) {
  if (running >= MAX_CONCURRENT_BUILDS) await new Promise((resolve) => waiters.push(resolve));
  running++;
  try {
    return await fn();
  } finally {
    running--;
    waiters.shift()?.();
  }
}

/** Gom nến phút nhiều phiên -> [{ date, refPrice, buckets, bars }] theo thứ tự thời gian (giữ nến phút cho IFE). */
export function groupSessions(bars) {
  const byDate = new Map();
  for (const b of bars) {
    const d = String(b.date).slice(0, 10);
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d).push(b);
  }
  const dates = [...byDate.keys()].sort();
  const out = [];
  let prevClose = null;
  for (const date of dates) {
    const sessionBars = byDate.get(date).sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const buckets = sessionToBuckets(sessionBars);
    const lastClose = [...buckets].reverse().find(Boolean)?.close ?? null;
    const firstOpen = buckets.find(Boolean)?.open ?? null;
    out.push({ date, refPrice: prevClose ?? firstOpen, buckets, bars: sessionBars });
    if (lastClose) prevClose = lastClose;
  }
  return out;
}

/**
 * Nến phút lịch sử (120 phiên, lưu đệm tới hết ngày) + phiên đang xem, dùng chung cho
 * Nhịp khối lượng, dòng phụ phân tích KL và IFE (không gọi SSI lặp lại).
 */
export async function getIntradaySessions(service, rawSymbol, { now = Date.now } = {}) {
  const symbol = canonicalSymbol(rawSymbol);
  if (!isValidSymbol(symbol) || isIndexSymbol(symbol)) throw new ValidationError("Mã cổ phiếu không hợp lệ.");
  const provider = service.router.providers?.ssiFcV2;
  if (!provider?.isConfigured?.() || typeof provider.getIntradayRange !== "function") {
    const error = new Error("Chưa cấu hình SSI FC Data cho nến phút.");
    error.statusCode = 503;
    throw error;
  }

  const nowDate = new Date(now());
  const today = vnDate(nowDate);
  const lastClosed = lastCompletedSessionDate(nowDate);
  const sessionLive = isTradingDay(nowDate) && vnParts(nowDate).minutes >= 9 * 60 && lastClosed < today;
  const historyEnd = sessionLive ? addDays(today, -1) : lastClosed;
  const historyDates = tradingDatesBack(historyEnd, HISTORY_SESSIONS);

  const history = await service.cache.wrap(`intraday-cycle-hist:${symbol}:${historyEnd}`, 12 * 60 * 60_000, () => withSlot(async () => {
    const bars = await provider.getIntradayRange(symbol, historyDates[0], historyEnd);
    return groupSessions(bars);
  }));

  // Hôm nay (trong phiên) hoặc phiên vừa đóng (để xem lại nhịp của phiên gần nhất).
  const viewDate = sessionLive ? today : lastClosed;
  let todaySession = null;
  if (sessionLive) {
    const bars = await service.cache.wrap(`intraday-cycle-today:${symbol}:${today}`, expectsLiveTicks(nowDate) ? 60_000 : 5 * 60_000,
      () => provider.getIntradayOhlcv(symbol, today).catch(() => []));
    const ref = [...history].reverse().find((s) => s.buckets.some(Boolean));
    const refPrice = ref ? [...ref.buckets].reverse().find(Boolean).close : null;
    todaySession = { date: today, refPrice, buckets: sessionToBuckets(bars) };
  } else {
    todaySession = history.find((s) => s.date === viewDate) ?? null;
  }
  const trainSessions = sessionLive ? history : history.filter((s) => s.date < viewDate);
  if (sessionLive && todaySession) {
    todaySession.bars = (await service.cache.wrap(`intraday-cycle-today:${symbol}:${today}`, expectsLiveTicks(nowDate) ? 60_000 : 5 * 60_000,
      () => provider.getIntradayOhlcv(symbol, today).catch(() => []))).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }
  return { symbol, sessionLive, today, viewDate, history, trainSessions, todaySession, nowMinute: sessionLive ? vnParts(nowDate).minutes : null };
}

export async function getIntradayCycle(service, rawSymbol, { now = Date.now } = {}) {
  const { symbol, sessionLive, viewDate, trainSessions, todaySession, nowMinute } = await getIntradaySessions(service, rawSymbol, { now });
  const result = buildIntradayCycle({
    sessions: trainSessions,
    today: todaySession,
    nowMinute,
  });
  return {
    symbol,
    viewDate,
    live: sessionLive,
    ...result,
    provenance: { intraday: "SSI_FC_V2 (IntradayOhlc)", bucketMinutes: 15, historySessions: HISTORY_SESSIONS },
    disclaimer: "Xác suất là tần suất lịch sử có điều kiện đã làm mượt và kiểm định walk-forward; không phải dự báo chắc chắn.",
  };
}
