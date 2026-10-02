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
 * @param {{ signal, direction, regime, horizon, hit, excessRet, ret }[]} joined  ledger ⋈ outcomes
 * @param {Record<number, number>} baselineHit  tỷ lệ "vượt VN-Index" vô điều kiện theo kỳ hạn
 */
export function summarizePerformance(joined, baselineHit = {}) {
  const groups = new Map();
  for (const r of joined) {
    if (!r.direction) continue;
    for (const regime of ["ALL", r.regime ?? "UNKNOWN"]) {
      const key = `${r.signal}|${regime}|${r.horizon}`;
      let g = groups.get(key);
      if (!g) groups.set(key, (g = { signal: r.signal, regime, horizon: r.horizon, n: 0, hits: 0, sum: 0, sumSq: 0, long: 0, short: 0 }));
      const signed = r.direction * (r.excessRet ?? r.ret);
      g.n++; g.hits += r.hit ? 1 : 0; g.sum += signed; g.sumSq += signed * signed;
      if (r.direction > 0) g.long++; else g.short++;
    }
  }
  const rows = [...groups.values()].map((g) => {
    const avg = g.sum / g.n;
    const sd = g.n > 1 ? Math.sqrt(Math.max(0, (g.sumSq - g.n * avg * avg) / (g.n - 1))) : null;
    const t = sd ? avg / (sd / Math.sqrt(g.n)) : null;
    const hitRate = g.hits / g.n;
    const base = baselineHit[g.horizon] ?? 0.5;
    const [lo, hi] = wilson(g.hits, g.n);
    // Kiểm định một phía: tỷ lệ trúng > tỷ lệ nền.
    const zHit = g.n ? (hitRate - base) / Math.sqrt(base * (1 - base) / g.n) : 0;
    const signal = g.n >= 30 && lo > base ? "edge" : g.n >= 30 && hi < base ? "negative" : g.n < 30 ? "insufficient" : "none";
    return {
      signal: g.signal, regime: g.regime, horizon: g.horizon, n: g.n, long: g.long, short: g.short,
      hitRate: round(hitRate, 4), hitLow: round(lo, 4), hitHigh: round(hi, 4), baseline: round(base, 4),
      avgSignedExcess: round(avg, 5), tStat: round(t, 2), pValue: round(1 - normCdf(zHit), 4), verdict: signal,
    };
  });
  return rows.sort((a, b) => a.signal.localeCompare(b.signal) || a.regime.localeCompare(b.regime) || a.horizon - b.horizon);
}

function round(v, d) {
  if (v === null || v === undefined || !Number.isFinite(v)) return null;
  const f = 10 ** d;
  return Math.round(v * f) / f;
}
