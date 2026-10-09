// SEPA SP6 — cảnh báo phá vỡ trong phiên cho các mã SEPA đang chờ pivot (KV strategies:sepa, quét sau ATC phiên trước).
// Giá + khối lượng lũy kế lấy từ service.getQuotes (luồng SSI đang chạy / bộ đệm quotes của Gateway — không thêm nguồn mới).
// Giá pivot thuộc chuỗi điều chỉnh LÙI nên cùng mặt bằng với giá danh nghĩa hôm nay; TB50 là khối lượng của chuỗi đó.

import { currentSession, vnDate, vnParts } from "../calendar.js";
import { hoseMinutesElapsed, intradayBreakout } from "./sepa/intraday.js";

export const SEPA_INTRADAY_VERSION = "sepa/SP6";
const WAITING = new Set(["FORMING", "NEAR_PIVOT", "SQUAT"]);
const ACTIVE_LISTS = new Set(["SẴN SÀNG MUA", "CẢNH BÁO MUA", "THEO DÕI"]);
const ORDER = { BREAKOUT: 0, BREAKOUT_LOW_VOL: 1, NEAR: 2, EXTENDED: 3, BELOW: 4 };

/** Mã chờ phá vỡ: thuộc 3 danh sách, có pivot, chưa vượt pivot ở phiên quét. */
export function sepaIntradayCandidates(doc) {
  return (doc?.results ?? []).filter((r) => ACTIVE_LISTS.has(r.list) && r.metrics?.pivot > 0 && WAITING.has(r.status) && r.metrics?.vol50 > 0);
}

/**
 * @param doc     KV strategies:sepa
 * @param quotes  { [symbol]: { price, totalVolume, time } } (getQuotes)
 * @param firstSeen Map<"date|symbol|state", ISO> — thời điểm đầu tiên thấy trạng thái phá vỡ trong ngày (bộ nhớ tiến trình)
 */
export function buildSepaIntraday({ doc, quotes, now = new Date(), firstSeen = new Map() }) {
  const session = currentSession(now);
  const today = vnDate(now);
  const live = ["ATO", "LO", "BREAK", "ATC"].includes(session);
  const minutes = live ? hoseMinutesElapsed(vnParts(now).minutes) : session === "PRE_OPEN" ? 0 : 255;
  const rows = [];
  for (const r of sepaIntradayCandidates(doc)) {
    const q = quotes?.[r.ticker];
    const quoteToday = q && String(q.time ?? "").startsWith(today);
    const price = Number(q?.price);
    if (!q || !(price > 0)) { rows.push({ ticker: r.ticker, list: r.list, pivot: r.metrics.pivot, state: null, reason: "NO_QUOTE" }); continue; }
    const b = intradayBreakout({ pivot: r.metrics.pivot, vol50: r.metrics.vol50, price, totalVolume: Number(q.totalVolume), minutesElapsed: quoteToday ? minutes : 0 });
    if (!b) continue;
    let since = null;
    if (b.state === "BREAKOUT" || b.state === "BREAKOUT_LOW_VOL") {
      const key = `${today}|${r.ticker}|${b.state}`;
      if (!firstSeen.has(key)) firstSeen.set(key, now.toISOString());
      since = firstSeen.get(key);
    }
    rows.push({
      ticker: r.ticker, name: r.name ?? null, sector: r.sector ?? null, list: r.list, pattern: r.metrics.pattern, footprint: r.metrics.footprint,
      scanStatus: r.status, pivot: r.metrics.pivot, stopPct: r.metrics.stopPct, vol50: r.metrics.vol50,
      price, totalVolume: Number(q.totalVolume) || 0, quoteTime: q.time ?? null, quoteToday: Boolean(quoteToday),
      ...b, since,
    });
  }
  rows.sort((a, b) => (ORDER[a.state] ?? 9) - (ORDER[b.state] ?? 9) || (b.projRatio ?? 0) - (a.projRatio ?? 0));
  const count = (s) => rows.filter((x) => x.state === s).length;
  return {
    version: SEPA_INTRADAY_VERSION, asOf: now.toISOString(), date: today, session, minutesElapsed: minutes, sessionMinutes: 255,
    scanDataAsOf: doc?.dataAsOf ?? null, candidates: rows.length,
    counts: { breakout: count("BREAKOUT"), lowVol: count("BREAKOUT_LOW_VOL"), near: count("NEAR"), extended: count("EXTENDED") },
    rule: "Giá vượt pivot, KL cả phiên ngoại suy (255 phút HOSE) ≥ 1,4× TB50, chưa quá pivot + 5% (s.265, s.270)",
    rows,
  };
}
