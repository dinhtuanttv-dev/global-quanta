/**
 * world-events.ts — event studies for Vietnamese equities around global events.
 *
 *  - alignEventToSession: maps an event instant (UTC) to the first Vietnamese trading session that can
 *    react to it (after-close and non-trading days roll to the next session);
 *  - market model + abnormal returns with the FULL prediction-error variance (includes estimation
 *    error), so the CAR t-test is correctly sized;
 *  - BMP (Boehmer-Musumeci-Poulsen 1991) aggregation across events — robust to event-induced variance;
 *  - flagLimitDays: sessions that hit the HOSE ±7% price limit, where returns are censored.
 *
 * Returns are in percent.
 */
import { mean, olsFit, std, studentTTwoSidedP } from './quant-macro';

const ICT_OFFSET_HOURS = 7;

export interface SessionAlignment {
  /** index into tradingDays of the first session that can react */
  index: number;
  date: string;
  /** true when the event arrived before the close of a trading day and reacts that same day */
  sameDay: boolean;
}

/**
 * tradingDays: sorted 'YYYY-MM-DD' (Vietnam sessions). closeHourIct: local hour after which news can
 * only be priced the next session. Returns null if the next session is beyond the calendar.
 */
export function alignEventToSession(tsUtc: string, tradingDays: string[], closeHourIct = 15): SessionAlignment | null {
  const t = Date.parse(tsUtc);
  if (Number.isNaN(t)) return null;
  const local = new Date(t + ICT_OFFSET_HOURS * 3_600_000);
  const date = local.toISOString().slice(0, 10);
  const hour = local.getUTCHours() + local.getUTCMinutes() / 60;
  const idxSame = tradingDays.indexOf(date);
  if (idxSame >= 0 && hour < closeHourIct) return { index: idxSame, date, sameDay: true };
  const next = tradingDays.findIndex((d) => d > date);
  return next < 0 ? null : { index: next, date: tradingDays[next], sameDay: false };
}

/** Sessions where |return| reaches the daily price limit (default ±7% of HOSE), within a small tolerance. */
export function flagLimitDays(retPct: number[], limitPct = 7, tolPct = 0.05): boolean[] {
  return retPct.map((r) => Math.abs(r) >= limitPct - tolPct);
}

export interface EventStudyOptions {
  /** estimation window offsets relative to the event session */
  est?: { start: number; end: number };
  /** measurement window offsets (inclusive) */
  window?: { lo: number; hi: number };
  /** offsets shown in the path (for charts) */
  path?: { lo: number; hi: number };
  excludeLimitDaysFromEstimation?: boolean;
  limitPct?: number;
}

export interface EventStudyResult {
  alpha: number;
  beta: number;
  sigma: number;
  nEst: number;
  car: number;
  varCar: number;
  se: number;
  t: number;
  p: number;
  /** abnormal return and cumulative AR (from window.lo) for each offset in the path */
  path: { day: number; ar: number; car: number | null; se: number | null }[];
  limitDaysInWindow: number;
}

/**
 * Market-model event study.
 *   AR_t = r_t − (α̂ + β̂ m_t),  CAR = Σ_{t∈window} AR_t
 *   Var(CAR) = σ̂² [ L + L²/N + (Σ_t (m_t − m̄))² / S_mm ]     (L = window length, N = estimation size)
 * which sums the prediction-error variances including their covariance through (α̂, β̂).
 */
export function eventStudy(ret: number[], mkt: number[], eventIdx: number, opts: EventStudyOptions = {}): EventStudyResult | null {
  const est = opts.est ?? { start: -250, end: -30 };
  const win = opts.window ?? { lo: -1, hi: 3 };
  const pathR = opts.path ?? { lo: -5, hi: 10 };
  const limitPct = opts.limitPct ?? 7;
  const e0 = eventIdx + est.start;
  const e1 = eventIdx + est.end;
  if (e0 < 0 || e1 >= eventIdx || eventIdx + Math.max(win.hi, pathR.hi) >= ret.length || ret.length !== mkt.length) return null;
  const X: number[][] = [];
  const y: number[] = [];
  const limits = flagLimitDays(ret, limitPct);
  for (let t = e0; t <= e1; t++) {
    if (opts.excludeLimitDaysFromEstimation && limits[t]) continue;
    if (!Number.isFinite(ret[t]) || !Number.isFinite(mkt[t])) continue;
    X.push([1, mkt[t]]);
    y.push(ret[t]);
  }
  if (X.length < 60) return null;
  const fit = olsFit(X, y, { hac: false });
  const [alpha, beta] = fit.beta;
  const n = X.length;
  const mbar = mean(X.map((r) => r[1]));
  let smm = 0;
  for (const r of X) smm += (r[1] - mbar) ** 2;
  const sigma2 = fit.sigma2;
  const ar = (t: number) => ret[t] - (alpha + beta * mkt[t]);

  const L = win.hi - win.lo + 1;
  let sumX = 0;
  let car = 0;
  let limitDays = 0;
  for (let d = win.lo; d <= win.hi; d++) {
    const t = eventIdx + d;
    car += ar(t);
    sumX += mkt[t] - mbar;
    if (limits[t]) limitDays++;
  }
  const varCar = sigma2 * (L + (L * L) / n + (sumX * sumX) / smm);
  const se = Math.sqrt(varCar);
  const tstat = car / se;

  const path: EventStudyResult['path'] = [];
  let cum = 0;
  let sx = 0;
  for (let d = pathR.lo; d <= pathR.hi; d++) {
    const t = eventIdx + d;
    const a = ar(t);
    if (d >= win.lo) {
      cum += a;
      sx += mkt[t] - mbar;
      const l = d - win.lo + 1;
      path.push({ day: d, ar: a, car: cum, se: Math.sqrt(sigma2 * (l + (l * l) / n + (sx * sx) / smm)) });
    } else path.push({ day: d, ar: a, car: null, se: null });
  }
  return { alpha, beta, sigma: Math.sqrt(sigma2), nEst: n, car, varCar, se, t: tstat, p: studentTTwoSidedP(tstat, n - 2), path, limitDaysInWindow: limitDays };
}

export interface BmpResult {
  n: number;
  caar: number;
  t: number;
  p: number;
}

/**
 * Boehmer-Musumeci-Poulsen test: standardise each CAR by its own prediction-error SE, then t-test the
 * cross-sectional mean of the standardised CARs. Needs at least 3 events.
 */
export function bmpTest(results: { car: number; varCar: number }[]): BmpResult | null {
  const n = results.length;
  if (n < 3) return null;
  const sc = results.map((r) => r.car / Math.sqrt(r.varCar));
  const s = std(sc);
  if (!(s > 0)) return null;
  const t = (mean(sc) * Math.sqrt(n)) / s;
  return { n, caar: mean(results.map((r) => r.car)), t, p: studentTTwoSidedP(t, n - 1) };
}
