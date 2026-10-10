// Lọc ngành (L1) — chỉ số ngành tổng hợp + RRG TUẦN theo khung JdK (Julius de Kempenaer), point-in-time.
//
// 1. Chỉ số ngành (buildSectorIndex): rổ mã cùng ngành ICB, trọng số = GTGD trung bình 60 phiên tại ngày tái cân bằng
//    (đầu mỗi tháng, chỉ dùng dữ liệu ĐẾN ngày đó), trần 25%/mã (khi rổ ≥ 4 mã), mã phải có ≥ 60 phiên và GTGD ≥ ngưỡng; chỉ số = tích
//    lợi suất ngày có trọng số (giá điều chỉnh cộng dồn). Mã mới niêm yết / bị loại tự vào – ra ở kỳ tái cân bằng kế tiếp.
// 2. RRG tuần (computeRrg): nến tuần W-FRI. RS = 100 × ngành / VN-Index.
//      RS-Ratio    = 100 + z( EMA(RS, 4) so với trung bình/độ lệch chuẩn 26 tuần trước đó )      (1 đơn vị = 1σ)
//      RS-Momentum = 100 + z( ROC 1 tuần của RS-Ratio, làm mượt EMA 4, so với 26 tuần )
//    Thang z (JdK không công bố công thức gốc; đây là phép xấp xỉ chuẩn hoá phổ biến, giữ đúng ý nghĩa: >100 = mạnh hơn /
//    tăng tốc so với chính lịch sử gần của ngành). Mọi giá trị tại tuần t chỉ dùng dữ liệu ≤ t.
// 3. Chống nhiễu (hysteresis): góc phần tư chỉ đổi khi CẢ HAI toạ độ đã vượt 100 ít nhất `band` (0,15σ) về phía mới;
//    nằm trong vùng đệm -> giữ góc cũ. Sự kiện "chuyển góc" của engine dùng góc đã lọc nhiễu, chỉ trên tuần ĐÃ ĐÓNG.
// 4. Đặc trưng xoay: heading (góc di chuyển, độ, 0° = sang phải, 90° = lên), velocity (khoảng cách / tuần), vệt đuôi.

import { weekFriday } from "../strategies/sepa/indicators.js";

export const RRG_PARAMS = Object.freeze({ smooth: 4, window: 26, momSmooth: 4, band: 0.15, minWeeks: 30, tail: 12 });
/** Rổ ≥ 2 mã có GTGD TB60 ≥ 300 triệu (để phủ cả ngành ít mã như Y tế, Bảo hiểm); < 3 mã -> gắn nhãn "rổ mỏng". */
export const INDEX_PARAMS = Object.freeze({ valueWindow: 60, minBars: 60, capWeight: 0.25, minAvgValue: 300_000_000, minMembers: 2, thinBelow: 3 });

const round = (x, nd = 4) => (Number.isFinite(x) ? Math.round(x * 10 ** nd) / 10 ** nd : null);

// ------------------------------------------------------------------ chỉ số ngành

/**
 * @param members [{ ticker, bars: [{date, close, volume, value?}] }] (giá điều chỉnh, tăng dần)
 * @param dates   lịch phiên chung (ví dụ ngày của VN-Index), tăng dần
 * @returns { series: [{date, close, n}], rebalances: [{date, weights: {ticker: w}}] }
 */
export function buildSectorIndex(members, dates, p = INDEX_PARAMS) {
  const M = members.map((m) => {
    const byDate = new Map(m.bars.map((b, i) => [b.date, i]));
    const val = m.bars.map((b) => (Number(b.value) > 0 ? Number(b.value) : b.close * (b.volume ?? 0)));
    return { ticker: m.ticker, bars: m.bars, byDate, val };
  });
  const byTicker = new Map(M.map((m) => [m.ticker, m]));
  const series = [], rebalances = [];
  let level = 100, weights = null, month = null;
  const avgValueAt = (m, i) => { if (i + 1 < p.minBars) return 0; let s = 0; for (let k = i - p.valueWindow + 1; k <= i; k++) s += m.val[k] ?? 0; return s / p.valueWindow; };
  for (let d = 0; d < dates.length; d++) {
    const date = dates[d];
    // lợi suất phiên `date` theo trọng số đã chốt ở kỳ trước (không nhìn trước)
    if (weights) {
      let r = 0, wsum = 0;
      for (const [t, w] of Object.entries(weights)) {
        const m = byTicker.get(t), i = m.byDate.get(date);
        if (i == null || i === 0) continue;
        const prev = m.bars[i - 1].close, cur = m.bars[i].close;
        if (prev > 0 && cur > 0) { r += w * (cur / prev - 1); wsum += w; }
      }
      if (wsum > 0) level *= 1 + r / wsum;
    }
    // tái cân bằng ở phiên đầu tháng (dùng dữ liệu tới HẾT phiên này -> áp từ phiên sau)
    const mo = date.slice(0, 7);
    if (mo !== month) {
      month = mo;
      const cand = [];
      for (const m of M) { const i = m.byDate.get(date); if (i == null) continue; const v = avgValueAt(m, i); if (v >= p.minAvgValue) cand.push([m.ticker, v]); }
      if (cand.length >= p.minMembers) {
        let w = Object.fromEntries(cand.map(([t, v]) => [t, v]));
        for (let it = 0; it < 10; it++) { // chuẩn hoá + trần 25% (lặp tới khi ổn định)
          const tot = Object.values(w).reduce((a, b) => a + b, 0);
          w = Object.fromEntries(Object.entries(w).map(([t, v]) => [t, v / tot]));
          const over = Object.entries(w).filter(([, v]) => v > p.capWeight + 1e-9);
          if (!over.length || cand.length * p.capWeight < 1) break;
          const excess = over.reduce((a, [, v]) => a + v - p.capWeight, 0), under = Object.entries(w).filter(([, v]) => v < p.capWeight);
          const us = under.reduce((a, [, v]) => a + v, 0);
          w = Object.fromEntries(Object.entries(w).map(([t, v]) => [t, v > p.capWeight ? p.capWeight : v + (us > 0 ? (excess * v) / us : 0)]));
        }
        weights = w; rebalances.push({ date, weights: Object.fromEntries(Object.entries(w).map(([t, v]) => [t, round(v, 4)])) });
      } else if (!weights) continue; // chưa đủ mã -> chưa bắt đầu chỉ số
    }
    if (weights) series.push({ date, close: round(level, 6), n: Object.keys(weights).length });
  }
  return { series, rebalances };
}

// ------------------------------------------------------------------ nến tuần & RRG

/** Giá đóng cửa tuần (W-FRI): { week (thứ Sáu), date (phiên cuối thực tế), close }. */
export function weeklyCloses(series) {
  const out = [];
  for (const b of series) {
    const wk = weekFriday(b.date), last = out[out.length - 1];
    if (last && last.week === wk) { last.date = b.date; last.close = b.close; } else out.push({ week: wk, date: b.date, close: b.close });
  }
  return out;
}

function ema(v, n) { const k = 2 / (n + 1), out = new Array(v.length).fill(NaN); let e = NaN; for (let i = 0; i < v.length; i++) { if (!Number.isFinite(v[i])) continue; e = Number.isFinite(e) ? v[i] * k + e * (1 - k) : v[i]; out[i] = e; } return out; }
function zAt(v, i, n) {
  if (i < n) return NaN; let s = 0, s2 = 0, c = 0;
  for (let k = i - n; k < i; k++) if (Number.isFinite(v[k])) { s += v[k]; s2 += v[k] * v[k]; c++; } // cửa sổ TRƯỚC t
  if (c < n * 0.8) return NaN; const m = s / c, sd = Math.sqrt(Math.max(0, s2 / c - m * m));
  return sd > 0 ? (v[i] - m) / sd : 0;
}
export function rawQuadrant(x, y) { return x >= 100 ? (y >= 100 ? "LEADING" : "WEAKENING") : (y >= 100 ? "IMPROVING" : "LAGGING"); }

/** Góc phần tư có vùng đệm: chỉ đổi khi cả hai toạ độ đã vượt 100 ít nhất `band` về phía của góc mới. */
export function hysteresisQuadrant(prev, x, y, band) {
  const raw = rawQuadrant(x, y);
  if (!prev || raw === prev) return raw;
  return Math.abs(x - 100) >= band && Math.abs(y - 100) >= band ? raw : prev;
}

/**
 * @param sectorWeekly / benchWeekly  [{week, date, close}] (khớp theo `week`)
 * @returns [{ week, date, rs, ratio, momentum, quadrantRaw, quadrant, heading, velocity }] — chỉ các tuần đủ dữ liệu
 */
export function computeRrg(sectorWeekly, benchWeekly, p = RRG_PARAMS) {
  const bm = new Map(benchWeekly.map((b) => [b.week, b.close]));
  const rows = sectorWeekly.filter((s) => bm.get(s.week) > 0).map((s) => ({ week: s.week, date: s.date, rs: (100 * s.close) / bm.get(s.week) }));
  const rsS = ema(rows.map((r) => r.rs), p.smooth);
  const ratio = rsS.map((_, i) => 100 + zAt(rsS, i, p.window));
  const roc = ratio.map((v, i) => (i > 0 && Number.isFinite(v) && Number.isFinite(ratio[i - 1]) ? v - ratio[i - 1] : NaN));
  const rocS = ema(roc, p.momSmooth);
  const mom = rocS.map((_, i) => 100 + zAt(rocS, i, p.window));
  const out = []; let q = null;
  for (let i = 0; i < rows.length; i++) {
    if (!Number.isFinite(ratio[i]) || !Number.isFinite(mom[i])) continue;
    q = hysteresisQuadrant(q, ratio[i], mom[i], p.band);
    const prev = out[out.length - 1];
    const dx = prev ? ratio[i] - prev.ratio : 0, dy = prev ? mom[i] - prev.momentum : 0;
    out.push({ week: rows[i].week, date: rows[i].date, rs: round(rows[i].rs, 4), ratio: round(ratio[i], 3), momentum: round(mom[i], 3),
      quadrantRaw: rawQuadrant(ratio[i], mom[i]), quadrant: q, heading: prev ? round((Math.atan2(dy, dx) * 180) / Math.PI, 1) : null, velocity: prev ? round(Math.hypot(dx, dy), 3) : null });
  }
  return out;
}

/** Các lần chuyển góc phần tư (đã lọc nhiễu) — sự kiện của engine; chỉ tuần đã đóng. */
export function quadrantTransitions(rrg, { closedThrough = null } = {}) {
  const out = [];
  for (let i = 1; i < rrg.length; i++) {
    if (closedThrough && rrg[i].week > closedThrough) break;
    if (rrg[i].quadrant !== rrg[i - 1].quadrant) out.push({ week: rrg[i].week, date: rrg[i].date, from: rrg[i - 1].quadrant, to: rrg[i].quadrant });
  }
  return out;
}
