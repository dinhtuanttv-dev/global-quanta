// MV1 (29/10/2026) — lợi suất THÁNG dương lịch từ chuỗi giá ngày (hàm thuần, không I/O).
//   r(y,m) = đóng cửa phiên cuối tháng m / đóng cửa phiên cuối tháng m−1 − 1.
//   Tháng chỉ hợp lệ khi phiên cuối rơi từ ngày SEAS.monthEndMinDay trở đi (dữ liệu tới cuối tháng); thiếu -> không có quan sát
//   (KHÔNG bao giờ thay bằng 0). Tháng chưa kết thúc (tháng của ngày dữ liệu) -> "đang diễn ra" (MTD), tách khỏi mẫu.
import { SEAS } from "./config.js";

export const ymOf = (date) => String(date).slice(0, 7);
export const prevYm = (ym) => {
  const y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7));
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
};

/** Phiên cuối của từng tháng: Map ym -> { date, close, valid } (valid = phiên cuối ≥ ngày minDay). */
export function monthEnds(bars, minDay = SEAS.monthEndMinDay) {
  const out = new Map();
  for (const b of bars) {
    if (!(b?.close > 0) || b.partial) continue;
    const ym = ymOf(b.date);
    const cur = out.get(ym);
    if (!cur || b.date > cur.date) out.set(ym, { date: b.date, close: b.close });
  }
  for (const v of out.values()) v.valid = Number(v.date.slice(8, 10)) >= minDay;
  return out;
}

/**
 * Lợi suất các tháng ĐÃ KẾT THÚC (ym < tháng của asOf) + MTD của tháng đang chạy.
 * @returns {{ returns: Map<string, number>, mtd: { ym, r, from, to } | null, firstDate: string|null, lastDate: string|null }}
 */
export function monthlyReturns(bars, { asOf, minDay = SEAS.monthEndMinDay } = {}) {
  const ends = monthEnds(bars, minDay);
  const nowYm = ymOf(asOf);
  const returns = new Map();
  for (const [ym, e] of ends) {
    if (ym >= nowYm || !e.valid) continue;
    const p = ends.get(prevYm(ym));
    if (p?.valid) returns.set(ym, e.close / p.close - 1);
  }
  let mtd = null;
  const cur = ends.get(nowYm), base = ends.get(prevYm(nowYm));
  if (cur && base?.valid) mtd = { ym: nowYm, r: cur.close / base.close - 1, from: base.date, to: cur.date };
  const dates = bars.filter((b) => b?.close > 0 && !b.partial).map((b) => b.date);
  return { returns, mtd, firstDate: dates[0] ?? null, lastDate: dates.at(-1) ?? null };
}

const Z90 = 1.6448536269514722;
/** Khoảng Wilson cho tỷ lệ k/n (mức 90% mặc định). n = 0 -> null. */
export function wilson(k, n, z = Z90) {
  if (!(n > 0)) return null;
  const p = k / n, z2 = z * z;
  const den = 1 + z2 / n;
  const mid = (p + z2 / (2 * n)) / den;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / den;
  return [Math.max(0, mid - half), Math.min(1, mid + half)];
}

/** Thống kê mô tả của một ô (mảng số, có thể rỗng). */
export function describe(values) {
  const xs = values.filter((v) => Number.isFinite(v));
  const n = xs.length;
  if (!n) return { n: 0, mean: null, median: null, min: null, max: null, positive: 0, positiveCi: null };
  const s = [...xs].sort((a, b) => a - b);
  const median = n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
  const positive = xs.filter((v) => v > 0).length;
  return { n, mean: xs.reduce((a, b) => a + b, 0) / n, median, min: s[0], max: s[n - 1], positive, positiveCi: wilson(positive, n) };
}
