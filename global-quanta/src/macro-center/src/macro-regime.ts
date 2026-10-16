/**
 * macro-regime.ts — Gaussian hidden Markov model for macro regimes (pure TypeScript).
 *
 * Why an HMM: the sign and size of macro → equity effects are not constant; they differ between
 * e.g. easing and tightening phases. The HMM labels the phase probabilistically so downstream code
 * can condition on it.
 *
 *  - diagonal-covariance multivariate Gaussian emissions, EM (Baum-Welch) with per-step scaling,
 *    several restarts, variance floor, light Dirichlet smoothing of the transition matrix;
 *  - states are re-ordered by the mean of the FIRST feature (state 0 = lowest) so labels are stable;
 *  - `filterProbs` is the forward (point-in-time) posterior — the only one safe to use in live
 *    decisions or backtests; `smoothProbs` and `viterbi` use the whole sample (descriptive only).
 */

import { fSurvival, linearCombination, mean, mulberry32, olsFit, std, type Mat } from './quant-macro';

export interface HmmParams {
  K: number;
  D: number;
  pi: number[];
  A: number[][];
  mu: number[][];
  vr: number[][];
  /** feature standardisation learned on the training sample */
  center: number[];
  scale: number[];
}

export interface HmmFit {
  params: HmmParams;
  logLik: number;
  bic: number;
  iterations: number;
  converged: boolean;
}

const LOG2PI = Math.log(2 * Math.PI);

function standardize(obs: number[][], center: number[], scale: number[]): number[][] {
  return obs.map((row) => row.map((v, d) => (v - center[d]) / scale[d]));
}

function logB(x: number[][], mu: number[][], vr: number[][]): number[][] {
  const T = x.length;
  const K = mu.length;
  const out: number[][] = Array.from({ length: T }, () => new Array<number>(K).fill(0));
  for (let t = 0; t < T; t++)
    for (let k = 0; k < K; k++) {
      let s = 0;
      for (let d = 0; d < x[t].length; d++) {
        const diff = x[t][d] - mu[k][d];
        s += -0.5 * (LOG2PI + Math.log(vr[k][d])) - (diff * diff) / (2 * vr[k][d]);
      }
      out[t][k] = s;
    }
  return out;
}

interface FB {
  alpha: number[][];
  beta: number[][];
  c: number[];
  b: number[][];
  logLik: number;
}

function forwardBackward(lb: number[][], pi: number[], A: number[][], needBackward: boolean): FB {
  const T = lb.length;
  const K = pi.length;
  const b = lb.map((row) => {
    const m = Math.max(...row);
    return row.map((v) => Math.exp(v - m));
  });
  const shifts = lb.map((row) => Math.max(...row));
  const alpha = Array.from({ length: T }, () => new Array<number>(K).fill(0));
  const c = new Array<number>(T).fill(0);
  let logLik = 0;
  for (let t = 0; t < T; t++) {
    let s = 0;
    for (let k = 0; k < K; k++) {
      let prior = 0;
      if (t === 0) prior = pi[k];
      else for (let j = 0; j < K; j++) prior += alpha[t - 1][j] * A[j][k];
      alpha[t][k] = prior * b[t][k];
      s += alpha[t][k];
    }
    if (s <= 0 || !Number.isFinite(s)) s = 1e-300;
    c[t] = s;
    for (let k = 0; k < K; k++) alpha[t][k] /= s;
    logLik += Math.log(s) + shifts[t];
  }
  const beta = Array.from({ length: T }, () => new Array<number>(K).fill(1));
  if (needBackward) {
    for (let t = T - 2; t >= 0; t--)
      for (let j = 0; j < K; j++) {
        let s = 0;
        for (let k = 0; k < K; k++) s += A[j][k] * b[t + 1][k] * beta[t + 1][k];
        beta[t][j] = s / c[t + 1];
      }
  }
  return { alpha, beta, c, b, logLik };
}

function emStep(x: number[][], p: HmmParams): { params: HmmParams; logLik: number } {
  const T = x.length;
  const { K, D } = p;
  const lb = logB(x, p.mu, p.vr);
  const fb = forwardBackward(lb, p.pi, p.A, true);
  const gamma = fb.alpha.map((a, t) => {
    const g = a.map((v, k) => v * fb.beta[t][k]);
    const s = g.reduce((u, v) => u + v, 0) || 1;
    return g.map((v) => v / s);
  });
  const xiSum = Array.from({ length: K }, () => new Array<number>(K).fill(0));
  for (let t = 0; t < T - 1; t++)
    for (let j = 0; j < K; j++)
      for (let k = 0; k < K; k++) xiSum[j][k] += (fb.alpha[t][j] * p.A[j][k] * fb.b[t + 1][k] * fb.beta[t + 1][k]) / fb.c[t + 1];
  const pi = gamma[0].map((v) => Math.max(v, 1e-6));
  const piS = pi.reduce((u, v) => u + v, 0);
  const A = xiSum.map((row) => {
    const sm = row.map((v) => v + 1e-3);
    const s = sm.reduce((u, v) => u + v, 0);
    return sm.map((v) => v / s);
  });
  const mu = Array.from({ length: K }, () => new Array<number>(D).fill(0));
  const vr = Array.from({ length: K }, () => new Array<number>(D).fill(1));
  for (let k = 0; k < K; k++) {
    let w = 0;
    for (let t = 0; t < T; t++) w += gamma[t][k];
    w = Math.max(w, 1e-9);
    for (let d = 0; d < D; d++) {
      let m = 0;
      for (let t = 0; t < T; t++) m += gamma[t][k] * x[t][d];
      m /= w;
      let v = 0;
      for (let t = 0; t < T; t++) v += gamma[t][k] * (x[t][d] - m) ** 2;
      mu[k][d] = m;
      vr[k][d] = Math.max(v / w, 0.02);
    }
  }
  return { params: { ...p, pi: pi.map((v) => v / piS), A, mu, vr }, logLik: fb.logLik };
}

function initParams(x: number[][], K: number, center: number[], scale: number[], restart: number, seed: number): HmmParams {
  const T = x.length;
  const D = x[0].length;
  const rng = mulberry32(seed + restart * 7919);
  let mu: number[][];
  if (restart === 0) {
    // deterministic: split observations sorted by first feature into K quantile chunks
    const order = x.map((_, i) => i).sort((a, b) => x[a][0] - x[b][0]);
    mu = Array.from({ length: K }, (_, k) => {
      const lo = Math.floor((k * T) / K);
      const hi = Math.max(lo + 1, Math.floor(((k + 1) * T) / K));
      const idx = order.slice(lo, hi);
      return Array.from({ length: D }, (_, d) => mean(idx.map((i) => x[i][d])));
    });
  } else {
    mu = Array.from({ length: K }, () => x[Math.floor(rng() * T)].slice());
  }
  const A = Array.from({ length: K }, (_, j) => Array.from({ length: K }, (_, k) => (j === k ? 0.9 : 0.1 / Math.max(K - 1, 1))));
  return {
    K, D, pi: new Array<number>(K).fill(1 / K), A, mu,
    vr: Array.from({ length: K }, () => new Array<number>(D).fill(1)), center, scale,
  };
}

function reorder(p: HmmParams): HmmParams {
  const order = p.mu.map((_, k) => k).sort((a, b) => p.mu[a][0] - p.mu[b][0]);
  return {
    ...p,
    pi: order.map((k) => p.pi[k]),
    A: order.map((j) => order.map((k) => p.A[j][k])),
    mu: order.map((k) => p.mu[k]),
    vr: order.map((k) => p.vr[k]),
  };
}

/** Fit a K-state Gaussian HMM. obs is T × D (raw units). */
export function fitHmm(
  obs: number[][],
  K: number,
  opts: { restarts?: number; maxIter?: number; tol?: number; seed?: number } = {},
): HmmFit {
  const T = obs.length;
  const D = obs[0].length;
  if (T < 10 * K) throw new Error(`fitHmm: need at least ${10 * K} observations for K=${K}`);
  const center = Array.from({ length: D }, (_, d) => mean(obs.map((r) => r[d])));
  const scale = Array.from({ length: D }, (_, d) => std(obs.map((r) => r[d])) || 1);
  const x = standardize(obs, center, scale);
  let best: { params: HmmParams; logLik: number; it: number; conv: boolean } | null = null;
  const restarts = K === 1 ? 1 : opts.restarts ?? 4;
  for (let r = 0; r < restarts; r++) {
    let p = initParams(x, K, center, scale, r, opts.seed ?? 1);
    let prev = -Infinity;
    let ll = -Infinity;
    let conv = false;
    let it = 0;
    for (; it < (opts.maxIter ?? 300); it++) {
      const step = emStep(x, p);
      p = step.params;
      ll = step.logLik;
      if (K === 1 || Math.abs(ll - prev) < (opts.tol ?? 1e-7) * (1 + Math.abs(ll))) {
        conv = true;
        break;
      }
      prev = ll;
    }
    if (!best || ll > best.logLik) best = { params: p, logLik: ll, it, conv };
  }
  const b = best as { params: HmmParams; logLik: number; it: number; conv: boolean };
  const nParams = (K - 1) + K * (K - 1) + 2 * K * D;
  return { params: reorder(b.params), logLik: b.logLik, bic: -2 * b.logLik + nParams * Math.log(T), iterations: b.it, converged: b.conv };
}

/** Fit K = 1..maxK and return the BIC-best model together with all candidates. */
export function selectHmm(obs: number[][], maxK = 3, opts: Parameters<typeof fitHmm>[2] = {}): { best: HmmFit; all: HmmFit[] } {
  const all: HmmFit[] = [];
  for (let K = 1; K <= maxK; K++) {
    try {
      all.push(fitHmm(obs, K, opts));
    } catch {
      break;
    }
  }
  const best = all.reduce((a, b) => (b.bic < a.bic ? b : a));
  return { best, all };
}

/** Forward (filtered) posterior P(state_t | obs_1..t) — point-in-time safe. */
export function filterProbs(obs: number[][], p: HmmParams): number[][] {
  const x = standardize(obs, p.center, p.scale);
  const fb = forwardBackward(logB(x, p.mu, p.vr), p.pi, p.A, false);
  return fb.alpha;
}

/** Smoothed posterior P(state_t | whole sample) — descriptive only (uses the future). */
export function smoothProbs(obs: number[][], p: HmmParams): number[][] {
  const x = standardize(obs, p.center, p.scale);
  const fb = forwardBackward(logB(x, p.mu, p.vr), p.pi, p.A, true);
  return fb.alpha.map((a, t) => {
    const g = a.map((v, k) => v * fb.beta[t][k]);
    const s = g.reduce((u, v) => u + v, 0) || 1;
    return g.map((v) => v / s);
  });
}

/** Most likely state path (Viterbi). */
export function viterbi(obs: number[][], p: HmmParams): number[] {
  const x = standardize(obs, p.center, p.scale);
  const lb = logB(x, p.mu, p.vr);
  const T = x.length;
  const K = p.K;
  const delta = Array.from({ length: T }, () => new Array<number>(K).fill(-Infinity));
  const psi = Array.from({ length: T }, () => new Array<number>(K).fill(0));
  const lA = p.A.map((r) => r.map(Math.log));
  for (let k = 0; k < K; k++) delta[0][k] = Math.log(p.pi[k]) + lb[0][k];
  for (let t = 1; t < T; t++)
    for (let k = 0; k < K; k++) {
      let best = -Infinity;
      let arg = 0;
      for (let j = 0; j < K; j++) {
        const v = delta[t - 1][j] + lA[j][k];
        if (v > best) {
          best = v;
          arg = j;
        }
      }
      delta[t][k] = best + lb[t][k];
      psi[t][k] = arg;
    }
  const path = new Array<number>(T).fill(0);
  let last = 0;
  for (let k = 1; k < K; k++) if (delta[T - 1][k] > delta[T - 1][last]) last = k;
  path[T - 1] = last;
  for (let t = T - 2; t >= 0; t--) path[t] = psi[t + 1][path[t + 1]];
  return path;
}

export interface RegimeSummary {
  state: number;
  meanRaw: number[];
  sdRaw: number[];
  expectedDurationMonths: number;
  stationaryShare: number;
}

export function summarizeRegimes(p: HmmParams): RegimeSummary[] {
  // stationary distribution by power iteration
  let s = new Array<number>(p.K).fill(1 / p.K);
  for (let i = 0; i < 500; i++) {
    const n = new Array<number>(p.K).fill(0);
    for (let j = 0; j < p.K; j++) for (let k = 0; k < p.K; k++) n[k] += s[j] * p.A[j][k];
    s = n;
  }
  return p.mu.map((m, k) => ({
    state: k,
    meanRaw: m.map((v, d) => v * p.scale[d] + p.center[d]),
    sdRaw: p.vr[k].map((v, d) => Math.sqrt(v) * p.scale[d]),
    expectedDurationMonths: p.A[k][k] < 1 ? 1 / (1 - p.A[k][k]) : Infinity,
    stationaryShare: s[k],
  }));
}

/** Vietnamese label for a state, from its rank among K ordered by the first feature. */
export function regimeLabelVi(state: number, K: number): string {
  if (K === 1) return 'Một chế độ';
  if (K === 2) return state === 0 ? 'Chế độ thấp' : 'Chế độ cao';
  return ['Chế độ thấp', 'Chế độ trung tính', 'Chế độ cao'][Math.min(state, 2)];
}

// ───────────────────────── Regime-conditional sensitivity ─────────────────────────

export interface RegimeBeta {
  state: number;
  n: number;
  beta: number;
  se: number;
  t: number;
  p: number;
  sufficient: boolean;
}

export interface RegimeConditionalResult {
  perRegime: RegimeBeta[];
  /** HAC Wald test (F form) of H0: the coefficient is the same in every regime */
  equalityF: number;
  equalityP: number;
  differs: boolean;
}

function invert(M: number[][]): number[][] | null {
  const n = M.length;
  const A = M.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    if (Math.abs(A[piv][c]) < 1e-12) return null;
    [A[c], A[piv]] = [A[piv], A[c]];
    const d = A[c][c];
    for (let j = 0; j < 2 * n; j++) A[c][j] /= d;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = A[r][c];
      for (let j = 0; j < 2 * n; j++) A[r][j] -= f * A[c][j];
    }
  }
  return A.map((r) => r.slice(n));
}

/**
 * Does the effect of one regressor depend on the macro regime? Interaction model
 *   y = Xβ + Σ_{s≥1} δ_s · x_coef · 1[regime = s] + e   (HAC errors)
 * `regimeOfRow[i]` is the regime of design row i (use the FILTERED state for point-in-time use,
 * −1 to drop a row). Regimes with fewer than `minPerRegime` rows are reported but excluded from
 * the equality test.
 */
export function regimeConditionalBeta(args: {
  X: Mat;
  y: number[];
  coefIdx: number;
  regimeOfRow: number[];
  K: number;
  minPerRegime?: number;
}): RegimeConditionalResult | null {
  const minN = args.minPerRegime ?? 25;
  const keep = args.X.map((_, i) => i).filter((i) => args.regimeOfRow[i] >= 0);
  const counts = new Array<number>(args.K).fill(0);
  keep.forEach((i) => counts[args.regimeOfRow[i]]++);
  const states = counts.map((n, s) => ({ n, s })).filter((r) => r.n >= minN).map((r) => r.s);
  if (states.length < 2) return null;
  const base = states[0];
  const rows = keep.filter((i) => states.includes(args.regimeOfRow[i]));
  const others = states.slice(1);
  const X2: Mat = rows.map((i) => [...args.X[i], ...others.map((s) => (args.regimeOfRow[i] === s ? args.X[i][args.coefIdx] : 0))]);
  const y2 = rows.map((i) => args.y[i]);
  const res = olsFit(X2, y2);
  const k0 = args.X[0].length;
  const perRegime: RegimeBeta[] = [];
  for (let s = 0; s < args.K; s++) {
    if (!states.includes(s)) {
      perRegime.push({ state: s, n: counts[s], beta: NaN, se: NaN, t: NaN, p: NaN, sufficient: false });
      continue;
    }
    const c = new Array<number>(X2[0].length).fill(0);
    c[args.coefIdx] = 1;
    if (s !== base) c[k0 + others.indexOf(s)] = 1;
    const lc = linearCombination(res, c);
    perRegime.push({ state: s, n: counts[s], beta: lc.est, se: lc.se, t: lc.t, p: lc.p, sufficient: true });
  }
  const m = others.length;
  const delta = others.map((_, j) => res.beta[k0 + j]);
  const V = others.map((_, a) => others.map((__, b) => res.covHac[k0 + a][k0 + b]));
  const Vi = invert(V);
  if (!Vi) return null;
  let W = 0;
  for (let a = 0; a < m; a++) for (let b = 0; b < m; b++) W += delta[a] * Vi[a][b] * delta[b];
  const F = W / m;
  const p = fSurvival(F, m, res.n - res.k);
  return { perRegime, equalityF: F, equalityP: p, differs: p < 0.05 };
}
