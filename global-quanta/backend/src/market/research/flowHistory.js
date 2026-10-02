// Cô đặc nến phút (và tick Lee–Ready nếu có) của từng phiên thành 1 dòng dòng tiền + 1 Volume Profile.
// Hàm thuần: không gọi mạng, dùng lại đúng các lớp tính của IFE (signedMinutes, sessionFootprint).

import { signedMinutes, sessionFootprint } from "../scanner/ife.js";
import { computeProfile } from "../scanner/volumeAnalysis.js";

const PROFILE_BINS = 24;
const median = (a) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
export function quantile(values, q) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}
const minuteOf = (iso) => {
  const m = String(iso).match(/T(\d{2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const isContinuous = (m) => m !== null && ((m > 9 * 60 + 15 && m < 11 * 60 + 30) || (m >= 13 * 60 && m < 14 * 60 + 30));

/** p95 KL phút khớp liên tục của một phiên. */
export function sessionMinuteP95(bars) {
  return quantile(bars.filter((b) => isContinuous(minuteOf(b.date))).map((b) => b.volume || 0).filter((v) => v > 0), 0.95);
}

/**
 * Ngưỡng "tay to" của phiên = trung vị p95 KL phút của tối đa 60 phiên TRƯỚC đó (không nhìn tương lai).
 * Chưa đủ 10 phiên trước -> dùng p95 của chính phiên (ghi chú trong tài liệu).
 */
export function largeThresholdFor(priorP95s, ownP95) {
  const prior = priorP95s.slice(-60).filter((v) => v > 0);
  return prior.length >= 10 ? median(prior) : ownP95;
}

/** Volume Profile một phiên, nén gọn: {lo, hi, v[24]} + POC / vùng giá trị 70% / VWAP. */
export function sessionProfile(bars, close) {
  const prof = computeProfile([bars], close, PROFILE_BINS);
  if (!prof) return null;
  let pv = 0, vol = 0;
  for (const b of bars) {
    const typical = (b.high + b.low + b.close) / 3;
    pv += typical * (b.volume || 0);
    vol += b.volume || 0;
  }
  return {
    poc: prof.poc, vaLow: prof.valueAreaLow, vaHigh: prof.valueAreaHigh,
    vwap: vol ? Math.round(pv / vol) : null,
    bins: { lo: prof.bins[0].priceLow, hi: prof.bins.at(-1).priceHigh, v: prof.bins.map((b) => b.volume) },
  };
}

/**
 * @param {{ date, refPrice, buckets, bars }} session  phiên đã gom (groupSessions)
 * @param {number} largeThreshold
 * @param {any|null} tickFlow  tick Lee–Ready đã lưu của phiên (nếu có)
 */
export function sessionFlowRow(session, largeThreshold, tickFlow = null) {
  const { minutes, method } = signedMinutes(session, tickFlow);
  const fp = sessionFootprint(session, minutes, largeThreshold);
  const close = [...session.bars].reverse().find((b) => b.close > 0)?.close ?? null;
  return {
    date: session.date, method, close, refPrice: session.refPrice,
    volume: fp.volume, continuousVolume: fp.continuousVolume,
    delta: fp.delta, largeDelta: fp.largeDelta, smallDelta: fp.smallDelta, ret: fp.ret,
  };
}

/**
 * Cô đặc nhiều phiên liên tiếp của một mã.
 * @param {any[]} sessions  cũ -> mới
 * @param {{ priorP95s?: number[], tickByDate?: Map<string, any>, refByDate?: Map<string, number> }} ctx
 * @returns {{ flow: any[], profiles: any[] }}
 */
export function summarizeSessions(sessions, { priorP95s = [], tickByDate = new Map(), refByDate = new Map() } = {}) {
  const p95s = [...priorP95s];
  const flow = [], profiles = [];
  for (const s of sessions) {
    if (!s.bars?.length) continue;
    const session = { ...s, refPrice: refByDate.get(s.date) ?? s.refPrice };
    if (!(session.refPrice > 0)) continue;
    const own = sessionMinuteP95(s.bars);
    const threshold = largeThresholdFor(p95s, own);
    const row = sessionFlowRow(session, threshold || Infinity, tickByDate.get(s.date) ?? null);
    flow.push({ ...row, minuteP95: own });
    const prof = sessionProfile(s.bars, row.close);
    if (prof) profiles.push({ date: s.date, ...prof });
    p95s.push(own);
  }
  return { flow, profiles };
}

/** Gộp Volume Profile của nhiều phiên (bin nén) vào một lưới chung -> POC / vùng giá trị. */
export function rollingProfile(profiles, close) {
  const pseudoBars = [];
  for (const p of profiles) {
    const b = p.bins;
    if (!b?.v?.length || !(b.hi > b.lo)) continue;
    const w = (b.hi - b.lo) / b.v.length;
    b.v.forEach((vol, i) => {
      if (vol > 0) { const mid = b.lo + (i + 0.5) * w; pseudoBars.push({ high: mid, low: mid, close: mid, volume: vol }); }
    });
  }
  if (!pseudoBars.length) return null;
  const prof = computeProfile([pseudoBars], close, PROFILE_BINS);
  return prof && { poc: prof.poc, vaLow: prof.valueAreaLow, vaHigh: prof.valueAreaHigh, position: prof.position };
}
