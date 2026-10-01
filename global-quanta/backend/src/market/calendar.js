// Lịch phiên giao dịch chứng khoán Việt Nam (HOSE/HNX/UPCoM), giờ Asia/Ho_Chi_Minh
// (UTC+7, không có giờ mùa hè). Dùng để phân biệt "mất dữ liệu" với "thị trường
// đóng cửa": ngoài phiên không có tick là bình thường, không được báo STALE.

import { marketConfig } from "./config.js";

const VN_OFFSET_MS = 7 * 60 * 60_000;

/** Trả về các thành phần ngày giờ theo giờ Việt Nam. */
export function vnParts(now = new Date()) {
  const shifted = new Date(now.getTime() + VN_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(), // 0 = Chủ nhật
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}

const pad = (n) => String(n).padStart(2, "0");

/** YYYY-MM-DD theo giờ Việt Nam. */
export function vnDate(now = new Date()) {
  const p = vnParts(now);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

export function isTradingDay(now = new Date()) {
  const p = vnParts(now);
  if (p.weekday === 0 || p.weekday === 6) return false;
  return !marketConfig().holidays.has(vnDate(now));
}

const SESSIONS = [
  { name: "ATO", start: 9 * 60, end: 9 * 60 + 15 },
  { name: "LO", start: 9 * 60 + 15, end: 11 * 60 + 30 },
  { name: "BREAK", start: 11 * 60 + 30, end: 13 * 60 },
  { name: "LO", start: 13 * 60, end: 14 * 60 + 30 },
  { name: "ATC", start: 14 * 60 + 30, end: 14 * 60 + 45 },
  // Thoả thuận / PLO (HNX) kéo dài tới 15:00.
  { name: "PT", start: 14 * 60 + 45, end: 15 * 60 },
];

/** Phiên hiện tại: PRE_OPEN | ATO | LO | BREAK | ATC | PT | CLOSED. */
export function currentSession(now = new Date()) {
  if (!isTradingDay(now)) return "CLOSED";
  const { minutes } = vnParts(now);
  if (minutes >= 8 * 60 + 30 && minutes < 9 * 60) return "PRE_OPEN";
  const hit = SESSIONS.find((s) => minutes >= s.start && minutes < s.end);
  return hit ? hit.name : "CLOSED";
}

/** Có đang trong khoảng thời gian phải có tick liên tục không. */
export function expectsLiveTicks(now = new Date()) {
  return ["ATO", "LO", "ATC"].includes(currentSession(now));
}

/** Ngày giao dịch gần nhất (hôm nay nếu là ngày giao dịch và đã qua 9h). */
export function lastTradingDate(now = new Date()) {
  let cursor = new Date(now.getTime());
  if (isTradingDay(cursor) && vnParts(cursor).minutes >= 9 * 60) return vnDate(cursor);
  for (let i = 0; i < 15; i++) {
    cursor = new Date(cursor.getTime() - 24 * 60 * 60_000);
    if (isTradingDay(cursor)) return vnDate(cursor);
  }
  return vnDate(now);
}

/** Ngày của phiên đã đóng cửa gần nhất (hôm nay chỉ tính sau 15:05). Dùng để biết dữ liệu ngày đã đủ chưa. */
export function lastCompletedSessionDate(now = new Date()) {
  if (isTradingDay(now) && vnParts(now).minutes >= 15 * 60 + 5) return vnDate(now);
  let cursor = new Date(now.getTime());
  for (let i = 0; i < 15; i++) {
    cursor = new Date(cursor.getTime() - 24 * 60 * 60_000);
    if (isTradingDay(cursor)) return vnDate(cursor);
  }
  return vnDate(now);
}
