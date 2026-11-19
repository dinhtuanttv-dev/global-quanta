// I0-G3 (19/11/2026) — Vũ trụ mã ĐÚNG THỜI ĐIỂM cho mọi kiểm định (bài học 12/11/2026: chọn mẫu theo thanh khoản hiện tại làm GL 5/5 còn +0,88%).
// Hàm thuần. Một mã thuộc vũ trụ ngày D khi, chỉ dùng dữ liệu TRƯỚC ngày D:
//   - đã niêm yết (listedDate ≤ D, nếu có) và chưa huỷ niêm yết (delistedDate > D, nếu có);
//   - có ít nhất `minSessions` phiên có giá trước D;
//   - trung vị GTGD khớp lệnh `window` phiên gần nhất trước D ≥ `minValue` đồng;
//   - phiên gần nhất có giá cách D không quá `maxGapDays` ngày (bỏ mã đang tạm ngừng giao dịch).
// Mã đã huỷ niêm yết VẪN có mặt ở những ngày trước khi huỷ — đó là cốt lõi để tránh thiên lệch sống sót.

export const UNIVERSE_DEFAULTS = { minValue: 1e9, window: 20, minSessions: 120, maxGapDays: 10 };

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/** Chỉ số phiên cuối cùng có ngày < d (tìm nhị phân trên mảng ngày tăng dần). */
function lastBefore(dates, d) {
  let lo = 0, hi = dates.length - 1, ans = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (dates[mid] < d) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
  return ans;
}

/**
 * @param {string} date YYYY-MM-DD
 * @param {{ listings: {code:string, listedDate?:string|null, delistedDate?:string|null}[],
 *           series: Map<string, {dates:string[], values:number[]}> }} data  values = GTGD khớp lệnh (đồng) theo phiên
 * @returns {{ code: string, medianValue: number }[]}
 */
export function universeAt(date, { listings, series }, opts = {}) {
  const o = { ...UNIVERSE_DEFAULTS, ...opts };
  const out = [];
  for (const l of listings) {
    if (l.listedDate && l.listedDate > date) continue;
    if (l.delistedDate && l.delistedDate <= date) continue;
    const s = series.get(l.code);
    if (!s?.dates.length) continue;
    const j = lastBefore(s.dates, date);
    if (j + 1 < o.minSessions) continue;
    if (daysBetween(s.dates[j], date) > o.maxGapDays) continue;
    const vals = s.values.slice(Math.max(0, j - o.window + 1), j + 1).filter((v) => Number.isFinite(v) && v >= 0);
    if (vals.length < Math.ceil(o.window / 2)) continue;
    const mv = median(vals);
    if (mv >= o.minValue) out.push({ code: l.code, medianValue: mv });
  }
  return out.sort((a, b) => b.medianValue - a.medianValue);
}
