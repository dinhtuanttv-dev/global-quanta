// Order Flow cho TA VN-Index (TA_VNINDEX_UPGRADE_SPEC §2.2.3).
//   - Dòng lệnh theo phút: bộ phân loại Lee–Ready của StreamHub (quote rule -> tick rule), lưu ở market_tick_flow
//     + phút hôm nay trong bộ nhớ. Sàn KHÔNG công bố bên chủ động -> mọi số Mua/Bán chủ động là INFERRED.
//   - Phút khớp định kỳ (ATO 09:15, ATC ≥ 14:45) KHÔNG có bên chủ động: chuyển toàn bộ sang `auction`
//     (bộ ghi cũ có gán nhầm lệnh ATC là "bán chủ động" — VD FPT 08/10 phút 14:45: 338.900 cp).
//   - Lệnh lớn ("tay to"): kích thước lệnh ≥ phân vị 99 (theo số lệnh) của chính mã trong cửa sổ; không có bên -> chỉ đếm KL.
//   - Khối ngoại: giá trị mua/bán theo ngày từ market_daily (dữ liệu sàn — HARD), ~1 năm.

import { canonicalSymbol, isIndexSymbol, isValidSymbol } from "../normalizer.js";
import { ValidationError } from "../errors.js";
import { lastCompletedSessionDate, vnDate } from "../calendar.js";
import { addDays } from "../util.js";
import { tradingDatesBack } from "../scanner/scannerJobs.js";
import { loadTickFlows } from "../scanner/tickFlowService.js";

const ATO_MINUTE = 9 * 60 + 15;
const ATC_MINUTE = 14 * 60 + 45;
export const LARGE_PRINT_PCT = 0.99;

/** Ngưỡng lệnh lớn = phân vị `pct` của kích thước lệnh (đếm theo số lệnh) trên toàn cửa sổ (hàm thuần). */
export function largePrintThreshold(minutes, pct = LARGE_PRINT_PCT) {
  const counts = new Map();
  let total = 0;
  for (const m of minutes) {
    if (m.auction) continue;
    for (const [size, n] of Object.entries(m.sizes ?? {})) {
      const q = Number(size);
      if (!(q > 0)) continue;
      counts.set(q, (counts.get(q) ?? 0) + Number(n));
      total += Number(n);
    }
  }
  if (!total) return null;
  let acc = 0;
  for (const q of [...counts.keys()].sort((a, b) => a - b)) {
    acc += counts.get(q);
    if (acc / total >= pct) return q;
  }
  return null;
}

/** Chuẩn hoá phút: tách khớp định kỳ, đếm KL lệnh lớn (hàm thuần). */
export function normalizeFlowMinutes(rows, { isIndex = false } = {}) {
  const base = rows.map((m) => {
    const auction = m.minute >= ATC_MINUTE || (!isIndex && m.minute <= ATO_MINUTE);
    const total = (m.buy ?? 0) + (m.sell ?? 0) + (m.unknown ?? 0);
    return auction
      ? { date: m.date, minute: m.minute, buy: 0, sell: 0, unknown: 0, auction: total, prints: m.prints ?? 0, sizes: m.sizes ?? {} }
      : { date: m.date, minute: m.minute, buy: m.buy ?? 0, sell: m.sell ?? 0, unknown: m.unknown ?? 0, auction: 0, prints: m.prints ?? 0, sizes: m.sizes ?? {} };
  });
  const threshold = largePrintThreshold(base.map((m) => ({ ...m, auction: m.auction > 0 })));
  return {
    threshold,
    minutes: base.map(({ sizes, ...m }) => {
      let large = 0;
      if (threshold && !m.auction) for (const [size, n] of Object.entries(sizes)) if (Number(size) >= threshold) large += Number(size) * Number(n);
      return { ...m, large };
    }),
  };
}

export function createTaFlow({ store, hub, now = Date.now }) {
  return {
    async get({ symbol: raw, days = 20 }) {
      const symbol = canonicalSymbol(raw);
      if (!isValidSymbol(symbol)) throw new ValidationError("Mã chứng khoán không hợp lệ.");
      const n = Math.min(Math.max(Number(days) || 20, 1), 30);
      const isIndex = isIndexSymbol(symbol);
      const nowDate = new Date(now());
      const today = vnDate(nowDate);
      const dates = tradingDatesBack(lastCompletedSessionDate(nowDate), n);
      const from = dates[0] ?? today;

      let minutes = [];
      let threshold = null;
      if (!isIndex) {
        const { history, today: live } = await loadTickFlows({ store, hub, symbol, from, to: today, today });
        const rows = [];
        for (const s of history.values()) for (const m of s.minutes) rows.push({ date: s.date, ...m });
        if (live) for (const m of live.minutes) rows.push({ date: live.date, ...m });
        const norm = normalizeFlowMinutes(rows.sort((a, b) => a.date.localeCompare(b.date) || a.minute - b.minute), { isIndex });
        minutes = norm.minutes;
        threshold = norm.threshold;
      }
      const tickSessions = [...new Set(minutes.map((m) => m.date))];

      // Khối ngoại ~1 năm (dữ liệu sàn). Chỉ số: không có khối ngoại theo mã.
      let foreign = [];
      if (!isIndex && typeof store.getMarketDailyRange === "function") {
        try {
          const rows = await store.getMarketDailyRange({ from: addDays(today, -400), to: today, symbols: [symbol] });
          foreign = rows
            .filter((r) => r.foreignBuyVal != null || r.foreignSellVal != null)
            .map((r) => ({ date: r.date, buyVal: r.foreignBuyVal ?? 0, sellVal: r.foreignSellVal ?? 0, netVal: (r.foreignBuyVal ?? 0) - (r.foreignSellVal ?? 0), room: r.foreignRoom ?? null }));
        } catch (error) {
          console.warn(`[market] Đọc khối ngoại ${symbol} lỗi: ${error.message}`);
        }
      }
      return {
        symbol, ticker: symbol, minutes, largePrintThreshold: threshold, foreign,
        coverage: { requestedSessions: dates.length, tickSessions: tickSessions.length, firstTickSession: tickSessions[0] ?? null },
        provenance: {
          flow: "INFERRED (Lee–Ready: quote rule -> tick rule; ATO/ATC tách riêng)",
          foreign: "HARD (market_daily, giá trị mua/bán khối ngoại theo ngày)",
          asOf: minutes.at(-1) ? `${minutes.at(-1).date} ${minutes.at(-1).minute}` : null,
        },
      };
    },
  };
}
