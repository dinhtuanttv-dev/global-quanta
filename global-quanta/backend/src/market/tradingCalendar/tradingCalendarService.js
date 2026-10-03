// Lịch giao dịch TỰ VẬN HÀNH nhiều năm, 3 lớp (ưu tiên từ cao xuống):
//  1. QUAN SÁT — với mọi ngày đã có dữ liệu (≤ phiên VN-Index gần nhất): ngày thường KHÔNG có phiên = nghỉ, có phiên = giao
//     dịch. Bắt được cả ngày Chính phủ cho đổi ngày làm việc và sự cố đóng sàn mà không quy tắc nào đoán trước được.
//  2. CHÍNH THỨC (tuỳ chọn) — MARKET_HOLIDAYS khi Sở đã công bố (VD ngày nghỉ nối); không bắt buộc.
//  3. QUY TẮC — vnHolidays.js (âm lịch + Bộ luật Lao động) cho mọi năm tương lai.
// Kiểm chứng 2017–2026: quy tắc khớp 106/106 ngày nghỉ, không đánh nhầm ngày nào; 8 ngày nghỉ nối/sự cố do lớp 1 bắt.

import { ruleHolidaySet } from "./vnHolidays.js";

const DAY = 86_400_000;
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const isWeekendIso = (d) => { const w = new Date(`${d}T00:00:00Z`).getUTCDay(); return w === 0 || w === 6; };

/** Hàm thuần: từ danh sách ngày CÓ phiên (ISO) suy ra ngày thường không có phiên trong [phiên đầu, phiên cuối]. */
export function observedFromSessions(sessionDates) {
  const traded = new Set(sessionDates);
  const sorted = [...traded].sort();
  const holidays = new Set();
  if (sorted.length >= 2) {
    for (let t = Date.parse(`${sorted[0]}T00:00:00Z`); t <= Date.parse(`${sorted.at(-1)}T00:00:00Z`); t += DAY) {
      const d = iso(t);
      if (!isWeekendIso(d) && !traded.has(d)) holidays.add(d);
    }
  }
  return { traded, holidays, from: sorted[0] ?? null, through: sorted.at(-1) ?? null };
}

/**
 * Hàm thuần: quyết định một ngày (ISO, ngày thường) có nghỉ không và vì sao.
 * @returns {{ holiday: boolean, source: "OBSERVED"|"OFFICIAL"|"RULE"|null, reason: string|null }}
 */
export function classifyDay(date, { observed, official = new Set(), rules }) {
  if (isWeekendIso(date)) return { holiday: true, source: null, reason: "Cuối tuần" };
  const ruleReason = rules.get(date) ?? null;
  if (observed?.through && observed.from && date >= observed.from && date <= observed.through) {
    if (observed.holidays.has(date)) return { holiday: true, source: "OBSERVED", reason: ruleReason ?? "Không có phiên (nghỉ nối / đổi ngày làm việc)" };
    return { holiday: false, source: "OBSERVED", reason: null };
  }
  if (official.has(date)) return { holiday: true, source: "OFFICIAL", reason: ruleReason ?? "Lịch nghỉ do Sở công bố" };
  if (ruleReason) return { holiday: true, source: "RULE", reason: ruleReason };
  return { holiday: false, source: null, reason: null };
}

export function createTradingCalendarService({ loadSessionDates, official = () => new Set(), now = Date.now, refreshMs = 6 * 3_600_000 } = {}) {
  let observed = null;
  let loadedAt = null;
  let lastError = null;
  let rules = new Map();
  let rulesRange = [0, -1];
  let timer;

  function ensureRules(year) {
    if (year >= rulesRange[0] && year <= rulesRange[1]) return;
    const from = Math.min(rulesRange[0] || year, year - 2);
    const to = Math.max(rulesRange[1], year + 3);
    rules = ruleHolidaySet(from, to);
    rulesRange = [from, to];
  }

  function classify(date) {
    ensureRules(Number(date.slice(0, 4)));
    return classifyDay(date, { observed, official: official(), rules });
  }

  async function refresh() {
    try {
      const dates = await loadSessionDates();
      if (Array.isArray(dates) && dates.length > 100) {
        observed = observedFromSessions(dates);
        loadedAt = new Date(now()).toISOString();
        lastError = null;
      }
    } catch (e) {
      lastError = String(e?.message ?? e).slice(0, 200);
    }
    return status();
  }

  function status() {
    return {
      layers: ["OBSERVED", "OFFICIAL", "RULE"],
      observedFrom: observed?.from ?? null, observedThrough: observed?.through ?? null,
      observedHolidays: observed?.holidays.size ?? 0, loadedAt, lastError, officialCount: official().size,
    };
  }

  return {
    isHoliday: (date) => classify(date).holiday,
    classify,
    /** Ngày nghỉ (ngày thường) trong [from, to]. */
    list(from, to) {
      const out = [];
      for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += DAY) {
        const d = iso(t);
        if (isWeekendIso(d)) continue;
        const c = classify(d);
        if (c.holiday) out.push({ date: d, source: c.source, reason: c.reason });
      }
      return out;
    },
    refresh,
    status,
    start() {
      if (timer) return;
      void refresh();
      timer = setInterval(() => { void refresh(); }, refreshMs);
      timer.unref?.();
    },
    stop() { clearInterval(timer); timer = undefined; },
  };
}
