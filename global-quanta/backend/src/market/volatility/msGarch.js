// MS-GARCH 2 chế độ (Gray 1996) trên Gateway: bộ lọc Hamilton, ước lượng Nelder-Mead, mô phỏng Monte Carlo. Hàm thuần, xác định theo seed.
// Khác bản Project A: báo hội tụ thật, xếp chế độ theo phương sai dài hạn, mô phỏng có seed, phần dư đúng định nghĩa, phương sai bám theo đường mô phỏng.
const sigmoid = (x) => 1 / (1 + Math.exp(-x));
const logit = (p) => Math.log(p / (1 - p));

export function nelderMead(f, initial, { maxIterations = 2000, tolerance = 1e-8 } = {}) {
  const n = initial.length;
  let simplex = [initial.slice()];
  for (let i = 0; i < n; i++) { const p = initial.slice(); p[i] += p[i] !== 0 ? p[i] * 0.05 : 0.1; simplex.push(p); }
  let values = simplex.map(f), iterations = 0, converged = false;
  for (; iterations < maxIterations; iterations++) {
    const order = values.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
    simplex = order.map(([, i]) => simplex[i]);
    values = order.map(([v]) => v);
    if (Math.abs(values[n] - values[0]) < tolerance) { converged = true; break; }
    const c = new Array(n).fill(0);
    for (let i = 0; i < n; i++) for (let d = 0; d < n; d++) c[d] += simplex[i][d] / n;
    const worst = simplex[n];
    const refl = c.map((x, d) => x + (x - worst[d])), fr = f(refl);
    if (fr < values[0]) {
      const exp = c.map((x, d) => x + 2 * (refl[d] - x)), fe = f(exp);
      if (fe < fr) { simplex[n] = exp; values[n] = fe; } else { simplex[n] = refl; values[n] = fr; }
    } else if (fr < values[n - 1]) { simplex[n] = refl; values[n] = fr; } else {
      const con = c.map((x, d) => x + 0.5 * (worst[d] - x)), fc = f(con);
      if (fc < values[n]) { simplex[n] = con; values[n] = fc; } else {
        for (let i = 1; i <= n; i++) { simplex[i] = simplex[i].map((v, d) => simplex[0][d] + 0.5 * (v - simplex[0][d])); values[i] = f(simplex[i]); }
      }
    }
  }
  const best = values.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0])[0];
  return { x: simplex[best[1]], fx: best[0], iterations, converged };
}

const pdf = (x, mean, v) => (v <= 0 ? 0 : Math.exp(-((x - mean) ** 2) / (2 * v)) / Math.sqrt(2 * Math.PI * v));

export function hamiltonFilter(returns, { mu, regimes, p11, p22 }) {
  const T = returns.length, mean = returns.reduce((s, r) => s + r, 0) / T;
  const uncond = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / T;
  const denom = 2 - p11 - p22;
  let xi1 = denom > 0 ? Math.max(0, Math.min(1, (1 - p22) / denom)) : 0.5, xi2 = 1 - xi1;
  let hAgg = uncond, eps2 = uncond, ll = 0, h1 = uncond, h2 = uncond;
  for (let t = 0; t < T; t++) {
    const pred1 = xi1 * p11 + xi2 * (1 - p22), pred2 = xi1 * (1 - p11) + xi2 * p22;
    h1 = regimes[0].omega + regimes[0].alpha * eps2 + regimes[0].beta * hAgg;
    h2 = regimes[1].omega + regimes[1].alpha * eps2 + regimes[1].beta * hAgg;
    const j1 = pred1 * pdf(returns[t], mu, h1), j2 = pred2 * pdf(returns[t], mu, h2), m = j1 + j2;
    xi1 = m > 0 ? j1 / m : pred1; xi2 = m > 0 ? j2 / m : pred2;
    ll += m > 0 ? Math.log(m) : -1e10;
    hAgg = xi1 * h1 + xi2 * h2;
    eps2 = (returns[t] - mu) ** 2;
  }
  return { logLikelihood: ll, prob: [xi1, xi2], hAgg, eps2 };
}

function fromX(x) {
  const a1 = sigmoid(x[2]) * 0.3, a2 = sigmoid(x[5]) * 0.3;
  return { mu: x[0], regimes: [{ omega: Math.exp(x[1]), alpha: a1, beta: sigmoid(x[3]) * (0.98 - a1) }, { omega: Math.exp(x[4]), alpha: a2, beta: sigmoid(x[6]) * (0.98 - a2) }], p11: sigmoid(x[7]), p22: sigmoid(x[8]) };
}
/** Phương sai dài hạn của một chế độ: dùng để gọi tên yên tĩnh / biến động. */
export const longRunVar = (r) => r.omega / Math.max(1e-6, 1 - r.alpha - r.beta);

export function estimate(returns) {
  if (returns.length < 60) return null;
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const v = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length;
  if (!(v > 0)) return null;
  const x0 = [mean, Math.log(v * 0.3), logit(0.08 / 0.3), logit(0.85 / 0.9), Math.log(v * 2), logit(0.1 / 0.3), logit(0.8 / 0.88), logit(0.95), logit(0.9)];
  const sol = nelderMead((x) => { const ll = hamiltonFilter(returns, fromX(x)).logLikelihood; return Number.isFinite(ll) ? -ll : 1e12; }, x0);
  const params = fromX(sol.x);
  const warnings = [];
  const [r1, r2] = params.regimes;
  if (!sol.converged) warnings.push("Bộ tối ưu dừng ở giới hạn vòng lặp, chưa hội tụ.");
  if (r1.alpha + r1.beta > 0.97 || r2.alpha + r2.beta > 0.97) warnings.push("Tham số gần ngưỡng ổn định.");
  if (r1.alpha > 0.28 || r2.alpha > 0.28) warnings.push("Hệ số alpha gần giới hạn.");
  if (r1.omega < v * 0.01 || r2.omega < v * 0.01) warnings.push("Một chế độ có omega gần bằng 0.");
  if (params.p11 > 0.995 || params.p11 < 0.5 || params.p22 > 0.995 || params.p22 < 0.5) warnings.push("Xác suất duy trì chế độ ở mức cực đoan.");
  const l1 = longRunVar(r1), l2 = longRunVar(r2);
  if (Math.abs(l1 - l2) / Math.max(l1, l2) < 0.15) warnings.push("Hai chế độ có phương sai gần nhau, mô hình khó phân biệt.");
  return { params, logLikelihood: -sol.fx, converged: sol.converged, iterations: sol.iterations, warnings };
}

export function seedOf(text) { let h = 2166136261; for (const c of String(text)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** Mô phỏng tỷ lệ giá so với hiện tại, mỗi ngày trả P10/P50/P90. Dùng mảng phẳng để không tạo hàng nghìn mảng con. */
export function simulate({ params, prob, hAgg, eps2, horizon = 20, nSims = 2000, seed = 1 }) {
  const r = rng(seed), paths = new Float64Array(nSims * horizon);
  for (let s = 0; s < nSims; s++) {
    let regime = r() < prob[0] ? 0 : 1, h = hAgg, e2 = eps2, logRatio = 0;
    for (let d = 0; d < horizon; d++) {
      regime = r() < (regime === 0 ? params.p11 : 1 - params.p22) ? 0 : 1;
      const g = params.regimes[regime];
      h = g.omega + g.alpha * e2 + g.beta * h;
      const z = Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
      const eps = Math.sqrt(Math.max(0, h)) * z;
      logRatio += eps / 100; // Không drift: đây là dải rủi ro, không dự báo chiều giá.
      paths[s * horizon + d] = Math.exp(logRatio);
      e2 = eps * eps;
    }
  }
  const out = [], col = new Float64Array(nSims);
  for (let d = 0; d < horizon; d++) {
    for (let s = 0; s < nSims; s++) col[s] = paths[s * horizon + d];
    col.sort();
    out.push({ day: d + 1, p10: col[Math.floor(nSims * 0.1)], p50: col[Math.floor(nSims * 0.5)], p90: col[Math.floor(nSims * 0.9)] });
  }
  return out;
}

const Z90 = 1.2815515655;
/** Mô hình so sánh: biến động lịch sử 250 phiên, không drift. */
export function historicalBands(returns, horizon = 20) {
  const w = returns.slice(-250), m = w.reduce((s, x) => s + x, 0) / w.length;
  const sd = Math.sqrt(w.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, w.length - 1)) / 100;
  return Array.from({ length: horizon }, (_, i) => { const q = sd * Math.sqrt(i + 1); return { day: i + 1, p10: Math.exp(-Z90 * q), p50: 1, p90: Math.exp(Z90 * q) }; });
}

export const logReturns = (closes) => { const out = []; for (let i = 1; i < closes.length; i++) if (closes[i] > 0 && closes[i - 1] > 0) out.push(Math.log(closes[i] / closes[i - 1]) * 100); return out; };

/** Toàn bộ phép tính cho một chuỗi giá đóng cửa đã điều chỉnh. */
export function analyze(closes, { horizon = 20, nSims = 2000, seed = 1 } = {}) {
  const returns = logReturns(closes);
  const est = estimate(returns);
  if (!est) return null;
  const f = hamiltonFilter(returns, est.params);
  const calmIdx = longRunVar(est.params.regimes[0]) <= longRunVar(est.params.regimes[1]) ? 0 : 1;
  const probCalm = f.prob[calmIdx], probVolatile = f.prob[1 - calmIdx];
  return {
    regime: { label: probCalm >= probVolatile ? "calm" : "volatile", probCalm, probVolatile },
    volAnnualPct: Math.sqrt(f.hAgg * 252), converged: est.converged, iterations: est.iterations, warnings: est.warnings,
    bands: simulate({ params: est.params, prob: f.prob, hAgg: f.hAgg, eps2: f.eps2, horizon, nSims, seed }),
    baseline: historicalBands(returns, horizon),
  };
}
