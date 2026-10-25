/**
 * macro-scenario.ts — "what if" engine, alerts, release calendar and the macro thermometer.
 *
 * Scenario responses use Jordà (2005) LOCAL PROJECTIONS: for each horizon h we regress the
 * cumulative return Σ_{j=0..h} y_{t+j} directly on the shock vector (plus controls), with HAC
 * errors that account for the overlap of the dependent variable. Compared with iterating a VAR it
 * is robust to mis-specified dynamics, and each horizon carries its own honest confidence band.
 */

import {
  isFiniteNum, mean, olsFit, std, studentTCdf, type MacroScorePoint, type StabilityInfo, type Transform, type ImpactCell,
} from './quant-macro';
import { addMonths, estimateAsOf, periodIndex, type SeriesMeta } from './macro-data';

// ───────────────────────────── Local projections ─────────────────────────────

export interface IrfPoint {
  h: number;
  est: number;
  se: number;
  lo: number;
  hi: number;
  n: number;
}

function tQuantile(p: number, df: number): number {
  // bisection on the CDF — only used for CI half-widths, so precision of 1e-6 is plenty
  let lo = 0;
  let hi = 50;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (studentTCdf(mid, df) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Cumulative response of y (in the units of y, e.g. % return) at horizons 0..H to a one-off
 * shock vector `shock` (same order as xs, in the stationary units of each factor).
 */
export function localProjectionIRF(args: {
  y: number[];
  xs: number[][];
  shock: number[];
  horizon: number;
  arLags?: number;
  level?: number;
}): IrfPoint[] {
  const { y, xs, shock, horizon } = args;
  const p = args.arLags ?? 1;
  const level = args.level ?? 0.9;
  const T = y.length;
  const F = xs.length;
  const out: IrfPoint[] = [];
  for (let h = 0; h <= horizon; h++) {
    const X: number[][] = [];
    const r: number[] = [];
    for (let t = p; t < T - h; t++) {
      const row = [1];
      let ok = true;
      for (let j = 0; j < F && ok; j++) {
        if (!isFiniteNum(xs[j][t])) ok = false;
        else row.push(xs[j][t]);
      }
      for (let i = 1; i <= p && ok; i++) {
        if (!isFiniteNum(y[t - i])) ok = false;
        else row.push(y[t - i]);
      }
      let cum = 0;
      for (let j = 0; j <= h && ok; j++) {
        if (!isFiniteNum(y[t + j])) ok = false;
        else cum += y[t + j];
      }
      if (!ok) continue;
      X.push(row);
      r.push(cum);
    }
    if (X.length < X[0]?.length + 15 || X.length === 0) break;
    const auto = Math.max(1, Math.floor(4 * Math.pow(X.length / 100, 2 / 9)));
    let res;
    try {
      res = olsFit(X, r, { hacLag: Math.max(h + 1, auto) });
    } catch {
      break;
    }
    let est = 0;
    let v = 0;
    for (let a = 0; a < F; a++) {
      est += shock[a] * res.beta[1 + a];
      for (let b = 0; b < F; b++) v += shock[a] * shock[b] * res.covHac[1 + a][1 + b];
    }
    const se = Math.sqrt(Math.max(v, 0));
    const q = tQuantile(1 - (1 - level) / 2, res.n - res.k);
    out.push({ h, est, se, lo: est - q * se, hi: est + q * se, n: res.n });
  }
  return out;
}

// ───────────────────────────── Scenarios ─────────────────────────────

export interface ShockSpec {
  factor: string;
  amount: number;
  /** 'pct' = percent change of a level series; 'pp' = percentage-point change of a rate */
  unit: 'pct' | 'pp';
}

export interface NamedScenario {
  id: string;
  nameVi: string;
  descriptionVi: string;
  shocks: ShockSpec[];
}

export const NAMED_SCENARIOS: NamedScenario[] = [
  { id: 'cpi-up', nameVi: 'Lạm phát tăng tốc', descriptionVi: 'CPI so cùng kỳ tăng thêm 1 điểm phần trăm.', shocks: [{ factor: 'CPI', amount: 1, unit: 'pp' }] },
  { id: 'easing', nameVi: 'Nới lỏng tiền tệ', descriptionVi: 'M2 tăng thêm 2%, lãi suất liên ngân hàng giảm 0,5 điểm.', shocks: [{ factor: 'M2', amount: 2, unit: 'pct' }, { factor: 'IR', amount: -0.5, unit: 'pp' }] },
  { id: 'tightening', nameVi: 'Thắt chặt tiền tệ', descriptionVi: 'Lãi suất liên ngân hàng tăng 1 điểm, M2 giảm 1%.', shocks: [{ factor: 'IR', amount: 1, unit: 'pp' }, { factor: 'M2', amount: -1, unit: 'pct' }] },
  { id: 'vnd-weak', nameVi: 'VND mất giá 3%', descriptionVi: 'Tỷ giá USD/VND tăng 3% trong một tháng.', shocks: [{ factor: 'EX', amount: 3, unit: 'pct' }] },
  { id: 'credit-squeeze', nameVi: 'Siết tín dụng', descriptionVi: 'Dư nợ tín dụng giảm 2%, lãi suất tăng 0,5 điểm.', shocks: [{ factor: 'CREDIT', amount: -2, unit: 'pct' }, { factor: 'IR', amount: 0.5, unit: 'pp' }] },
  { id: 'fed-cut', nameVi: 'Fed giảm lãi suất', descriptionVi: 'Lãi suất Fed giảm 0,5 điểm, USD yếu đi 1,5%.', shocks: [{ factor: 'FED', amount: -0.5, unit: 'pp' }, { factor: 'DXY', amount: -1.5, unit: 'pct' }] },
];

export function resolveShocks(shocks: ShockSpec[], transforms: Record<string, Transform>): { vector: Record<string, number>; warnings: string[] } {
  const vector: Record<string, number> = {};
  const warnings: string[] = [];
  for (const s of shocks) {
    const t = transforms[s.factor];
    if (!t) {
      warnings.push(`Bỏ qua cú sốc ${s.factor}: biến này không có trong mô hình.`);
      continue;
    }
    const compatible = (s.unit === 'pct' && t === 'logdiff') || (s.unit === 'pp' && t === 'diff');
    if (!compatible) {
      warnings.push(`Bỏ qua cú sốc ${s.factor}: đơn vị '${s.unit}' không khớp phép biến đổi '${t}'.`);
      continue;
    }
    vector[s.factor] = (vector[s.factor] ?? 0) + s.amount;
  }
  return { vector, warnings };
}

export interface ScenarioTargetResult {
  target: string;
  irf: IrfPoint[];
  atHorizon: IrfPoint | null;
  significant: boolean;
}

export interface ScenarioResult {
  results: ScenarioTargetResult[];
  ranking: { target: string; est: number; lo: number; hi: number; significant: boolean }[];
  warnings: string[];
  horizon: number;
}

export function runScenario(args: {
  targets: Record<string, number[]>;
  factors: Record<string, number[]>;
  transforms: Record<string, Transform>;
  shocks: ShockSpec[];
  horizon?: number;
  arLags?: number;
}): ScenarioResult {
  const horizon = args.horizon ?? 6;
  const { vector, warnings } = resolveShocks(args.shocks, args.transforms);
  const names = Object.keys(args.factors);
  const xs = names.map((n) => args.factors[n]);
  const shock = names.map((n) => vector[n] ?? 0);
  const results: ScenarioTargetResult[] = [];
  if (Object.keys(vector).length === 0) warnings.push('Không có cú sốc hợp lệ nào để mô phỏng.');
  else
    for (const [target, y] of Object.entries(args.targets)) {
      const irf = localProjectionIRF({ y, xs, shock, horizon, arLags: args.arLags });
      const at = irf.length ? irf[irf.length - 1] : null;
      results.push({ target, irf, atHorizon: at, significant: !!at && (at.lo > 0 || at.hi < 0) });
    }
  const ranking = results
    .filter((r) => r.atHorizon)
    .map((r) => ({ target: r.target, est: r.atHorizon!.est, lo: r.atHorizon!.lo, hi: r.atHorizon!.hi, significant: r.significant }))
    .sort((a, b) => b.est - a.est);
  return { results, ranking, warnings, horizon };
}

// ───────────────────────────── Alerts ─────────────────────────────

/** z-score of x_t against the mean/sd of x_{<t} only (no look-ahead). NaN until `minObs` points. */
export function expandingZ(x: number[], minObs = 24): number[] {
  const out = new Array<number>(x.length).fill(NaN);
  const seen: number[] = [];
  for (let t = 0; t < x.length; t++) {
    if (isFiniteNum(x[t])) {
      if (seen.length >= minObs) {
        const s = std(seen);
        if (s > 0) out[t] = (x[t] - mean(seen)) / s;
      }
      seen.push(x[t]);
    }
  }
  return out;
}

export type AlertKind = 'factor-extreme' | 'regime-change' | 'unstable-effect';

export interface MacroAlert {
  id: string;
  kind: AlertKind;
  level: 'info' | 'warn' | 'high';
  messageVi: string;
}

export function generateAlerts(args: {
  factorZ: Record<string, number>;
  factorNamesVi?: Record<string, string>;
  regime?: { previous: number[]; current: number[]; labels: string[] };
  stability?: Record<string, StabilityInfo>;
  best?: ImpactCell[];
  zWarn?: number;
  zHigh?: number;
}): MacroAlert[] {
  const alerts: MacroAlert[] = [];
  const zWarn = args.zWarn ?? 1.5;
  const zHigh = args.zHigh ?? 2.5;
  for (const [f, z] of Object.entries(args.factorZ)) {
    if (!isFiniteNum(z) || Math.abs(z) < zWarn) continue;
    const name = args.factorNamesVi?.[f] ?? f;
    alerts.push({
      id: `z:${f}`, kind: 'factor-extreme', level: Math.abs(z) >= zHigh ? 'high' : 'warn',
      messageVi: `${name} đang ${z > 0 ? 'cao' : 'thấp'} bất thường: lệch ${z > 0 ? '+' : ''}${z.toFixed(1)} độ lệch chuẩn so với lịch sử.`,
    });
  }
  if (args.regime) {
    const arg = (v: number[]) => v.indexOf(Math.max(...v));
    const a = arg(args.regime.previous);
    const b = arg(args.regime.current);
    if (a !== b && Math.max(...args.regime.current) >= 0.6)
      alerts.push({
        id: 'regime', kind: 'regime-change', level: 'high',
        messageVi: `Chế độ vĩ mô chuyển từ "${args.regime.labels[a]}" sang "${args.regime.labels[b]}" (xác suất ${(Math.max(...args.regime.current) * 100).toFixed(0)}%). Độ nhạy lịch sử có thể không còn đúng.`,
      });
  }
  if (args.stability && args.best)
    for (const c of args.best) {
      const st = args.stability[`${c.factor}|${c.target}`];
      if (c.significant && st && st.windows > 0 && !st.stable)
        alerts.push({
          id: `unstable:${c.factor}|${c.target}`, kind: 'unstable-effect', level: 'warn',
          messageVi: `Tác động của ${c.factor} lên ${c.target} có ý nghĩa thống kê nhưng không ổn định (cùng dấu ${(st.shareSameSign * 100).toFixed(0)}% số cửa sổ, đổi dấu ${st.signFlips} lần).`,
        });
    }
  const rank = { high: 0, warn: 1, info: 2 } as const;
  return alerts.sort((x, y) => rank[x.level] - rank[y.level]);
}

// ───────────────────────────── Calendar and surprises ─────────────────────────────

export interface UpcomingRelease {
  seriesId: string;
  nameVi: string;
  period: string;
  expectedDate: string;
  estimated: true;
  status: 'upcoming' | 'overdue';
  daysUntil: number;
}

const daysBetween = (a: string, b: string): number => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

/** Next expected release of each factor, from its latest known period. Dates are ESTIMATES. */
export function upcomingReleases(catalog: SeriesMeta[], latestPeriod: Record<string, string>, today: string): UpcomingRelease[] {
  const out: UpcomingRelease[] = [];
  for (const m of catalog) {
    if (m.role !== 'factor' || !latestPeriod[m.id]) continue;
    const next = addMonths(latestPeriod[m.id], 1);
    const date = estimateAsOf(next, m.pubLagMonths, m.typicalReleaseDay);
    const d = daysBetween(today, date);
    out.push({ seriesId: m.id, nameVi: m.nameVi, period: next, expectedDate: date, estimated: true, status: d < 0 ? 'overdue' : 'upcoming', daysUntil: d });
  }
  return out.sort((a, b) => a.expectedDate.localeCompare(b.expectedDate) || periodIndex(a.period) - periodIndex(b.period));
}

/** Standardised surprise: (actual − consensus) / sd of past surprises. */
export function surpriseZ(actual: number, consensus: number, pastSurprises: number[]): number {
  const s = pastSurprises.length >= 6 ? std(pastSurprises) : NaN;
  return Number.isFinite(s) && s > 0 ? (actual - consensus) / s : NaN;
}

/** OLS of the next-period return on the surprise (n small → read the p-value, not the point). */
export function surpriseReaction(surprises: number[], nextReturns: number[]): { beta: number; t: number; p: number; n: number } | null {
  const X: number[][] = [];
  const y: number[] = [];
  surprises.forEach((s, i) => {
    if (isFiniteNum(s) && isFiniteNum(nextReturns[i])) {
      X.push([1, s]);
      y.push(nextReturns[i]);
    }
  });
  if (X.length < 12) return null;
  const r = olsFit(X, y);
  return { beta: r.beta[1], t: r.tHac[1], p: r.pHac[1], n: r.n };
}

// ───────────────────────────── Thermometer ─────────────────────────────

export type ThermoBand = 'strong-negative' | 'negative' | 'neutral' | 'positive' | 'strong-positive';

export interface Thermometer {
  value: number;
  band: ThermoBand;
  bandVi: string;
  topContributors: { factor: string; contribution: number }[];
  row: number;
}

const BANDS: [number, ThermoBand, string][] = [
  [-0.5, 'strong-negative', 'Bất lợi mạnh'],
  [-0.15, 'negative', 'Bất lợi nhẹ'],
  [0.15, 'neutral', 'Trung tính'],
  [0.5, 'positive', 'Thuận lợi nhẹ'],
  [Infinity, 'strong-positive', 'Thuận lợi mạnh'],
];

export function buildThermometer(points: MacroScorePoint[]): Thermometer | null {
  if (points.length === 0) return null;
  const last = points[points.length - 1];
  const [, band, bandVi] = BANDS.find(([hi]) => last.score <= hi) as [number, ThermoBand, string];
  const topContributors = Object.entries(last.contributions)
    .map(([factor, contribution]) => ({ factor, contribution }))
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
    .slice(0, 3);
  return { value: last.score, band, bandVi, topContributors, row: last.row };
}
