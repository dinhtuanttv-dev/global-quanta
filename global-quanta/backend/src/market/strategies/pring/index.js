// Pattern Scanner v2 (Martin Pring) — P1: engine point-in-time. scanPatterns(S, t) trả về các mô hình còn "tươi" tại t
// (đang hình thành gần điểm phá vỡ, hoặc vừa phá vỡ / xác nhận / pullback / đạt mục tiêu / thất bại trong N thanh gần nhất),
// mỗi mô hình kèm vòng đời, bằng chứng Pring (checklist + điểm minh bạch chưa kiểm định), kế hoạch R:R, hình học để vẽ.

import { PRING } from "./config.js";
import { pivotsAt, preparePattern } from "./core.js";
import { detectAll, FAMILY_VI, TYPE_VI } from "./patterns.js";
import { evidence, lifecycle, plan, STATE_VI } from "./lifecycle.js";

export { PRING } from "./config.js";
export { TYPE_VI, FAMILY_VI } from "./patterns.js";
export { STATE_VI } from "./lifecycle.js";
export { barPatternsAt, BAR_LABEL } from "./bars.js";
export { preparePattern, pivotsAt, zigzag, atrOf } from "./core.js";

export const PATTERN_ENGINE = "pring/P2";
const ACTIVE = new Set(["BREAKOUT", "CONFIRMED", "PULLBACK", "TARGET1", "TARGET2"]);
/** Độ "tươi": đang hình thành (điểm cuối mô hình ≤ 40 thanh trước) hoặc sự kiện cuối ≤ 20 thanh trước. */
export const FRESH = Object.freeze({ formingBars: 40, eventBars: 20, failedBars: 5 });

function lastEventIdx(lc) {
  return Math.max(lc.breakoutIdx ?? -1, lc.confirmIdx ?? -1, lc.pullbackIdx ?? -1, lc.failIdx ?? -1, ...(lc.targetsHit ?? []).map((x) => x.i));
}

function serialize(S, t, g, lc, ev, pl) {
  const at = (f, i) => (f ? f(Math.min(i, t)) : null);
  const bo = lc.breakoutIdx;
  return {
    type: g.type, label: TYPE_VI[g.type] ?? g.type, family: g.family, familyLabel: FAMILY_VI[g.family], subLabel: g.label2 ?? null,
    dir: g.dir > 0 ? "bull" : "bear", role: g.role, degree: g.degree ?? "intermediate",
    state: lc.state, stateLabel: STATE_VI[lc.state], score: ev.score,
    startDate: S.date[g.startIdx], endDate: S.date[g.endIdx], width: g.endIdx - g.startIdx,
    heightPct: Math.expm1(g.height) * 100,
    levelNow: at(g.level, t), levelAtBreakout: bo != null ? g.level(bo) : null, opposite: at(g.opposite, bo ?? t),
    invalidation: g.invalidation ?? null,
    breakout: bo != null ? { date: S.date[bo], price: S.C[bo], volRatio: ev.boVol, confirmDate: lc.confirmIdx != null ? S.date[lc.confirmIdx] : null } : null,
    pullbackDate: lc.pullbackIdx != null ? S.date[lc.pullbackIdx] : null,
    failure: lc.failIdx != null ? { date: S.date[Math.min(lc.failIdx, t)], reason: lc.failReason } : null,
    failLevel: lc.failLevel ?? null, targets: lc.targets ?? [1, 2, 3].map((k) => g.level(t) * Math.exp(g.dir * k * g.height)),
    targetsHit: lc.targetsHit.map((x) => ({ k: x.k, date: x.date })),
    events: lc.events,
    points: g.points, lines: g.lines.map((l) => ({ ...l, d0: S.date[Math.max(0, Math.min(l.i0, t))], d1: S.date[Math.max(0, Math.min(l.i1, t))] })),
    apexDate: g.apexIdx != null ? (g.apexIdx <= t ? S.date[g.apexIdx] : null) : null, apexBarsAhead: g.apexIdx != null ? g.apexIdx - t : null,
    curve: g.curve ? { ...g.curve, startDate: S.date[g.curve.a] } : null,
    checks: [...(g.checks ?? []), ...ev.items],
    barSignals: { warn: ev.bars.warn, confirm: ev.bars.confirm },
    context: { majorTrend: ev.trend, withTrend: ev.withTrend, counterTrend: ev.counterTrend, divergence: ev.divergence, trianglePosition: ev.triPos, priorMove: g.priorMove ?? null, priorOk: g.priorOk !== false },
    plan: pl,
    distancePct: (S.C[t] / g.level(t) - 1) * 100,
  };
}

/**
 * @param S chuỗi đã chuẩn bị (preparePattern(bars)); t = phiên đánh giá.
 * @returns mảng mô hình đã khử trùng lặp, xếp theo trạng thái rồi điểm.
 */
export function scanPatterns(S, t, { includeStale = false } = {}) {
  if (t < 60) return [];
  const inter = pivotsAt(S, t, "intermediate"), minor = pivotsAt(S, t, "minor");
  const cands = detectAll(S, t, { inter, minor });
  const evaluated = [];
  for (const g of cands) {
    if (g.endIdx > t || g.endIdx < t - (PRING.breakoutSearchBars + PRING.maxAgeAfterBreakout)) continue;
    const lc = lifecycle(S, t, g);
    evaluated.push({ g, lc });
  }
  // mô hình hai chiều: giữ hướng phá vỡ trước; chưa phá vỡ -> hướng xu hướng hiện hành
  const keyOf = (g) => `${g.type}|${g.startIdx}|${g.endIdx}`;
  const groups = new Map();
  for (const x of evaluated) { const k = keyOf(x.g); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(x); }
  const chosen = [];
  for (const arr of groups.values()) {
    if (arr.length === 1) { chosen.push(arr[0]); continue; }
    const broke = arr.filter((x) => x.lc.breakoutIdx != null).sort((a, b) => a.lc.breakoutIdx - b.lc.breakoutIdx);
    chosen.push(broke[0] ?? arr.find((x) => (x.g.trendUp ? 1 : -1) === x.g.dir) ?? arr[0]);
  }
  const out = [];
  for (const { g, lc } of chosen) {
    const last = lastEventIdx(lc);
    const fresh = lc.state === "FORMING" ? g.endIdx >= t - FRESH.formingBars
      : lc.state === "FAILED" ? last >= t - FRESH.failedBars
      : lc.state === "EXPIRED" ? false
      : last >= t - FRESH.eventBars || ACTIVE.has(lc.state) && lc.breakoutIdx >= t - FRESH.eventBars;
    if (!fresh && !includeStale) continue;
    // đang hình thành: giá phải còn trong thân mô hình (giữa hai biên) và cách đường phá vỡ ≤ ½ chiều cao
    if (lc.state === "FORMING") {
      const lv = g.level(t), op = g.opposite(t), c = S.C[t];
      const inside = g.dir > 0 ? c <= lv * 1.0001 && c >= Math.min(lv, op) : c >= lv * 0.9999 && c <= Math.max(lv, op);
      if (!inside || Math.abs(Math.log(c / lv)) > 0.5 * g.height) continue;
    }
    const ev = evidence(S, t, g, lc), pl = plan(S, t, g, lc);
    out.push({ ...serialize(S, t, g, lc, ev, pl), fresh, _s: g.startIdx, _e: g.endIdx });
  }
  // khử trùng lặp: cùng hướng, chồng lấn thời gian > 60% -> giữ điểm cao hơn (ưu tiên mô hình đã phá vỡ)
  const rank = (x) => (x.state === "FORMING" ? 0 : x.state === "FAILED" ? -1 : 1) * 1000 + x.score;
  out.sort((a, b) => rank(b) - rank(a));
  const kept = [];
  for (const x of out) {
    const dup = kept.some((k) => k.dir === x.dir && Math.max(0, Math.min(k._e, x._e) - Math.max(k._s, x._s)) > 0.6 * Math.min(k._e - k._s || 1, x._e - x._s || 1));
    if (!dup) kept.push(x);
  }
  return kept.slice(0, 3).map(({ _s, _e, ...x }) => x);
}

/** Tiện ích: phân tích phiên cuối của một chuỗi bars. */
export const scanPatternsLast = (bars, opts) => { const S = preparePattern(bars); return scanPatterns(S, S.n - 1, opts); };
