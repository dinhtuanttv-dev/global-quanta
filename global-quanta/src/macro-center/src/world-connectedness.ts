/**
 * world-connectedness.ts — how strongly markets transmit shocks to each other.
 *
 *  - VAR(p) by equation-wise OLS (QR);
 *  - generalized forecast-error variance decomposition (Pesaran-Shin 1998), invariant to the
 *    ordering of variables — unlike Cholesky-based decompositions;
 *  - Diebold-Yilmaz (2012) connectedness: total, directional (to/from), net, pairwise;
 *  - rolling-window version and lower/upper tail dependence.
 *
 * Inputs are return series in percent (T × K). The measures are scale-invariant.
 */
import { olsFit, std, type Mat } from './quant-macro';

export interface VarFit {
  K: number;
  p: number;
  nobs: number;
  /** A[l-1][i][j]: effect of variable j at lag l on variable i */
  A: Mat[];
  intercept: number[];
  /** residual covariance */
  Sigma: Mat;
}

export function fitVar(Y: Mat, p: number): VarFit {
  const T = Y.length;
  const K = Y[0].length;
  if (T - p < K * p + 10) throw new Error('fitVar: sample too short for this lag order');
  const X: Mat = [];
  for (let t = p; t < T; t++) {
    const row = [1];
    for (let l = 1; l <= p; l++) for (let j = 0; j < K; j++) row.push(Y[t - l][j]);
    X.push(row);
  }
  const A: Mat[] = Array.from({ length: p }, () => Array.from({ length: K }, () => new Array<number>(K).fill(0)));
  const intercept = new Array<number>(K).fill(0);
  const resid: Mat = Array.from({ length: X.length }, () => new Array<number>(K).fill(0));
  for (let i = 0; i < K; i++) {
    const y = Y.slice(p).map((r) => r[i]);
    const res = olsFit(X, y, { hac: false });
    intercept[i] = res.beta[0];
    for (let l = 0; l < p; l++) for (let j = 0; j < K; j++) A[l][i][j] = res.beta[1 + l * K + j];
    res.residuals.forEach((e, t) => (resid[t][i] = e));
  }
  const n = X.length;
  const dof = n - (K * p + 1);
  const Sigma: Mat = Array.from({ length: K }, () => new Array<number>(K).fill(0));
  for (let a = 0; a < K; a++)
    for (let b = 0; b < K; b++) {
      let s = 0;
      for (let t = 0; t < n; t++) s += resid[t][a] * resid[t][b];
      Sigma[a][b] = s / dof;
    }
  return { K, p, nobs: n, A, intercept, Sigma };
}

/** BIC lag order on a common sample. */
export function selectVarLag(Y: Mat, maxP = 5): number {
  const K = Y[0].length;
  let best = 1;
  let bestBic = Infinity;
  for (let p = 1; p <= maxP; p++) {
    try {
      const sub = Y.slice(maxP - p);
      const f = fitVar(sub, p);
      // log-determinant via Cholesky-free Gaussian elimination
      const bic = logDet(f.Sigma) + (K * K * p * Math.log(f.nobs)) / f.nobs;
      if (bic < bestBic) {
        bestBic = bic;
        best = p;
      }
    } catch {
      break;
    }
  }
  return best;
}

function logDet(M: Mat): number {
  const n = M.length;
  const A = M.map((r) => r.slice());
  let ld = 0;
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    if (Math.abs(A[piv][c]) < 1e-300) return -Infinity;
    [A[c], A[piv]] = [A[piv], A[c]];
    ld += Math.log(Math.abs(A[c][c]));
    for (let r = c + 1; r < n; r++) {
      const f = A[r][c] / A[c][c];
      for (let j = c; j < n; j++) A[r][j] -= f * A[c][j];
    }
  }
  return ld;
}

const matMul = (A: Mat, B: Mat): Mat => A.map((row) => B[0].map((_, j) => row.reduce((s, a, k) => s + a * B[k][j], 0)));
const eye = (K: number): Mat => Array.from({ length: K }, (_, i) => Array.from({ length: K }, (_, j) => (i === j ? 1 : 0)));

/** MA(∞) coefficient matrices Φ_0..Φ_{H-1}. */
export function maCoefficients(A: Mat[], H: number): Mat[] {
  const K = A[0].length;
  const Phi: Mat[] = [eye(K)];
  for (let h = 1; h < H; h++) {
    let acc: Mat = Array.from({ length: K }, () => new Array<number>(K).fill(0));
    for (let l = 1; l <= Math.min(h, A.length); l++) {
      const term = matMul(A[l - 1], Phi[h - l]);
      acc = acc.map((r, i) => r.map((v, j) => v + term[i][j]));
    }
    Phi.push(acc);
  }
  return Phi;
}

/**
 * Generalized FEVD, row-normalised: result[i][j] = share of the H-step forecast-error variance of
 * variable i explained by shocks to variable j (rows sum to 1).
 */
export function generalizedFevd(fit: VarFit, H: number): Mat {
  const K = fit.K;
  const Phi = maCoefficients(fit.A, H);
  const S = fit.Sigma;
  const theta: Mat = Array.from({ length: K }, () => new Array<number>(K).fill(0));
  for (let i = 0; i < K; i++) {
    let denom = 0;
    for (let h = 0; h < H; h++) {
      const pe = Phi[h][i];
      // e_i' Φ_h Σ Φ_h' e_i
      let v = 0;
      for (let a = 0; a < K; a++) for (let b = 0; b < K; b++) v += pe[a] * S[a][b] * pe[b];
      denom += v;
    }
    for (let j = 0; j < K; j++) {
      let num = 0;
      for (let h = 0; h < H; h++) {
        let cross = 0;
        for (let a = 0; a < K; a++) cross += Phi[h][i][a] * S[a][j];
        num += cross * cross;
      }
      theta[i][j] = num / S[j][j] / denom;
    }
  }
  return theta.map((row) => {
    const s = row.reduce((a, b) => a + b, 0);
    return row.map((v) => v / s);
  });
}

export interface Connectedness {
  names: string[];
  /** row-normalised GFEVD, in percent */
  table: Mat;
  /** share of own variance coming from other markets, per market (percent) */
  from: number[];
  /** share each market's shocks add to the others' variance (percent) */
  to: number[];
  net: number[];
  /** pairwiseNet[i][j] > 0: j transmits more to i than i transmits to j (percentage points) */
  pairwiseNet: Mat;
  /** total spillover index (percent) */
  total: number;
}

export function summarizeConnectedness(theta: Mat, names: string[]): Connectedness {
  const K = theta.length;
  const table = theta.map((r) => r.map((v) => v * 100));
  const from = table.map((r, i) => r.reduce((s, v, j) => (j === i ? s : s + v), 0));
  const to = names.map((_, j) => table.reduce((s, r, i) => (i === j ? s : s + r[j]), 0));
  const net = to.map((v, j) => v - from[j]);
  const pairwiseNet = table.map((r, i) => r.map((v, j) => (i === j ? 0 : v - table[j][i])));
  return { names, table, from, to, net, pairwiseNet, total: from.reduce((a, b) => a + b, 0) / K };
}

export function connectedness(Y: Mat, names: string[], opts: { p?: number; H?: number } = {}): Connectedness & { p: number; H: number } {
  const p = opts.p ?? selectVarLag(Y, 4);
  const H = opts.H ?? 10;
  const fit = fitVar(Y, p);
  return { ...summarizeConnectedness(generalizedFevd(fit, H), names), p, H };
}

export interface RollingPoint {
  end: number;
  total: number;
  to: number[];
  from: number[];
}

export function rollingConnectedness(Y: Mat, names: string[], opts: { window?: number; step?: number; p?: number; H?: number } = {}): RollingPoint[] {
  const w = opts.window ?? 250;
  const step = opts.step ?? 20;
  const p = opts.p ?? 1;
  const H = opts.H ?? 10;
  const out: RollingPoint[] = [];
  for (let end = w; end <= Y.length; end += step) {
    try {
      const c = summarizeConnectedness(generalizedFevd(fitVar(Y.slice(end - w, end), p), H), names);
      out.push({ end: end - 1, total: c.total, to: c.to, from: c.from });
    } catch {
      /* skip degenerate window */
    }
  }
  return out;
}

/**
 * Empirical tail dependence: P(Y in its q-tail | X in its q-tail). Independent series give ≈ q,
 * perfectly co-moving series give 1. `tail` 'lower' looks at joint crashes, 'upper' at joint rallies.
 */
export function tailDependence(x: number[], y: number[], q = 0.05, tail: 'lower' | 'upper' = 'lower'): number {
  const n = Math.min(x.length, y.length);
  const sx = [...x.slice(0, n)].sort((a, b) => a - b);
  const sy = [...y.slice(0, n)].sort((a, b) => a - b);
  const k = Math.max(1, Math.floor(q * n));
  const cx = tail === 'lower' ? sx[k - 1] : sx[n - k];
  const cy = tail === 'lower' ? sy[k - 1] : sy[n - k];
  let nx = 0;
  let both = 0;
  for (let i = 0; i < n; i++) {
    const inX = tail === 'lower' ? x[i] <= cx : x[i] >= cx;
    const inY = tail === 'lower' ? y[i] <= cy : y[i] >= cy;
    if (inX) {
      nx++;
      if (inY) both++;
    }
  }
  return nx === 0 ? NaN : both / nx;
}

/** Standardise columns (for diagnostics; the measures themselves are scale-invariant). */
export function standardizeColumns(Y: Mat): Mat {
  const K = Y[0].length;
  const sd = Array.from({ length: K }, (_, j) => std(Y.map((r) => r[j])));
  return Y.map((r) => r.map((v, j) => v / sd[j]));
}
