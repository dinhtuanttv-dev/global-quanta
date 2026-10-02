// Vòng phản hồi: (1) phát tín hiệu theo quy tắc công khai, (2) chấm kết quả sau T+3/T+5/T+10,
// (3) tổng hợp hiệu suất theo tín hiệu × trạng thái thị trường × kỳ hạn, có khoảng tin cậy.

import { tripleBarrier } from "../scanner/ifeValidation.js";
import { normCdf } from "../scanner/ife.js";

export const HORIZONS = [3, 5, 10];
export const STEALTH_Z = 1.5;
export const INTENT_MIN_P = 0.5;
export const ADAPTIVE_BAND = 0.05; // P ≥ 0.55 -> +1, P ≤ 0.45 -> −1
export const IMPULSE_BANDS = { high: 60, low: 40 };

export const SIGNAL_LABELS = {
  STEALTH_5: "Stealth Score 5 phiên",
  STEALTH_20: "Stealth Score 20 phiên",
  IFE_INTENT: "Bản đồ ý đồ dòng tiền (HMM)",
  IMPULSE: "Market Impulse Gauge",
  ADAPTIVE_T3: "Điểm thích ứng T+3",
  ADAPTIVE_T5: "Điểm thích ứng T+5",
  ADAPTIVE_T10: "Điểm thích ứng T+10",
};

/** Tín hiệu cấp mã từ đặc trưng ngày. Chỉ ghi khi tín hiệu "bật" (direction ≠ 0). */
export function stockSignals(day) {
  const out = [];
  for (const [signal, z] of [["STEALTH_5", day.stealth5], ["STEALTH_20", day.stealth20]]) {
    if (z !== null && Math.abs(z) >= STEALTH_Z) out.push({ signal, direction: Math.sign(z), score: z });
  }
  const it = day.intent;
  if (it && it.p >= INTENT_MIN_P && it.id !== "NEUTRAL") {
    out.push({ signal: "IFE_INTENT", direction: it.id.startsWith("ACC") ? 1 : -1, score: it.p, extra: { state: it.id } });
  }
  return out;
}

export function impulseSignal(score) {
  if (score === null || score === undefined) return null;
  const direction = score >= IMPULSE_BANDS.high ? 1 : score <= IMPULSE_BANDS.low ? -1 : 0;
  return direction ? { signal: "IMPULSE", direction, score } : null;
}

export function adaptiveSignal(horizon, prob) {
  const direction = prob >= 0.5 + ADAPTIVE_BAND ? 1 : prob <= 0.5 - ADAPTIVE_BAND ? -1 : 0;
  return direction ? { signal: `ADAPTIVE_T${horizon}`, direction, score: prob } : null;
}

/**
 * Kết quả sau h phiên.
 * @param {any[]} rows   dòng ngày của mã (cũ -> mới, có closeAdj/close/high/low)
 * @param {number} i     chỉ số phiên phát tín hiệu
 * @param {Map<string, number>|null} benchClose  VN-Index đóng cửa theo ngày (null = chính là chỉ số)
 */
export function evaluateOutcome(rows, i, direction, horizon, benchClose = null) {
  if (i < 0 || i + horizon >= rows.length) return null;
  const base = rows[i].closeAdj ?? rows[i].close;
  const end = rows[i + horizon].closeAdj ?? rows[i + horizon].close;
  if (!(base > 0) || !(end > 0)) return null;
  const ret = end / base - 1;
  let benchRet = null;
  if (benchClose) {
    const b0 = benchClose.get(rows[i].date), b1 = benchClose.get(rows[i + horizon].date);
    if (!(b0 > 0) || !(b1 > 0)) return null;
    benchRet = b1 / b0 - 1;
  }
  const excess = benchClose ? ret - benchRet : ret;
  // ATR% 14 phiên tới ngày phát tín hiệu (cho ba rào chắn).
  let atrPct = null;
  if (i >= 15) {
    let s = 0;
    for (let k = i - 13; k <= i; k++) {
      const prev = rows[k - 1].close;
      s += Math.max(rows[k].high - rows[k].low, Math.abs(rows[k].high - prev), Math.abs(rows[k].low - prev)) / rows[k].close;
    }
    atrPct = s / 14;
  }
  let mfe = 0, mae = 0;
  for (let j = i + 1; j <= i + horizon; j++) {
    const f = rows[j].close ? (rows[j].closeAdj ?? rows[j].close) / rows[j].close : 1;
    const up = (rows[j].high * f) / base - 1, dn = (rows[j].low * f) / base - 1;
    const fav = direction >= 0 ? up : -dn, adv = direction >= 0 ? dn : -up;
    mfe = Math.max(mfe, fav);
    mae = Math.min(mae, adv);
  }
  return {
    ret, benchRet, excessRet: excess,
    barrier: atrPct ? tripleBarrier(rows.map((r) => ({ ...r, closeAdj: r.closeAdj ?? r.close })), i, horizon, 1.5, atrPct) : null,
    mfe, mae,
    hit: direction === 0 ? null : direction * excess > 0,
  };
}

/** Khoảng Wilson 95% cho tỷ lệ. */
export function wilson(k, n, z = 1.96) {
  if (!n) return [null, null];
  const p = k / n, d = 1 + z * z / n;
  const c = (p + z * z / (2 * n)) / d, h = (z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}

/**
 * Phương sai cụm hai chiều (Cameron–Gelbach–Miller) của tổng phần dư:
 *   V = V_ngày + V_mã − V_quan sát.
 * - Cụm NGÀY: các khối h phiên liên tiếp (nhãn T+h của các ngày trong cùng khối chồng lấn nhau,
 *   và các mã cùng ngày cùng chịu một cú sốc thị trường).
 * - Cụm MÃ: tín hiệu của một mã kéo dài nhiều ngày liền (Stealth bền bỉ) -> tương quan chuỗi.
 *   Chỉ dùng khi có ≥ 10 mã (tín hiệu cấp chỉ số chỉ có 1 "mã").
 */
export function twoWayClusterVariance(rows, residual, dateBlock) {
  const sq = (m) => { let v = 0; for (const x of m.values()) v += x * x; return v; };
  const byDate = new Map(), bySym = new Map();
  let white = 0;
  for (const r of rows) {
    const e = residual(r);
    white += e * e;
    const db = dateBlock(r);
    byDate.set(db, (byDate.get(db) ?? 0) + e);
    bySym.set(r.symbol, (bySym.get(r.symbol) ?? 0) + e);
  }
  const vDate = sq(byDate);
  if (bySym.size < 10) return { variance: Math.max(vDate, white), dateClusters: byDate.size, symbolClusters: bySym.size };
  const vSym = sq(bySym);
  const v = vDate + vSym - white;
  // CGM có thể âm với mẫu nhỏ -> lấy phương sai một chiều lớn hơn (thận trọng).
  return { variance: v > 0 ? Math.max(v, white) : Math.max(vDate, vSym, white), dateClusters: byDate.size, symbolClusters: bySym.size };
}

/**
 * Mốc so sánh "không có kỹ năng" phải cùng CHIỀU và cùng NGÀY với tín hiệu:
 *   - Mua (+1) trúng khi mã vượt VN-Index; bán (−1) trúng khi mã thua VN-Index. Vì đa số mã thường
 *     thua chỉ số vốn hoá, tỷ lệ nền của chiều bán cao hơn hẳn chiều mua -> phải tính riêng.
 *   - Mỗi tín hiệu so với toàn universe CÙNG NGÀY (độ rộng thị trường thay đổi theo thời gian):
 *     expectedHit = p_up(ngày, h) nếu mua, 1 − p_up nếu bán; lợi suất vượt được trừ trung bình
 *     cắt ngang cùng ngày trước khi nhân chiều (tránh "lãi miễn phí" của chiều bán).
 * Kiểm định: z/t với sai số CỤM hai chiều (ngày theo khối h phiên × mã) vì tín hiệu chồng lấn;
 * zHit/tStat (giả định độc lập) giữ lại để tham khảo. Phán định dùng bản cụm.
 * @param {{ signal, symbol, date, direction, regime, horizon, hit, expectedHit, signedExcess }[]} joined
 */
export function summarizePerformance(joined) {
  // Thứ hạng ngày giao dịch (để chia khối h phiên liên tiếp).
  const dateRank = new Map([...new Set(joined.map((r) => r.date).filter(Boolean))].sort().map((d, i) => [d, i]));
  const groups = new Map();
  for (const r of joined) {
    if (!r.direction || r.expectedHit === null || r.expectedHit === undefined) continue;
    for (const regime of ["ALL", r.regime ?? "UNKNOWN"]) {
      const key = `${r.signal}|${regime}|${r.horizon}`;
      let g = groups.get(key);
      if (!g) groups.set(key, (g = { signal: r.signal, regime, horizon: r.horizon, rows: [], long: 0, short: 0 }));
      g.rows.push(r);
      if (r.direction > 0) g.long++; else g.short++;
    }
  }
  const rows = [...groups.values()].map((g) => {
    const n = g.rows.length;
    let hits = 0, exp = 0, expVar = 0, sum = 0, sumSq = 0;
    for (const r of g.rows) {
      hits += r.hit ? 1 : 0; exp += r.expectedHit; expVar += r.expectedHit * (1 - r.expectedHit);
      sum += r.signedExcess; sumSq += r.signedExcess * r.signedExcess;
    }
    const avg = sum / n;
    const sd = n > 1 ? Math.sqrt(Math.max(0, (sumSq - n * avg * avg) / (n - 1))) : null;
    const t = sd ? avg / (sd / Math.sqrt(n)) : null;
    const hitRate = hits / n;
    const base = exp / n;
    const [lo, hi] = wilson(hits, n);
    const zHit = expVar > 0 ? (hits - exp) / Math.sqrt(expVar) : 0;

    // Sai số cụm hai chiều.
    const block = (r) => (r.date && dateRank.has(r.date) ? Math.floor(dateRank.get(r.date) / Math.max(1, g.horizon)) : r.date);
    const hc = twoWayClusterVariance(g.rows, (r) => (r.hit ? 1 : 0) - r.expectedHit, block);
    const ec = twoWayClusterVariance(g.rows, (r) => r.signedExcess - avg, block);
    const zCl = hc.variance > 0 ? (hits - exp) / Math.sqrt(hc.variance) : 0;
    const tCl = ec.variance > 0 ? sum / Math.sqrt(ec.variance) : null;
    // Hệ số co giãn hiệu dụng: n_hiệu dụng ≈ n × (phương sai độc lập / phương sai cụm).
    const effN = hc.variance > 0 ? Math.round((n * expVar) / hc.variance) : n;

    const enough = n >= 30 && hc.dateClusters >= 8;
    const verdict = !enough ? "insufficient" : zCl >= 1.96 ? "edge" : zCl <= -1.96 ? "negative" : "none";
    return {
      signal: g.signal, regime: g.regime, horizon: g.horizon, n, long: g.long, short: g.short,
      hitRate: round(hitRate, 4), hitLow: round(lo, 4), hitHigh: round(hi, 4), baseline: round(base, 4),
      avgSignedExcess: round(avg, 5), tStat: round(t, 2), zHit: round(zHit, 2),
      zHitClustered: round(zCl, 2), tStatClustered: round(tCl, 2), effectiveN: Math.min(n, effN),
      clusters: { dates: hc.dateClusters, symbols: hc.symbolClusters },
      pValue: round(1 - normCdf(zCl), 4), verdict,
    };
  });
  return rows.sort((a, b) => a.signal.localeCompare(b.signal) || a.regime.localeCompare(b.regime) || a.horizon - b.horizon);
}

function round(v, d) {
  if (v === null || v === undefined || !Number.isFinite(v)) return null;
  const f = 10 ** d;
  return Math.round(v * f) / f;
}
