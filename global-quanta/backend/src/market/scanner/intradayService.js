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

/** Phiên đang mở (ngày giao dịch, sau 9:00, phiên hôm nay chưa đóng) — cùng điều kiện getIntradaySessions dùng. */
export function isSessionLive(nowDate = new Date()) {
  return isTradingDay(nowDate) && vnParts(nowDate).minutes >= 9 * 60 && lastCompletedSessionDate(nowDate) < vnDate(nowDate);
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
  const sessionLive = isSessionLive(nowDate);
  // Lịch sử = tới phiên ĐÃ ĐÓNG gần nhất (trong phiên đó là phiên giao dịch trước). Trước đây trong phiên dùng "hôm qua" theo LỊCH ->
  // thứ Hai ra khoá đệm Chủ nhật, lệch khoá dựng trước giờ mở cửa (thứ Sáu) -> nạp sẵn (N5) bị trượt, phải tải lại 120 phiên SSI.
  const historyEnd = lastClosed;
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

// ---------- Lịch sử GỌN cho ESA (29/10/2026) ----------
// ESA R0 + ESA từ lúc ra tin chỉ cần khối lượng CỘNG DỒN theo phút của các phiên trước, không cần nguyên nến phút.
// Mỗi phiên -> Float64Array(361) khối lượng cộng dồn từ 09:00 tới 15:00 (~2,9 KB; 120 phiên ≈ 0,35 MB/mã) thay vì ~33 MB nến phút
// giữ trong đệm 12 giờ (đo production 29/10: nạp nguyên 10 mã đẩy heap 57 -> ~400/489 MB).
export const ESA_MIN0 = 9 * 60, ESA_SPAN = 6 * 60 + 1;

/** Phiên nến phút -> { date, refPrice, cum } (cum[i] = KL cộng dồn tới phút 09:00 + i, gồm cả phút đó). */
export function compactSession(session) {
  const vol = new Float64Array(ESA_SPAN);
  for (const b of session.bars ?? []) {
    const m = String(b.date).match(/T(\d{2}):(\d{2})/);
    if (!m) continue;
    const i = Number(m[1]) * 60 + Number(m[2]) - ESA_MIN0;
    if (i >= 0 && i < ESA_SPAN) vol[i] += Math.max(0, Number(b.volume) || 0);
  }
  for (let i = 1; i < ESA_SPAN; i++) vol[i] += vol[i - 1];
  const closes = (session.bars ?? []).map((b) => Number(b.close)).filter((v) => v > 0);
  return { date: session.date, refPrice: session.refPrice ?? null, close: closes.length ? closes[closes.length - 1] : null, cum: vol };
}

/**
 * Như getIntradaySessions nhưng lịch sử ở dạng GỌN (chỉ cho ESA). Dùng lại lịch sử đầy đủ nếu đang có sẵn trong đệm; không có thì tải
 * SSI rồi chỉ giữ bản gọn (nến phút thô được giải phóng ngay).
 */
export async function getEsaSessions(service, rawSymbol, { now = Date.now } = {}) {
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
  const historyEnd = lastCompletedSessionDate(nowDate);
  const sessionLive = isSessionLive(nowDate);
  const fullKey = `intraday-cycle-hist:${symbol}:${historyEnd}`;
  const history = await service.cache.wrap(`esa-hist:${symbol}:${historyEnd}`, 12 * 60 * 60_000, async () => {
    const full = typeof service.cache.get === "function" ? service.cache.get(fullKey) : undefined;
    if (full) return full.map(compactSession);
    const dates = tradingDatesBack(historyEnd, HISTORY_SESSIONS);
    return withSlot(async () => groupSessions(await provider.getIntradayRange(symbol, dates[0], historyEnd)).map(compactSession));
  });
  const viewDate = sessionLive ? today : historyEnd;
  let todaySession = null;
  if (sessionLive) {
    const bars = (await service.cache.wrap(`intraday-cycle-today:${symbol}:${today}`, expectsLiveTicks(nowDate) ? 60_000 : 5 * 60_000,
      () => provider.getIntradayOhlcv(symbol, today).catch(() => []))).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const ref = [...history].reverse().find((s) => s.close > 0);
    todaySession = { date: today, refPrice: ref?.close ?? null, bars };
  }
  return { symbol, sessionLive, today, viewDate, trainSessions: sessionLive ? history : history.filter((s) => s.date < viewDate), todaySession };
}
