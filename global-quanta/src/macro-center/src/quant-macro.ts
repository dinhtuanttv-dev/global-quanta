/**
 * quant-macro.ts — Macro → equity-index impact engine (pure TypeScript, zero dependencies)
 *
 * Why this is not a copy of the 2015 paper:
 *  - The paper regresses non-stationary LEVELS and reports t-stats from classical OLS.
 *    Here every series is first diagnosed (ADF + KPSS + Zivot-Andrews), transformed to
 *    stationarity, and only then regressed.
 *  - Inference uses Newey-West HAC standard errors, and the whole family of tested cells
 *    is corrected with Benjamini-Hochberg / Benjamini-Yekutieli FDR.
 *  - Stability is measured (rolling beta, Chow test), not assumed.
 *  - MacroScore is strictly point-in-time (walk-forward betas, expanding z-scores,
 *    empirical-Bayes shrinkage), so it can be backtested without look-ahead.
 *
 * Out of scope here (belongs to the Python service): Johansen/VECM, Markov-switching.
 */

// ───────────────────────────── 1. Utilities ─────────────────────────────

export type Mat = number[][];

export const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function mean(a: number[]): number {
  let s = 0;
  for (const v of a) s += v;
  return s / a.length;
}

export function variance(a: number[], ddof = 1): number {
  const m = mean(a);
  let s = 0;
  for (const v of a) s += (v - m) * (v - m);
  return s / (a.length - ddof);
}

export const std = (a: number[], ddof = 1): number => Math.sqrt(variance(a, ddof));

/** Deterministic PRNG (mulberry32) so bootstraps and tests are reproducible. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randn(rng: () => number): number {
  let u = 0;
  while (u === 0) u = rng();
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ───────────────────────── 2. Special functions ─────────────────────────

const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
  1.5056327351493116e-7,
];

export function lgamma(x: number): number {
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
  const xm = x - 1;
  let a = LANCZOS[0];
  const t = xm + 7.5;
  for (let i = 1; i < 9; i++) a += LANCZOS[i] / (xm + i);
  return 0.5 * Math.log(2 * Math.PI) + (xm + 0.5) * Math.log(t) - t + Math.log(a);
}

function betacf(a: number, b: number, x: number): number {
  const MAXIT = 400;
  const EPS = 3e-16;
  const FPMIN = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/** Regularized incomplete beta I_x(a, b). */
export function betaInc(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) return (bt * betacf(a, b, x)) / a;
  return 1 - (bt * betacf(b, a, 1 - x)) / b;
}

export function erfc(x: number): number {
  if (x < 0) return 2 - erfc(-x);
  if (x < 2.5) {
    // Maclaurin series for erf, accurate to ~1e-13 on this range
    let sum = x;
    let term = x;
    for (let n = 1; n < 200; n++) {
      term *= (-x * x) / n;
      const add = term / (2 * n + 1);
      sum += add;
      if (Math.abs(add) < 1e-17) break;
    }
    return 1 - (2 / Math.sqrt(Math.PI)) * sum;
  }
  // continued fraction for the tail
  let f = x;
  for (let k = 80; k >= 1; k--) f = x + k / 2 / f;
  return Math.exp(-x * x) / (Math.sqrt(Math.PI) * f);
}

export const normCdf = (x: number): number => 0.5 * erfc(-x / Math.SQRT2);

export function studentTCdf(t: number, df: number): number {
  const p = 0.5 * betaInc(df / 2, 0.5, df / (df + t * t));
  return t > 0 ? 1 - p : p;
}

export const studentTTwoSidedP = (t: number, df: number): number =>
  Number.isFinite(t) ? betaInc(df / 2, 0.5, df / (df + t * t)) : 0;

/** Upper-tail probability of the F distribution. */
export const fSurvival = (f: number, d1: number, d2: number): number =>
  f <= 0 ? 1 : betaInc(d2 / 2, d1 / 2, d2 / (d2 + d1 * f));

// ───────────────────────── 3. Linear algebra + OLS ─────────────────────────

const zeros = (r: number, c: number): Mat => Array.from({ length: r }, () => new Array<number>(c).fill(0));

function matMul(A: Mat, B: Mat): Mat {
  const n = A.length;
  const m = B[0].length;
  const k = B.length;
  const C = zeros(n, m);
  for (let i = 0; i < n; i++)
    for (let l = 0; l < k; l++) {
      const a = A[i][l];
      if (a === 0) continue;
      for (let j = 0; j < m; j++) C[i][j] += a * B[l][j];
    }
  return C;
}

export interface OlsResult {
  n: number;
  k: number;
  beta: number[];
  residuals: number[];
  fitted: number[];
  rss: number;
  sigma2: number;
  se: number[];
  t: number[];
  p: number[];
  seHac: number[];
  tHac: number[];
  pHac: number[];
  hacLag: number;
  cov: Mat;
  covHac: Mat;
  r2: number;
  adjR2: number;
  aic: number;
  bic: number;
  dw: number;
}

export interface OlsOptions {
  /** false → skip HAC (faster; used inside unit-root loops). */
  hac?: boolean;
  /** Bartlett lag; default is the Newey-West (1994) rule floor(4 (n/100)^(2/9)). */
  hacLag?: number;
}

/**
 * OLS through Householder QR on the augmented matrix [X | y] — numerically stable even
 * with collinear macro factors (does not form X'X).
 */
export function olsFit(X: Mat, y: number[], opts: OlsOptions = {}): OlsResult {
  const n = X.length;
  const k = X[0].length;
  if (n <= k) throw new Error(`olsFit: need n > k (n=${n}, k=${k})`);
  const A: Mat = X.map((row, i) => [...row, y[i]]);
  for (let j = 0; j < k; j++) {
    let norm = 0;
    for (let i = j; i < n; i++) norm += A[i][j] * A[i][j];
    norm = Math.sqrt(norm);
    if (norm === 0) continue;
    const alpha = A[j][j] > 0 ? -norm : norm;
    const v = new Array<number>(n - j);
    v[0] = A[j][j] - alpha;
    for (let i = 1; i < n - j; i++) v[i] = A[j + i][j];
    let vn2 = 0;
    for (const e of v) vn2 += e * e;
    if (vn2 === 0) continue;
    for (let c = j; c <= k; c++) {
      let dot = 0;
      for (let i = 0; i < n - j; i++) dot += v[i] * A[j + i][c];
      const f = (2 * dot) / vn2;
      for (let i = 0; i < n - j; i++) A[j + i][c] -= f * v[i];
    }
  }
  let maxDiag = 0;
  for (let j = 0; j < k; j++) maxDiag = Math.max(maxDiag, Math.abs(A[j][j]));
  for (let j = 0; j < k; j++)
    if (Math.abs(A[j][j]) <= 1e-10 * maxDiag) throw new Error('olsFit: singular / collinear design matrix');

  // R^{-1} (upper triangular)
  const Rinv = zeros(k, k);
  for (let j = 0; j < k; j++) {
    Rinv[j][j] = 1 / A[j][j];
    for (let i = j - 1; i >= 0; i--) {
      let s = 0;
      for (let l = i + 1; l <= j; l++) s += A[i][l] * Rinv[l][j];
      Rinv[i][j] = -s / A[i][i];
    }
  }
  const beta = new Array<number>(k).fill(0);
  for (let i = 0; i < k; i++) {
    let s = 0;
    for (let l = i; l < k; l++) s += Rinv[i][l] * A[l][k];
    beta[i] = s;
  }
  const xtxInv = zeros(k, k);
  for (let a = 0; a < k; a++)
    for (let b = a; b < k; b++) {
      let s = 0;
      for (let l = b; l < k; l++) s += Rinv[a][l] * Rinv[b][l];
      xtxInv[a][b] = s;
      xtxInv[b][a] = s;
    }

  const fitted = new Array<number>(n);
  const residuals = new Array<number>(n);
  let rss = 0;
  for (let i = 0; i < n; i++) {
    let f = 0;
    for (let j = 0; j < k; j++) f += X[i][j] * beta[j];
    fitted[i] = f;
    residuals[i] = y[i] - f;
    rss += residuals[i] * residuals[i];
  }
  const df = n - k;
  const sigma2 = rss / df;
  const cov = xtxInv.map((r) => r.map((v) => v * sigma2));
  const se = cov.map((r, i) => Math.sqrt(r[i]));
  const t = beta.map((b, i) => b / se[i]);
  const p = t.map((tv) => studentTTwoSidedP(tv, df));

  let seHac = se;
  let tHac = t;
  let pHac = p;
  let covHac = cov;
  let hacLag = 0;
  if (opts.hac !== false) {
    hacLag = opts.hacLag ?? Math.max(1, Math.floor(4 * Math.pow(n / 100, 2 / 9)));
    covHac = neweyWest(X, residuals, xtxInv, hacLag);
    seHac = covHac.map((r, i) => Math.sqrt(r[i]));
    tHac = beta.map((b, i) => b / seHac[i]);
    pHac = tHac.map((tv) => studentTTwoSidedP(tv, df));
  }

  const ybar = mean(y);
  let tss = 0;
  for (const v of y) tss += (v - ybar) * (v - ybar);
  const r2 = tss > 0 ? 1 - rss / tss : 0;
  const adjR2 = 1 - ((1 - r2) * (n - 1)) / df;
  let dnum = 0;
  for (let i = 1; i < n; i++) dnum += (residuals[i] - residuals[i - 1]) ** 2;
  return {
    n, k, beta, residuals, fitted, rss, sigma2, se, t, p, seHac, tHac, pHac, hacLag, cov, covHac,
    r2, adjR2,
    aic: n * Math.log(rss / n) + 2 * k,
    bic: n * Math.log(rss / n) + k * Math.log(n),
    dw: rss > 0 ? dnum / rss : 2,
  };
}

/** Newey-West (1987) covariance with Bartlett kernel and n/(n-k) small-sample factor. */
function neweyWest(X: Mat, e: number[], xtxInv: Mat, L: number): Mat {
  const n = X.length;
  const k = X[0].length;
  const S = zeros(k, k);
  for (let t = 0; t < n; t++) {
    const e2 = e[t] * e[t];
    for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) S[a][b] += e2 * X[t][a] * X[t][b];
  }
  for (let l = 1; l <= L && l < n; l++) {
    const w = 1 - l / (L + 1);
    for (let t = l; t < n; t++) {
      const c = e[t] * e[t - l] * w;
      for (let a = 0; a < k; a++)
        for (let b = 0; b < k; b++) S[a][b] += c * (X[t][a] * X[t - l][b] + X[t - l][a] * X[t][b]);
    }
  }
  const V = matMul(matMul(xtxInv, S), xtxInv);
  const f = n / (n - k);
  return V.map((r) => r.map((v) => v * f));
}

/** Test of a linear combination c'β using the HAC covariance. */
export function linearCombination(res: OlsResult, c: number[]): { est: number; se: number; t: number; p: number } {
  let est = 0;
  for (let i = 0; i < c.length; i++) est += c[i] * res.beta[i];
  let v = 0;
  for (let i = 0; i < c.length; i++) for (let j = 0; j < c.length; j++) v += c[i] * c[j] * res.covHac[i][j];
  const se = Math.sqrt(Math.max(v, 0));
  const t = est / se;
  return { est, se, t, p: studentTTwoSidedP(t, res.n - res.k) };
}

// ─────────────────────── 4. Multiple-testing correction ───────────────────────

export type PAdjust = 'bh' | 'by' | 'holm' | 'bonferroni';

/**
 * Adjusted p-values. 'bh' = Benjamini-Hochberg (independent / PRDS tests);
 * 'by' = Benjamini-Yekutieli (arbitrary dependence — safer for correlated macro factors).
 */
export function adjustPValues(p: number[], method: PAdjust = 'by'): number[] {
  const m = p.length;
  const clean = p.map((v) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1));
  const order = clean.map((_, i) => i).sort((a, b) => clean[a] - clean[b]);
  const out = new Array<number>(m).fill(1);
  if (method === 'bonferroni') return clean.map((v) => Math.min(1, v * m));
  if (method === 'holm') {
    let running = 0;
    order.forEach((idx, rank) => {
      running = Math.max(running, clean[idx] * (m - rank));
      out[idx] = Math.min(1, running);
    });
    return out;
  }
  let cm = 1;
  if (method === 'by') {
    cm = 0;
    for (let i = 1; i <= m; i++) cm += 1 / i;
  }
  let running = 1;
  for (let rank = m - 1; rank >= 0; rank--) {
    const idx = order[rank];
    running = Math.min(running, (clean[idx] * m * cm) / (rank + 1));
    out[idx] = Math.min(1, running);
  }
  return out;
}

// ───────────────────────── 5. Unit-root & stationarity ─────────────────────────

export type AdfDet = 'n' | 'c' | 'ct';
export type LagCriterion = 'aic' | 'bic' | 'maic';

// MacKinnon (2010) finite-sample response surface: cv = b0 + b1/T + b2/T^2 + b3/T^3
const MACK_CV: Record<AdfDet, Record<'1' | '5' | '10', number[]>> = {
  n: {
    '1': [-2.56574, -2.2358, -3.627, 0],
    '5': [-1.941, -0.2686, -3.365, 31.223],
    '10': [-1.61682, 0.2656, -2.714, 25.364],
  },
  c: {
    '1': [-3.43035, -6.5393, -16.786, -79.433],
    '5': [-2.86154, -2.8903, -4.234, -40.04],
    '10': [-2.56677, -1.5384, -2.809, 0],
  },
  ct: {
    '1': [-3.95877, -9.0531, -28.428, -134.155],
    '5': [-3.41049, -4.3904, -9.036, -45.374],
    '10': [-3.12705, -2.5856, -3.925, -22.38],
  },
};

export function adfCriticalValues(det: AdfDet, n: number): { '1': number; '5': number; '10': number } {
  const f = (c: number[]) => c[0] + c[1] / n + c[2] / (n * n) + c[3] / (n * n * n);
  return { '1': f(MACK_CV[det]['1']), '5': f(MACK_CV[det]['5']), '10': f(MACK_CV[det]['10']) };
}

// MacKinnon (1994) asymptotic p-value approximation
const MACK_P: Record<AdfDet, { max: number; min: number; star: number; small: number[]; large: number[] }> = {
  n: { max: Infinity, min: -19.04, star: -1.04, small: [0.6344, 1.2378, 0.032496], large: [0.4797, 0.93557, -0.06999, 0.033066] },
  c: { max: 2.74, min: -18.83, star: -1.61, small: [2.1659, 1.4412, 0.038269], large: [1.7339, 0.93202, -0.12745, -0.010368] },
  ct: { max: 0.7, min: -16.18, star: -2.89, small: [3.2512, 1.6047, 0.049588], large: [2.5261, 0.61654, -0.37956, -0.060285] },
};

export function mackinnonP(stat: number, det: AdfDet): number {
  const c = MACK_P[det];
  if (stat > c.max) return 1;
  if (stat < c.min) return 0;
  const coef = stat <= c.star ? c.small : c.large;
  let v = 0;
  for (let i = coef.length - 1; i >= 0; i--) v = v * stat + coef[i];
  return normCdf(v);
}

export interface AdfResult {
  stat: number;
  pValue: number;
  usedLag: number;
  nobs: number;
  det: AdfDet;
  gamma: number;
  critical: { '1': number; '5': number; '10': number };
  rejectUnitRoot5: boolean;
}

function adfDesign(y: number[], p: number, det: AdfDet, start: number): { X: Mat; r: number[] } {
  const X: Mat = [];
  const r: number[] = [];
  const T = y.length;
  for (let t = start; t < T; t++) {
    const row = [y[t - 1]];
    if (det !== 'n') row.push(1);
    if (det === 'ct') row.push(t / T);
    for (let i = 1; i <= p; i++) row.push(y[t - i] - y[t - i - 1]);
    X.push(row);
    r.push(y[t] - y[t - 1]);
  }
  return { X, r };
}

function detrend(y: number[], det: AdfDet): number[] {
  if (det === 'n') return y.slice();
  const T = y.length;
  if (det === 'c') {
    const m = mean(y);
    return y.map((v) => v - m);
  }
  const X: Mat = y.map((_, t) => [1, t / T]);
  const res = olsFit(X, y, { hac: false });
  return res.residuals;
}

/**
 * Augmented Dickey-Fuller test.
 *  - lag choice: BIC (default) / AIC / MAIC (Ng-Perron 2001, Perron-Qu 2007 OLS-detrended
 *    variant), all compared on a COMMON sample, then re-estimated on the longest sample.
 *    Monte Carlo (T=200): BIC gives size 4.3% / power 100% on AR(0.5); our MAIC variant keeps
 *    size but over-selects lags on stationary data (power 88%), so use it only for series with
 *    strong negative-MA errors, where BIC is known to over-reject.
 *  - critical values: MacKinnon (2010) finite-sample surface; p-value: MacKinnon (1994).
 */
export function adfTest(y: number[], opts: { det?: AdfDet; criterion?: LagCriterion; maxLag?: number; lag?: number } = {}): AdfResult {
  const det = opts.det ?? 'c';
  const T = y.length;
  if (T < 25) throw new Error('adfTest: need at least 25 observations');
  const fit = (p: number, start: number) => {
    const { X, r } = adfDesign(y, p, det, start);
    const res = olsFit(X, r, { hac: false });
    return { res, stat: res.t[0], n: r.length };
  };
  let p: number;
  if (opts.lag !== undefined) {
    p = opts.lag;
  } else {
    const kMin = det === 'n' ? 1 : det === 'c' ? 2 : 3;
    const pmaxDefault = Math.min(Math.floor(12 * Math.pow(T / 100, 0.25)), Math.floor((T - 1 - kMin - 12) / 2));
    const pmax = Math.max(0, opts.maxLag ?? pmaxDefault);
    const crit = opts.criterion ?? 'bic';
    const ytil = detrend(y, det);
    let best = Infinity;
    p = 0;
    for (let q = 0; q <= pmax; q++) {
      const { res, n } = fit(q, pmax + 1);
      const s2 = res.rss / n;
      const k = res.k;
      let ic: number;
      if (crit === 'aic') ic = Math.log(s2) + (2 * k) / n;
      else if (crit === 'bic') ic = Math.log(s2) + (k * Math.log(n)) / n;
      else {
        let sy = 0;
        for (let t = pmax + 1; t < T; t++) sy += ytil[t - 1] * ytil[t - 1];
        const tau = (res.beta[0] * res.beta[0] * sy) / s2;
        ic = Math.log(s2) + (2 * (tau + q)) / n;
      }
      if (ic < best) {
        best = ic;
        p = q;
      }
    }
  }
  const { res, stat, n } = fit(p, p + 1);
  const critical = adfCriticalValues(det, n);
  return {
    stat, pValue: mackinnonP(stat, det), usedLag: p, nobs: n, det, gamma: res.beta[0], critical,
    rejectUnitRoot5: stat < critical['5'],
  };
}

export interface KpssResult {
  stat: number;
  pValue: number;
  lags: number;
  trend: 'c' | 'ct';
  critical: { '10': number; '5': number; '2.5': number; '1': number };
  rejectStationarity5: boolean;
}

const KPSS_CV = {
  c: { '10': 0.347, '5': 0.463, '2.5': 0.574, '1': 0.739 },
  ct: { '10': 0.119, '5': 0.146, '2.5': 0.176, '1': 0.216 },
};

/** KPSS (1992): H0 = stationary. Bartlett long-run variance. */
export function kpssTest(y: number[], opts: { trend?: 'c' | 'ct'; lags?: number } = {}): KpssResult {
  const trend = opts.trend ?? 'c';
  const T = y.length;
  if (T < 20) throw new Error('kpssTest: need at least 20 observations');
  let e: number[];
  if (trend === 'c') {
    const m = mean(y);
    e = y.map((v) => v - m);
  } else {
    e = olsFit(y.map((_, t) => [1, t / T]), y, { hac: false }).residuals;
  }
  const l = opts.lags ?? Math.floor(4 * Math.pow(T / 100, 0.25));
  let s2 = 0;
  for (const v of e) s2 += v * v;
  s2 /= T;
  for (let j = 1; j <= l; j++) {
    let g = 0;
    for (let t = j; t < T; t++) g += e[t] * e[t - j];
    s2 += (2 * (1 - j / (l + 1)) * g) / T;
  }
  let S = 0;
  let sum = 0;
  for (const v of e) {
    S += v;
    sum += S * S;
  }
  const stat = sum / (T * T * s2);
  const cv = KPSS_CV[trend];
  const pts: [number, number][] = [
    [cv['10'], 0.1], [cv['5'], 0.05], [cv['2.5'], 0.025], [cv['1'], 0.01],
  ];
  let pValue: number;
  if (stat <= pts[0][0]) pValue = 0.1;
  else if (stat >= pts[3][0]) pValue = 0.01;
  else {
    pValue = 0.1;
    for (let i = 0; i < 3; i++) {
      const [s0, p0] = pts[i];
      const [s1, p1] = pts[i + 1];
      if (stat >= s0 && stat <= s1) {
        pValue = p0 + ((stat - s0) / (s1 - s0)) * (p1 - p0);
        break;
      }
    }
  }
  return { stat, pValue, lags: l, trend, critical: cv, rejectStationarity5: stat > cv['5'] };
}

export type ZaModel = 'intercept' | 'trend' | 'both';

const ZA_CV: Record<ZaModel, { '1': number; '5': number; '10': number }> = {
  intercept: { '1': -5.34, '5': -4.8, '10': -4.58 },
  trend: { '1': -4.93, '5': -4.42, '10': -4.11 },
  both: { '1': -5.57, '5': -5.08, '10': -4.82 },
};

export interface ZaResult {
  stat: number;
  breakIndex: number;
  usedLag: number;
  critical: { '1': number; '5': number; '10': number };
  rejectUnitRoot5: boolean;
}

/**
 * Zivot-Andrews (1992) unit-root test with ONE endogenous structural break.
 * Vietnamese macro series have regime shifts (2008, 2011, 2020...) that make plain ADF
 * low-powered; this separates "unit root" from "stationary around a broken mean/trend".
 * The lag is fixed from a BIC-ADF on the series (common practical simplification).
 * Monte Carlo (T=200, drifting RW, nominal 5%): empirical size intercept 6.0%, trend 7.3%,
 * both 10.0% — 'both' is liberal, so diagnoseIntegration uses 'intercept' as arbiter and a
 * 'break-stationary' label should be read as a flag for review, not as proof.
 */
export function zivotAndrewsTest(y: number[], opts: { model?: ZaModel; lag?: number; trim?: number } = {}): ZaResult {
  const model = opts.model ?? 'both';
  const T = y.length;
  if (T < 40) throw new Error('zivotAndrewsTest: need at least 40 observations');
  const p = opts.lag ?? adfTest(y, { det: 'ct', criterion: 'bic' }).usedLag;
  const trim = opts.trim ?? 0.15;
  const lo = Math.max(p + 2, Math.ceil(trim * T));
  const hi = Math.floor((1 - trim) * T);
  let best = Infinity;
  let bestTb = lo;
  for (let tb = lo; tb <= hi; tb++) {
    const X: Mat = [];
    const r: number[] = [];
    for (let t = p + 1; t < T; t++) {
      const row = [y[t - 1], 1, t / T];
      if (model === 'intercept' || model === 'both') row.push(t > tb ? 1 : 0);
      if (model === 'trend' || model === 'both') row.push(t > tb ? (t - tb) / T : 0);
      for (let i = 1; i <= p; i++) row.push(y[t - i] - y[t - i - 1]);
      X.push(row);
      r.push(y[t] - y[t - 1]);
    }
    let stat: number;
    try {
      stat = olsFit(X, r, { hac: false }).t[0];
    } catch {
      continue;
    }
    if (stat < best) {
      best = stat;
      bestTb = tb;
    }
  }
  const critical = ZA_CV[model];
  return { stat: best, breakIndex: bestTb, usedLag: p, critical, rejectUnitRoot5: best < critical['5'] };
}

export type IntegrationClass = 'I(0)' | 'I(1)' | 'break-stationary' | 'ambiguous';

export interface IntegrationDiagnosis {
  klass: IntegrationClass;
  adf: AdfResult;
  kpss: KpssResult;
  za?: ZaResult;
}

/**
 * Joint ADF (H0: unit root) + KPSS (H0: stationary) verdict:
 *   ADF rejects & KPSS doesn't → I(0);   ADF doesn't & KPSS rejects → I(1);
 *   otherwise Zivot-Andrews arbitrates (reject → stationary around a break), else 'ambiguous'.
 */
export function diagnoseIntegration(y: number[], opts: { trending?: boolean } = {}): IntegrationDiagnosis {
  const det: AdfDet = opts.trending ? 'ct' : 'c';
  const adf = adfTest(y, { det });
  const kpss = kpssTest(y, { trend: opts.trending ? 'ct' : 'c' });
  if (adf.rejectUnitRoot5 && !kpss.rejectStationarity5) return { klass: 'I(0)', adf, kpss };
  if (!adf.rejectUnitRoot5 && kpss.rejectStationarity5) return { klass: 'I(1)', adf, kpss };
  // Persistent but stationary series (PMI, spreads, VIX...) inflate KPSS, especially with the short
  // bandwidth. Arbitrate with a long-bandwidth KPSS (Schwert l12): if ADF rejects at 1% and the
  // long-bandwidth KPSS does not reject at 1%, trust the strong ADF rejection instead of differencing.
  if (adf.pValue < 0.01 && kpss.rejectStationarity5) {
    const long = kpssTest(y, { trend: opts.trending ? 'ct' : 'c', lags: Math.ceil(12 * Math.pow(y.length / 100, 0.25)) });
    if (long.pValue > 0.01) return { klass: 'I(0)', adf, kpss };
  }
  if (y.length >= 40) {
    const za = zivotAndrewsTest(y, { model: 'intercept' });
    if (za.rejectUnitRoot5 && !adf.rejectUnitRoot5) return { klass: 'break-stationary', adf, kpss, za };
    return { klass: adf.rejectUnitRoot5 && kpss.rejectStationarity5 ? 'ambiguous' : 'I(1)', adf, kpss, za };
  }
  return { klass: 'ambiguous', adf, kpss };
}

/**
 * Integration order d ∈ {0,1,2}. Conservative rule: when evidence is ambiguous we difference,
 * because a spurious regression costs far more than a little over-differencing.
 */
export function determineIntegrationOrder(
  y: number[],
  opts: { trending?: boolean; maxD?: number } = {},
): { order: number; history: IntegrationDiagnosis[] } {
  const maxD = opts.maxD ?? 2;
  const history: IntegrationDiagnosis[] = [];
  let cur = y;
  for (let d = 0; d <= maxD; d++) {
    const diag = diagnoseIntegration(cur, { trending: d === 0 ? opts.trending : false });
    history.push(diag);
    if (diag.klass === 'I(0)' || diag.klass === 'break-stationary') return { order: d, history };
    if (d === maxD) break;
    const next: number[] = [];
    for (let i = 1; i < cur.length; i++) next.push(cur[i] - cur[i - 1]);
    cur = next;
  }
  return { order: maxD, history };
}

/**
 * Engle-Granger two-step cointegration test for ONE regressor (N = 2 variables), using
 * MacKinnon (1991/2010) cointegration critical values. Multivariate Johansen is handled
 * by the Python service.
 */
export function engleGranger(y: number[], x: number[]): { stat: number; critical: { '1': number; '5': number; '10': number }; cointegrated5: boolean; beta: number } {
  const n = y.length;
  const res = olsFit(y.map((_, i) => [1, x[i]]), y, { hac: false });
  const adf = adfTest(res.residuals, { det: 'n', criterion: 'bic' });
  const c = (b: number[]) => b[0] + b[1] / n + b[2] / (n * n);
  const critical = {
    '1': c([-3.89644, -10.9519, -22.527]),
    '5': c([-3.33613, -6.1101, -6.823]),
    '10': c([-3.04445, -4.2412, -2.72]),
  };
  return { stat: adf.stat, critical, cointegrated5: adf.stat < critical['5'], beta: res.beta[1] };
}

// ───────────────────────── 6. Transforms & alignment ─────────────────────────

export type Transform = 'level' | 'diff' | 'logdiff' | 'diff2' | 'yoy';
export type SeriesKind = 'index' | 'level' | 'rate';

export function applyTransform(v: number[], t: Transform): number[] {
  const n = v.length;
  const out = new Array<number>(n).fill(NaN);
  switch (t) {
    case 'level':
      return v.slice();
    case 'diff':
      for (let i = 1; i < n; i++) out[i] = v[i] - v[i - 1];
      return out;
    case 'diff2':
      for (let i = 2; i < n; i++) out[i] = v[i] - 2 * v[i - 1] + v[i - 2];
      return out;
    case 'logdiff':
      for (let i = 1; i < n; i++) if (v[i] > 0 && v[i - 1] > 0) out[i] = 100 * (Math.log(v[i]) - Math.log(v[i - 1]));
      return out;
    case 'yoy':
      for (let i = 12; i < n; i++) if (v[i] > 0 && v[i - 12] > 0) out[i] = 100 * (Math.log(v[i]) - Math.log(v[i - 12]));
      return out;
  }
}

export function recommendTransform(kind: SeriesKind, order: number, values?: number[]): Transform {
  if (order <= 0) return 'level';
  if (order >= 2) return 'diff2';
  const positive = !values || values.every((x) => x > 0);
  return (kind === 'index' || kind === 'level') && positive ? 'logdiff' : 'diff';
}

/**
 * Publication-lag shift: a value for month t is only known at t + lag, so the series seen at
 * month t is values[t - lag]. Prevents look-ahead bias (e.g. CPI of month T is published in T+1).
 */
export function shiftForPublicationLag(values: number[], lag: number): number[] {
  if (lag <= 0) return values.slice();
  return values.map((_, i) => (i - lag >= 0 ? values[i - lag] : NaN));
}

// ───────────────────────── 7. Design matrices & impact matrix ─────────────────────────

export interface Design {
  X: Mat;
  y: number[];
  rows: number[];
  names: string[];
}

/** y_t on [1, x_{j,t-lag} (all j), y_{t-1..t-arLags}]. Rows with non-finite values are dropped. */
export function buildDesign(args: { y: number[]; xs: number[][]; names?: string[]; lag: number; arLags: number; start?: number }): Design {
  const { y, xs, lag, arLags } = args;
  const T = y.length;
  const start = args.start ?? Math.max(lag, arLags);
  const names = ['const', ...(args.names ?? xs.map((_, j) => `x${j}`))];
  for (let i = 1; i <= arLags; i++) names.push(`ar${i}`);
  const X: Mat = [];
  const yy: number[] = [];
  const rows: number[] = [];
  for (let t = start; t < T; t++) {
    if (t - lag < 0) continue;
    const row = [1];
    let ok = isFiniteNum(y[t]);
    for (let j = 0; j < xs.length && ok; j++) {
      const v = xs[j][t - lag];
      if (!isFiniteNum(v)) ok = false;
      else row.push(v);
    }
    for (let i = 1; i <= arLags && ok; i++) {
      const v = y[t - i];
      if (!isFiniteNum(v)) ok = false;
      else row.push(v);
    }
    if (!ok) continue;
    X.push(row);
    yy.push(y[t]);
    rows.push(t);
  }
  return { X, y: yy, rows, names };
}

export interface ImpactOptions {
  maxLag: number;
  maxArLags: number;
  hacLag?: number;
  adjust: PAdjust;
  alpha: number;
}

export const DEFAULT_IMPACT_OPTIONS: ImpactOptions = { maxLag: 6, maxArLags: 2, adjust: 'by', alpha: 0.05 };

export interface ImpactCell {
  factor: string;
  target: string;
  lag: number;
  beta: number;
  se: number;
  t: number;
  p: number;
  q: number;
  betaStd: number;
  nobs: number;
  arLags: number;
  r2adj: number;
  direction: '+' | '-' | '0';
  significant: boolean;
}

/**
 * Joint model per (target, lag): y_t = a + Σ_f β_f x_{f,t-lag} + Σ φ_i y_{t-i} + e_t.
 * AR order picked by BIC on a common sample. All cells of the whole matrix are one
 * multiple-testing family → q-values via BY (default) or BH.
 * Inputs must already be stationary (see analyzeMacro).
 */
export function estimateImpactMatrix(args: {
  targets: Record<string, number[]>;
  factors: Record<string, number[]>;
  options?: Partial<ImpactOptions>;
}): ImpactCell[] {
  const o = { ...DEFAULT_IMPACT_OPTIONS, ...args.options };
  const fNames = Object.keys(args.factors);
  const xs = fNames.map((f) => args.factors[f]);
  const cells: ImpactCell[] = [];
  for (const [tName, y] of Object.entries(args.targets)) {
    for (let lag = 0; lag <= o.maxLag; lag++) {
      let bestP = 0;
      let bestBic = Infinity;
      const common = Math.max(lag, o.maxArLags);
      for (let p = 0; p <= o.maxArLags; p++) {
        const d = buildDesign({ y, xs, names: fNames, lag, arLags: p, start: common });
        if (d.X.length < d.names.length + 12) continue;
        try {
          const r = olsFit(d.X, d.y, { hac: false });
          if (r.bic < bestBic) {
            bestBic = r.bic;
            bestP = p;
          }
        } catch {
          /* singular → skip */
        }
      }
      const d = buildDesign({ y, xs, names: fNames, lag, arLags: bestP });
      if (d.X.length < d.names.length + 12) continue;
      let res: OlsResult;
      try {
        res = olsFit(d.X, d.y, { hacLag: o.hacLag });
      } catch {
        continue;
      }
      const sdY = std(d.y);
      fNames.forEach((f, j) => {
        const col = d.X.map((r) => r[1 + j]);
        const beta = res.beta[1 + j];
        cells.push({
          factor: f, target: tName, lag, beta, se: res.seHac[1 + j], t: res.tHac[1 + j], p: res.pHac[1 + j],
          q: 1, betaStd: sdY > 0 ? (beta * std(col)) / sdY : 0, nobs: res.n, arLags: bestP, r2adj: res.adjR2,
          direction: beta > 0 ? '+' : beta < 0 ? '-' : '0', significant: false,
        });
      });
    }
  }
  const q = adjustPValues(cells.map((c) => c.p), o.adjust);
  cells.forEach((c, i) => {
    c.q = q[i];
    c.significant = q[i] < o.alpha;
  });
  return cells;
}

/** For each (factor, target) the lag with the smallest p-value (its q already accounts for the whole family). */
export function bestLagCells(cells: ImpactCell[]): ImpactCell[] {
  const map = new Map<string, ImpactCell>();
  for (const c of cells) {
    const key = `${c.factor}|${c.target}`;
    const cur = map.get(key);
    if (!cur || c.p < cur.p) map.set(key, c);
  }
  return [...map.values()];
}

// ───────────────────────── 8. Stability, breaks, causality ─────────────────────────

export interface RollingResult {
  rows: number[];
  beta: number[];
  t: number[];
}

/** Rolling-window beta with HAC t-stat for coefficient `coefIdx` of a design. */
export function rollingBeta(design: Design, coefIdx: number, window: number): RollingResult {
  const out: RollingResult = { rows: [], beta: [], t: [] };
  const n = design.X.length;
  const k = design.names.length;
  if (window < k + 10) throw new Error(`rollingBeta: window must be at least ${k + 10}`);
  for (let end = window; end <= n; end++) {
    try {
      const r = olsFit(design.X.slice(end - window, end), design.y.slice(end - window, end));
      out.rows.push(design.rows[end - 1]);
      out.beta.push(r.beta[coefIdx]);
      out.t.push(r.tHac[coefIdx]);
    } catch {
      /* skip singular window */
    }
  }
  return out;
}

export interface StabilityInfo {
  shareSameSign: number;
  shareSignificant: number;
  signFlips: number;
  windows: number;
  stable: boolean;
}

export function summarizeStability(roll: RollingResult, fullSampleBeta: number): StabilityInfo {
  const w = roll.beta.length;
  if (w === 0) return { shareSameSign: 0, shareSignificant: 0, signFlips: 0, windows: 0, stable: false };
  const s = Math.sign(fullSampleBeta);
  let same = 0;
  let sig = 0;
  let flips = 0;
  for (let i = 0; i < w; i++) {
    if (Math.sign(roll.beta[i]) === s) same++;
    if (Math.abs(roll.t[i]) > 1.96 && Math.sign(roll.beta[i]) === s) sig++;
    if (i > 0 && Math.sign(roll.beta[i]) !== Math.sign(roll.beta[i - 1])) flips++;
  }
  const shareSameSign = same / w;
  const shareSignificant = sig / w;
  return { shareSameSign, shareSignificant, signFlips: flips, windows: w, stable: shareSameSign >= 0.8 && shareSignificant >= 0.3 };
}

/** Chow (1960) test for a structural break at design-row `breakRow`. */
export function chowTest(X: Mat, y: number[], breakRow: number): { F: number; p: number; df1: number; df2: number } {
  const n = X.length;
  const k = X[0].length;
  if (breakRow < k + 2 || n - breakRow < k + 2) throw new Error('chowTest: sub-samples too small');
  const rp = olsFit(X, y, { hac: false }).rss;
  const r1 = olsFit(X.slice(0, breakRow), y.slice(0, breakRow), { hac: false }).rss;
  const r2 = olsFit(X.slice(breakRow), y.slice(breakRow), { hac: false }).rss;
  const df2 = n - 2 * k;
  const F = ((rp - (r1 + r2)) / k) / ((r1 + r2) / df2);
  return { F, p: fSurvival(F, k, df2), df1: k, df2 };
}

/** Granger causality "x → y" with p lags (F-test). Both series should be stationary. */
export function grangerCausality(y: number[], x: number[], p: number): { F: number; p: number; df1: number; df2: number } {
  const T = y.length;
  const XR: Mat = [];
  const XU: Mat = [];
  const r: number[] = [];
  for (let t = p; t < T; t++) {
    const base = [1];
    for (let i = 1; i <= p; i++) base.push(y[t - i]);
    const ext = [...base];
    for (let i = 1; i <= p; i++) ext.push(x[t - i]);
    if (![...ext, y[t]].every(isFiniteNum)) continue;
    XR.push(base);
    XU.push(ext);
    r.push(y[t]);
  }
  const rssR = olsFit(XR, r, { hac: false }).rss;
  const ur = olsFit(XU, r, { hac: false });
  const df2 = ur.n - ur.k;
  const F = ((rssR - ur.rss) / p) / (ur.rss / df2);
  return { F, p: fSurvival(F, p, df2), df1: p, df2 };
}

/** Cross-correlation corr(x_{t-k}, y_t) for k = -maxLag..maxLag with the ±1.96/√n band. */
export function crossCorrelation(x: number[], y: number[], maxLag: number): { lag: number; r: number; significant: boolean }[] {
  const out: { lag: number; r: number; significant: boolean }[] = [];
  for (let k = -maxLag; k <= maxLag; k++) {
    const a: number[] = [];
    const b: number[] = [];
    for (let t = 0; t < y.length; t++) {
      const s = t - k;
      if (s < 0 || s >= x.length) continue;
      if (isFiniteNum(x[s]) && isFiniteNum(y[t])) {
        a.push(x[s]);
        b.push(y[t]);
      }
    }
    const n = a.length;
    if (n < 10) continue;
    const ma = mean(a);
    const mb = mean(b);
    let sab = 0;
    let saa = 0;
    let sbb = 0;
    for (let i = 0; i < n; i++) {
      sab += (a[i] - ma) * (b[i] - mb);
      saa += (a[i] - ma) ** 2;
      sbb += (b[i] - mb) ** 2;
    }
    const r = sab / Math.sqrt(saa * sbb);
    out.push({ lag: k, r, significant: Math.abs(r) > 1.96 / Math.sqrt(n) });
  }
  return out;
}

/** Politis-Romano (1994) stationary bootstrap CI for one coefficient (keeps serial dependence). */
export function stationaryBootstrapCI(
  X: Mat,
  y: number[],
  coefIdx: number,
  opts: { B?: number; meanBlock?: number; seed?: number; level?: number } = {},
): { lo: number; hi: number; mean: number } {
  const B = opts.B ?? 999;
  const n = X.length;
  const pNew = 1 / (opts.meanBlock ?? 6);
  const rng = mulberry32(opts.seed ?? 12345);
  const betas: number[] = [];
  for (let b = 0; b < B; b++) {
    const idx: number[] = [];
    let cur = Math.floor(rng() * n);
    for (let i = 0; i < n; i++) {
      if (i > 0) cur = rng() < pNew ? Math.floor(rng() * n) : (cur + 1) % n;
      idx.push(cur);
    }
    try {
      betas.push(olsFit(idx.map((i) => X[i]), idx.map((i) => y[i]), { hac: false }).beta[coefIdx]);
    } catch {
      /* degenerate resample */
    }
  }
  betas.sort((a, c) => a - c);
  const lvl = opts.level ?? 0.95;
  const lo = betas[Math.floor(((1 - lvl) / 2) * (betas.length - 1))];
  const hi = betas[Math.ceil(((1 + lvl) / 2) * (betas.length - 1))];
  return { lo, hi, mean: mean(betas) };
}

// ───────────────────────── 9. MacroScore (point-in-time) ─────────────────────────

export interface MacroScorePoint {
  /** index of the month being forecast */
  row: number;
  /** forecast origin = row - lag (the last month whose factor value is used) */
  origin: number;
  score: number;
  z: number;
  expectedReturn: number;
  contributions: Record<string, number>;
}

/**
 * Walk-forward (out-of-sample) MacroScore for one target.
 *  - the forecast for month t uses factors at t-lag and betas fitted ONLY on responses that
 *    were already observed at the origin t-lag (row index ≤ t-lag), re-estimated every `step` rows;
 *  - each beta is shrunk by the positive-part empirical-Bayes factor max(0, 1 - 1/t²), so
 *    noisy coefficients contribute ~0;
 *  - x enters as a deviation from its mean over the training rows (no look-ahead);
 *  - expected return μ̂_t = Σ β*_f (x_{f,t-lag} - x̄_f); score_t = tanh(μ̂_t / σ̂_y) ∈ (-1, 1),
 *    z_t = μ̂_t / σ̂_y is directly usable as a log-odds-like input of a signal combiner.
 */
export function macroScoreSeries(args: {
  y: number[];
  factors: Record<string, number[]>;
  lag?: number;
  arLags?: number;
  minTrain?: number;
  step?: number;
}): MacroScorePoint[] {
  const lag = args.lag ?? 1;
  const arLags = args.arLags ?? 1;
  const minTrain = args.minTrain ?? 60;
  const step = args.step ?? 3;
  const names = Object.keys(args.factors);
  const xs = names.map((n) => args.factors[n]);
  const d = buildDesign({ y: args.y, xs, names, lag, arLags });
  const out: MacroScorePoint[] = [];
  let betas: number[] | null = null;
  let tstats: number[] = [];
  let sdY = 1;
  let lastFit = -Infinity;
  let cnt = 0;
  for (let i = 0; i < d.rows.length; i++) {
    while (cnt < d.rows.length && d.rows[cnt] <= d.rows[i] - lag) cnt++;
    if (cnt < minTrain) continue;
    if (betas === null || cnt - lastFit >= step) {
      try {
        const r = olsFit(d.X.slice(0, cnt), d.y.slice(0, cnt));
        betas = r.beta;
        tstats = r.tHac;
        sdY = std(d.y.slice(0, cnt));
        lastFit = cnt;
      } catch {
        continue;
      }
    }
    if (betas === null) continue;
    const contributions: Record<string, number> = {};
    let mu = 0;
    for (let j = 0; j < names.length; j++) {
      const shrink = Math.max(0, 1 - 1 / (tstats[1 + j] * tstats[1 + j]));
      let m = 0;
      for (let r = 0; r < cnt; r++) m += d.X[r][1 + j];
      m /= cnt;
      const c = betas[1 + j] * shrink * (d.X[i][1 + j] - m);
      contributions[names[j]] = c;
      mu += c;
    }
    const z = sdY > 0 ? mu / sdY : 0;
    out.push({ row: d.rows[i], origin: d.rows[i] - lag, score: Math.tanh(z), z, expectedReturn: mu, contributions });
  }
  return out;
}

// ───────────────────────── 10. Orchestrator ─────────────────────────

export interface MacroSeries {
  id: string;
  name?: string;
  values: number[];
  kind: SeriesKind;
  /** months between the reference month and the publication date */
  pubLagMonths?: number;
  transform?: Transform | 'auto';
}

export interface SeriesDiagnostic {
  id: string;
  klass: IntegrationClass;
  order: number;
  transform: Transform;
  adfP: number;
  kpssP: number;
  breakIndex?: number;
}

export interface MacroAnalysis {
  dates: string[];
  diagnostics: SeriesDiagnostic[];
  cells: ImpactCell[];
  best: ImpactCell[];
  stability: Record<string, StabilityInfo>;
  warnings: string[];
}

function firstFiniteBlock(v: number[]): number[] {
  const s = v.findIndex(isFiniteNum);
  if (s < 0) return [];
  const out: number[] = [];
  for (let i = s; i < v.length && isFiniteNum(v[i]); i++) out.push(v[i]);
  return out;
}

export interface StationaryPrep {
  diagnostics: SeriesDiagnostic[];
  factors: Record<string, number[]>;
  targets: Record<string, number[]>;
  transforms: Record<string, Transform>;
  warnings: string[];
}

/** Diagnose every series (ADF + KPSS + ZA), apply publication lags and stationarity transforms. */
export function prepareStationary(input: { dates: string[]; factors: MacroSeries[]; targets: MacroSeries[] }): StationaryPrep {
  const warnings: string[] = [];
  const T = input.dates.length;
  for (const s of [...input.factors, ...input.targets])
    if (s.values.length !== T) throw new Error(`analyzeMacro: series ${s.id} has length ${s.values.length}, expected ${T}`);
  const diagnostics: SeriesDiagnostic[] = [];
  const out = { factors: {} as Record<string, number[]>, targets: {} as Record<string, number[]>, transforms: {} as Record<string, Transform> };

  const process = (s: MacroSeries, role: 'factors' | 'targets') => {
    const shifted = role === 'factors' ? shiftForPublicationLag(s.values, s.pubLagMonths ?? 0) : s.values.slice();
    const clean = firstFiniteBlock(shifted);
    if (clean.length < 40) warnings.push(`${s.id}: only ${clean.length} usable observations; diagnostics skipped (treated as I(1)).`);
    let order = 1;
    let klass: IntegrationClass = 'ambiguous';
    let adfP = NaN;
    let kpssP = NaN;
    let breakIndex: number | undefined;
    const trending = s.kind !== 'rate';
    const series = trending && clean.every((v) => v > 0) ? clean.map(Math.log) : clean;
    if (clean.length >= 40) {
      const r = determineIntegrationOrder(series, { trending });
      order = r.order;
      const h = r.history[r.history.length - 1];
      klass = h.klass;
      adfP = h.adf.pValue;
      kpssP = h.kpss.pValue;
      breakIndex = h.za?.breakIndex;
      // Trend-stationary series (I(0) only around a deterministic trend) would carry the trend into
      // a regression on returns. Differencing is the safe, look-ahead-free choice.
      if (order === 0 && trending && kpssTest(series, { trend: 'c' }).rejectStationarity5) {
        order = 1;
        warnings.push(`${s.id}: stationary only around a deterministic trend; differenced to keep the trend out of the regression.`);
      }
      if (klass === 'ambiguous') warnings.push(`${s.id}: unit-root tests ambiguous; differenced conservatively.`);
      if (klass === 'break-stationary') warnings.push(`${s.id}: looks stationary only around a structural break (index ${breakIndex}); consider regime-specific estimation.`);
    }
    const tr: Transform = s.transform && s.transform !== 'auto' ? s.transform : recommendTransform(s.kind, order, clean);
    out[role][s.id] = applyTransform(shifted, tr);
    out.transforms[s.id] = tr;
    diagnostics.push({ id: s.id, klass, order, transform: tr, adfP, kpssP, breakIndex });
  };
  input.factors.forEach((s) => process(s, 'factors'));
  input.targets.forEach((s) => process(s, 'targets'));
  return { diagnostics, factors: out.factors, targets: out.targets, transforms: out.transforms, warnings };
}

export function analyzeMacro(input: {
  dates: string[];
  factors: MacroSeries[];
  targets: MacroSeries[];
  options?: Partial<ImpactOptions> & { rollingWindow?: number; stabilityMaxP?: number };
}): MacroAnalysis {
  const o = { ...DEFAULT_IMPACT_OPTIONS, ...input.options };
  const prep = prepareStationary(input);
  const warnings = [...prep.warnings];
  const cells = estimateImpactMatrix({ targets: prep.targets, factors: prep.factors, options: o });
  if (cells.length === 0) warnings.push('No estimable cells: sample too short for the requested lags.');
  const nobs = cells.length ? Math.min(...cells.map((c) => c.nobs)) : 0;
  if (nobs > 0 && nobs < 60) warnings.push(`Only ${nobs} observations: estimates are fragile; read q-values, not point estimates.`);
  const best = bestLagCells(cells);

  const stability: Record<string, StabilityInfo> = {};
  const window = o.rollingWindow ?? 48;
  const maxP = o.stabilityMaxP ?? 0.1;
  const fNames = Object.keys(prep.factors);
  const xs = fNames.map((f) => prep.factors[f]);
  for (const c of best) {
    if (c.p > maxP) continue;
    const y = prep.targets[c.target];
    const d = buildDesign({ y, xs, names: fNames, lag: c.lag, arLags: c.arLags });
    const idx = 1 + fNames.indexOf(c.factor);
    if (d.X.length >= window + 5) {
      try {
        stability[`${c.factor}|${c.target}`] = summarizeStability(rollingBeta(d, idx, window), c.beta);
      } catch {
        /* window too small for design */
      }
    }
  }
  warnings.push(`Multiple testing: ${cells.length} cells corrected with ${o.adjust.toUpperCase()}; best-lag cells inherit that correction. Stability is computed for cells with raw p ≤ ${maxP}.`);
  return { dates: input.dates, diagnostics: prep.diagnostics, cells, best, stability, warnings };
}
