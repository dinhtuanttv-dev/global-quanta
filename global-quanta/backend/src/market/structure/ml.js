// Cấu trúc đa khung — T2/T3: công cụ học máy thuần JS (không phụ thuộc thư viện), dùng cho kiểm định đặt trước.
//   - Hồi quy logistic L2 (Newton–IRLS), hiệu chỉnh isotonic (PAV), AUC / Brier / ECE.
//   - Purged k-fold theo thời gian (López de Prado): bỏ mẫu huấn luyện có nhãn chồng lên khoảng kiểm tra + embargo.
//   - Hồi quy phân vị tuyến tính (pinball, Adam) + hiệu chỉnh conformal CQR (Romano 2019) + ACI (Gibbs & Candès 2021).
//   - HMM Gauss (đường chéo) Baum–Welch nhiều chuỗi + lọc tiến (forward filter, không nhìn trước).

export function rng(seed = 7) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ------------------------------------------------------------------ chuẩn hoá

export function standardizer(X) {
  const d = X[0]?.length ?? 0, mu = new Array(d).fill(0), sd = new Array(d).fill(0);
  for (const x of X) for (let j = 0; j < d; j++) mu[j] += x[j] / X.length;
  for (const x of X) for (let j = 0; j < d; j++) sd[j] += (x[j] - mu[j]) ** 2 / X.length;
  for (let j = 0; j < d; j++) sd[j] = Math.sqrt(sd[j]) || 1;
  return { mu, sd, apply: (x) => x.map((v, j) => (v - mu[j]) / sd[j]) };
}

// ------------------------------------------------------------------ logistic L2 (IRLS)

function solve(A, b) {
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const v = M[c][c] || 1e-12;
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / v; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map((r, i) => r[n] / (r[i] || 1e-12));
}

const sigmoid = (z) => 1 / (1 + Math.exp(-Math.max(-35, Math.min(35, z))));

/** Hồi quy logistic có chặn, phạt L2 λ trên hệ số (không phạt chặn). X đã chuẩn hoá. */
export function fitLogistic(X, y, { lambda = 1, iters = 25 } = {}) {
  const d = X[0].length + 1;
  let w = new Array(d).fill(0);
  for (let it = 0; it < iters; it++) {
    const H = Array.from({ length: d }, () => new Array(d).fill(0)), g = new Array(d).fill(0);
    for (let i = 0; i < X.length; i++) {
      const xi = [1, ...X[i]];
      let z = 0; for (let j = 0; j < d; j++) z += w[j] * xi[j];
      const p = sigmoid(z), s = Math.max(p * (1 - p), 1e-6);
      for (let j = 0; j < d; j++) { g[j] += (p - y[i]) * xi[j]; for (let k = 0; k < d; k++) H[j][k] += s * xi[j] * xi[k]; }
    }
    for (let j = 1; j < d; j++) { g[j] += lambda * w[j]; H[j][j] += lambda; }
    const step = solve(H, g);
    let mx = 0; w = w.map((v, j) => { mx = Math.max(mx, Math.abs(step[j])); return v - step[j]; });
    if (mx < 1e-7) break;
  }
  return { w, predict: (x) => { let z = w[0]; for (let j = 1; j < w.length; j++) z += w[j] * x[j - 1]; return sigmoid(z); } };
}

/** Hồi quy isotonic (Pool-Adjacent-Violators) -> hàm bậc thang tăng dần. */
export function fitIsotonic(p, y) {
  const idx = p.map((v, i) => i).sort((a, b) => p[a] - p[b]);
  const blocks = [];
  for (const i of idx) {
    blocks.push({ lo: p[i], hi: p[i], s: y[i], n: 1 });
    while (blocks.length > 1 && blocks[blocks.length - 2].s / blocks[blocks.length - 2].n >= blocks[blocks.length - 1].s / blocks[blocks.length - 1].n) {
      const b = blocks.pop(), a = blocks[blocks.length - 1];
      a.hi = b.hi; a.s += b.s; a.n += b.n;
    }
  }
  const steps = { xs: blocks.map((b) => b.hi), vs: blocks.map((b) => b.s / b.n) };
  const f = (x) => applyIsotonic(steps, x);
  f.steps = steps;
  return f;
}

/** Áp hàm bậc thang isotonic đã lưu ({ xs, vs }: cận phải từng khối + giá trị). */
export function applyIsotonic({ xs, vs }, x) {
  if (!xs.length) return 0.5;
  if (x <= xs[0]) return vs[0];
  let lo = 0, hi = xs.length - 1;
  if (x >= xs[hi]) return vs[hi];
  while (lo < hi) { const m = (lo + hi) >> 1; if (xs[m] < x) lo = m + 1; else hi = m; }
  return vs[lo];
}

export const logisticAt = (w, z) => { let s = w[0]; for (let j = 1; j < w.length; j++) s += w[j] * z[j - 1]; return 1 / (1 + Math.exp(-Math.max(-35, Math.min(35, s)))); };
export const linearAt = (w, z) => { let s = w[0]; for (let j = 1; j < w.length; j++) s += w[j] * z[j - 1]; return s; };

export function auc(p, y) {
  const pos = [], neg = [];
  p.forEach((v, i) => (y[i] ? pos : neg).push(v));
  if (!pos.length || !neg.length) return null;
  const all = p.map((v, i) => [v, y[i]]).sort((a, b) => a[0] - b[0]);
  let rank = 0, sumPos = 0;
  for (let i = 0; i < all.length;) {
    let j = i; while (j < all.length && all[j][0] === all[i][0]) j++;
    const r = (i + j + 1) / 2;
    for (let k = i; k < j; k++) if (all[k][1]) sumPos += r;
    rank = j; i = j;
  }
  return (sumPos - (pos.length * (pos.length + 1)) / 2) / (pos.length * neg.length);
}

export const brier = (p, y) => p.reduce((s, v, i) => s + (v - y[i]) ** 2, 0) / p.length;

/** Expected Calibration Error, 10 bin đều. */
export function ece(p, y, bins = 10) {
  const acc = Array.from({ length: bins }, () => [0, 0, 0]);
  p.forEach((v, i) => { const b = Math.min(bins - 1, Math.floor(v * bins)); acc[b][0] += v; acc[b][1] += y[i]; acc[b][2]++; });
  return acc.reduce((s, [sp, sy, n]) => s + (n ? (n / p.length) * Math.abs(sp / n - sy / n) : 0), 0);
}

/** KTC bootstrap 95% của AUC (lấy mẫu lại theo cụm ngày). */
export function aucCi(p, y, dates, { iters = 500, seed = 7 } = {}) {
  const by = new Map(); dates.forEach((d, i) => { if (!by.has(d)) by.set(d, []); by.get(d).push(i); });
  const cl = [...by.values()], r = rng(seed), vals = [];
  for (let k = 0; k < iters; k++) {
    const pp = [], yy = [];
    for (let c = 0; c < cl.length; c++) for (const i of cl[Math.floor(r() * cl.length)]) { pp.push(p[i]); yy.push(y[i]); }
    const a = auc(pp, yy); if (a != null) vals.push(a);
  }
  vals.sort((a, b) => a - b);
  return vals.length ? [vals[Math.floor(0.025 * vals.length)], vals[Math.floor(0.975 * vals.length)]] : null;
}

// ------------------------------------------------------------------ purged k-fold

/**
 * Chia k fold liên tiếp theo thời gian (chỉ số ngày giao dịch `ti`, nhãn kéo dài tới `te`).
 * Huấn luyện bỏ mẫu có [ti, te] giao [đầu fold − purge, cuối fold + embargo].
 */
export function purgedFolds(ti, te, k = 5, { embargo = 10 } = {}) {
  const order = ti.map((v, i) => i).sort((a, b) => ti[a] - ti[b]);
  const size = Math.ceil(order.length / k), folds = [];
  for (let f = 0; f < k; f++) {
    const test = order.slice(f * size, (f + 1) * size);
    if (!test.length) continue;
    const lo = ti[test[0]], hi = Math.max(...test.map((i) => te[i]));
    const testSet = new Set(test);
    const train = order.filter((i) => !testSet.has(i) && (te[i] < lo || ti[i] > hi + embargo));
    folds.push({ train, test });
  }
  return folds;
}

// ------------------------------------------------------------------ hồi quy phân vị + CQR + ACI

/** Hồi quy phân vị tuyến tính (pinball loss), Adam. X đã chuẩn hoá. */
export function fitQuantile(X, y, tau, { epochs = 60, lr = 0.02, lambda = 1e-3, seed = 3 } = {}) {
  const d = X[0].length + 1, w = new Array(d).fill(0);
  const sorted = [...y].sort((a, b) => a - b); w[0] = sorted[Math.floor(tau * (sorted.length - 1))];
  const m = new Array(d).fill(0), v = new Array(d).fill(0), r = rng(seed), idx = X.map((_, i) => i);
  let step = 0;
  const B = 256;
  for (let ep = 0; ep < epochs; ep++) {
    for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    for (let s = 0; s < idx.length; s += B) {
      const g = new Array(d).fill(0), end = Math.min(idx.length, s + B);
      for (let q = s; q < end; q++) {
        const i = idx[q]; let z = w[0]; for (let j = 1; j < d; j++) z += w[j] * X[i][j - 1];
        const gr = y[i] > z ? -tau : 1 - tau;
        g[0] += gr; for (let j = 1; j < d; j++) g[j] += gr * X[i][j - 1];
      }
      step++;
      for (let j = 0; j < d; j++) {
        const gj = g[j] / (end - s) + (j ? lambda * w[j] : 0);
        m[j] = 0.9 * m[j] + 0.1 * gj; v[j] = 0.999 * v[j] + 0.001 * gj * gj;
        w[j] -= (lr * (m[j] / (1 - 0.9 ** step))) / (Math.sqrt(v[j] / (1 - 0.999 ** step)) + 1e-8);
      }
    }
  }
  return { w, predict: (x) => { let z = w[0]; for (let j = 1; j < w.length; j++) z += w[j] * x[j - 1]; return z; } };
}

/** Lượng hiệu chỉnh CQR cho khoảng (1−α): phân vị ⌈(n+1)(1−α)⌉/n của điểm không phù hợp max(lo − y, y − hi). */
export function cqrOffset(lo, hi, y, alpha = 0.2) {
  const s = y.map((v, i) => Math.max(lo[i] - v, v - hi[i])).sort((a, b) => a - b);
  const k = Math.min(s.length - 1, Math.ceil((s.length + 1) * (1 - alpha)) - 1);
  return s[Math.max(0, k)];
}

/** Adaptive Conformal Inference: α_{t+1} = α_t + γ(α − 1{y ∉ khoảng}). Trả α mới. */
export const aciStep = (alphaT, alphaTarget, miss, gamma = 0.005) => Math.min(0.99, Math.max(0.001, alphaT + gamma * (alphaTarget - (miss ? 1 : 0))));

// ------------------------------------------------------------------ HMM Gauss (đường chéo)

const LOG2PI = Math.log(2 * Math.PI);
function logN(x, mu, va) { let s = 0; for (let j = 0; j < x.length; j++) s += -0.5 * (LOG2PI + Math.log(va[j]) + (x[j] - mu[j]) ** 2 / va[j]); return s; }
function lse(a) { const m = Math.max(...a); return m === -Infinity ? m : m + Math.log(a.reduce((s, v) => s + Math.exp(v - m), 0)); }

/** Baum–Welch trên nhiều chuỗi (mỗi chuỗi = mảng vectơ đặc trưng đã chuẩn hoá). Khởi tạo theo phân vị đặc trưng 0. */
export function fitHmm(seqs, K = 4, { iters = 30, seed = 5 } = {}) {
  const d = seqs[0][0].length, all = seqs.flat();
  const r = rng(seed);
  const sorted = [...all].sort((a, b) => a[0] - b[0]);
  let mu = Array.from({ length: K }, (_, k) => [...sorted[Math.floor(((k + 0.5) / K) * (sorted.length - 1))]].map((v) => v + (r() - 0.5) * 0.1));
  let va = Array.from({ length: K }, () => new Array(d).fill(1));
  let pi = new Array(K).fill(1 / K);
  let A = Array.from({ length: K }, (_, i) => Array.from({ length: K }, (_, j) => (i === j ? 0.9 : 0.1 / (K - 1))));
  let ll = -Infinity;
  for (let it = 0; it < iters; it++) {
    const piAcc = new Array(K).fill(0), Aacc = Array.from({ length: K }, () => new Array(K).fill(1e-6));
    const gS = new Array(K).fill(1e-9), muS = Array.from({ length: K }, () => new Array(d).fill(0)), sqS = Array.from({ length: K }, () => new Array(d).fill(0));
    let total = 0;
    const lA = A.map((row) => row.map(Math.log)), lpi = pi.map(Math.log);
    for (const x of seqs) {
      const T = x.length, lb = x.map((xt) => mu.map((m, k) => logN(xt, m, va[k])));
      const la = Array.from({ length: T }, () => new Array(K)), lbe = Array.from({ length: T }, () => new Array(K).fill(0));
      for (let k = 0; k < K; k++) la[0][k] = lpi[k] + lb[0][k];
      for (let t = 1; t < T; t++) for (let k = 0; k < K; k++) la[t][k] = lb[t][k] + lse(la[t - 1].map((v, i) => v + lA[i][k]));
      for (let t = T - 2; t >= 0; t--) for (let i = 0; i < K; i++) lbe[t][i] = lse(lbe[t + 1].map((v, k) => lA[i][k] + lb[t + 1][k] + v));
      const L = lse(la[T - 1]); total += L;
      for (let t = 0; t < T; t++) {
        const g = la[t].map((v, k) => Math.exp(v + lbe[t][k] - L));
        for (let k = 0; k < K; k++) {
          if (t === 0) piAcc[k] += g[k];
          gS[k] += g[k];
          for (let j = 0; j < d; j++) { muS[k][j] += g[k] * x[t][j]; sqS[k][j] += g[k] * x[t][j] * x[t][j]; }
        }
        if (t < T - 1) for (let i = 0; i < K; i++) for (let k = 0; k < K; k++) Aacc[i][k] += Math.exp(la[t][i] + lA[i][k] + lb[t + 1][k] + lbe[t + 1][k] - L);
      }
    }
    pi = piAcc.map((v) => v / seqs.length);
    A = Aacc.map((row) => { const s = row.reduce((a, b) => a + b, 0); return row.map((v) => v / s); });
    mu = muS.map((m, k) => m.map((v) => v / gS[k]));
    va = sqS.map((s, k) => s.map((v, j) => Math.max(1e-3, v / gS[k] - mu[k][j] ** 2)));
    if (total - ll < 1e-4 * Math.abs(total)) { ll = total; break; }
    ll = total;
  }
  return { K, pi, A, mu, va, ll };
}

/** Lọc tiến (chỉ dùng x[0..t]): xác suất trạng thái ẩn tại từng t. */
export function hmmFilter(model, x) {
  const { K, pi, A, mu, va } = model, out = [];
  let prev = null;
  for (let t = 0; t < x.length; t++) {
    const lik = mu.map((m, k) => logN(x[t], m, va[k]));
    const prior = prev ? Array.from({ length: K }, (_, k) => prev.reduce((s, p, i) => s + p * A[i][k], 0)) : pi;
    const lw = lik.map((l, k) => Math.log(Math.max(prior[k], 1e-300)) + l);
    const z = lse(lw);
    prev = lw.map((v) => Math.exp(v - z));
    out.push(prev);
  }
  return out;
}
