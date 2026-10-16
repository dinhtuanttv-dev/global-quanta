// FILE SINH TỰ ĐỘNG — KHÔNG SỬA TAY. Nguồn: src/macro-center/src (gateway.ts). Tạo lại: npm run bundle:macro

// src/macro-center/src/quant-macro.ts
var isFiniteNum = (v) => typeof v === "number" && Number.isFinite(v);
function mean(a) {
  let s = 0;
  for (const v of a) s += v;
  return s / a.length;
}
function variance(a, ddof = 1) {
  const m = mean(a);
  let s = 0;
  for (const v of a) s += (v - m) * (v - m);
  return s / (a.length - ddof);
}
var std = (a, ddof = 1) => Math.sqrt(variance(a, ddof));
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = a + 1831565813 >>> 0;
    let t = a;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function randn(rng) {
  let u = 0;
  while (u === 0) u = rng();
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
var LANCZOS = [
  0.9999999999998099,
  676.5203681218851,
  -1259.1392167224028,
  771.3234287776531,
  -176.6150291621406,
  12.507343278686905,
  -0.13857109526572012,
  9984369578019572e-21,
  15056327351493116e-23
];
function lgamma(x) {
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
  const xm = x - 1;
  let a = LANCZOS[0];
  const t = xm + 7.5;
  for (let i = 1; i < 9; i++) a += LANCZOS[i] / (xm + i);
  return 0.5 * Math.log(2 * Math.PI) + (xm + 0.5) * Math.log(t) - t + Math.log(a);
}
function betacf(a, b, x) {
  const MAXIT = 400;
  const EPS = 3e-16;
  const FPMIN = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - qab * x / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
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
function betaInc(a, b, x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) return bt * betacf(a, b, x) / a;
  return 1 - bt * betacf(b, a, 1 - x) / b;
}
function erfc(x) {
  if (x < 0) return 2 - erfc(-x);
  if (x < 2.5) {
    let sum = x;
    let term = x;
    for (let n = 1; n < 200; n++) {
      term *= -x * x / n;
      const add = term / (2 * n + 1);
      sum += add;
      if (Math.abs(add) < 1e-17) break;
    }
    return 1 - 2 / Math.sqrt(Math.PI) * sum;
  }
  let f = x;
  for (let k = 80; k >= 1; k--) f = x + k / 2 / f;
  return Math.exp(-x * x) / (Math.sqrt(Math.PI) * f);
}
var normCdf = (x) => 0.5 * erfc(-x / Math.SQRT2);
function studentTCdf(t, df) {
  const p = 0.5 * betaInc(df / 2, 0.5, df / (df + t * t));
  return t > 0 ? 1 - p : p;
}
var studentTTwoSidedP = (t, df) => Number.isFinite(t) ? betaInc(df / 2, 0.5, df / (df + t * t)) : 0;
var fSurvival = (f, d1, d2) => f <= 0 ? 1 : betaInc(d2 / 2, d1 / 2, d2 / (d2 + d1 * f));
var zeros = (r, c) => Array.from({ length: r }, () => new Array(c).fill(0));
function matMul(A, B) {
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
function olsFit(X, y, opts = {}) {
  const n = X.length;
  const k = X[0].length;
  if (n <= k) throw new Error(`olsFit: need n > k (n=${n}, k=${k})`);
  const A = X.map((row2, i) => [...row2, y[i]]);
  for (let j = 0; j < k; j++) {
    let norm = 0;
    for (let i = j; i < n; i++) norm += A[i][j] * A[i][j];
    norm = Math.sqrt(norm);
    if (norm === 0) continue;
    const alpha = A[j][j] > 0 ? -norm : norm;
    const v = new Array(n - j);
    v[0] = A[j][j] - alpha;
    for (let i = 1; i < n - j; i++) v[i] = A[j + i][j];
    let vn2 = 0;
    for (const e of v) vn2 += e * e;
    if (vn2 === 0) continue;
    for (let c = j; c <= k; c++) {
      let dot = 0;
      for (let i = 0; i < n - j; i++) dot += v[i] * A[j + i][c];
      const f = 2 * dot / vn2;
      for (let i = 0; i < n - j; i++) A[j + i][c] -= f * v[i];
    }
  }
  let maxDiag = 0;
  for (let j = 0; j < k; j++) maxDiag = Math.max(maxDiag, Math.abs(A[j][j]));
  for (let j = 0; j < k; j++)
    if (Math.abs(A[j][j]) <= 1e-10 * maxDiag) throw new Error("olsFit: singular / collinear design matrix");
  const Rinv = zeros(k, k);
  for (let j = 0; j < k; j++) {
    Rinv[j][j] = 1 / A[j][j];
    for (let i = j - 1; i >= 0; i--) {
      let s = 0;
      for (let l = i + 1; l <= j; l++) s += A[i][l] * Rinv[l][j];
      Rinv[i][j] = -s / A[i][i];
    }
  }
  const beta = new Array(k).fill(0);
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
  const fitted = new Array(n);
  const residuals = new Array(n);
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
  const adjR2 = 1 - (1 - r2) * (n - 1) / df;
  let dnum = 0;
  for (let i = 1; i < n; i++) dnum += (residuals[i] - residuals[i - 1]) ** 2;
  return {
    n,
    k,
    beta,
    residuals,
    fitted,
    rss,
    sigma2,
    se,
    t,
    p,
    seHac,
    tHac,
    pHac,
    hacLag,
    cov,
    covHac,
    r2,
    adjR2,
    aic: n * Math.log(rss / n) + 2 * k,
    bic: n * Math.log(rss / n) + k * Math.log(n),
    dw: rss > 0 ? dnum / rss : 2
  };
}
function neweyWest(X, e, xtxInv, L) {
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
function linearCombination(res, c) {
  let est = 0;
  for (let i = 0; i < c.length; i++) est += c[i] * res.beta[i];
  let v = 0;
  for (let i = 0; i < c.length; i++) for (let j = 0; j < c.length; j++) v += c[i] * c[j] * res.covHac[i][j];
  const se = Math.sqrt(Math.max(v, 0));
  const t = est / se;
  return { est, se, t, p: studentTTwoSidedP(t, res.n - res.k) };
}
function adjustPValues(p, method = "by") {
  const m = p.length;
  const clean = p.map((v) => Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1);
  const order = clean.map((_, i) => i).sort((a, b) => clean[a] - clean[b]);
  const out = new Array(m).fill(1);
  if (method === "bonferroni") return clean.map((v) => Math.min(1, v * m));
  if (method === "holm") {
    let running2 = 0;
    order.forEach((idx, rank) => {
      running2 = Math.max(running2, clean[idx] * (m - rank));
      out[idx] = Math.min(1, running2);
    });
    return out;
  }
  let cm = 1;
  if (method === "by") {
    cm = 0;
    for (let i = 1; i <= m; i++) cm += 1 / i;
  }
  let running = 1;
  for (let rank = m - 1; rank >= 0; rank--) {
    const idx = order[rank];
    running = Math.min(running, clean[idx] * m * cm / (rank + 1));
    out[idx] = Math.min(1, running);
  }
  return out;
}
var MACK_CV = {
  n: {
    "1": [-2.56574, -2.2358, -3.627, 0],
    "5": [-1.941, -0.2686, -3.365, 31.223],
    "10": [-1.61682, 0.2656, -2.714, 25.364]
  },
  c: {
    "1": [-3.43035, -6.5393, -16.786, -79.433],
    "5": [-2.86154, -2.8903, -4.234, -40.04],
    "10": [-2.56677, -1.5384, -2.809, 0]
  },
  ct: {
    "1": [-3.95877, -9.0531, -28.428, -134.155],
    "5": [-3.41049, -4.3904, -9.036, -45.374],
    "10": [-3.12705, -2.5856, -3.925, -22.38]
  }
};
function adfCriticalValues(det, n) {
  const f = (c) => c[0] + c[1] / n + c[2] / (n * n) + c[3] / (n * n * n);
  return { "1": f(MACK_CV[det]["1"]), "5": f(MACK_CV[det]["5"]), "10": f(MACK_CV[det]["10"]) };
}
var MACK_P = {
  n: { max: Infinity, min: -19.04, star: -1.04, small: [0.6344, 1.2378, 0.032496], large: [0.4797, 0.93557, -0.06999, 0.033066] },
  c: { max: 2.74, min: -18.83, star: -1.61, small: [2.1659, 1.4412, 0.038269], large: [1.7339, 0.93202, -0.12745, -0.010368] },
  ct: { max: 0.7, min: -16.18, star: -2.89, small: [3.2512, 1.6047, 0.049588], large: [2.5261, 0.61654, -0.37956, -0.060285] }
};
function mackinnonP(stat, det) {
  const c = MACK_P[det];
  if (stat > c.max) return 1;
  if (stat < c.min) return 0;
  const coef = stat <= c.star ? c.small : c.large;
  let v = 0;
  for (let i = coef.length - 1; i >= 0; i--) v = v * stat + coef[i];
  return normCdf(v);
}
function adfDesign(y, p, det, start) {
  const X = [];
  const r = [];
  const T = y.length;
  for (let t = start; t < T; t++) {
    const row2 = [y[t - 1]];
    if (det !== "n") row2.push(1);
    if (det === "ct") row2.push(t / T);
    for (let i = 1; i <= p; i++) row2.push(y[t - i] - y[t - i - 1]);
    X.push(row2);
    r.push(y[t] - y[t - 1]);
  }
  return { X, r };
}
function detrend(y, det) {
  if (det === "n") return y.slice();
  const T = y.length;
  if (det === "c") {
    const m = mean(y);
    return y.map((v) => v - m);
  }
  const X = y.map((_, t) => [1, t / T]);
  const res = olsFit(X, y, { hac: false });
  return res.residuals;
}
function adfTest(y, opts = {}) {
  const det = opts.det ?? "c";
  const T = y.length;
  if (T < 25) throw new Error("adfTest: need at least 25 observations");
  const fit = (p2, start) => {
    const { X, r } = adfDesign(y, p2, det, start);
    const res2 = olsFit(X, r, { hac: false });
    return { res: res2, stat: res2.t[0], n: r.length };
  };
  let p;
  if (opts.lag !== void 0) {
    p = opts.lag;
  } else {
    const kMin = det === "n" ? 1 : det === "c" ? 2 : 3;
    const pmaxDefault = Math.min(Math.floor(12 * Math.pow(T / 100, 0.25)), Math.floor((T - 1 - kMin - 12) / 2));
    const pmax = Math.max(0, opts.maxLag ?? pmaxDefault);
    const crit = opts.criterion ?? "bic";
    const ytil = detrend(y, det);
    let best = Infinity;
    p = 0;
    for (let q = 0; q <= pmax; q++) {
      const { res: res2, n: n2 } = fit(q, pmax + 1);
      const s2 = res2.rss / n2;
      const k = res2.k;
      let ic;
      if (crit === "aic") ic = Math.log(s2) + 2 * k / n2;
      else if (crit === "bic") ic = Math.log(s2) + k * Math.log(n2) / n2;
      else {
        let sy = 0;
        for (let t = pmax + 1; t < T; t++) sy += ytil[t - 1] * ytil[t - 1];
        const tau = res2.beta[0] * res2.beta[0] * sy / s2;
        ic = Math.log(s2) + 2 * (tau + q) / n2;
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
    stat,
    pValue: mackinnonP(stat, det),
    usedLag: p,
    nobs: n,
    det,
    gamma: res.beta[0],
    critical,
    rejectUnitRoot5: stat < critical["5"]
  };
}
var KPSS_CV = {
  c: { "10": 0.347, "5": 0.463, "2.5": 0.574, "1": 0.739 },
  ct: { "10": 0.119, "5": 0.146, "2.5": 0.176, "1": 0.216 }
};
function kpssTest(y, opts = {}) {
  const trend = opts.trend ?? "c";
  const T = y.length;
  if (T < 20) throw new Error("kpssTest: need at least 20 observations");
  let e;
  if (trend === "c") {
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
    s2 += 2 * (1 - j / (l + 1)) * g / T;
  }
  let S = 0;
  let sum = 0;
  for (const v of e) {
    S += v;
    sum += S * S;
  }
  const stat = sum / (T * T * s2);
  const cv = KPSS_CV[trend];
  const pts = [
    [cv["10"], 0.1],
    [cv["5"], 0.05],
    [cv["2.5"], 0.025],
    [cv["1"], 0.01]
  ];
  let pValue;
  if (stat <= pts[0][0]) pValue = 0.1;
  else if (stat >= pts[3][0]) pValue = 0.01;
  else {
    pValue = 0.1;
    for (let i = 0; i < 3; i++) {
      const [s0, p0] = pts[i];
      const [s1, p1] = pts[i + 1];
      if (stat >= s0 && stat <= s1) {
        pValue = p0 + (stat - s0) / (s1 - s0) * (p1 - p0);
        break;
      }
    }
  }
  return { stat, pValue, lags: l, trend, critical: cv, rejectStationarity5: stat > cv["5"] };
}
var ZA_CV = {
  intercept: { "1": -5.34, "5": -4.8, "10": -4.58 },
  trend: { "1": -4.93, "5": -4.42, "10": -4.11 },
  both: { "1": -5.57, "5": -5.08, "10": -4.82 }
};
function zivotAndrewsTest(y, opts = {}) {
  const model = opts.model ?? "both";
  const T = y.length;
  if (T < 40) throw new Error("zivotAndrewsTest: need at least 40 observations");
  const p = opts.lag ?? adfTest(y, { det: "ct", criterion: "bic" }).usedLag;
  const trim = opts.trim ?? 0.15;
  const lo = Math.max(p + 2, Math.ceil(trim * T));
  const hi = Math.floor((1 - trim) * T);
  let best = Infinity;
  let bestTb = lo;
  for (let tb = lo; tb <= hi; tb++) {
    const X = [];
    const r = [];
    for (let t = p + 1; t < T; t++) {
      const row2 = [y[t - 1], 1, t / T];
      if (model === "intercept" || model === "both") row2.push(t > tb ? 1 : 0);
      if (model === "trend" || model === "both") row2.push(t > tb ? (t - tb) / T : 0);
      for (let i = 1; i <= p; i++) row2.push(y[t - i] - y[t - i - 1]);
      X.push(row2);
      r.push(y[t] - y[t - 1]);
    }
    let stat;
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
  return { stat: best, breakIndex: bestTb, usedLag: p, critical, rejectUnitRoot5: best < critical["5"] };
}
function diagnoseIntegration(y, opts = {}) {
  const det = opts.trending ? "ct" : "c";
  const adf = adfTest(y, { det });
  const kpss = kpssTest(y, { trend: opts.trending ? "ct" : "c" });
  if (adf.rejectUnitRoot5 && !kpss.rejectStationarity5) return { klass: "I(0)", adf, kpss };
  if (!adf.rejectUnitRoot5 && kpss.rejectStationarity5) return { klass: "I(1)", adf, kpss };
  if (adf.pValue < 0.01 && kpss.rejectStationarity5) {
    const long = kpssTest(y, { trend: opts.trending ? "ct" : "c", lags: Math.ceil(12 * Math.pow(y.length / 100, 0.25)) });
    if (long.pValue > 0.01) return { klass: "I(0)", adf, kpss };
  }
  if (y.length >= 40) {
    const za = zivotAndrewsTest(y, { model: "intercept" });
    if (za.rejectUnitRoot5 && !adf.rejectUnitRoot5) return { klass: "break-stationary", adf, kpss, za };
    return { klass: adf.rejectUnitRoot5 && kpss.rejectStationarity5 ? "ambiguous" : "I(1)", adf, kpss, za };
  }
  return { klass: "ambiguous", adf, kpss };
}
function determineIntegrationOrder(y, opts = {}) {
  const maxD = opts.maxD ?? 2;
  const history = [];
  let cur = y;
  for (let d = 0; d <= maxD; d++) {
    const diag = diagnoseIntegration(cur, { trending: d === 0 ? opts.trending : false });
    history.push(diag);
    if (diag.klass === "I(0)" || diag.klass === "break-stationary") return { order: d, history };
    if (d === maxD) break;
    const next = [];
    for (let i = 1; i < cur.length; i++) next.push(cur[i] - cur[i - 1]);
    cur = next;
  }
  return { order: maxD, history };
}
function applyTransform(v, t) {
  const n = v.length;
  const out = new Array(n).fill(NaN);
  switch (t) {
    case "level":
      return v.slice();
    case "diff":
      for (let i = 1; i < n; i++) out[i] = v[i] - v[i - 1];
      return out;
    case "diff2":
      for (let i = 2; i < n; i++) out[i] = v[i] - 2 * v[i - 1] + v[i - 2];
      return out;
    case "logdiff":
      for (let i = 1; i < n; i++) if (v[i] > 0 && v[i - 1] > 0) out[i] = 100 * (Math.log(v[i]) - Math.log(v[i - 1]));
      return out;
    case "yoy":
      for (let i = 12; i < n; i++) if (v[i] > 0 && v[i - 12] > 0) out[i] = 100 * (Math.log(v[i]) - Math.log(v[i - 12]));
      return out;
  }
}
function recommendTransform(kind, order, values) {
  if (order <= 0) return "level";
  if (order >= 2) return "diff2";
  const positive = !values || values.every((x) => x > 0);
  return (kind === "index" || kind === "level") && positive ? "logdiff" : "diff";
}
function shiftForPublicationLag(values, lag) {
  if (lag <= 0) return values.slice();
  return values.map((_, i) => i - lag >= 0 ? values[i - lag] : NaN);
}
function buildDesign(args) {
  const { y, xs, lag, arLags } = args;
  const T = y.length;
  const start = args.start ?? Math.max(lag, arLags);
  const names = ["const", ...args.names ?? xs.map((_, j) => `x${j}`)];
  for (let i = 1; i <= arLags; i++) names.push(`ar${i}`);
  const X = [];
  const yy = [];
  const rows = [];
  for (let t = start; t < T; t++) {
    if (t - lag < 0) continue;
    const row2 = [1];
    let ok = isFiniteNum(y[t]);
    for (let j = 0; j < xs.length && ok; j++) {
      const v = xs[j][t - lag];
      if (!isFiniteNum(v)) ok = false;
      else row2.push(v);
    }
    for (let i = 1; i <= arLags && ok; i++) {
      const v = y[t - i];
      if (!isFiniteNum(v)) ok = false;
      else row2.push(v);
    }
    if (!ok) continue;
    X.push(row2);
    yy.push(y[t]);
    rows.push(t);
  }
  return { X, y: yy, rows, names };
}
var DEFAULT_IMPACT_OPTIONS = { maxLag: 6, maxArLags: 2, adjust: "by", alpha: 0.05 };
function estimateImpactMatrix(args) {
  const o = { ...DEFAULT_IMPACT_OPTIONS, ...args.options };
  const fNames = Object.keys(args.factors);
  const xs = fNames.map((f) => args.factors[f]);
  const cells = [];
  for (const [tName, y] of Object.entries(args.targets)) {
    for (let lag = 0; lag <= o.maxLag; lag++) {
      let bestP = 0;
      let bestBic = Infinity;
      const common = Math.max(lag, o.maxArLags);
      for (let p = 0; p <= o.maxArLags; p++) {
        const d2 = buildDesign({ y, xs, names: fNames, lag, arLags: p, start: common });
        if (d2.X.length < d2.names.length + 12) continue;
        try {
          const r = olsFit(d2.X, d2.y, { hac: false });
          if (r.bic < bestBic) {
            bestBic = r.bic;
            bestP = p;
          }
        } catch {
        }
      }
      const d = buildDesign({ y, xs, names: fNames, lag, arLags: bestP });
      if (d.X.length < d.names.length + 12) continue;
      let res;
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
          factor: f,
          target: tName,
          lag,
          beta,
          se: res.seHac[1 + j],
          t: res.tHac[1 + j],
          p: res.pHac[1 + j],
          q: 1,
          betaStd: sdY > 0 ? beta * std(col) / sdY : 0,
          nobs: res.n,
          arLags: bestP,
          r2adj: res.adjR2,
          direction: beta > 0 ? "+" : beta < 0 ? "-" : "0",
          significant: false
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
function bestLagCells(cells) {
  const map = /* @__PURE__ */ new Map();
  for (const c of cells) {
    const key = `${c.factor}|${c.target}`;
    const cur = map.get(key);
    if (!cur || c.p < cur.p) map.set(key, c);
  }
  return [...map.values()];
}
function rollingBeta(design, coefIdx, window) {
  const out = { rows: [], beta: [], t: [] };
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
    }
  }
  return out;
}
function summarizeStability(roll, fullSampleBeta) {
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
function stationaryBootstrapCI(X, y, coefIdx, opts = {}) {
  const B = opts.B ?? 999;
  const n = X.length;
  const pNew = 1 / (opts.meanBlock ?? 6);
  const rng = mulberry32(opts.seed ?? 12345);
  const betas = [];
  for (let b = 0; b < B; b++) {
    const idx = [];
    let cur = Math.floor(rng() * n);
    for (let i = 0; i < n; i++) {
      if (i > 0) cur = rng() < pNew ? Math.floor(rng() * n) : (cur + 1) % n;
      idx.push(cur);
    }
    try {
      betas.push(olsFit(idx.map((i) => X[i]), idx.map((i) => y[i]), { hac: false }).beta[coefIdx]);
    } catch {
    }
  }
  betas.sort((a, c) => a - c);
  const lvl = opts.level ?? 0.95;
  const lo = betas[Math.floor((1 - lvl) / 2 * (betas.length - 1))];
  const hi = betas[Math.ceil((1 + lvl) / 2 * (betas.length - 1))];
  return { lo, hi, mean: mean(betas) };
}
function macroScoreSeries(args) {
  const lag = args.lag ?? 1;
  const arLags = args.arLags ?? 1;
  const minTrain = args.minTrain ?? 60;
  const step = args.step ?? 3;
  const names = Object.keys(args.factors);
  const xs = names.map((n) => args.factors[n]);
  const d = buildDesign({ y: args.y, xs, names, lag, arLags });
  const out = [];
  let betas = null;
  let tstats = [];
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
    const contributions = {};
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
function firstFiniteBlock(v) {
  const s = v.findIndex(isFiniteNum);
  if (s < 0) return [];
  const out = [];
  for (let i = s; i < v.length && isFiniteNum(v[i]); i++) out.push(v[i]);
  return out;
}
function prepareStationary(input) {
  const warnings = [];
  const T = input.dates.length;
  for (const s of [...input.factors, ...input.targets])
    if (s.values.length !== T) throw new Error(`analyzeMacro: series ${s.id} has length ${s.values.length}, expected ${T}`);
  const diagnostics = [];
  const out = { factors: {}, targets: {}, transforms: {} };
  const process = (s, role) => {
    const shifted = role === "factors" ? shiftForPublicationLag(s.values, s.pubLagMonths ?? 0) : s.values.slice();
    const clean = firstFiniteBlock(shifted);
    if (clean.length < 40) warnings.push(`${s.id}: only ${clean.length} usable observations; diagnostics skipped (treated as I(1)).`);
    let order = 1;
    let klass = "ambiguous";
    let adfP = NaN;
    let kpssP = NaN;
    let breakIndex;
    const trending = s.kind !== "rate";
    const series = trending && clean.every((v) => v > 0) ? clean.map(Math.log) : clean;
    if (clean.length >= 40) {
      const r = determineIntegrationOrder(series, { trending });
      order = r.order;
      const h = r.history[r.history.length - 1];
      klass = h.klass;
      adfP = h.adf.pValue;
      kpssP = h.kpss.pValue;
      breakIndex = h.za?.breakIndex;
      if (order === 0 && trending && kpssTest(series, { trend: "c" }).rejectStationarity5) {
        order = 1;
        warnings.push(`${s.id}: stationary only around a deterministic trend; differenced to keep the trend out of the regression.`);
      }
      if (klass === "ambiguous") warnings.push(`${s.id}: unit-root tests ambiguous; differenced conservatively.`);
      if (klass === "break-stationary") warnings.push(`${s.id}: looks stationary only around a structural break (index ${breakIndex}); consider regime-specific estimation.`);
    }
    const tr = s.transform && s.transform !== "auto" ? s.transform : recommendTransform(s.kind, order, clean);
    out[role][s.id] = applyTransform(shifted, tr);
    out.transforms[s.id] = tr;
    diagnostics.push({ id: s.id, klass, order, transform: tr, adfP, kpssP, breakIndex });
  };
  input.factors.forEach((s) => process(s, "factors"));
  input.targets.forEach((s) => process(s, "targets"));
  return { diagnostics, factors: out.factors, targets: out.targets, transforms: out.transforms, warnings };
}
function analyzeMacro(input) {
  const o = { ...DEFAULT_IMPACT_OPTIONS, ...input.options };
  const prep = prepareStationary(input);
  const warnings = [...prep.warnings];
  const cells = estimateImpactMatrix({ targets: prep.targets, factors: prep.factors, options: o });
  if (cells.length === 0) warnings.push("No estimable cells: sample too short for the requested lags.");
  const nobs = cells.length ? Math.min(...cells.map((c) => c.nobs)) : 0;
  if (nobs > 0 && nobs < 60) warnings.push(`Only ${nobs} observations: estimates are fragile; read q-values, not point estimates.`);
  const best = bestLagCells(cells);
  const stability = {};
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
      }
    }
  }
  warnings.push(`Multiple testing: ${cells.length} cells corrected with ${o.adjust.toUpperCase()}; best-lag cells inherit that correction. Stability is computed for cells with raw p \u2264 ${maxP}.`);
  return { dates: input.dates, diagnostics: prep.diagnostics, cells, best, stability, warnings };
}

// src/macro-center/src/macro-data.ts
var VN_CATALOG = [
  { id: "CPI", nameVi: "L\u1EA1m ph\xE1t (CPI, so c\xF9ng k\u1EF3)", role: "factor", kind: "rate", unit: "%", source: "GSO", pubLagMonths: 1, typicalReleaseDay: 6, group: "prices" },
  { id: "IR", nameVi: "L\xE3i su\u1EA5t li\xEAn ng\xE2n h\xE0ng 1 th\xE1ng", role: "factor", kind: "rate", unit: "%/n\u0103m", source: "NHNN", pubLagMonths: 0, typicalReleaseDay: 1, group: "money" },
  { id: "M2", nameVi: "Cung ti\u1EC1n M2", role: "factor", kind: "level", unit: "t\u1EF7 VND", source: "NHNN", pubLagMonths: 2, typicalReleaseDay: 15, group: "money" },
  { id: "CREDIT", nameVi: "D\u01B0 n\u1EE3 t\xEDn d\u1EE5ng", role: "factor", kind: "level", unit: "t\u1EF7 VND", source: "NHNN", pubLagMonths: 1, typicalReleaseDay: 10, group: "money" },
  { id: "EX", nameVi: "T\u1EF7 gi\xE1 USD/VND (li\xEAn ng\xE2n h\xE0ng)", role: "factor", kind: "level", unit: "VND", source: "NHNN", pubLagMonths: 0, typicalReleaseDay: 1, group: "external" },
  { id: "FDI", nameVi: "FDI gi\u1EA3i ng\xE2n", role: "factor", kind: "level", unit: "tri\u1EC7u USD", source: "GSO", pubLagMonths: 1, typicalReleaseDay: 6, group: "external" },
  { id: "EXPORT", nameVi: "Kim ng\u1EA1ch xu\u1EA5t kh\u1EA9u", role: "factor", kind: "level", unit: "tri\u1EC7u USD", source: "GSO", pubLagMonths: 1, typicalReleaseDay: 6, group: "external" },
  { id: "IO", nameVi: "Ch\u1EC9 s\u1ED1 s\u1EA3n xu\u1EA5t c\xF4ng nghi\u1EC7p (IIP)", role: "factor", kind: "level", unit: "ch\u1EC9 s\u1ED1", source: "GSO", pubLagMonths: 1, typicalReleaseDay: 6, group: "activity" },
  { id: "PMI", nameVi: "PMI s\u1EA3n xu\u1EA5t", role: "factor", kind: "rate", unit: "\u0111i\u1EC3m", source: "S&P Global", pubLagMonths: 1, typicalReleaseDay: 1, group: "activity" },
  { id: "DXY", nameVi: "Ch\u1EC9 s\u1ED1 USD (DXY)", role: "factor", kind: "level", unit: "\u0111i\u1EC3m", source: "th\u1ECB tr\u01B0\u1EDDng", pubLagMonths: 0, typicalReleaseDay: 1, group: "global" },
  { id: "FED", nameVi: "L\xE3i su\u1EA5t \u0111i\u1EC1u h\xE0nh Fed", role: "factor", kind: "rate", unit: "%/n\u0103m", source: "Fed", pubLagMonths: 0, typicalReleaseDay: 1, group: "global" },
  { id: "OIL", nameVi: "Gi\xE1 d\u1EA7u Brent", role: "factor", kind: "level", unit: "USD/th\xF9ng", source: "th\u1ECB tr\u01B0\u1EDDng", pubLagMonths: 0, typicalReleaseDay: 1, group: "global" },
  { id: "VNINDEX", nameVi: "VN-Index", role: "target", kind: "index", unit: "\u0111i\u1EC3m", source: "HOSE", pubLagMonths: 0, typicalReleaseDay: 1, group: "market", capGroup: "broad" },
  { id: "VN30", nameVi: "VN30", role: "target", kind: "index", unit: "\u0111i\u1EC3m", source: "HOSE", pubLagMonths: 0, typicalReleaseDay: 1, group: "market", capGroup: "large" },
  { id: "VNMIDCAP", nameVi: "VNMidcap", role: "target", kind: "index", unit: "\u0111i\u1EC3m", source: "HOSE", pubLagMonths: 0, typicalReleaseDay: 1, group: "market", capGroup: "mid" },
  { id: "VN100", nameVi: "VN100", role: "target", kind: "index", unit: "\u0111i\u1EC3m", source: "HOSE", pubLagMonths: 0, typicalReleaseDay: 1, group: "market", capGroup: "broad" },
  { id: "VNSMALLCAP", nameVi: "VNSmallcap", role: "target", kind: "index", unit: "\u0111i\u1EC3m", source: "HOSE", pubLagMonths: 0, typicalReleaseDay: 1, group: "market", capGroup: "small" },
  { id: "VNALLSHARE", nameVi: "VNAllshare", role: "target", kind: "index", unit: "\u0111i\u1EC3m", source: "HOSE", pubLagMonths: 0, typicalReleaseDay: 1, group: "market", capGroup: "broad" }
];
var catalogById = (c = VN_CATALOG) => Object.fromEntries(c.map((m) => [m.id, m]));
var isPeriod = (s) => /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
function periodIndex(p) {
  const [y, m] = p.split("-").map(Number);
  return y * 12 + (m - 1);
}
function periodFromIndex(i) {
  const y = Math.floor(i / 12);
  const m = i % 12 + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}
var addMonths = (p, k) => periodFromIndex(periodIndex(p) + k);
function estimateAsOf(period, pubLagMonths, releaseDay = 1) {
  const p = addMonths(period, pubLagMonths + 1);
  return `${p}-${String(Math.min(Math.max(releaseDay, 1), 28)).padStart(2, "0")}`;
}
function normalizePeriod(input) {
  const s = input.trim();
  let m;
  const ok = (y, mo) => mo >= 1 && mo <= 12 && y >= 1900 && y <= 2200 ? `${y}-${String(mo).padStart(2, "0")}` : null;
  if (m = s.match(/^(\d{4})[-/](\d{1,2})(?:[-/]\d{1,2})?$/)) return ok(+m[1], +m[2]);
  if (m = s.match(/^\d{1,2}[/-](\d{1,2})[/-](\d{4})$/)) return ok(+m[2], +m[1]);
  if (m = s.match(/^(\d{1,2})[/-](\d{4})$/)) return ok(+m[2], +m[1]);
  if (m = s.match(/^(?:th[áa]ng|t)\s*(\d{1,2})\s*[/-]\s*(\d{4})$/i)) return ok(+m[2], +m[1]);
  return null;
}
function parseCsv(text, delimiter = ",") {
  const rows = [];
  let row2 = [];
  let cell2 = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') {
        cell2 += '"';
        i++;
      } else if (c === '"') inQ = false;
      else cell2 += c;
    } else if (c === '"') inQ = true;
    else if (c === delimiter) {
      row2.push(cell2);
      cell2 = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row2.push(cell2);
      cell2 = "";
      if (row2.some((x) => x.trim() !== "")) rows.push(row2);
      row2 = [];
    } else cell2 += c;
  }
  row2.push(cell2);
  if (row2.some((x) => x.trim() !== "")) rows.push(row2);
  return rows;
}
function parseNumber(raw, locale = "auto") {
  let s = raw.trim().replace(/[%\s\u00a0]/g, "");
  if (s === "" || /^(-|–|—|\.\.|n\/?a|nan|null)$/i.test(s)) return NaN;
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  const hasDot = s.includes(".");
  const hasComma = s.includes(",");
  let dec = null;
  if (locale === "vi") dec = ",";
  else if (locale === "en") dec = ".";
  else if (hasDot && hasComma) dec = s.lastIndexOf(".") > s.lastIndexOf(",") ? "." : ",";
  else dec = hasComma ? "," : hasDot ? "." : null;
  if (dec === ",") s = s.replace(/\./g, "").replace(",", ".");
  else if (dec === ".") s = s.replace(/,/g, "");
  const v = Number(s);
  if (!Number.isFinite(v)) return NaN;
  return neg ? -v : v;
}
function toMonthly(points, method = "last") {
  const byP = /* @__PURE__ */ new Map();
  for (const pt of points) {
    if (!isFiniteNum(pt.value)) continue;
    const p = normalizePeriod(pt.date);
    if (!p) continue;
    const full = pt.date.trim();
    const cur = byP.get(p);
    if (!cur) byP.set(p, { last: { d: full, v: pt.value }, sum: pt.value, n: 1 });
    else {
      cur.sum += pt.value;
      cur.n++;
      if (isoOrder(full) >= isoOrder(cur.last.d)) cur.last = { d: full, v: pt.value };
    }
  }
  return [...byP.entries()].sort((a, b) => periodIndex(a[0]) - periodIndex(b[0])).map(([period, c]) => ({ period, value: method === "last" ? c.last.v : c.sum / c.n }));
}
function isoOrder(d) {
  const m = d.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return d.padEnd(10, "0");
}
function importSeriesCsv(args) {
  const rows = parseCsv(args.csv, args.delimiter ?? ",");
  const body = args.hasHeader === false ? rows : rows.slice(1);
  const pts = [];
  let rejected = 0;
  for (const r of body) {
    const v = parseNumber(r[1] ?? "", args.locale ?? "auto");
    if (!r[0] || !normalizePeriod(r[0]) || !Number.isFinite(v)) {
      rejected++;
      continue;
    }
    pts.push({ date: r[0], value: v });
  }
  const monthly = toMonthly(pts, args.monthly ?? "last");
  const observations = monthly.map((m) => ({
    seriesId: args.meta.id,
    period: m.period,
    value: m.value,
    asOf: args.asOfOverride ?? estimateAsOf(m.period, args.meta.pubLagMonths, args.meta.typicalReleaseDay)
  }));
  return { observations, rejectedRows: rejected };
}
var InMemoryVintageStore = class {
  data = /* @__PURE__ */ new Map();
  version = 0;
  upsert(obs) {
    for (const o of obs) {
      if (!isPeriod(o.period)) throw new Error(`invalid period ${o.period}`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(o.asOf)) throw new Error(`invalid asOf ${o.asOf}`);
      if (!Number.isFinite(o.value)) continue;
      let s = this.data.get(o.seriesId);
      if (!s) this.data.set(o.seriesId, s = /* @__PURE__ */ new Map());
      const list = s.get(o.period) ?? [];
      const same = list.findIndex((x) => x.asOf === o.asOf);
      if (same >= 0) list[same] = o;
      else list.push(o);
      s.set(o.period, list);
    }
    this.version++;
  }
  getSeries(seriesId, asOf = "9999-12-31") {
    const s = this.data.get(seriesId);
    if (!s) return [];
    const out = [];
    for (const [period, list] of s) {
      let best = null;
      for (const o of list) if (o.asOf <= asOf && (!best || o.asOf > best.asOf)) best = o;
      if (best) out.push({ period, value: best.value });
    }
    return out.sort((a, b) => periodIndex(a.period) - periodIndex(b.period));
  }
  seriesIds() {
    return [...this.data.keys()];
  }
  dataVersion() {
    return `v${this.version}`;
  }
};
function buildDataset(store, ids, asOf = "9999-12-31", range = "intersection") {
  const raw = ids.map((id) => ({ id, pts: store.getSeries(id, asOf) })).filter((r) => r.pts.length > 0);
  if (raw.length === 0) return { dates: [], series: {}, asOf };
  const firsts = raw.map((r) => periodIndex(r.pts[0].period));
  const lasts = raw.map((r) => periodIndex(r.pts[r.pts.length - 1].period));
  const lo = range === "intersection" ? Math.max(...firsts) : Math.min(...firsts);
  const hi = range === "intersection" ? Math.min(...lasts) : Math.max(...lasts);
  if (hi < lo) return { dates: [], series: {}, asOf };
  const dates = [];
  for (let i = lo; i <= hi; i++) dates.push(periodFromIndex(i));
  const series = {};
  for (const r of raw) {
    const m = new Map(r.pts.map((p) => [p.period, p.value]));
    series[r.id] = dates.map((d) => m.get(d) ?? NaN);
  }
  return { dates, series, asOf };
}
function toMacroSeries(ds, catalog, ids, opts = {}) {
  const by = catalogById(catalog);
  return ids.filter((id) => ds.series[id] && by[id]).map((id) => ({
    id,
    name: by[id].nameVi,
    values: ds.series[id],
    kind: by[id].kind,
    pubLagMonths: opts.ignorePubLag ? 0 : by[id].pubLagMonths
  }));
}
function robustZ(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const med = sorted[Math.floor(sorted.length / 2)];
  const dev = values.map((v) => Math.abs(v - med));
  const mad = [...dev].sort((a, b) => a - b)[Math.floor(dev.length / 2)];
  let scale = mad / 0.6745;
  if (scale < 1e-12) scale = 1.2533 * (dev.reduce((s, d) => s + d, 0) / dev.length);
  if (scale < 1e-12) return values.map(() => 0);
  return values.map((v) => (v - med) / scale);
}
function checkQuality(seriesId, pts, meta, nowPeriod) {
  const issues = [];
  if (pts.length < 60) issues.push({ seriesId, code: "too-short", severity: pts.length < 36 ? "error" : "warn", message: `Ch\u1EC9 c\xF3 ${pts.length} quan s\xE1t th\xE1ng; n\xEAn c\xF3 t\u1ED1i thi\u1EC3u 60.` });
  const seen = /* @__PURE__ */ new Set();
  for (const p of pts) {
    if (seen.has(p.period)) issues.push({ seriesId, code: "duplicate-period", severity: "error", message: `Tr\xF9ng k\u1EF3 ${p.period}.`, period: p.period });
    seen.add(p.period);
  }
  for (let i = 1; i < pts.length; i++) {
    const g = periodIndex(pts[i].period) - periodIndex(pts[i - 1].period);
    if (g > 1) issues.push({ seriesId, code: "gap", severity: g > 3 ? "error" : "warn", message: `Thi\u1EBFu ${g - 1} th\xE1ng gi\u1EEFa ${pts[i - 1].period} v\xE0 ${pts[i].period}.`, period: pts[i].period });
  }
  if (pts.length >= 12) {
    const vals = pts.map((p) => p.value);
    const base = meta && meta.kind !== "rate" && vals.every((v) => v > 0) ? vals.map(Math.log) : vals;
    const diffs = base.slice(1).map((v, i) => v - base[i]);
    const stepwise = diffs.filter((d) => Math.abs(d) < 1e-12).length / diffs.length > 0.4;
    const z = stepwise ? diffs.map(() => 0) : robustZ(diffs);
    z.forEach((v, i) => {
      if (Math.abs(v) > 8) issues.push({ seriesId, code: "outlier", severity: "warn", message: `Bi\u1EBFn \u0111\u1ED9ng b\u1EA5t th\u01B0\u1EDDng t\u1EA1i ${pts[i + 1].period} (robust z = ${v.toFixed(1)}); ki\u1EC3m tra l\u1ED7i nh\u1EADp ho\u1EB7c \u0111\u01A1n v\u1ECB.`, period: pts[i + 1].period });
    });
    if (new Set(vals).size <= 2) issues.push({ seriesId, code: "flat", severity: "error", message: "Chu\u1ED7i g\u1EA7n nh\u01B0 kh\xF4ng \u0111\u1ED5i." });
  }
  if (meta && meta.kind !== "rate" && pts.some((p) => p.value <= 0)) issues.push({ seriesId, code: "non-positive", severity: "warn", message: "C\xF3 gi\xE1 tr\u1ECB \u2264 0 trong chu\u1ED7i c\u1EA7n l\u1EA5y log; engine s\u1EBD d\xF9ng sai ph\xE2n th\u01B0\u1EDDng." });
  if (nowPeriod && pts.length) {
    const lag = periodIndex(nowPeriod) - periodIndex(pts[pts.length - 1].period);
    const allowed = (meta?.pubLagMonths ?? 1) + 1;
    if (lag > allowed) issues.push({ seriesId, code: "stale", severity: "warn", message: `D\u1EEF li\u1EC7u m\u1EDBi nh\u1EA5t l\xE0 ${pts[pts.length - 1].period}, \u0111\xE3 ch\u1EADm ${lag - allowed} th\xE1ng so v\u1EDBi l\u1ECBch c\xF4ng b\u1ED1 d\u1EF1 ki\u1EBFn.` });
  }
  return issues;
}

// src/macro-center/src/macro-scenario.ts
function tQuantile(p, df) {
  let lo = 0;
  let hi = 50;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (studentTCdf(mid, df) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
function localProjectionIRF(args) {
  const { y, xs, shock, horizon } = args;
  const p = args.arLags ?? 1;
  const level = args.level ?? 0.9;
  const T = y.length;
  const F = xs.length;
  const out = [];
  for (let h = 0; h <= horizon; h++) {
    const X = [];
    const r = [];
    for (let t = p; t < T - h; t++) {
      const row2 = [1];
      let ok = true;
      for (let j = 0; j < F && ok; j++) {
        if (!isFiniteNum(xs[j][t])) ok = false;
        else row2.push(xs[j][t]);
      }
      for (let i = 1; i <= p && ok; i++) {
        if (!isFiniteNum(y[t - i])) ok = false;
        else row2.push(y[t - i]);
      }
      let cum = 0;
      for (let j = 0; j <= h && ok; j++) {
        if (!isFiniteNum(y[t + j])) ok = false;
        else cum += y[t + j];
      }
      if (!ok) continue;
      X.push(row2);
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
var NAMED_SCENARIOS = [
  { id: "cpi-up", nameVi: "L\u1EA1m ph\xE1t t\u0103ng t\u1ED1c", descriptionVi: "CPI so c\xF9ng k\u1EF3 t\u0103ng th\xEAm 1 \u0111i\u1EC3m ph\u1EA7n tr\u0103m.", shocks: [{ factor: "CPI", amount: 1, unit: "pp" }] },
  { id: "easing", nameVi: "N\u1EDBi l\u1ECFng ti\u1EC1n t\u1EC7", descriptionVi: "M2 t\u0103ng th\xEAm 2%, l\xE3i su\u1EA5t li\xEAn ng\xE2n h\xE0ng gi\u1EA3m 0,5 \u0111i\u1EC3m.", shocks: [{ factor: "M2", amount: 2, unit: "pct" }, { factor: "IR", amount: -0.5, unit: "pp" }] },
  { id: "tightening", nameVi: "Th\u1EAFt ch\u1EB7t ti\u1EC1n t\u1EC7", descriptionVi: "L\xE3i su\u1EA5t li\xEAn ng\xE2n h\xE0ng t\u0103ng 1 \u0111i\u1EC3m, M2 gi\u1EA3m 1%.", shocks: [{ factor: "IR", amount: 1, unit: "pp" }, { factor: "M2", amount: -1, unit: "pct" }] },
  { id: "vnd-weak", nameVi: "VND m\u1EA5t gi\xE1 3%", descriptionVi: "T\u1EF7 gi\xE1 USD/VND t\u0103ng 3% trong m\u1ED9t th\xE1ng.", shocks: [{ factor: "EX", amount: 3, unit: "pct" }] },
  { id: "credit-squeeze", nameVi: "Si\u1EBFt t\xEDn d\u1EE5ng", descriptionVi: "D\u01B0 n\u1EE3 t\xEDn d\u1EE5ng gi\u1EA3m 2%, l\xE3i su\u1EA5t t\u0103ng 0,5 \u0111i\u1EC3m.", shocks: [{ factor: "CREDIT", amount: -2, unit: "pct" }, { factor: "IR", amount: 0.5, unit: "pp" }] },
  { id: "fed-cut", nameVi: "Fed gi\u1EA3m l\xE3i su\u1EA5t", descriptionVi: "L\xE3i su\u1EA5t Fed gi\u1EA3m 0,5 \u0111i\u1EC3m, USD y\u1EBFu \u0111i 1,5%.", shocks: [{ factor: "FED", amount: -0.5, unit: "pp" }, { factor: "DXY", amount: -1.5, unit: "pct" }] }
];
function resolveShocks(shocks, transforms) {
  const vector = {};
  const warnings = [];
  for (const s of shocks) {
    const t = transforms[s.factor];
    if (!t) {
      warnings.push(`B\u1ECF qua c\xFA s\u1ED1c ${s.factor}: bi\u1EBFn n\xE0y kh\xF4ng c\xF3 trong m\xF4 h\xECnh.`);
      continue;
    }
    const compatible = s.unit === "pct" && t === "logdiff" || s.unit === "pp" && t === "diff";
    if (!compatible) {
      warnings.push(`B\u1ECF qua c\xFA s\u1ED1c ${s.factor}: \u0111\u01A1n v\u1ECB '${s.unit}' kh\xF4ng kh\u1EDBp ph\xE9p bi\u1EBFn \u0111\u1ED5i '${t}'.`);
      continue;
    }
    vector[s.factor] = (vector[s.factor] ?? 0) + s.amount;
  }
  return { vector, warnings };
}
function runScenario(args) {
  const horizon = args.horizon ?? 6;
  const { vector, warnings } = resolveShocks(args.shocks, args.transforms);
  const names = Object.keys(args.factors);
  const xs = names.map((n) => args.factors[n]);
  const shock = names.map((n) => vector[n] ?? 0);
  const results = [];
  if (Object.keys(vector).length === 0) warnings.push("Kh\xF4ng c\xF3 c\xFA s\u1ED1c h\u1EE3p l\u1EC7 n\xE0o \u0111\u1EC3 m\xF4 ph\u1ECFng.");
  else
    for (const [target, y] of Object.entries(args.targets)) {
      const irf = localProjectionIRF({ y, xs, shock, horizon, arLags: args.arLags });
      const at = irf.length ? irf[irf.length - 1] : null;
      results.push({ target, irf, atHorizon: at, significant: !!at && (at.lo > 0 || at.hi < 0) });
    }
  const ranking = results.filter((r) => r.atHorizon).map((r) => ({ target: r.target, est: r.atHorizon.est, lo: r.atHorizon.lo, hi: r.atHorizon.hi, significant: r.significant })).sort((a, b) => b.est - a.est);
  return { results, ranking, warnings, horizon };
}
function expandingZ(x, minObs = 24) {
  const out = new Array(x.length).fill(NaN);
  const seen = [];
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
function generateAlerts(args) {
  const alerts = [];
  const zWarn = args.zWarn ?? 1.5;
  const zHigh = args.zHigh ?? 2.5;
  for (const [f, z] of Object.entries(args.factorZ)) {
    if (!isFiniteNum(z) || Math.abs(z) < zWarn) continue;
    const name = args.factorNamesVi?.[f] ?? f;
    alerts.push({
      id: `z:${f}`,
      kind: "factor-extreme",
      level: Math.abs(z) >= zHigh ? "high" : "warn",
      messageVi: `${name} \u0111ang ${z > 0 ? "cao" : "th\u1EA5p"} b\u1EA5t th\u01B0\u1EDDng: l\u1EC7ch ${z > 0 ? "+" : ""}${z.toFixed(1)} \u0111\u1ED9 l\u1EC7ch chu\u1EA9n so v\u1EDBi l\u1ECBch s\u1EED.`
    });
  }
  if (args.regime) {
    const arg = (v) => v.indexOf(Math.max(...v));
    const a = arg(args.regime.previous);
    const b = arg(args.regime.current);
    if (a !== b && Math.max(...args.regime.current) >= 0.6)
      alerts.push({
        id: "regime",
        kind: "regime-change",
        level: "high",
        messageVi: `Ch\u1EBF \u0111\u1ED9 v\u0129 m\xF4 chuy\u1EC3n t\u1EEB "${args.regime.labels[a]}" sang "${args.regime.labels[b]}" (x\xE1c su\u1EA5t ${(Math.max(...args.regime.current) * 100).toFixed(0)}%). \u0110\u1ED9 nh\u1EA1y l\u1ECBch s\u1EED c\xF3 th\u1EC3 kh\xF4ng c\xF2n \u0111\xFAng.`
      });
  }
  if (args.stability && args.best)
    for (const c of args.best) {
      const st = args.stability[`${c.factor}|${c.target}`];
      if (c.significant && st && st.windows > 0 && !st.stable)
        alerts.push({
          id: `unstable:${c.factor}|${c.target}`,
          kind: "unstable-effect",
          level: "warn",
          messageVi: `T\xE1c \u0111\u1ED9ng c\u1EE7a ${c.factor} l\xEAn ${c.target} c\xF3 \xFD ngh\u0129a th\u1ED1ng k\xEA nh\u01B0ng kh\xF4ng \u1ED5n \u0111\u1ECBnh (c\xF9ng d\u1EA5u ${(st.shareSameSign * 100).toFixed(0)}% s\u1ED1 c\u1EEDa s\u1ED5, \u0111\u1ED5i d\u1EA5u ${st.signFlips} l\u1EA7n).`
        });
    }
  const rank = { high: 0, warn: 1, info: 2 };
  return alerts.sort((x, y) => rank[x.level] - rank[y.level]);
}
var daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
function upcomingReleases(catalog, latestPeriod, today) {
  const out = [];
  for (const m of catalog) {
    if (m.role !== "factor" || !latestPeriod[m.id]) continue;
    const next = addMonths(latestPeriod[m.id], 1);
    const date = estimateAsOf(next, m.pubLagMonths, m.typicalReleaseDay);
    const d = daysBetween(today, date);
    out.push({ seriesId: m.id, nameVi: m.nameVi, period: next, expectedDate: date, estimated: true, status: d < 0 ? "overdue" : "upcoming", daysUntil: d });
  }
  return out.sort((a, b) => a.expectedDate.localeCompare(b.expectedDate) || periodIndex(a.period) - periodIndex(b.period));
}
var BANDS = [
  [-0.5, "strong-negative", "B\u1EA5t l\u1EE3i m\u1EA1nh"],
  [-0.15, "negative", "B\u1EA5t l\u1EE3i nh\u1EB9"],
  [0.15, "neutral", "Trung t\xEDnh"],
  [0.5, "positive", "Thu\u1EADn l\u1EE3i nh\u1EB9"],
  [Infinity, "strong-positive", "Thu\u1EADn l\u1EE3i m\u1EA1nh"]
];
function buildThermometer(points) {
  if (points.length === 0) return null;
  const last = points[points.length - 1];
  const [, band, bandVi] = BANDS.find(([hi]) => last.score <= hi);
  const topContributors = Object.entries(last.contributions).map(([factor, contribution]) => ({ factor, contribution })).sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)).slice(0, 3);
  return { value: last.score, band, bandVi, topContributors, row: last.row };
}

// src/macro-center/src/macro-backtest.ts
function ranks(a) {
  const idx = a.map((_, i) => i).sort((i, j) => a[i] - a[j]);
  const r = new Array(a.length);
  for (let k = 0; k < idx.length; ) {
    let m = k;
    while (m + 1 < idx.length && a[idx[m + 1]] === a[idx[k]]) m++;
    const avg = (k + m) / 2 + 1;
    for (let q = k; q <= m; q++) r[idx[q]] = avg;
    k = m + 1;
  }
  return r;
}
function spearman(a, b) {
  if (a.length < 3) return NaN;
  const ra = ranks(a);
  const rb = ranks(b);
  const ma = mean(ra);
  const mb = mean(rb);
  let sab = 0;
  let saa = 0;
  let sbb = 0;
  for (let i = 0; i < ra.length; i++) {
    sab += (ra[i] - ma) * (rb[i] - mb);
    saa += (ra[i] - ma) ** 2;
    sbb += (rb[i] - mb) ** 2;
  }
  return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : NaN;
}
function perf(monthly) {
  const m = mean(monthly);
  const s = std(monthly);
  let eq = 1;
  let peak = 1;
  let mdd = 0;
  for (const r of monthly) {
    eq *= 1 + r;
    peak = Math.max(peak, eq);
    mdd = Math.min(mdd, eq / peak - 1);
  }
  return { annReturn: m * 12, annVol: s * Math.sqrt(12), sharpe: s > 0 ? m / s * Math.sqrt(12) : 0, maxDrawdown: mdd };
}
function backtestMacroScore(args) {
  const lag = args.lag ?? 1;
  const pts = macroScoreSeries({ y: args.y, factors: args.factors, lag, arLags: args.arLags, minTrain: args.minTrain ?? 60, step: args.step ?? 3 });
  if (pts.length < 30) return null;
  const score = pts.map((p) => p.score);
  const real = pts.map((p) => args.y[p.row]);
  const naive = pts.map((p) => args.y[p.origin]);
  const ic = spearman(score, real);
  const baselineIc = spearman(naive, real);
  const rng = mulberry32(args.seed ?? 7);
  const B = args.B ?? 499;
  const n = pts.length;
  const pNew = 1 / 6;
  const boots = [];
  for (let b = 0; b < B; b++) {
    const idx = [];
    let cur = Math.floor(rng() * n);
    for (let i = 0; i < n; i++) {
      if (i > 0) cur = rng() < pNew ? Math.floor(rng() * n) : (cur + 1) % n;
      idx.push(cur);
    }
    const v = spearman(idx.map((i) => score[i]), idx.map((i) => real[i]));
    if (Number.isFinite(v)) boots.push(v);
  }
  boots.sort((a, c) => a - c);
  const icCI = [boots[Math.floor(0.05 * (boots.length - 1))], boots[Math.ceil(0.95 * (boots.length - 1))]];
  const centred = boots.map((v) => v - ic);
  const icP = (centred.filter((v) => v >= ic).length + 1) / (centred.length + 1);
  const hits = pts.filter((p) => Math.sign(p.score) === Math.sign(args.y[p.row])).length / n;
  const cost = (args.costBps ?? 10) / 1e4;
  let prev = 0;
  let turn = 0;
  const strat = pts.map((p) => {
    const pos = p.score > 0 ? 1 : 0;
    const r = pos * args.y[p.row] / 100 - cost * Math.abs(pos - prev);
    turn += Math.abs(pos - prev);
    prev = pos;
    return r;
  });
  const hold = pts.map((p) => args.y[p.row] / 100);
  const reasons = [];
  if (!(ic >= 0.05)) reasons.push(`IC ngo\xE0i m\u1EABu = ${ic.toFixed(3)} < 0,05.`);
  if (!(icP <= 0.1)) reasons.push(`IC kh\xF4ng c\xF3 \xFD ngh\u0129a th\u1ED1ng k\xEA (p = ${icP.toFixed(3)} > 0,10).`);
  if (!(ic > baselineIc)) reasons.push(`Kh\xF4ng th\u1EAFng m\xF4 h\xECnh ng\xE2y th\u01A1 (IC ${ic.toFixed(3)} so v\u1EDBi ${baselineIc.toFixed(3)}).`);
  if (!(hits > 0.5)) reasons.push(`T\u1EF7 l\u1EC7 \u0111\xFAng h\u01B0\u1EDBng ${(hits * 100).toFixed(1)}% kh\xF4ng v\u01B0\u1EE3t 50%.`);
  return {
    n,
    ic,
    icCI,
    icP,
    hitRate: hits,
    baselineIc,
    strategy: { ...perf(strat), turnover: turn / n },
    buyHold: perf(hold),
    gate: { pass: reasons.length === 0, reasons }
  };
}

// src/macro-center/src/macro-regime.ts
var LOG2PI = Math.log(2 * Math.PI);
function standardize(obs, center, scale) {
  return obs.map((row2) => row2.map((v, d) => (v - center[d]) / scale[d]));
}
function logB(x, mu, vr) {
  const T = x.length;
  const K = mu.length;
  const out = Array.from({ length: T }, () => new Array(K).fill(0));
  for (let t = 0; t < T; t++)
    for (let k = 0; k < K; k++) {
      let s = 0;
      for (let d = 0; d < x[t].length; d++) {
        const diff = x[t][d] - mu[k][d];
        s += -0.5 * (LOG2PI + Math.log(vr[k][d])) - diff * diff / (2 * vr[k][d]);
      }
      out[t][k] = s;
    }
  return out;
}
function forwardBackward(lb, pi, A, needBackward) {
  const T = lb.length;
  const K = pi.length;
  const b = lb.map((row2) => {
    const m = Math.max(...row2);
    return row2.map((v) => Math.exp(v - m));
  });
  const shifts = lb.map((row2) => Math.max(...row2));
  const alpha = Array.from({ length: T }, () => new Array(K).fill(0));
  const c = new Array(T).fill(0);
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
  const beta = Array.from({ length: T }, () => new Array(K).fill(1));
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
function emStep(x, p) {
  const T = x.length;
  const { K, D } = p;
  const lb = logB(x, p.mu, p.vr);
  const fb = forwardBackward(lb, p.pi, p.A, true);
  const gamma = fb.alpha.map((a, t) => {
    const g = a.map((v, k) => v * fb.beta[t][k]);
    const s = g.reduce((u, v) => u + v, 0) || 1;
    return g.map((v) => v / s);
  });
  const xiSum = Array.from({ length: K }, () => new Array(K).fill(0));
  for (let t = 0; t < T - 1; t++)
    for (let j = 0; j < K; j++)
      for (let k = 0; k < K; k++) xiSum[j][k] += fb.alpha[t][j] * p.A[j][k] * fb.b[t + 1][k] * fb.beta[t + 1][k] / fb.c[t + 1];
  const pi = gamma[0].map((v) => Math.max(v, 1e-6));
  const piS = pi.reduce((u, v) => u + v, 0);
  const A = xiSum.map((row2) => {
    const sm = row2.map((v) => v + 1e-3);
    const s = sm.reduce((u, v) => u + v, 0);
    return sm.map((v) => v / s);
  });
  const mu = Array.from({ length: K }, () => new Array(D).fill(0));
  const vr = Array.from({ length: K }, () => new Array(D).fill(1));
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
function initParams(x, K, center, scale, restart, seed) {
  const T = x.length;
  const D = x[0].length;
  const rng = mulberry32(seed + restart * 7919);
  let mu;
  if (restart === 0) {
    const order = x.map((_, i) => i).sort((a, b) => x[a][0] - x[b][0]);
    mu = Array.from({ length: K }, (_, k) => {
      const lo = Math.floor(k * T / K);
      const hi = Math.max(lo + 1, Math.floor((k + 1) * T / K));
      const idx = order.slice(lo, hi);
      return Array.from({ length: D }, (_2, d) => mean(idx.map((i) => x[i][d])));
    });
  } else {
    mu = Array.from({ length: K }, () => x[Math.floor(rng() * T)].slice());
  }
  const A = Array.from({ length: K }, (_, j) => Array.from({ length: K }, (_2, k) => j === k ? 0.9 : 0.1 / Math.max(K - 1, 1)));
  return {
    K,
    D,
    pi: new Array(K).fill(1 / K),
    A,
    mu,
    vr: Array.from({ length: K }, () => new Array(D).fill(1)),
    center,
    scale
  };
}
function reorder(p) {
  const order = p.mu.map((_, k) => k).sort((a, b) => p.mu[a][0] - p.mu[b][0]);
  return {
    ...p,
    pi: order.map((k) => p.pi[k]),
    A: order.map((j) => order.map((k) => p.A[j][k])),
    mu: order.map((k) => p.mu[k]),
    vr: order.map((k) => p.vr[k])
  };
}
function fitHmm(obs, K, opts = {}) {
  const T = obs.length;
  const D = obs[0].length;
  if (T < 10 * K) throw new Error(`fitHmm: need at least ${10 * K} observations for K=${K}`);
  const center = Array.from({ length: D }, (_, d) => mean(obs.map((r) => r[d])));
  const scale = Array.from({ length: D }, (_, d) => std(obs.map((r) => r[d])) || 1);
  const x = standardize(obs, center, scale);
  let best = null;
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
  const b = best;
  const nParams = K - 1 + K * (K - 1) + 2 * K * D;
  return { params: reorder(b.params), logLik: b.logLik, bic: -2 * b.logLik + nParams * Math.log(T), iterations: b.it, converged: b.conv };
}
function selectHmm(obs, maxK = 3, opts = {}) {
  const all = [];
  for (let K = 1; K <= maxK; K++) {
    try {
      all.push(fitHmm(obs, K, opts));
    } catch {
      break;
    }
  }
  const best = all.reduce((a, b) => b.bic < a.bic ? b : a);
  return { best, all };
}
function filterProbs(obs, p) {
  const x = standardize(obs, p.center, p.scale);
  const fb = forwardBackward(logB(x, p.mu, p.vr), p.pi, p.A, false);
  return fb.alpha;
}
function summarizeRegimes(p) {
  let s = new Array(p.K).fill(1 / p.K);
  for (let i = 0; i < 500; i++) {
    const n = new Array(p.K).fill(0);
    for (let j = 0; j < p.K; j++) for (let k = 0; k < p.K; k++) n[k] += s[j] * p.A[j][k];
    s = n;
  }
  return p.mu.map((m, k) => ({
    state: k,
    meanRaw: m.map((v, d) => v * p.scale[d] + p.center[d]),
    sdRaw: p.vr[k].map((v, d) => Math.sqrt(v) * p.scale[d]),
    expectedDurationMonths: p.A[k][k] < 1 ? 1 / (1 - p.A[k][k]) : Infinity,
    stationaryShare: s[k]
  }));
}
function regimeLabelVi(state, K) {
  if (K === 1) return "M\u1ED9t ch\u1EBF \u0111\u1ED9";
  if (K === 2) return state === 0 ? "Ch\u1EBF \u0111\u1ED9 th\u1EA5p" : "Ch\u1EBF \u0111\u1ED9 cao";
  return ["Ch\u1EBF \u0111\u1ED9 th\u1EA5p", "Ch\u1EBF \u0111\u1ED9 trung t\xEDnh", "Ch\u1EBF \u0111\u1ED9 cao"][Math.min(state, 2)];
}
function invert(M) {
  const n = M.length;
  const A = M.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => i === j ? 1 : 0)]);
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
function regimeConditionalBeta(args) {
  const minN = args.minPerRegime ?? 25;
  const keep = args.X.map((_, i) => i).filter((i) => args.regimeOfRow[i] >= 0);
  const counts = new Array(args.K).fill(0);
  keep.forEach((i) => counts[args.regimeOfRow[i]]++);
  const states = counts.map((n, s) => ({ n, s })).filter((r) => r.n >= minN).map((r) => r.s);
  if (states.length < 2) return null;
  const base = states[0];
  const rows = keep.filter((i) => states.includes(args.regimeOfRow[i]));
  const others = states.slice(1);
  const X2 = rows.map((i) => [...args.X[i], ...others.map((s) => args.regimeOfRow[i] === s ? args.X[i][args.coefIdx] : 0)]);
  const y2 = rows.map((i) => args.y[i]);
  const res = olsFit(X2, y2);
  const k0 = args.X[0].length;
  const perRegime = [];
  for (let s = 0; s < args.K; s++) {
    if (!states.includes(s)) {
      perRegime.push({ state: s, n: counts[s], beta: NaN, se: NaN, t: NaN, p: NaN, sufficient: false });
      continue;
    }
    const c = new Array(X2[0].length).fill(0);
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

// src/macro-center/src/macro-filter.ts
function fmtNum(v, digits = 2) {
  if (!Number.isFinite(v)) return "\u2013";
  return v.toLocaleString("vi-VN", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
function fmtQ(q) {
  if (!Number.isFinite(q)) return "\u2013";
  if (q < 1e-3) return "< 0,001";
  return fmtNum(q, 3);
}

// src/macro-center/src/macro-report.ts
var cell = (s) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
var row = (cols) => `| ${cols.map(cell).join(" | ")} |`;
var table = (head, rows) => [row(head), row(head.map(() => "---")), ...rows.map(row)].join("\n");
var dmy = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
function buildMonthlyReport(inp) {
  const n = (id) => inp.names[id] ?? id;
  const out = [];
  out.push(`# B\xE1o c\xE1o v\u0129 m\xF4 th\xE1ng ${inp.asOf.slice(5, 7)}/${inp.asOf.slice(0, 4)}`);
  out.push(`Ng\xE0y l\u1EADp s\u1ED1 li\u1EC7u: ${dmy(inp.asOf)}. D\u1EEF li\u1EC7u t\u1EEB ${inp.impact.firstPeriod} \u0111\u1EBFn ${inp.impact.lastPeriod}.`);
  if (inp.notice) out.push(`> **L\u01B0u \xFD:** ${inp.notice}`);
  const solid = inp.impact.best.filter((c) => c.significant);
  const stable = solid.filter((c) => inp.impact.stability[`${c.factor}|${c.target}`]?.stable);
  out.push("## 1. T\xF3m t\u1EAFt");
  const sum = [];
  if (inp.score?.thermometer) sum.push(`- Nhi\u1EC7t k\u1EBF v\u0129 m\xF4 cho ${n(inp.score.target)}: **${inp.score.thermometer.bandVi}** (\u0111i\u1EC3m ${fmtNum(inp.score.thermometer.value, 2)}).`);
  if (inp.regime) sum.push(`- Ch\u1EBF \u0111\u1ED9 v\u0129 m\xF4 hi\u1EC7n t\u1EA1i: **${inp.regime.current.label}** (x\xE1c su\u1EA5t ${fmtNum(Math.max(...inp.regime.current.probs) * 100, 0)}%).`);
  sum.push(`- ${solid.length} c\u1EB7p bi\u1EBFn\u2013ch\u1EC9 s\u1ED1 c\xF3 \xFD ngh\u0129a th\u1ED1ng k\xEA sau hi\u1EC7u ch\u1EC9nh ki\u1EC3m \u0111\u1ECBnh b\u1ED9i, trong \u0111\xF3 ${stable.length} c\u1EB7p \u1ED5n \u0111\u1ECBnh theo th\u1EDDi gian.`);
  if (inp.alerts) sum.push(`- ${inp.alerts.length} c\u1EA3nh b\xE1o \u0111ang hi\u1EC7u l\u1EF1c.`);
  out.push(sum.join("\n"));
  if (inp.score) {
    out.push("## 2. Nhi\u1EC7t k\u1EBF v\u0129 m\xF4");
    if (inp.score.thermometer) {
      out.push(`\u0110i\u1EC3m ${fmtNum(inp.score.thermometer.value, 2)} (thang \u22121 \u0111\u1EBFn +1) cho k\u1EF3 ${inp.score.thermometer.period}: **${inp.score.thermometer.bandVi}**.`);
      if (inp.score.thermometer.topContributors.length)
        out.push(table(["Y\u1EBFu t\u1ED1", "\u0110\xF3ng g\xF3p v\xE0o l\u1EE3i su\u1EA5t k\u1EF3 v\u1ECDng (%/th\xE1ng)"], inp.score.thermometer.topContributors.map((c) => [n(c.factor), `${c.contribution >= 0 ? "+" : ""}${fmtNum(c.contribution, 2)}`])));
    } else out.push("Ch\u01B0a \u0111\u1EE7 d\u1EEF li\u1EC7u \u0111\u1EC3 t\xEDnh \u0111i\u1EC3m.");
    out.push(`**Ki\u1EC3m \u0111\u1ECBnh ngo\xE0i m\u1EABu:** ${inp.score.gateNote}${inp.score.backtest ? ` IC = ${fmtNum(inp.score.backtest.ic, 2)}, p = ${fmtNum(inp.score.backtest.icP, 3)}, \u0111\xFAng h\u01B0\u1EDBng ${fmtNum(inp.score.backtest.hitRate * 100, 0)}%.` : ""}`);
    if (inp.score.backtest && !inp.score.backtest.gate.pass) out.push(inp.score.backtest.gate.reasons.map((r) => `- ${r}`).join("\n"));
  }
  if (inp.regime) {
    out.push("## 3. Ch\u1EBF \u0111\u1ED9 v\u0129 m\xF4");
    out.push(table(
      ["Ch\u1EBF \u0111\u1ED9", "Th\u1EDDi gian k\xE9o d\xE0i k\u1EF3 v\u1ECDng (th\xE1ng)", "T\u1EF7 tr\u1ECDng d\xE0i h\u1EA1n", "Gi\xE1 tr\u1ECB trung b\xECnh"],
      inp.regime.summary.map((s) => [s.label, fmtNum(s.expectedDurationMonths, 1), `${fmtNum(s.stationaryShare * 100, 0)}%`, Object.entries(s.meansByFeature).map(([f, v]) => `${f} ${fmtNum(v, 2)}`).join("; ")])
    ));
  }
  out.push("## 4. T\xE1c \u0111\u1ED9ng n\u1ED5i b\u1EADt");
  const top = [...solid].sort((a, b) => Math.abs(b.t) - Math.abs(a.t)).slice(0, 12);
  if (top.length === 0) out.push("Kh\xF4ng c\xF3 c\u1EB7p n\xE0o v\u01B0\u1EE3t hi\u1EC7u ch\u1EC9nh ki\u1EC3m \u0111\u1ECBnh b\u1ED9i trong k\u1EF3 n\xE0y.");
  else {
    out.push(table(
      ["Bi\u1EBFn v\u0129 m\xF4", "Ch\u1EC9 s\u1ED1", "H\u01B0\u1EDBng", "H\u1EC7 s\u1ED1", "t", "q", "\u0110\u1ED9 tr\u1EC5 (th\xE1ng)", "\u1ED4n \u0111\u1ECBnh"],
      top.map((c) => {
        const st = inp.impact.stability[`${c.factor}|${c.target}`];
        return [n(c.factor), n(c.target), c.direction === "+" ? "T\u0103ng gi\xE1" : "Gi\u1EA3m gi\xE1", fmtNum(c.beta, 2), fmtNum(c.t, 1), fmtQ(c.q), String(c.lag), st ? st.stable ? "C\xF3" : `Kh\xF4ng (\u0111\u1ED5i d\u1EA5u ${st.signFlips} l\u1EA7n)` : "Ch\u01B0a ki\u1EC3m tra"];
      })
    ));
    out.push(`Hi\u1EC7u ch\u1EC9nh ki\u1EC3m \u0111\u1ECBnh b\u1ED9i: ${inp.impact.options.adjust.toUpperCase()}, ng\u01B0\u1EE1ng ${fmtNum(inp.impact.options.alpha, 2)}.`);
  }
  if (inp.alerts) {
    out.push("## 5. C\u1EA3nh b\xE1o");
    out.push(inp.alerts.length ? inp.alerts.map((a) => `- **${a.level === "high" ? "Cao" : a.level === "warn" ? "L\u01B0u \xFD" : "Th\xF4ng tin"}.** ${a.messageVi}`).join("\n") : "Kh\xF4ng c\xF3 c\u1EA3nh b\xE1o.");
  }
  if (inp.calendar) {
    out.push("## 6. L\u1ECBch c\xF4ng b\u1ED1 s\u1EAFp t\u1EDBi");
    out.push(table(["Ng\xE0y d\u1EF1 ki\u1EBFn", "S\u1ED1 li\u1EC7u", "K\u1EF3", "Tr\u1EA1ng th\xE1i"], inp.calendar.releases.slice(0, 6).map((r) => [dmy(r.expectedDate), r.nameVi, r.period, r.status === "overdue" ? "Ch\u1EADm so v\u1EDBi l\u1ECBch" : "S\u1EAFp t\u1EDBi"])));
    out.push(`_${inp.calendar.caveat}_`);
  }
  out.push("## 7. Ph\u01B0\u01A1ng ph\xE1p v\xE0 gi\u1EDBi h\u1EA1n");
  out.push([
    "- M\u1ECDi chu\u1ED7i \u0111\u01B0\u1EE3c ki\u1EC3m tra t\xEDnh d\u1EEBng (ADF, KPSS, Zivot-Andrews) v\xE0 bi\u1EBFn \u0111\u1ED5i tr\u01B0\u1EDBc khi h\u1ED3i quy; sai s\u1ED1 chu\u1EA9n HAC Newey-West.",
    "- M\u1ED7i \xF4 c\u1EE7a ma tr\u1EADn l\xE0 m\u1ED9t gi\u1EA3 thuy\u1EBFt; c\u1EA3 h\u1ECD \u0111\u01B0\u1EE3c hi\u1EC7u ch\u1EC9nh ki\u1EC3m \u0111\u1ECBnh b\u1ED9i, n\xEAn \xF4 kh\xF4ng v\u01B0\u1EE3t ng\u01B0\u1EE1ng kh\xF4ng n\xEAn \u0111\u01B0\u1EE3c \u0111\u1ECDc nh\u01B0 t\xE1c \u0111\u1ED9ng th\u1EF1c.",
    "- S\u1ED1 li\u1EC7u \u0111\u01B0\u1EE3c d\u1ECBch theo \u0111\u1ED9 tr\u1EC5 c\xF4ng b\u1ED1 \u0111\u1EC3 tr\xE1nh d\xF9ng th\xF4ng tin ch\u01B0a bi\u1EBFt t\u1EA1i th\u1EDDi \u0111i\u1EC3m \u0111\xF3.",
    "- T\u01B0\u01A1ng quan th\u1ED1ng k\xEA kh\xF4ng ph\u1EA3i quan h\u1EC7 nh\xE2n qu\u1EA3; \u0111\u1ED9 nh\u1EA1y l\u1ECBch s\u1EED c\xF3 th\u1EC3 \u0111\u1ED5i khi ch\u1EBF \u0111\u1ED9 v\u0129 m\xF4 \u0111\u1ED5i.",
    ...inp.impact.warnings.map((w) => `- ${w}`)
  ].join("\n"));
  return out.join("\n\n") + "\n";
}

// src/macro-center/src/macro-api.ts
var ApiError = class extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
};
var PAPER_FACTORS = ["CPI", "IR", "M2", "EX", "IO", "FDI"];
function createMacroApi(deps) {
  const catalog = deps.catalog ?? VN_CATALOG;
  const by = catalogById(catalog);
  const today = deps.today ?? (() => (/* @__PURE__ */ new Date()).toISOString().slice(0, 10));
  const ttl = deps.cacheTtlMs ?? 5 * 6e4;
  const maxEntries = deps.maxCacheEntries ?? 200;
  const cache = /* @__PURE__ */ new Map();
  let hits = 0;
  let misses = 0;
  const memo = (key, compute) => {
    const full = `${deps.store.dataVersion()}|${key}`;
    const hit = cache.get(full);
    if (hit && Date.now() - hit.at < ttl) {
      hits++;
      return hit.value;
    }
    misses++;
    const value = compute();
    cache.set(full, { at: Date.now(), value });
    while (cache.size > maxEntries) cache.delete(cache.keys().next().value);
    return value;
  };
  const obj2 = (b) => b && typeof b === "object" && !Array.isArray(b) ? b : {};
  const optStr = (v, name) => {
    if (v === void 0 || v === null || v === "") return void 0;
    if (typeof v !== "string") throw new ApiError(400, `${name} ph\u1EA3i l\xE0 chu\u1ED7i.`);
    return v;
  };
  const optInt = (v, name, lo, hi) => {
    if (v === void 0 || v === null || v === "") return void 0;
    const n = typeof v === "string" ? Number(v) : v;
    if (typeof n !== "number" || !Number.isInteger(n) || n < lo || n > hi) throw new ApiError(400, `${name} ph\u1EA3i l\xE0 s\u1ED1 nguy\xEAn trong [${lo}, ${hi}].`);
    return n;
  };
  const optNum = (v, name, lo, hi) => {
    if (v === void 0 || v === null || v === "") return void 0;
    const n = typeof v === "string" ? Number(v) : v;
    if (typeof n !== "number" || !Number.isFinite(n) || n < lo || n > hi) throw new ApiError(400, `${name} ph\u1EA3i n\u1EB1m trong [${lo}, ${hi}].`);
    return n;
  };
  const asOfOf = (v) => {
    const s = optStr(v, "asOf") ?? today();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new ApiError(400, "asOf ph\u1EA3i c\xF3 d\u1EA1ng YYYY-MM-DD.");
    return s;
  };
  const idList = (v, name, role) => {
    if (v === void 0 || v === null) return void 0;
    if (!Array.isArray(v) || v.length === 0 || !v.every((x) => typeof x === "string")) throw new ApiError(400, `${name} ph\u1EA3i l\xE0 danh s\xE1ch m\xE3 chu\u1ED7i.`);
    for (const id of v) if (!by[id] || by[id].role !== role) throw new ApiError(400, `M\xE3 ${id} kh\xF4ng ph\u1EA3i ${role === "factor" ? "bi\u1EBFn v\u0129 m\xF4" : "ch\u1EC9 s\u1ED1"} h\u1EE3p l\u1EC7.`);
    return v;
  };
  const prepare = (asOf, factors, targets) => {
    const known = (id) => deps.store.getSeries(id, asOf).length >= 60;
    const factorIds3 = factors ?? catalog.filter((m) => m.role === "factor" && known(m.id)).map((m) => m.id);
    const targetIds2 = targets ?? catalog.filter((m) => m.role === "target" && known(m.id)).map((m) => m.id);
    const missing = [...factorIds3, ...targetIds2].filter((id) => deps.store.getSeries(id, asOf).length === 0);
    if (missing.length) throw new ApiError(422, `Ch\u01B0a c\xF3 d\u1EEF li\u1EC7u cho: ${missing.join(", ")}.`);
    if (factorIds3.length === 0 || targetIds2.length === 0) throw new ApiError(422, "Ch\u01B0a \u0111\u1EE7 d\u1EEF li\u1EC7u (c\u1EA7n \xEDt nh\u1EA5t 60 th\xE1ng) cho bi\u1EBFn v\u0129 m\xF4 v\xE0 ch\u1EC9 s\u1ED1.");
    const ds = buildDataset(deps.store, [...factorIds3, ...targetIds2], asOf);
    if (ds.dates.length < 60) throw new ApiError(422, `Ch\u1EC9 c\xF3 ${ds.dates.length} th\xE1ng chung gi\u1EEFa c\xE1c chu\u1ED7i \u0111\xE3 ch\u1ECDn; c\u1EA7n t\u1ED1i thi\u1EC3u 60.`);
    return { asOf, ds, factorIds: factorIds3, targetIds: targetIds2 };
  };
  const stationary = (p) => memo(`stat|${p.asOf}|${p.factorIds.join(",")}|${p.targetIds.join(",")}`, () => ({
    prep: prepareStationary({
      dates: p.ds.dates,
      factors: toMacroSeries(p.ds, catalog, p.factorIds),
      targets: toMacroSeries(p.ds, catalog, p.targetIds)
    }),
    dates: p.ds.dates
  }));
  const notice = deps.notice;
  const withMeta = (p, payload) => ({
    dataVersion: deps.store.dataVersion(),
    asOf: p.asOf,
    firstPeriod: p.ds.dates[0],
    lastPeriod: p.ds.dates[p.ds.dates.length - 1],
    notice,
    ...payload
  });
  const impact = (b) => {
    const asOf = asOfOf(b.asOf);
    const p = prepare(asOf, idList(b.factors, "factors", "factor"), idList(b.targets, "targets", "target"));
    const maxLag = optInt(b.maxLag, "maxLag", 0, 12) ?? 6;
    const adjust = optStr(b.adjust, "adjust") ?? "by";
    if (!["by", "bh", "holm", "bonferroni"].includes(adjust)) throw new ApiError(400, "adjust ph\u1EA3i l\xE0 'by', 'bh', 'holm' ho\u1EB7c 'bonferroni'.");
    const alpha = optNum(b.alpha, "alpha", 1e-3, 0.5) ?? 0.05;
    const rollingWindow = optInt(b.rollingWindow, "rollingWindow", 24, 120) ?? 48;
    const key = `impact|${asOf}|${p.factorIds.join(",")}|${p.targetIds.join(",")}|${maxLag}|${adjust}|${alpha}|${rollingWindow}`;
    const out = memo(
      key,
      () => analyzeMacro({
        dates: p.ds.dates,
        factors: toMacroSeries(p.ds, catalog, p.factorIds),
        targets: toMacroSeries(p.ds, catalog, p.targetIds),
        options: { maxLag, adjust, alpha, rollingWindow }
      })
    );
    return withMeta(p, {
      factors: p.factorIds,
      targets: p.targetIds,
      diagnostics: out.diagnostics,
      cells: out.cells,
      best: out.best,
      stability: out.stability,
      warnings: out.warnings,
      options: { maxLag, adjust, alpha, rollingWindow }
    });
  };
  const cell2 = (b) => {
    const asOf = asOfOf(b.asOf);
    const factor = optStr(b.factor, "factor");
    const target = optStr(b.target, "target");
    if (!factor || !target) throw new ApiError(400, "C\u1EA7n factor v\xE0 target.");
    if (!by[factor] || by[factor].role !== "factor") throw new ApiError(400, `M\xE3 ${factor} kh\xF4ng ph\u1EA3i bi\u1EBFn v\u0129 m\xF4 h\u1EE3p l\u1EC7.`);
    if (!by[target] || by[target].role !== "target") throw new ApiError(400, `M\xE3 ${target} kh\xF4ng ph\u1EA3i ch\u1EC9 s\u1ED1 h\u1EE3p l\u1EC7.`);
    const lag = optInt(b.lag, "lag", 0, 12) ?? 1;
    const arLags = optInt(b.arLags, "arLags", 0, 6) ?? 1;
    const window = optInt(b.window, "window", 24, 120) ?? 48;
    const p = prepare(asOf, idList(b.factors, "factors", "factor"), idList(b.targets, "targets", "target"));
    if (!p.factorIds.includes(factor) || !p.targetIds.includes(target)) throw new ApiError(404, "C\u1EB7p factor/target kh\xF4ng n\u1EB1m trong t\u1EADp d\u1EEF li\u1EC7u hi\u1EC7n c\xF3.");
    const { prep, dates } = stationary(p);
    const names = Object.keys(prep.factors);
    const xs = names.map((n) => prep.factors[n]);
    const d = buildDesign({ y: prep.targets[target], xs, names, lag, arLags });
    const idx = 1 + names.indexOf(factor);
    if (d.X.length < window + 5) throw new ApiError(422, "M\u1EABu qu\xE1 ng\u1EAFn cho c\u1EEDa s\u1ED5 tr\u01B0\u1EE3t y\xEAu c\u1EA7u.");
    const key = `cell|${asOf}|${factor}|${target}|${lag}|${arLags}|${window}|${names.join(",")}`;
    return memo(key, () => {
      const full = olsFit(d.X, d.y);
      const roll = rollingBeta(d, idx, window);
      const ci = stationaryBootstrapCI(d.X, d.y, idx, { B: 399, seed: 17 });
      return withMeta(p, {
        factor,
        target,
        lag,
        arLags,
        nobs: full.n,
        beta: full.beta[idx],
        se: full.seHac[idx],
        t: full.tHac[idx],
        p: full.pHac[idx],
        bootstrapCI: [ci.lo, ci.hi],
        rolling: { dates: roll.rows.map((r) => dates[r]), beta: roll.beta, t: roll.t }
      });
    });
  };
  const scenario = (b) => {
    const asOf = asOfOf(b.asOf);
    const horizon = optInt(b.horizon, "horizon", 1, 24) ?? 6;
    let shocks;
    let meta;
    const sid = optStr(b.scenarioId, "scenarioId");
    if (sid) {
      const sc = NAMED_SCENARIOS.find((s) => s.id === sid);
      if (!sc) throw new ApiError(404, `Kh\xF4ng c\xF3 k\u1ECBch b\u1EA3n '${sid}'.`);
      shocks = sc.shocks;
      meta = { id: sc.id, nameVi: sc.nameVi, descriptionVi: sc.descriptionVi };
    } else {
      const raw = b.shocks;
      if (!Array.isArray(raw) || raw.length === 0) throw new ApiError(400, "C\u1EA7n scenarioId ho\u1EB7c danh s\xE1ch shocks.");
      shocks = raw.map((r, i) => {
        const o = obj2(r);
        const factor = optStr(o.factor, `shocks[${i}].factor`);
        const amount = optNum(o.amount, `shocks[${i}].amount`, -100, 100);
        const unit = optStr(o.unit, `shocks[${i}].unit`);
        if (!factor || amount === void 0 || unit !== "pct" && unit !== "pp") throw new ApiError(400, `shocks[${i}] c\u1EA7n factor, amount v\xE0 unit ('pct' ho\u1EB7c 'pp').`);
        return { factor, amount, unit };
      });
    }
    const p = prepare(asOf, idList(b.factors, "factors", "factor"), idList(b.targets, "targets", "target"));
    const key = `scenario|${asOf}|${JSON.stringify(shocks)}|${horizon}|${p.factorIds.join(",")}|${p.targetIds.join(",")}`;
    const { prep } = stationary(p);
    const res = memo(key, () => runScenario({ targets: prep.targets, factors: prep.factors, transforms: prep.transforms, shocks, horizon }));
    return withMeta(p, { scenario: meta ?? { id: "custom", nameVi: "K\u1ECBch b\u1EA3n tu\u1EF3 ch\u1EC9nh", descriptionVi: "" }, shocks, ...res });
  };
  const score = (b) => {
    const asOf = asOfOf(b.asOf);
    const target = optStr(b.target, "target") ?? "VNINDEX";
    if (!by[target] || by[target].role !== "target") throw new ApiError(400, `M\xE3 ${target} kh\xF4ng ph\u1EA3i ch\u1EC9 s\u1ED1 h\u1EE3p l\u1EC7.`);
    const lag = optInt(b.lag, "lag", 1, 6) ?? 1;
    const minTrain = optInt(b.minTrain, "minTrain", 36, 240) ?? 60;
    const chosen = idList(b.factors, "factors", "factor");
    const factorIds3 = chosen ?? PAPER_FACTORS.filter((f) => deps.store.getSeries(f, asOf).length >= 60);
    const p = prepare(asOf, factorIds3, [target]);
    const { prep, dates } = stationary(p);
    const key = `score|${asOf}|${target}|${lag}|${minTrain}|${p.factorIds.join(",")}`;
    return memo(key, () => {
      const y = prep.targets[target];
      const pts = macroScoreSeries({ y, factors: prep.factors, lag, minTrain });
      if (pts.length === 0) throw new ApiError(422, "Ch\u01B0a \u0111\u1EE7 d\u1EEF li\u1EC7u \u0111\u1EC3 t\xEDnh MacroScore ngo\xE0i m\u1EABu.");
      const bt = backtestMacroScore({ y, factors: prep.factors, lag, minTrain, B: 199 });
      const thermo = buildThermometer(pts);
      return withMeta(p, {
        target,
        lag,
        factors: p.factorIds,
        thermometer: thermo && { ...thermo, period: dates[thermo.row] },
        series: pts.slice(-36).map((q) => ({ period: dates[q.row], score: q.score, z: q.z })),
        backtest: bt,
        usableForDecisions: !!bt?.gate.pass,
        gateNote: bt?.gate.pass ? "MacroScore v\u01B0\u1EE3t c\u1ED5ng ki\u1EC3m \u0111\u1ECBnh ngo\xE0i m\u1EABu." : "MacroScore CH\u01AFA v\u01B0\u1EE3t c\u1ED5ng ki\u1EC3m \u0111\u1ECBnh; ch\u1EC9 d\xF9ng \u0111\u1EC3 tham kh\u1EA3o, kh\xF4ng \u0111\u01B0a v\xE0o b\u1ED9 m\xE1y quy\u1EBFt \u0111\u1ECBnh."
      });
    });
  };
  const regimeFit = (p, maxK) => {
    const feats = ["IR", "CPI", "M2"].filter((f) => p.ds.series[f]);
    if (feats.length === 0) throw new ApiError(422, "C\u1EA7n \xEDt nh\u1EA5t m\u1ED9t trong IR, CPI, M2 \u0111\u1EC3 nh\u1EADn di\u1EC7n ch\u1EBF \u0111\u1ED9.");
    const cols = feats.map((f) => by[f].kind === "level" ? applyTransform(p.ds.series[f], "yoy") : p.ds.series[f]);
    const rows = [];
    for (let t = 0; t < p.ds.dates.length; t++) if (cols.every((c) => Number.isFinite(c[t]))) rows.push(t);
    if (rows.length < 60) throw new ApiError(422, "Qu\xE1 \xEDt quan s\xE1t \u0111\u1EC3 nh\u1EADn di\u1EC7n ch\u1EBF \u0111\u1ED9.");
    const obs = rows.map((t) => cols.map((c) => c[t]));
    const sel = selectHmm(obs, maxK);
    const probs = filterProbs(obs, sel.best.params);
    return { feats, rows, obs, sel, probs };
  };
  const regime = (q) => {
    const asOf = asOfOf(q.asOf);
    const maxK = optInt(q.maxK, "maxK", 1, 4) ?? 3;
    const p = prepare(asOf, ["IR", "CPI", "M2"].filter((f) => deps.store.getSeries(f, asOf).length >= 60), [by.VNINDEX ? "VNINDEX" : catalog.find((m) => m.role === "target").id]);
    return memo(`regime|${asOf}|${maxK}`, () => {
      const r = regimeFit(p, maxK);
      const K = r.sel.best.params.K;
      const summary = summarizeRegimes(r.sel.best.params).map((s) => ({
        ...s,
        label: regimeLabelVi(s.state, K),
        meansByFeature: Object.fromEntries(r.feats.map((f, i) => [f, s.meanRaw[i]]))
      }));
      const last = r.probs[r.probs.length - 1];
      return withMeta(p, {
        features: r.feats,
        K,
        bicByK: r.sel.all.map((m) => ({ K: m.params.K, bic: m.bic })),
        summary,
        current: { probs: last, state: last.indexOf(Math.max(...last)), label: regimeLabelVi(last.indexOf(Math.max(...last)), K) },
        history: r.rows.slice(-60).map((t, i) => ({ period: p.ds.dates[t], probs: r.probs[r.probs.length - 60 + i] ?? r.probs[i] })),
        note: "X\xE1c su\u1EA5t l\u1ECDc (forward) \u2014 an to\xE0n cho quy\u1EBFt \u0111\u1ECBnh th\u1EDDi gian th\u1EF1c; kh\xF4ng d\xF9ng th\xF4ng tin t\u01B0\u01A1ng lai."
      });
    });
  };
  const regimeImpact = (b) => {
    const asOf = asOfOf(b.asOf);
    const factor = optStr(b.factor, "factor");
    const target = optStr(b.target, "target");
    if (!factor || !target) throw new ApiError(400, "C\u1EA7n factor v\xE0 target.");
    if (!by[factor] || by[factor].role !== "factor") throw new ApiError(400, `M\xE3 ${factor} kh\xF4ng ph\u1EA3i bi\u1EBFn v\u0129 m\xF4 h\u1EE3p l\u1EC7.`);
    if (!by[target] || by[target].role !== "target") throw new ApiError(400, `M\xE3 ${target} kh\xF4ng ph\u1EA3i ch\u1EC9 s\u1ED1 h\u1EE3p l\u1EC7.`);
    const lag = optInt(b.lag, "lag", 0, 12) ?? 1;
    const arLags = optInt(b.arLags, "arLags", 0, 6) ?? 1;
    const p = prepare(asOf, idList(b.factors, "factors", "factor"), idList(b.targets, "targets", "target"));
    if (!p.factorIds.includes(factor) || !p.targetIds.includes(target)) throw new ApiError(404, "C\u1EB7p factor/target kh\xF4ng n\u1EB1m trong t\u1EADp d\u1EEF li\u1EC7u hi\u1EC7n c\xF3.");
    return memo(`regime-impact|${asOf}|${factor}|${target}|${lag}|${arLags}|${p.factorIds.join(",")}`, () => {
      const r = regimeFit(p, 3);
      const K = r.sel.best.params.K;
      if (K < 2) throw new ApiError(422, "Ch\u1EC9 nh\u1EADn di\u1EC7n \u0111\u01B0\u1EE3c m\u1ED9t ch\u1EBF \u0111\u1ED9; kh\xF4ng c\xF3 g\xEC \u0111\u1EC3 so s\xE1nh.");
      const stateOfMonth = /* @__PURE__ */ new Map();
      r.rows.forEach((t, i) => stateOfMonth.set(t, r.probs[i].indexOf(Math.max(...r.probs[i]))));
      const { prep } = stationary(p);
      const names = Object.keys(prep.factors);
      const d = buildDesign({ y: prep.targets[target], xs: names.map((n) => prep.factors[n]), names, lag, arLags });
      const res = regimeConditionalBeta({ X: d.X, y: d.y, coefIdx: 1 + names.indexOf(factor), regimeOfRow: d.rows.map((t) => stateOfMonth.get(t) ?? -1), K });
      if (!res) throw new ApiError(422, "M\u1ED7i ch\u1EBF \u0111\u1ED9 c\u1EA7n \xEDt nh\u1EA5t 25 quan s\xE1t \u0111\u1EC3 so s\xE1nh.");
      return withMeta(p, {
        factor,
        target,
        lag,
        K,
        features: r.feats,
        perRegime: res.perRegime.map((x) => ({ ...x, label: regimeLabelVi(x.state, K) })),
        equalityF: res.equalityF,
        equalityP: res.equalityP,
        differs: res.differs,
        note: "Ch\u1EBF \u0111\u1ED9 g\xE1n theo x\xE1c su\u1EA5t l\u1ECDc (forward). K\u1EBFt qu\u1EA3 mang t\xEDnh m\xF4 t\u1EA3: ch\u1EBF \u0111\u1ED9 \u0111\u01B0\u1EE3c \u01B0\u1EDBc l\u01B0\u1EE3ng tr\xEAn to\xE0n m\u1EABu."
      });
    });
  };
  const report = (q) => {
    const asOf = asOfOf(q.asOf);
    const imp = impact({ asOf });
    const names = Object.fromEntries(catalog.map((m) => [m.id, m.nameVi]));
    const opt = (f) => {
      try {
        return f();
      } catch {
        return void 0;
      }
    };
    const markdown = buildMonthlyReport({
      asOf,
      notice,
      names,
      impact: imp,
      score: opt(() => score({ asOf })),
      regime: opt(() => regime({ asOf })),
      alerts: opt(() => alerts({ asOf }).alerts),
      calendar: opt(() => calendar({ asOf }))
    });
    return { dataVersion: deps.store.dataVersion(), asOf, notice, markdown };
  };
  const alerts = (q) => {
    const asOf = asOfOf(q.asOf);
    const imp = impact({ asOf });
    const p = prepare(asOf, imp.factors, imp.targets);
    const { prep } = stationary(p);
    const factorZ = {};
    for (const f of Object.keys(prep.factors)) {
      const z = expandingZ(prep.factors[f]);
      for (let i = z.length - 1; i >= 0; i--) if (Number.isFinite(z[i])) {
        factorZ[f] = z[i];
        break;
      }
    }
    let regimeArg;
    try {
      const r = regimeFit(p, 3);
      const K = r.sel.best.params.K;
      if (r.probs.length >= 2 && K > 1)
        regimeArg = { previous: r.probs[r.probs.length - 2], current: r.probs[r.probs.length - 1], labels: Array.from({ length: K }, (_, s) => regimeLabelVi(s, K)) };
    } catch {
    }
    const list = generateAlerts({
      factorZ,
      factorNamesVi: Object.fromEntries(catalog.map((m) => [m.id, m.nameVi])),
      regime: regimeArg,
      stability: imp.stability,
      best: imp.best
    });
    return withMeta(p, { alerts: list, factorZ });
  };
  const calendar = (q) => {
    const asOf = asOfOf(q.asOf);
    const latest = {};
    for (const m of catalog) {
      const s = deps.store.getSeries(m.id, asOf);
      if (s.length) latest[m.id] = s[s.length - 1].period;
    }
    return { dataVersion: deps.store.dataVersion(), asOf, notice, releases: upcomingReleases(catalog, latest, asOf), caveat: "Ng\xE0y c\xF4ng b\u1ED1 l\xE0 \u01AF\u1EDAC T\xCDNH t\u1EEB \u0111\u1ED9 tr\u1EC5 v\xE0 ng\xE0y c\xF4ng b\u1ED1 \u0111i\u1EC3n h\xECnh; \u0111\u1ED1i chi\u1EBFu l\u1ECBch ch\xEDnh th\u1EE9c c\u1EE7a t\u1EEBng c\u01A1 quan." };
  };
  const seriesList = (q) => {
    const asOf = asOfOf(q.asOf);
    const nowPeriod = asOf.slice(0, 7);
    return {
      dataVersion: deps.store.dataVersion(),
      asOf,
      notice,
      series: catalog.map((m) => {
        const pts = deps.store.getSeries(m.id, asOf);
        const issues = pts.length ? checkQuality(m.id, pts, m, nowPeriod) : [];
        return { ...m, n: pts.length, first: pts[0]?.period ?? null, last: pts[pts.length - 1]?.period ?? null, issues };
      }),
      scenarios: NAMED_SCENARIOS
    };
  };
  async function handle(req) {
    try {
      const path = req.path.replace(/\/+$/, "");
      const m = req.method.toUpperCase();
      const route = (method, p) => m === method && path === `/api/macro/${p}`;
      if (route("GET", "health")) return { status: 200, body: { ok: true, dataVersion: deps.store.dataVersion(), cache: { entries: cache.size, hits, misses } } };
      if (route("GET", "series")) return { status: 200, body: seriesList(req.query) };
      if (route("POST", "impact")) return { status: 200, body: impact(obj2(req.body)) };
      if (route("POST", "cell")) return { status: 200, body: cell2(obj2(req.body)) };
      if (route("POST", "scenario")) return { status: 200, body: scenario(obj2(req.body)) };
      if (route("POST", "score")) return { status: 200, body: score(obj2(req.body)) };
      if (route("GET", "regime")) return { status: 200, body: regime(req.query) };
      if (route("POST", "regime-impact")) return { status: 200, body: regimeImpact(obj2(req.body)) };
      if (route("GET", "report")) return { status: 200, body: report(req.query) };
      if (route("GET", "alerts")) return { status: 200, body: alerts(req.query) };
      if (route("GET", "calendar")) return { status: 200, body: calendar(req.query) };
      if (path.startsWith("/api/macro/")) return { status: 405, body: { error: "Ph\u01B0\u01A1ng th\u1EE9c ho\u1EB7c \u0111\u01B0\u1EDDng d\u1EABn kh\xF4ng \u0111\u01B0\u1EE3c h\u1ED7 tr\u1EE3." } };
      return { status: 404, body: { error: "Kh\xF4ng t\xECm th\u1EA5y." } };
    } catch (e) {
      if (e instanceof ApiError) return { status: e.status, body: { error: e.message } };
      return { status: 500, body: { error: "L\u1ED7i t\xEDnh to\xE1n n\u1ED9i b\u1ED9." } };
    }
  }
  return { handle, cacheStats: () => ({ entries: cache.size, hits, misses }), clearCache: () => cache.clear() };
}

// src/macro-center/src/macro-seed.ts
var SYNTHETIC_NOTICE = "D\u1EEE LI\u1EC6U M\xD4 PH\u1ECENG \u2014 kh\xF4ng ph\u1EA3i s\u1ED1 li\u1EC7u th\u1EF1c c\u1EE7a GSO/NHNN/HOSE.";
var TRUE_EFFECTS = {
  VNINDEX: { CPI: -3, IR: -2, M2: 1.2, PMI: 0.75, DXY: -0.6 },
  VN30: { CPI: -2.3, IR: -1.6, M2: 0.9, PMI: 0.75, DXY: -0.45 },
  VNMIDCAP: { CPI: -3.8, IR: -2.2, M2: 1.35, PMI: 0.75, DXY: -0.6 },
  VNSMALLCAP: { CPI: -5.3, IR: -2.8, M2: 1.8, PMI: 0.6, DXY: -0.75 },
  VN100: { CPI: -2.85, IR: -1.9, M2: 1.1, PMI: 0.75, DXY: -0.6 },
  VNALLSHARE: { CPI: -3, IR: -2, M2: 1.2, PMI: 0.75, DXY: -0.6 }
};
function makeSyntheticStore(seed = 2024, start = "2008-01", months = 222) {
  const rng = mulberry32(seed);
  const n = months;
  const ar = (phi, mu, sd, x0, floor = -Infinity) => {
    const y = [x0];
    for (let i = 1; i < n; i++) y.push(Math.max(floor, mu + phi * (y[i - 1] - mu) + sd * randn(rng)));
    return y;
  };
  const level = (g, sd, x0, extra) => {
    const y = [x0];
    for (let i = 1; i < n; i++) y.push(y[i - 1] * Math.exp((g + sd * randn(rng) + (extra ? extra(i) : 0)) / 100));
    return y;
  };
  const cpi = ar(0.95, 5, 0.35, 5, -1);
  const ir = ar(0.93, 5, 0.6, 5, 0.2);
  const m2 = level(1.2, 1, 4e6);
  const credit = level(1.1, 0.5, 3e6);
  const ex = level(0.15, 0.25, 16e3);
  const fdi = Array.from({ length: n }, (_, i) => 1500 * Math.exp(4e-3 * i + 0.25 * randn(rng)));
  const exportV = level(0.8, 3, 4e3);
  const io = level(0.6, 2, 100);
  const pmi = ar(0.7, 51, 1.2, 51);
  const dxy = level(0, 1.5, 85);
  const fed = ar(0.985, 2, 0.12, 2, 0);
  const oil = level(0, 8, 80);
  const dd = (x) => x.map((v, i) => i === 0 ? 0 : v - x[i - 1]);
  const ld = (x) => x.map((v, i) => i === 0 ? 0 : 100 * Math.log(v / x[i - 1]));
  const stat = { CPI: dd(cpi), IR: dd(ir), M2: ld(m2), PMI: pmi.map((v) => v - 51), DXY: ld(dxy) };
  const pub = Object.fromEntries(Object.entries(catalogById()).map(([id, m]) => [id, m.pubLagMonths]));
  const market = Array.from({ length: n }, () => 2.4 * randn(rng));
  const raw = { CPI: cpi, IR: ir, M2: m2, CREDIT: credit, EX: ex, FDI: fdi, EXPORT: exportV, IO: io, PMI: pmi, DXY: dxy, FED: fed, OIL: oil };
  for (const [id, eff] of Object.entries(TRUE_EFFECTS)) {
    const ret = new Array(n).fill(0);
    for (let t = 1; t < n; t++) {
      let r = 0.5 + market[t] + 1.2 * randn(rng);
      for (const [f, b] of Object.entries(eff)) {
        const src = t - 1 - (pub[f] ?? 0);
        if (src >= 0) r += b * stat[f][src];
      }
      ret[t] = r;
    }
    const idx = [1e3];
    for (let t = 1; t < n; t++) idx.push(idx[t - 1] * Math.exp(ret[t] / 100));
    raw[id] = idx;
  }
  const store = new InMemoryVintageStore();
  const obs = [];
  for (const meta of VN_CATALOG) {
    const v = raw[meta.id];
    if (!v) continue;
    for (let i = 0; i < n; i++) {
      const period = addMonths(start, i);
      obs.push({ seriesId: meta.id, period, value: v[i], asOf: estimateAsOf(period, meta.pubLagMonths, meta.typicalReleaseDay) });
    }
  }
  store.upsert(obs);
  return store;
}

// src/macro-center/src/macro-chat-tools.ts
var factorIds = VN_CATALOG.filter((m) => m.role === "factor").map((m) => m.id);
var targetIds = VN_CATALOG.filter((m) => m.role === "target").map((m) => m.id);
var ASOF = { type: "string", description: "Ng\xE0y tham chi\u1EBFu YYYY-MM-DD; b\u1ECF tr\u1ED1ng \u0111\u1EC3 d\xF9ng d\u1EEF li\u1EC7u m\u1EDBi nh\u1EA5t. Ch\u1EC9 d\xF9ng th\xF4ng tin \u0111\xE3 bi\u1EBFt t\u1EA1i ng\xE0y \u0111\xF3." };
var MACRO_TOOL_SPECS = [
  {
    name: "macro_overview",
    description: 'T\u1ED5ng quan v\u0129 m\xF4 hi\u1EC7n t\u1EA1i cho m\u1ED9t ch\u1EC9 s\u1ED1: nhi\u1EC7t k\u1EBF v\u0129 m\xF4 (\u0111i\u1EC3m \u22121..+1 v\xE0 nh\xE3n), y\u1EBFu t\u1ED1 \u0111\xF3ng g\xF3p ch\xEDnh, ch\u1EBF \u0111\u1ED9 v\u0129 m\xF4, c\u1EA3nh b\xE1o, v\xE0 li\u1EC7u \u0111i\u1EC3m n\xE0y \u0111\xE3 v\u01B0\u1EE3t c\u1ED5ng ki\u1EC3m \u0111\u1ECBnh ngo\xE0i m\u1EABu \u0111\u1EC3 d\xF9ng cho quy\u1EBFt \u0111\u1ECBnh hay ch\u01B0a. D\xF9ng khi ng\u01B0\u1EDDi d\xF9ng h\u1ECFi "v\u0129 m\xF4 \u0111ang thu\u1EADn l\u1EE3i hay b\u1EA5t l\u1EE3i?".',
    parameters: { type: "object", properties: { target: { type: "string", description: "M\xE3 ch\u1EC9 s\u1ED1, m\u1EB7c \u0111\u1ECBnh VNINDEX.", enum: targetIds }, asOf: ASOF }, required: [], additionalProperties: false }
  },
  {
    name: "macro_impact_lookup",
    description: 'Tra c\u1EE9u t\xE1c \u0111\u1ED9ng l\u1ECBch s\u1EED c\u1EE7a bi\u1EBFn v\u0129 m\xF4 l\xEAn ch\u1EC9 s\u1ED1 (h\u1EC7 s\u1ED1, th\u1ED1ng k\xEA t, q-value sau hi\u1EC7u ch\u1EC9nh ki\u1EC3m \u0111\u1ECBnh b\u1ED9i, \u0111\u1ED9 tr\u1EC5, \u0111\u1ED9 \u1ED5n \u0111\u1ECBnh). M\u1EB7c \u0111\u1ECBnh ch\u1EC9 tr\u1EA3 c\xE1c c\u1EB7p c\xF3 \xFD ngh\u0129a th\u1ED1ng k\xEA. D\xF9ng khi h\u1ECFi "l\u1EA1m ph\xE1t/l\xE3i su\u1EA5t/M2... \u1EA3nh h\u01B0\u1EDFng g\xEC t\u1EDBi VN30/Smallcap?".',
    parameters: {
      type: "object",
      properties: {
        factor: { type: "string", description: "M\xE3 bi\u1EBFn v\u0129 m\xF4.", enum: factorIds },
        target: { type: "string", description: "M\xE3 ch\u1EC9 s\u1ED1.", enum: targetIds },
        onlySignificant: { type: "boolean", description: "Ch\u1EC9 tr\u1EA3 c\u1EB7p c\xF3 \xFD ngh\u0129a th\u1ED1ng k\xEA (m\u1EB7c \u0111\u1ECBnh true)." },
        topN: { type: "number", description: "S\u1ED1 d\xF2ng t\u1ED1i \u0111a, 1..20, m\u1EB7c \u0111\u1ECBnh 8.", minimum: 1, maximum: 20 },
        asOf: ASOF
      },
      required: [],
      additionalProperties: false
    }
  },
  {
    name: "macro_scenario",
    description: 'M\xF4 ph\u1ECFng m\u1ED9t k\u1ECBch b\u1EA3n v\u0129 m\xF4 v\xE0 x\u1EBFp h\u1EA1ng ch\u1EC9 s\u1ED1 th\u1EAFng/thua sau N th\xE1ng, k\xE8m kho\u1EA3ng tin c\u1EADy 90%. Truy\u1EC1n scenarioId (k\u1ECBch b\u1EA3n c\xF3 s\u1EB5n) HO\u1EB6C shocks (c\xFA s\u1ED1c tu\u1EF3 ch\u1EC9nh). D\xF9ng khi h\u1ECFi "n\u1EBFu Fed gi\u1EA3m l\xE3i su\u1EA5t / VND m\u1EA5t gi\xE1 / si\u1EBFt t\xEDn d\u1EE5ng th\xEC sao?".',
    parameters: {
      type: "object",
      properties: {
        scenarioId: { type: "string", description: "K\u1ECBch b\u1EA3n c\xF3 s\u1EB5n.", enum: NAMED_SCENARIOS.map((s) => s.id) },
        shocks: { type: "array", description: "C\xFA s\u1ED1c tu\u1EF3 ch\u1EC9nh: [{factor, amount, unit}] v\u1EDBi unit 'pct' (% thay \u0111\u1ED5i c\u1EE7a bi\u1EBFn d\u1EA1ng m\u1EE9c nh\u01B0 M2, t\u1EF7 gi\xE1) ho\u1EB7c 'pp' (\u0111i\u1EC3m ph\u1EA7n tr\u0103m c\u1EE7a bi\u1EBFn d\u1EA1ng t\u1EF7 l\u1EC7 nh\u01B0 CPI, l\xE3i su\u1EA5t).", items: { type: "object" } },
        horizon: { type: "number", description: "T\u1EA7m nh\xECn t\xEDnh theo th\xE1ng, 1..12, m\u1EB7c \u0111\u1ECBnh 3.", minimum: 1, maximum: 12 },
        asOf: ASOF
      },
      required: [],
      additionalProperties: false
    }
  },
  {
    name: "macro_cell_detail",
    description: "Chi ti\u1EBFt m\u1ED9t c\u1EB7p bi\u1EBFn\u2013ch\u1EC9 s\u1ED1: h\u1EC7 s\u1ED1, sai s\u1ED1, kho\u1EA3ng tin c\u1EADy bootstrap v\xE0 \u0111\u1ED9 \u1ED5n \u0111\u1ECBnh theo th\u1EDDi gian. D\xF9ng khi ng\u01B0\u1EDDi d\xF9ng mu\u1ED1n ki\u1EC3m tra \u0111\u1ED9 tin c\u1EADy c\u1EE7a m\u1ED9t k\u1EBFt lu\u1EADn c\u1EE5 th\u1EC3.",
    parameters: {
      type: "object",
      properties: {
        factor: { type: "string", description: "M\xE3 bi\u1EBFn v\u0129 m\xF4.", enum: factorIds },
        target: { type: "string", description: "M\xE3 ch\u1EC9 s\u1ED1.", enum: targetIds },
        lag: { type: "number", description: "\u0110\u1ED9 tr\u1EC5 th\xE1ng 0..12; m\u1EB7c \u0111\u1ECBnh 1.", minimum: 0, maximum: 12 },
        asOf: ASOF
      },
      required: ["factor", "target"],
      additionalProperties: false
    }
  },
  {
    name: "macro_calendar_alerts",
    description: 'C\u1EA3nh b\xE1o v\u0129 m\xF4 \u0111ang hi\u1EC7u l\u1EF1c v\xE0 l\u1ECBch c\xF4ng b\u1ED1 s\u1ED1 li\u1EC7u s\u1EAFp t\u1EDBi (ng\xE0y c\xF4ng b\u1ED1 l\xE0 \u01AF\u1EDAC T\xCDNH). D\xF9ng khi h\u1ECFi "s\u1EAFp c\xF3 s\u1ED1 li\u1EC7u g\xEC?" ho\u1EB7c "c\xF3 g\xEC b\u1EA5t th\u01B0\u1EDDng kh\xF4ng?".',
    parameters: { type: "object", properties: { asOf: ASOF }, required: [], additionalProperties: false }
  },
  {
    name: "macro_report",
    description: "B\xE1o c\xE1o v\u0129 m\xF4 th\xE1ng \u0111\u1EA7y \u0111\u1EE7 d\u1EA1ng Markdown. Ch\u1EC9 g\u1ECDi khi ng\u01B0\u1EDDi d\xF9ng y\xEAu c\u1EA7u b\xE1o c\xE1o; n\u1ED9i dung d\xE0i.",
    parameters: { type: "object", properties: { asOf: ASOF }, required: [], additionalProperties: false }
  }
];
var toAnthropicTools = (specs = MACRO_TOOL_SPECS) => specs.map((s) => ({ name: s.name, description: s.description, input_schema: s.parameters }));
var MACRO_CHAT_SYSTEM_PROMPT = `B\u1EA1n c\xF3 c\xE1c c\xF4ng c\u1EE5 ph\xE2n t\xEDch v\u0129 m\xF4 (macro_*). Quy t\u1EAFc khi d\xF9ng:

1. S\u1ED1 li\u1EC7u: ch\u1EC9 n\xEAu con s\u1ED1 l\u1EA5y t\u1EEB k\u1EBFt qu\u1EA3 c\xF4ng c\u1EE5; kh\xF4ng t\u1EF1 suy ra hay l\xE0m tr\xF2n th\xE0nh k\u1EBFt lu\u1EADn m\u1EA1nh h\u01A1n. Kh\xF4ng g\u1ECDi c\xF4ng c\u1EE5 th\xEC kh\xF4ng n\xF3i v\u1EC1 \u0111\u1ED9 nh\u1EA1y v\u0129 m\xF4 c\u1EE5 th\u1EC3.
2. \xDD ngh\u0129a th\u1ED1ng k\xEA: ch\u1EC9 g\u1ECDi l\xE0 "c\xF3 t\xE1c \u0111\u1ED9ng" khi k\u1EBFt qu\u1EA3 ghi status l\xE0 stable ho\u1EB7c unstable/significant-unchecked k\xE8m ch\xFA th\xEDch. \xD4 "insignificant" ngh\u0129a l\xE0 CH\u01AFA \u0110\u1EE6 B\u1EB0NG CH\u1EE8NG, kh\xF4ng ph\u1EA3i "kh\xF4ng c\xF3 t\xE1c \u0111\u1ED9ng" v\xE0 c\u0169ng kh\xF4ng ph\u1EA3i "c\xF3 t\xE1c \u0111\u1ED9ng nh\u1ECF". Lu\xF4n n\xEAu \u0111\u1ED9 tr\u1EC5 (th\xE1ng) v\xE0 h\u01B0\u1EDBng.
3. \u0110\u1ED9 \u1ED5n \u0111\u1ECBnh: status "unstable" ph\u1EA3i \u0111\u01B0\u1EE3c n\xF3i r\xF5 l\xE0 kh\xF4ng \u1ED5n \u0111\u1ECBnh theo th\u1EDDi gian.
4. Nh\xE2n qu\u1EA3: \u0111\xE2y l\xE0 quan h\u1EC7 th\u1ED1ng k\xEA l\u1ECBch s\u1EED, kh\xF4ng ph\u1EA3i b\u1EB1ng ch\u1EE9ng nh\xE2n qu\u1EA3; kh\xF4ng h\u1EE9a h\u1EB9n t\u01B0\u01A1ng lai.
5. Quy\u1EBFt \u0111\u1ECBnh: ch\u1EC9 coi \u0111i\u1EC3m v\u0129 m\xF4 l\xE0 t\xEDn hi\u1EC7u c\xF3 th\u1EC3 d\xF9ng khi usableForDecisions = true. N\u1EBFu false, n\xF3i r\xF5 ch\u01B0a v\u01B0\u1EE3t ki\u1EC3m \u0111\u1ECBnh ngo\xE0i m\u1EABu v\xE0 kh\xF4ng \u0111\u01B0a khuy\u1EBFn ngh\u1ECB mua/b\xE1n d\u1EF1a tr\xEAn n\xF3.
6. K\u1ECBch b\u1EA3n: n\xEAu kho\u1EA3ng tin c\u1EADy; n\u1EBFu conclusive = false th\xEC n\xF3i "ch\u01B0a k\u1EBFt lu\u1EADn \u0111\u01B0\u1EE3c h\u01B0\u1EDBng", kh\xF4ng x\u1EBFp nh\u01B0 k\u1EBFt qu\u1EA3 ch\u1EAFc ch\u1EAFn.
7. Ng\xE0y c\xF4ng b\u1ED1 trong l\u1ECBch l\xE0 \u01B0\u1EDBc t\xEDnh; n\u1EBFu k\u1EBFt qu\u1EA3 c\xF3 tr\u01B0\u1EDDng notice (v\xED d\u1EE5 d\u1EEF li\u1EC7u m\xF4 ph\u1ECFng) th\xEC n\xEAu ngay \u0111\u1EA7u c\xE2u tr\u1EA3 l\u1EDDi.
8. L\u1ED7i c\xF4ng c\u1EE5: n\xF3i th\u1EADt l\xE0 kh\xF4ng l\u1EA5y \u0111\u01B0\u1EE3c d\u1EEF li\u1EC7u; kh\xF4ng b\u1ECBa s\u1ED1.
9. Tr\xECnh b\xE0y ng\u1EAFn g\u1ECDn b\u1EB1ng ti\u1EBFng Vi\u1EC7t, k\u1EBFt lu\u1EADn tr\u01B0\u1EDBc, r\u1ED3i 1-3 con s\u1ED1 quan tr\u1ECDng, r\u1ED3i l\u01B0u \xFD.`;
var NAMES = Object.fromEntries(VN_CATALOG.map((m) => [m.id, m.nameVi]));
var round = (v, d = 2) => Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : NaN;
function validateArgs(schema, args) {
  if (args === void 0 || args === null) args = {};
  if (typeof args !== "object" || Array.isArray(args)) return "Tham s\u1ED1 ph\u1EA3i l\xE0 m\u1ED9t \u0111\u1ED1i t\u01B0\u1EE3ng JSON.";
  const a = args;
  for (const k of Object.keys(a)) if (!(k in schema.properties)) return `Tham s\u1ED1 kh\xF4ng h\u1EE3p l\u1EC7: ${k}. Cho ph\xE9p: ${Object.keys(schema.properties).join(", ") || "(kh\xF4ng c\xF3)"}.`;
  for (const r of schema.required) if (a[r] === void 0) return `Thi\u1EBFu tham s\u1ED1 b\u1EAFt bu\u1ED9c: ${r}.`;
  for (const [k, p] of Object.entries(schema.properties)) {
    const v = a[k];
    if (v === void 0) continue;
    const ok = p.type === "array" ? Array.isArray(v) : typeof v === p.type;
    if (!ok) return `Tham s\u1ED1 ${k} ph\u1EA3i c\xF3 ki\u1EC3u ${p.type}.`;
    if (p.enum && !p.enum.includes(v)) return `Gi\xE1 tr\u1ECB ${k} = ${String(v)} kh\xF4ng h\u1EE3p l\u1EC7. Cho ph\xE9p: ${p.enum.join(", ")}.`;
    if (typeof v === "number") {
      if (!Number.isFinite(v)) return `Tham s\u1ED1 ${k} ph\u1EA3i l\xE0 s\u1ED1 h\u1EEFu h\u1EA1n.`;
      if (p.minimum !== void 0 && v < p.minimum) return `Tham s\u1ED1 ${k} ph\u1EA3i \u2265 ${p.minimum}.`;
      if (p.maximum !== void 0 && v > p.maximum) return `Tham s\u1ED1 ${k} ph\u1EA3i \u2264 ${p.maximum}.`;
    }
  }
  return null;
}
function createMacroChatTools(api) {
  const call = async (method, path, payload = {}) => {
    const r = await api.handle({ method, path: `/api/macro/${path}`, query: method === "GET" ? stringify(payload) : {}, body: method === "POST" ? payload : void 0 });
    return { status: r.status, body: r.body };
  };
  const stringify = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== void 0).map(([k, v]) => [k, String(v)]));
  const fail = (r) => ({ ok: false, error: String(r.body.error ?? `L\u1ED7i ${r.status}`) });
  const withAsOf = (a, extra = {}) => ({ ...extra, ...a.asOf ? { asOf: a.asOf } : {} });
  const handlers = {
    async macro_overview(a) {
      const target = a.target ?? "VNINDEX";
      const s = await call("POST", "score", withAsOf(a, { target }));
      if (s.status !== 200) return fail(s);
      const [reg, al] = await Promise.all([call("GET", "regime", withAsOf(a)), call("GET", "alerts", withAsOf(a))]);
      const t = s.body.thermometer;
      const guidance = [s.body.gateNote];
      if (!s.body.usableForDecisions) guidance.push("KH\xD4NG \u0111\u01B0a khuy\u1EBFn ngh\u1ECB mua/b\xE1n d\u1EF1a tr\xEAn \u0111i\u1EC3m v\u0129 m\xF4 n\xE0y.");
      return {
        ok: true,
        notice: s.body.notice,
        data: {
          target,
          targetName: NAMES[target],
          asOf: s.body.asOf,
          thermometer: t && { value: round(t.value), band: t.bandVi, period: t.period, topContributors: t.topContributors.map((c) => ({ factor: c.factor, name: NAMES[c.factor], contributionPctPerMonth: round(c.contribution) })) },
          usableForDecisions: s.body.usableForDecisions,
          backtest: s.body.backtest && { ic: round(s.body.backtest.ic), pValue: round(s.body.backtest.icP, 3), hitRate: round(s.body.backtest.hitRate, 3) },
          regime: reg.status === 200 ? { label: reg.body.current.label, probability: round(Math.max(...reg.body.current.probs), 2) } : null,
          alerts: al.status === 200 ? al.body.alerts.slice(0, 3).map((x) => ({ level: x.level, message: x.messageVi })) : []
        },
        guidance
      };
    },
    async macro_impact_lookup(a) {
      const r = await call("POST", "impact", withAsOf(a));
      if (r.status !== 200) return fail(r);
      const onlySig = a.onlySignificant !== false;
      const topN = Math.min(20, Math.max(1, Math.floor(a.topN ?? 8)));
      const all = r.body.best.filter((c) => (!a.factor || c.factor === a.factor) && (!a.target || c.target === a.target));
      const rows = all.filter((c) => !onlySig || c.significant).sort((x, y) => Math.abs(y.t) - Math.abs(x.t));
      const status = (c) => !c.significant ? "insignificant" : r.body.stability[`${c.factor}|${c.target}`] ? r.body.stability[`${c.factor}|${c.target}`].stable ? "stable" : "unstable" : "significant-unchecked";
      return {
        ok: true,
        notice: r.body.notice,
        data: {
          asOf: r.body.asOf,
          dataRange: [r.body.firstPeriod, r.body.lastPeriod],
          matched: all.length,
          significant: all.filter((c) => c.significant).length,
          shown: Math.min(rows.length, topN),
          rows: rows.slice(0, topN).map((c) => ({
            factor: c.factor,
            factorName: NAMES[c.factor],
            target: c.target,
            targetName: NAMES[c.target],
            direction: c.direction === "+" ? "t\u0103ng" : "gi\u1EA3m",
            beta: round(c.beta),
            t: round(c.t, 1),
            q: c.q < 1e-3 ? "<0.001" : round(c.q, 3),
            lagMonths: c.lag,
            status: status(c)
          }))
        },
        guidance: [
          "H\u1EC7 s\u1ED1 l\xE0 \u0111i\u1EC3m ph\u1EA7n tr\u0103m l\u1EE3i su\u1EA5t th\xE1ng c\u1EE7a ch\u1EC9 s\u1ED1 tr\xEAn m\u1ED7i \u0111\u01A1n v\u1ECB thay \u0111\u1ED5i c\u1EE7a bi\u1EBFn (xem \u0111\u01A1n v\u1ECB bi\u1EBFn trong danh m\u1EE5c); n\xEAu \u0111\u1ED9 tr\u1EC5.",
          'status "insignificant" = ch\u01B0a \u0111\u1EE7 b\u1EB1ng ch\u1EE9ng, kh\xF4ng ph\u1EA3i kh\xF4ng c\xF3 t\xE1c \u0111\u1ED9ng.',
          'status "unstable" = c\xF3 \xFD ngh\u0129a nh\u01B0ng kh\xF4ng \u1ED5n \u0111\u1ECBnh theo th\u1EDDi gian; ph\u1EA3i n\xF3i r\xF5.',
          ...rows.length === 0 ? ["Kh\xF4ng c\xF3 c\u1EB7p n\xE0o tho\u1EA3 \u0111i\u1EC1u ki\u1EC7n: n\xF3i th\u1EADt l\xE0 ch\u01B0a t\xECm th\u1EA5y b\u1EB1ng ch\u1EE9ng, \u0111\u1EEBng suy di\u1EC5n."] : []
        ]
      };
    },
    async macro_scenario(a) {
      if (!a.scenarioId && !(Array.isArray(a.shocks) && a.shocks.length)) return { ok: false, error: `C\u1EA7n scenarioId (${NAMED_SCENARIOS.map((s) => s.id).join(", ")}) ho\u1EB7c shocks.` };
      const body = withAsOf(a, { horizon: a.horizon ?? 3 });
      if (a.scenarioId) body.scenarioId = a.scenarioId;
      else body.shocks = a.shocks;
      const r = await call("POST", "scenario", body);
      if (r.status !== 200) return fail(r);
      return {
        ok: true,
        notice: r.body.notice,
        data: {
          scenario: r.body.scenario.nameVi,
          description: r.body.scenario.descriptionVi,
          horizonMonths: r.body.horizon,
          ranking: r.body.ranking.map((x) => ({ target: x.target, name: NAMES[x.target], estimatePct: round(x.est, 1), ciLowPct: round(x.lo, 1), ciHighPct: round(x.hi, 1), conclusive: x.significant })),
          warnings: r.body.warnings
        },
        guidance: [
          "\u01AF\u1EDBc t\xEDnh l\xE0 l\u1EE3i su\u1EA5t c\u1ED9ng d\u1ED3n sau N th\xE1ng, kho\u1EA3ng tin c\u1EADy 90%.",
          "conclusive = false ngh\u0129a l\xE0 kho\u1EA3ng tin c\u1EADy ch\u1EE9a 0: ch\u01B0a k\u1EBFt lu\u1EADn \u0111\u01B0\u1EE3c h\u01B0\u1EDBng, kh\xF4ng x\u1EBFp nh\u01B0 k\u1EBFt qu\u1EA3 ch\u1EAFc ch\u1EAFn.",
          "\u0110\xE2y l\xE0 suy di\u1EC5n t\u1EEB quan h\u1EC7 l\u1ECBch s\u1EED, kh\xF4ng ph\u1EA3i d\u1EF1 b\xE1o."
        ]
      };
    },
    async macro_cell_detail(a) {
      const r = await call("POST", "cell", withAsOf(a, { factor: a.factor, target: a.target, lag: a.lag ?? 1 }));
      if (r.status !== 200) return fail(r);
      const beta = r.body.rolling.beta;
      const sign = Math.sign(r.body.beta);
      const same = beta.filter((b) => Math.sign(b) === sign).length / Math.max(beta.length, 1);
      let flips = 0;
      for (let i = 1; i < beta.length; i++) if (Math.sign(beta[i]) !== Math.sign(beta[i - 1])) flips++;
      return {
        ok: true,
        notice: r.body.notice,
        data: {
          factor: a.factor,
          factorName: NAMES[a.factor],
          target: a.target,
          targetName: NAMES[a.target],
          lagMonths: r.body.lag,
          observations: r.body.nobs,
          beta: round(r.body.beta, 3),
          standardError: round(r.body.se, 3),
          t: round(r.body.t, 2),
          pValueUncorrected: round(r.body.p, 4),
          bootstrapCI95: [round(r.body.bootstrapCI[0]), round(r.body.bootstrapCI[1])],
          rolling48m: { windows: beta.length, shareSameSign: round(same, 2), signFlips: flips }
        },
        guidance: ["p-value \u1EDF \u0111\xE2y CH\u01AFA hi\u1EC7u ch\u1EC9nh ki\u1EC3m \u0111\u1ECBnh b\u1ED9i; d\xF9ng macro_impact_lookup \u0111\u1EC3 xem q-value.", "shareSameSign th\u1EA5p ho\u1EB7c signFlips cao ngh\u0129a l\xE0 t\xE1c \u0111\u1ED9ng kh\xF4ng \u1ED5n \u0111\u1ECBnh."]
      };
    },
    async macro_calendar_alerts(a) {
      const [c, al] = await Promise.all([call("GET", "calendar", withAsOf(a)), call("GET", "alerts", withAsOf(a))]);
      if (c.status !== 200) return fail(c);
      return {
        ok: true,
        notice: c.body.notice,
        data: {
          upcoming: c.body.releases.slice(0, 6).map((x) => ({ name: x.nameVi, period: x.period, expectedDate: x.expectedDate, status: x.status === "overdue" ? "ch\u1EADm so v\u1EDBi l\u1ECBch" : "s\u1EAFp t\u1EDBi", daysUntil: x.daysUntil })),
          alerts: al.status === 200 ? al.body.alerts.map((x) => ({ level: x.level, message: x.messageVi })) : []
        },
        guidance: ["Ng\xE0y c\xF4ng b\u1ED1 l\xE0 \u01AF\u1EDAC T\xCDNH; khuy\xEAn ng\u01B0\u1EDDi d\xF9ng \u0111\u1ED1i chi\u1EBFu l\u1ECBch ch\xEDnh th\u1EE9c c\u1EE7a c\u01A1 quan c\xF4ng b\u1ED1."]
      };
    },
    async macro_report(a) {
      const r = await call("GET", "report", withAsOf(a));
      if (r.status !== 200) return fail(r);
      return { ok: true, notice: r.body.notice, data: { markdown: r.body.markdown }, guidance: ['C\xF3 th\u1EC3 tr\xEDch c\xE1c ph\u1EA7n quan tr\u1ECDng; kh\xF4ng b\u1ECF ph\u1EA7n "Ph\u01B0\u01A1ng ph\xE1p v\xE0 gi\u1EDBi h\u1EA1n" khi chuy\u1EC3n ti\u1EBFp nguy\xEAn v\u0103n.'] };
    }
  };
  return {
    specs: MACRO_TOOL_SPECS,
    async run(name, args) {
      const spec = MACRO_TOOL_SPECS.find((s) => s.name === name);
      if (!spec) return { ok: false, error: `Kh\xF4ng c\xF3 c\xF4ng c\u1EE5 ${name}. C\xF4ng c\u1EE5 h\u1EE3p l\u1EC7: ${MACRO_TOOL_SPECS.map((s) => s.name).join(", ")}.` };
      const bad = validateArgs(spec.parameters, args);
      if (bad) return { ok: false, error: bad };
      try {
        return await handlers[name](args ?? {});
      } catch {
        return { ok: false, error: "L\u1ED7i n\u1ED9i b\u1ED9 khi ch\u1EA1y c\xF4ng c\u1EE5 v\u0129 m\xF4." };
      }
    }
  };
}

// src/macro-center/src/world-connectedness.ts
function fitVar(Y, p) {
  const T = Y.length;
  const K = Y[0].length;
  if (T - p < K * p + 10) throw new Error("fitVar: sample too short for this lag order");
  const X = [];
  for (let t = p; t < T; t++) {
    const row2 = [1];
    for (let l = 1; l <= p; l++) for (let j = 0; j < K; j++) row2.push(Y[t - l][j]);
    X.push(row2);
  }
  const A = Array.from({ length: p }, () => Array.from({ length: K }, () => new Array(K).fill(0)));
  const intercept = new Array(K).fill(0);
  const resid = Array.from({ length: X.length }, () => new Array(K).fill(0));
  for (let i = 0; i < K; i++) {
    const y = Y.slice(p).map((r) => r[i]);
    const res = olsFit(X, y, { hac: false });
    intercept[i] = res.beta[0];
    for (let l = 0; l < p; l++) for (let j = 0; j < K; j++) A[l][i][j] = res.beta[1 + l * K + j];
    res.residuals.forEach((e, t) => resid[t][i] = e);
  }
  const n = X.length;
  const dof = n - (K * p + 1);
  const Sigma = Array.from({ length: K }, () => new Array(K).fill(0));
  for (let a = 0; a < K; a++)
    for (let b = 0; b < K; b++) {
      let s = 0;
      for (let t = 0; t < n; t++) s += resid[t][a] * resid[t][b];
      Sigma[a][b] = s / dof;
    }
  return { K, p, nobs: n, A, intercept, Sigma };
}
function selectVarLag(Y, maxP = 5) {
  const K = Y[0].length;
  let best = 1;
  let bestBic = Infinity;
  for (let p = 1; p <= maxP; p++) {
    try {
      const sub = Y.slice(maxP - p);
      const f = fitVar(sub, p);
      const bic = logDet(f.Sigma) + K * K * p * Math.log(f.nobs) / f.nobs;
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
function logDet(M) {
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
var matMul2 = (A, B) => A.map((row2) => B[0].map((_, j) => row2.reduce((s, a, k) => s + a * B[k][j], 0)));
var eye = (K) => Array.from({ length: K }, (_, i) => Array.from({ length: K }, (_2, j) => i === j ? 1 : 0));
function maCoefficients(A, H) {
  const K = A[0].length;
  const Phi = [eye(K)];
  for (let h = 1; h < H; h++) {
    let acc = Array.from({ length: K }, () => new Array(K).fill(0));
    for (let l = 1; l <= Math.min(h, A.length); l++) {
      const term = matMul2(A[l - 1], Phi[h - l]);
      acc = acc.map((r, i) => r.map((v, j) => v + term[i][j]));
    }
    Phi.push(acc);
  }
  return Phi;
}
function generalizedFevd(fit, H) {
  const K = fit.K;
  const Phi = maCoefficients(fit.A, H);
  const S = fit.Sigma;
  const theta = Array.from({ length: K }, () => new Array(K).fill(0));
  for (let i = 0; i < K; i++) {
    let denom = 0;
    for (let h = 0; h < H; h++) {
      const pe = Phi[h][i];
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
  return theta.map((row2) => {
    const s = row2.reduce((a, b) => a + b, 0);
    return row2.map((v) => v / s);
  });
}
function summarizeConnectedness(theta, names) {
  const K = theta.length;
  const table2 = theta.map((r) => r.map((v) => v * 100));
  const from = table2.map((r, i) => r.reduce((s, v, j) => j === i ? s : s + v, 0));
  const to = names.map((_, j) => table2.reduce((s, r, i) => i === j ? s : s + r[j], 0));
  const net = to.map((v, j) => v - from[j]);
  const pairwiseNet = table2.map((r, i) => r.map((v, j) => i === j ? 0 : v - table2[j][i]));
  return { names, table: table2, from, to, net, pairwiseNet, total: from.reduce((a, b) => a + b, 0) / K };
}
function connectedness(Y, names, opts = {}) {
  const p = opts.p ?? selectVarLag(Y, 4);
  const H = opts.H ?? 10;
  const fit = fitVar(Y, p);
  return { ...summarizeConnectedness(generalizedFevd(fit, H), names), p, H };
}
function rollingConnectedness(Y, names, opts = {}) {
  const w = opts.window ?? 250;
  const step = opts.step ?? 20;
  const p = opts.p ?? 1;
  const H = opts.H ?? 10;
  const out = [];
  for (let end = w; end <= Y.length; end += step) {
    try {
      const c = summarizeConnectedness(generalizedFevd(fitVar(Y.slice(end - w, end), p), H), names);
      out.push({ end: end - 1, total: c.total, to: c.to, from: c.from });
    } catch {
    }
  }
  return out;
}
function tailDependence(x, y, q = 0.05, tail = "lower") {
  const n = Math.min(x.length, y.length);
  const sx = [...x.slice(0, n)].sort((a, b) => a - b);
  const sy = [...y.slice(0, n)].sort((a, b) => a - b);
  const k = Math.max(1, Math.floor(q * n));
  const cx = tail === "lower" ? sx[k - 1] : sx[n - k];
  const cy = tail === "lower" ? sy[k - 1] : sy[n - k];
  let nx = 0;
  let both = 0;
  for (let i = 0; i < n; i++) {
    const inX = tail === "lower" ? x[i] <= cx : x[i] >= cx;
    const inY = tail === "lower" ? y[i] <= cy : y[i] >= cy;
    if (inX) {
      nx++;
      if (inY) both++;
    }
  }
  return nx === 0 ? NaN : both / nx;
}

// src/macro-center/src/world-events.ts
var ICT_OFFSET_HOURS = 7;
function alignEventToSession(tsUtc, tradingDays, closeHourIct = 15) {
  const t = Date.parse(tsUtc);
  if (Number.isNaN(t)) return null;
  const local = new Date(t + ICT_OFFSET_HOURS * 36e5);
  const date = local.toISOString().slice(0, 10);
  const hour = local.getUTCHours() + local.getUTCMinutes() / 60;
  const idxSame = tradingDays.indexOf(date);
  if (idxSame >= 0 && hour < closeHourIct) return { index: idxSame, date, sameDay: true };
  const next = tradingDays.findIndex((d) => d > date);
  return next < 0 ? null : { index: next, date: tradingDays[next], sameDay: false };
}
function flagLimitDays(retPct, limitPct = 7, tolPct = 0.05) {
  return retPct.map((r) => Math.abs(r) >= limitPct - tolPct);
}
function eventStudy(ret, mkt, eventIdx, opts = {}) {
  const est = opts.est ?? { start: -250, end: -30 };
  const win = opts.window ?? { lo: -1, hi: 3 };
  const pathR = opts.path ?? { lo: -5, hi: 10 };
  const limitPct = opts.limitPct ?? 7;
  const e0 = eventIdx + est.start;
  const e1 = eventIdx + est.end;
  if (e0 < 0 || e1 >= eventIdx || eventIdx + Math.max(win.hi, pathR.hi) >= ret.length || ret.length !== mkt.length) return null;
  const X = [];
  const y = [];
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
  const ar = (t) => ret[t] - (alpha + beta * mkt[t]);
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
  const varCar = sigma2 * (L + L * L / n + sumX * sumX / smm);
  const se = Math.sqrt(varCar);
  const tstat = car / se;
  const path = [];
  let cum = 0;
  let sx = 0;
  for (let d = pathR.lo; d <= pathR.hi; d++) {
    const t = eventIdx + d;
    const a = ar(t);
    if (d >= win.lo) {
      cum += a;
      sx += mkt[t] - mbar;
      const l = d - win.lo + 1;
      path.push({ day: d, ar: a, car: cum, se: Math.sqrt(sigma2 * (l + l * l / n + sx * sx / smm)) });
    } else path.push({ day: d, ar: a, car: null, se: null });
  }
  return { alpha, beta, sigma: Math.sqrt(sigma2), nEst: n, car, varCar, se, t: tstat, p: studentTTwoSidedP(tstat, n - 2), path, limitDaysInWindow: limitDays };
}
function bmpTest(results) {
  const n = results.length;
  if (n < 3) return null;
  const sc = results.map((r) => r.car / Math.sqrt(r.varCar));
  const s = std(sc);
  if (!(s > 0)) return null;
  const t = mean(sc) * Math.sqrt(n) / s;
  return { n, caar: mean(results.map((r) => r.car)), t, p: studentTTwoSidedP(t, n - 1) };
}

// src/macro-center/src/world-shrinkage.ts
function dlTau2(items) {
  const k = items.length;
  if (k < 2) return 0;
  const w = items.map((i) => 1 / (i.se * i.se));
  const sw = w.reduce((a, b) => a + b, 0);
  const muFe = items.reduce((s, i, j) => s + w[j] * i.beta, 0) / sw;
  const Q = items.reduce((s, i, j) => s + w[j] * (i.beta - muFe) ** 2, 0);
  const C = sw - w.reduce((s, x) => s + x * x, 0) / sw;
  return C > 0 ? Math.max(0, (Q - (k - 1)) / C) : 0;
}
function shrinkGroup(items, opts = {}) {
  if (items.length === 0) return { mu: opts.priorMu ?? 0, muSe: Infinity, tau2: opts.tau2 ?? 0, items: [] };
  const tau2 = opts.tau2 ?? dlTau2(items);
  const w = items.map((i) => 1 / (tau2 + i.se * i.se));
  const sw = w.reduce((a, b) => a + b, 0);
  const mu = opts.priorMu ?? items.reduce((s, i, j) => s + w[j] * i.beta, 0) / sw;
  const muVar = 1 / sw;
  return {
    mu,
    muSe: Math.sqrt(muVar),
    tau2,
    items: items.map((i) => {
      const v = i.se * i.se;
      const B = tau2 / (tau2 + v);
      return { ...i, shrunk: mu + B * (i.beta - mu), weight: B, postSd: Math.sqrt(B * v + (1 - B) ** 2 * muVar) };
    })
  };
}
function hierarchicalShrink(groups) {
  const first = {};
  for (const [g, items] of Object.entries(groups)) first[g] = shrinkGroup(items);
  const identified = Object.entries(groups).filter(([, v]) => v.length >= 3).map(([g]) => first[g].tau2);
  const pooled = identified.length ? identified.reduce((a, b) => a + b, 0) / identified.length : 0;
  const sectorMeans = Object.entries(first).filter(([, r]) => r.items.length > 0).map(([g, r]) => ({ id: g, beta: r.mu, se: Math.max(r.muSe, 1e-6) }));
  const top = shrinkGroup(sectorMeans);
  const priorOf = new Map(top.items.map((i) => [i.id, i.shrunk]));
  const out = {};
  for (const [g, items] of Object.entries(groups)) {
    const tau2 = items.length >= 3 ? first[g].tau2 : pooled;
    const priorMu = priorOf.get(g) ?? top.mu;
    out[g] = { ...shrinkGroup(items, { tau2, priorMu }), priorMu };
  }
  return { globalMu: top.mu, globalTau2: top.tau2, groups: out };
}

// src/macro-center/src/world-evidence.ts
function assignTier(i) {
  const alpha = i.alpha ?? 0.05;
  if (i.isHypothesis) return { tier: "C", reasonVi: "L\xE0 gi\u1EA3 thuy\u1EBFt (c\u01A1 ch\u1EBF kinh t\u1EBF, \u0111\u1ED3 th\u1ECB ho\u1EB7c tin do AI tr\xEDch); ch\u01B0a \u0111\u01B0\u1EE3c s\u1ED1 li\u1EC7u x\xE1c nh\u1EADn." };
  if (!(i.q < alpha)) return { tier: "C", reasonVi: "Ch\u01B0a v\u01B0\u1EE3t hi\u1EC7u ch\u1EC9nh ki\u1EC3m \u0111\u1ECBnh b\u1ED9i; ch\u01B0a \u0111\u1EE7 b\u1EB1ng ch\u1EE9ng." };
  if (i.stable === true && i.oosPass === true) return { tier: "A", reasonVi: "V\u01B0\u1EE3t hi\u1EC7u ch\u1EC9nh ki\u1EC3m \u0111\u1ECBnh b\u1ED9i, \u1ED5n \u0111\u1ECBnh theo th\u1EDDi gian v\xE0 v\u01B0\u1EE3t ki\u1EC3m \u0111\u1ECBnh ngo\xE0i m\u1EABu." };
  const gaps = [];
  if (i.stable !== true) gaps.push(i.stable === false ? "kh\xF4ng \u1ED5n \u0111\u1ECBnh theo th\u1EDDi gian" : "ch\u01B0a ki\u1EC3m tra \u0111\u1ED9 \u1ED5n \u0111\u1ECBnh");
  if (i.oosPass !== true) gaps.push(i.oosPass === false ? "ch\u01B0a v\u01B0\u1EE3t ki\u1EC3m \u0111\u1ECBnh ngo\xE0i m\u1EABu" : "ch\u01B0a ki\u1EC3m tra ngo\xE0i m\u1EABu");
  return { tier: "B", reasonVi: `C\xF3 \xFD ngh\u0129a th\u1ED1ng k\xEA sau hi\u1EC7u ch\u1EC9nh nh\u01B0ng ${gaps.join(" v\xE0 ")}.` };
}
function stockTier(sector, ownSignificant) {
  if (sector === "C") return "C";
  if (sector === "A") return ownSignificant ? "A" : "B";
  return ownSignificant ? "B" : "C";
}
function summarizeTiers(tiers) {
  const out = { A: 0, B: 0, C: 0 };
  for (const t of tiers) out[t]++;
  return out;
}

// src/macro-center/src/world-confirmatory.ts
var WORLD_PREREG_VERSION = "W3-v1 (2026-10-16)";
var WORLD_PREREG_LAG = 1;
var WORLD_PREREG_PAIRS = [
  { id: "P1", factor: "OIL", sector: "S_OIL", sign: 1, mechanismVi: "Gi\xE1 d\u1EA7u \u2192 doanh thu d\u1EA7u kh\xED" },
  { id: "P2", factor: "STEEL", sector: "S_STEEL", sign: 1, mechanismVi: "Gi\xE1 th\xE9p HRC \u2192 gi\xE1 b\xE1n th\xE9p" },
  { id: "P3", factor: "FED", sector: "S_RE", sign: -1, mechanismVi: "L\xE3i su\u1EA5t Fed \u2192 chi ph\xED v\u1ED1n B\u0110S" },
  { id: "P4", factor: "FED", sector: "S_BANK", sign: -1, mechanismVi: "L\xE3i su\u1EA5t Fed \u2192 d\xF2ng v\u1ED1n / \xE1p l\u1EF1c l\xE3i su\u1EA5t VN" },
  { id: "P5", factor: "DXY", sector: "S_SEC", sign: -1, mechanismVi: "USD m\u1EA1nh \u2192 kh\u1ED1i ngo\u1EA1i r\xFAt, thanh kho\u1EA3n gi\u1EA3m" },
  { id: "P6", factor: "VIX", sector: "S_SEC", sign: -1, mechanismVi: "Ng\u1EA1i r\u1EE7i ro to\xE0n c\u1EA7u \u2192 thanh kho\u1EA3n / m\xF4i gi\u1EDBi" },
  { id: "P7", factor: "SEMI", sector: "S_TECH", sign: 1, mechanismVi: "Chu k\u1EF3 b\xE1n d\u1EABn \u2192 c\xF4ng ngh\u1EC7" },
  { id: "P8", factor: "CNY", sector: "S_STEEL", sign: -1, mechanismVi: "CNY y\u1EBFu \u2192 th\xE9p Trung Qu\u1ED1c r\u1EBB, c\u1EA1nh tranh nh\u1EADp kh\u1EA9u" },
  { id: "P9", factor: "TARIFF", sector: "S_TEXTILE", sign: -1, mechanismVi: "B\u1EA5t \u0111\u1ECBnh thu\u1EBF quan \u2192 d\u1EC7t may xu\u1EA5t kh\u1EA9u" },
  { id: "P10", factor: "TARIFF", sector: "S_SEAFOOD", sign: -1, mechanismVi: "B\u1EA5t \u0111\u1ECBnh thu\u1EBF quan \u2192 thu\u1EF7 s\u1EA3n xu\u1EA5t kh\u1EA9u" },
  { id: "P11", factor: "PMI_US", sector: "S_TEXTILE", sign: 1, mechanismVi: "C\u1EA7u s\u1EA3n xu\u1EA5t M\u1EF9 (proxy Philly Fed) \u2192 d\u1EC7t may" },
  { id: "P12", factor: "PMI_US", sector: "S_PORT", sign: 1, mechanismVi: "C\u1EA7u s\u1EA3n xu\u1EA5t M\u1EF9 (proxy Philly Fed) \u2192 c\u1EA3ng / logistics" }
];
var isFin = (v) => typeof v === "number" && Number.isFinite(v);
function fitPair(y, x, lag) {
  const common = Math.max(lag, 2);
  let best = 0, bestBic = Infinity;
  for (let p = 0; p <= 2; p++) {
    const d = buildDesign({ y, xs: [x], lag, arLags: p, start: common });
    if (d.X.length < d.names.length + 12) continue;
    try {
      const r = olsFit(d.X, d.y, { hac: false });
      if (r.bic < bestBic) {
        bestBic = r.bic;
        best = p;
      }
    } catch {
    }
  }
  const design = buildDesign({ y, xs: [x], lag, arLags: best });
  if (design.X.length < design.names.length + 12) return null;
  try {
    return { res: olsFit(design.X, design.y, {}), arLags: best, design };
  } catch {
    return null;
  }
}
function runConfirmatory(prep, opts = {}) {
  const pairs = opts.pairs ?? WORLD_PREREG_PAIRS;
  const lag = opts.lag ?? WORLD_PREREG_LAG, alpha = opts.alpha ?? 0.05;
  const fits = pairs.map((p) => {
    const y = prep.targets[p.sector], x = prep.factors[p.factor];
    if (!y || !x) return null;
    return fitPair(y, x, lag);
  });
  const pOne = fits.map((f, i) => {
    if (!f) return 1;
    const t = f.res.tHac[1], df = Math.max(1, f.res.n - f.res.k);
    return isFin(t) ? 1 - studentTCdf(pairs[i].sign * t, df) : 1;
  });
  const q = adjustPValues(pOne, "by");
  const rows = pairs.map((p, i) => {
    const f = fits[i];
    if (!f) return { ...p, available: false, beta: null, t: null, pOneSided: 1, q: q[i], nobs: null, arLags: null, signOk: null, stable: null, shareSameSign: null, oosPass: null, oosIc: null, oosHitRate: null, oosReasons: [], confirmed: false, reasonVi: "Thi\u1EBFu d\u1EEF li\u1EC7u (< 60 th\xE1ng ho\u1EB7c kh\xF4ng c\xF3 ngu\u1ED3n) \u2014 t\xEDnh p = 1, v\u1EABn trong h\u1ECD 12 c\u1EB7p." };
    const beta = f.res.beta[1], t = f.res.tHac[1];
    const signOk = Math.sign(beta) === p.sign;
    let stab = null;
    try {
      stab = summarizeStability(rollingBeta(f.design, 1, opts.window ?? 48), beta);
    } catch {
      stab = null;
    }
    const bt = backtestMacroScore({ y: prep.targets[p.sector], factors: { [p.factor]: prep.factors[p.factor] }, lag, B: opts.B ?? 499, seed: opts.seed ?? 3 });
    const oosPass = bt ? bt.gate.pass : false;
    const confirmed = q[i] < alpha && signOk && stab?.stable === true && oosPass;
    const gaps = [];
    if (!(q[i] < alpha)) gaps.push(`q = ${q[i].toFixed(3)} \u2265 ${alpha}`);
    if (!signOk) gaps.push("ng\u01B0\u1EE3c chi\u1EC1u k\u1EF3 v\u1ECDng");
    if (stab?.stable !== true) gaps.push("kh\xF4ng \u1ED5n \u0111\u1ECBnh theo th\u1EDDi gian");
    if (!oosPass) gaps.push("kh\xF4ng \u0111\u1EA1t ngo\xE0i m\u1EABu");
    return {
      ...p,
      available: true,
      beta,
      t,
      pOneSided: pOne[i],
      q: q[i],
      nobs: f.res.n,
      arLags: f.arLags,
      signOk,
      stable: stab ? stab.stable : null,
      shareSameSign: stab ? stab.shareSameSign : null,
      oosPass,
      oosIc: bt ? bt.ic : null,
      oosHitRate: bt ? bt.hitRate : null,
      oosReasons: bt ? bt.gate.reasons : ["Kh\xF4ng \u0111\u1EE7 \u0111i\u1EC3m ngo\xE0i m\u1EABu."],
      confirmed,
      reasonVi: confirmed ? "\u0110\u1EA1t b\u1EADc x\xE1c nh\u1EADn A: q < 0,05, \u0111\xFAng chi\u1EC1u, \u1ED5n \u0111\u1ECBnh v\xE0 \u0111\u1EA1t ngo\xE0i m\u1EABu." : `Ch\u01B0a x\xE1c nh\u1EADn: ${gaps.join("; ")}.`
    };
  });
  return { version: WORLD_PREREG_VERSION, lag, family: pairs.length, rows, confirmed: rows.filter((r) => r.confirmed).length };
}

// src/macro-center/src/world-transmission.ts
function channelExposure(x) {
  const rev = x.revenueByRegion;
  const foreign = Object.entries(rev).filter(([r]) => r !== "VN").reduce((s, [, v]) => s + (v ?? 0), 0) / 100;
  return {
    commodity: x.commodityCostShare,
    fx_rates: x.fxRevenueShare - x.fxDebtShare,
    capital_flow: x.foreignOwnership ?? 0,
    export_demand: foreign,
    risk_sentiment: x.foreignOwnership ?? 0,
    policy_trade: (rev.US ?? 0) / 100
  };
}

// src/macro-center/src/world-types.ts
var CHANNEL_NAMES_VI = {
  commodity: "H\xE0ng ho\xE1",
  fx_rates: "T\u1EF7 gi\xE1, l\xE3i su\u1EA5t",
  capital_flow: "D\xF2ng v\u1ED1n",
  export_demand: "C\u1EA7u xu\u1EA5t kh\u1EA9u",
  risk_sentiment: "T\xE2m l\xFD r\u1EE7i ro",
  policy_trade: "Ch\xEDnh s\xE1ch th\u01B0\u01A1ng m\u1EA1i"
};
var TIER_MEANING_VI = {
  A: "V\u01B0\u1EE3t hi\u1EC7u ch\u1EC9nh ki\u1EC3m \u0111\u1ECBnh b\u1ED9i, \u1ED5n \u0111\u1ECBnh theo th\u1EDDi gian v\xE0 v\u01B0\u1EE3t ki\u1EC3m \u0111\u1ECBnh ngo\xE0i m\u1EABu",
  B: "C\xF3 \xFD ngh\u0129a th\u1ED1ng k\xEA trong m\u1EABu sau hi\u1EC7u ch\u1EC9nh ki\u1EC3m \u0111\u1ECBnh b\u1ED9i",
  C: "Gi\u1EA3 thuy\u1EBFt ho\u1EB7c ch\u01B0a \u0111\u1EE7 b\u1EB1ng ch\u1EE9ng"
};
var WORLD_EXTRA_FACTORS = [
  { id: "CNY", nameVi: "T\u1EF7 gi\xE1 USD/CNY", role: "factor", kind: "level", unit: "CNY", source: "th\u1ECB tr\u01B0\u1EDDng", pubLagMonths: 0, typicalReleaseDay: 1, group: "global" },
  { id: "STEEL", nameVi: "Gi\xE1 th\xE9p th\u1EBF gi\u1EDBi", role: "factor", kind: "level", unit: "USD/t\u1EA5n", source: "th\u1ECB tr\u01B0\u1EDDng", pubLagMonths: 0, typicalReleaseDay: 1, group: "global" },
  { id: "CONTAINER", nameVi: "C\u01B0\u1EDBc container", role: "factor", kind: "level", unit: "ch\u1EC9 s\u1ED1", source: "th\u1ECB tr\u01B0\u1EDDng", pubLagMonths: 0, typicalReleaseDay: 1, group: "global" },
  { id: "PMI_CN", nameVi: "PMI s\u1EA3n xu\u1EA5t Trung Qu\u1ED1c", role: "factor", kind: "rate", unit: "\u0111i\u1EC3m", source: "ngu\u1ED3n ch\xEDnh th\u1EE9c", pubLagMonths: 1, typicalReleaseDay: 1, group: "global" },
  { id: "PMI_US", nameVi: "PMI s\u1EA3n xu\u1EA5t M\u1EF9", role: "factor", kind: "rate", unit: "\u0111i\u1EC3m", source: "ngu\u1ED3n ch\xEDnh th\u1EE9c", pubLagMonths: 1, typicalReleaseDay: 1, group: "global" },
  { id: "SEMI", nameVi: "Chu k\u1EF3 b\xE1n d\u1EABn", role: "factor", kind: "level", unit: "ch\u1EC9 s\u1ED1", source: "th\u1ECB tr\u01B0\u1EDDng", pubLagMonths: 0, typicalReleaseDay: 1, group: "global" },
  { id: "VIX", nameVi: "VIX (r\u1EE7i ro to\xE0n c\u1EA7u)", role: "factor", kind: "level", unit: "\u0111i\u1EC3m", source: "th\u1ECB tr\u01B0\u1EDDng", pubLagMonths: 0, typicalReleaseDay: 1, group: "global" },
  { id: "EM_FLOWS", nameVi: "D\xF2ng v\u1ED1n th\u1ECB tr\u01B0\u1EDDng m\u1EDBi n\u1ED5i", role: "factor", kind: "rate", unit: "t\u1EF7 USD", source: "t\u1ED5 ch\u1EE9c t\xE0i ch\xEDnh qu\u1ED1c t\u1EBF", pubLagMonths: 1, typicalReleaseDay: 10, group: "global" },
  { id: "TARIFF", nameVi: "B\u1EA5t \u0111\u1ECBnh ch\xEDnh s\xE1ch th\u01B0\u01A1ng m\u1EA1i", role: "factor", kind: "level", unit: "ch\u1EC9 s\u1ED1", source: "ch\u1EC9 s\u1ED1 b\u1EA5t \u0111\u1ECBnh ch\xEDnh s\xE1ch", pubLagMonths: 0, typicalReleaseDay: 1, group: "global" },
  { id: "MSCI_EM", nameVi: "Ch\u1EC9 s\u1ED1 th\u1ECB tr\u01B0\u1EDDng m\u1EDBi n\u1ED5i", role: "factor", kind: "level", unit: "\u0111i\u1EC3m", source: "th\u1ECB tr\u01B0\u1EDDng", pubLagMonths: 0, typicalReleaseDay: 1, group: "global" }
];
var WORLD_FACTOR_INFO = {
  FED: { region: "US", channel: "fx_rates" },
  DXY: { region: "US", channel: "fx_rates" },
  OIL: { region: "GLOBAL", channel: "commodity" },
  CNY: { region: "CN", channel: "fx_rates" },
  STEEL: { region: "CN", channel: "commodity" },
  CONTAINER: { region: "GLOBAL", channel: "export_demand" },
  PMI_CN: { region: "CN", channel: "export_demand" },
  PMI_US: { region: "US", channel: "export_demand" },
  SEMI: { region: "GLOBAL", channel: "export_demand" },
  VIX: { region: "US", channel: "risk_sentiment" },
  EM_FLOWS: { region: "GLOBAL", channel: "capital_flow" },
  TARIFF: { region: "US", channel: "policy_trade" },
  MSCI_EM: { region: "GLOBAL", channel: "capital_flow" }
};
var WORLD_FACTOR_IDS = Object.keys(WORLD_FACTOR_INFO);
var VN_SECTORS = [
  { id: "S_BANK", nameVi: "Ng\xE2n h\xE0ng" },
  { id: "S_SEC", nameVi: "Ch\u1EE9ng kho\xE1n" },
  { id: "S_RE", nameVi: "B\u1EA5t \u0111\u1ED9ng s\u1EA3n" },
  { id: "S_STEEL", nameVi: "Th\xE9p" },
  { id: "S_OIL", nameVi: "D\u1EA7u kh\xED" },
  { id: "S_SEAFOOD", nameVi: "Thu\u1EF7 s\u1EA3n" },
  { id: "S_TEXTILE", nameVi: "D\u1EC7t may" },
  { id: "S_PORT", nameVi: "C\u1EA3ng v\xE0 logistics" },
  { id: "S_TECH", nameVi: "C\xF4ng ngh\u1EC7" },
  { id: "S_POWER", nameVi: "\u0110i\u1EC7n" }
];
var SECTOR_TARGETS = VN_SECTORS.map((s) => ({
  id: s.id,
  nameVi: s.nameVi,
  role: "target",
  kind: "index",
  unit: "\u0111i\u1EC3m",
  source: "HOSE",
  pubLagMonths: 0,
  typicalReleaseDay: 1,
  group: "market"
}));
var WORLD_MARKETS = [
  { id: "US", nameVi: "M\u1EF9" },
  { id: "CN", nameVi: "Trung Qu\u1ED1c" },
  { id: "JP", nameVi: "Nh\u1EADt" },
  { id: "KR", nameVi: "H\xE0n Qu\u1ED1c" },
  { id: "TH", nameVi: "Th\xE1i Lan" },
  { id: "VN", nameVi: "Vi\u1EC7t Nam" }
];
var EVENT_TYPES = ["monetary_policy", "trade_policy", "macro_release", "commodity_shock", "geopolitical", "index_reclassification", "other"];
var isIso = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?Z$/.test(s) && !Number.isNaN(Date.parse(s));
var isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
function validateWorldEvent(e) {
  if (!isObj(e)) return ["S\u1EF1 ki\u1EC7n ph\u1EA3i l\xE0 m\u1ED9t \u0111\u1ED1i t\u01B0\u1EE3ng."];
  const errs = [];
  if (typeof e.id !== "string" || !e.id.trim()) errs.push("Thi\u1EBFu id.");
  if (e.kind !== "scheduled" && e.kind !== "surprise") errs.push("kind ph\u1EA3i l\xE0 'scheduled' ho\u1EB7c 'surprise'.");
  if (!EVENT_TYPES.includes(e.type)) errs.push(`type kh\xF4ng h\u1EE3p l\u1EC7; cho ph\xE9p: ${EVENT_TYPES.join(", ")}.`);
  if (typeof e.titleVi !== "string" || !e.titleVi.trim()) errs.push("Thi\u1EBFu ti\xEAu \u0111\u1EC1.");
  if (!isIso(e.tsUtc)) errs.push("tsUtc ph\u1EA3i l\xE0 th\u1EDDi \u0111i\u1EC3m UTC d\u1EA1ng ISO 8601 k\u1EBFt th\xFAc b\u1EB1ng Z.");
  if (!Array.isArray(e.sectorsHint) || !e.sectorsHint.every((s) => VN_SECTORS.some((v) => v.id === s))) errs.push("sectorsHint ph\u1EA3i l\xE0 danh s\xE1ch m\xE3 ng\xE0nh h\u1EE3p l\u1EC7.");
  if (![-1, 0, 1].includes(e.polarityHint)) errs.push("polarityHint ph\u1EA3i l\xE0 -1, 0 ho\u1EB7c 1.");
  if (!isObj(e.source) || typeof e.source.name !== "string" || !e.source.name) errs.push("Thi\u1EBFu ngu\u1ED3n.");
  if (e.extraction !== void 0) {
    const x = e.extraction;
    if (!isObj(x) || x.method !== "manual" && x.method !== "llm" || typeof x.confidence !== "number" || x.confidence < 0 || x.confidence > 1 || typeof x.reviewed !== "boolean")
      errs.push("extraction kh\xF4ng h\u1EE3p l\u1EC7 (method, confidence 0..1, reviewed).");
    else if (x.method === "llm" && x.confidence < 0.6 && x.reviewed !== true) errs.push("S\u1EF1 ki\u1EC7n do AI tr\xEDch v\u1EDBi \u0111\u1ED9 tin c\u1EADy d\u01B0\u1EDBi 0,6 ph\u1EA3i \u0111\u01B0\u1EE3c ng\u01B0\u1EDDi ki\u1EC3m duy\u1EC7t tr\u01B0\u1EDBc khi \u0111o.");
  }
  return errs;
}

// src/macro-center/src/world-api.ts
var WORLD_SCENARIOS = [
  { id: "tariff-up", nameVi: "Thu\u1EBF quan M\u1EF9 t\u0103ng", descriptionVi: "B\u1EA5t \u0111\u1ECBnh ch\xEDnh s\xE1ch th\u01B0\u01A1ng m\u1EA1i t\u0103ng 1,5 \u0111\u1ED9 l\u1EC7ch chu\u1EA9n.", shocks: [{ factor: "TARIFF", sigma: 1.5 }] },
  { id: "usd-strong", nameVi: "USD m\u1EA1nh l\xEAn", descriptionVi: "Ch\u1EC9 s\u1ED1 USD t\u0103ng 1 \u0111\u1ED9 l\u1EC7ch chu\u1EA9n.", shocks: [{ factor: "DXY", sigma: 1 }] },
  { id: "oil-spike", nameVi: "Gi\xE1 d\u1EA7u t\u0103ng m\u1EA1nh", descriptionVi: "Gi\xE1 d\u1EA7u t\u0103ng 2 \u0111\u1ED9 l\u1EC7ch chu\u1EA9n.", shocks: [{ factor: "OIL", sigma: 2 }] },
  { id: "fed-cut", nameVi: "Fed gi\u1EA3m l\xE3i su\u1EA5t", descriptionVi: "L\xE3i su\u1EA5t Fed gi\u1EA3m 1 \u0111\u1ED9 l\u1EC7ch chu\u1EA9n, USD y\u1EBFu \u0111i 0,5.", shocks: [{ factor: "FED", sigma: -1 }, { factor: "DXY", sigma: -0.5 }] },
  { id: "china-recovery", nameVi: "Trung Qu\u1ED1c ph\u1EE5c h\u1ED3i", descriptionVi: "PMI Trung Qu\u1ED1c t\u0103ng 1,5 v\xE0 gi\xE1 th\xE9p t\u0103ng 1 \u0111\u1ED9 l\u1EC7ch chu\u1EA9n.", shocks: [{ factor: "PMI_CN", sigma: 1.5 }, { factor: "STEEL", sigma: 1 }] },
  { id: "risk-off", nameVi: "Tr\xE1nh r\u1EE7i ro to\xE0n c\u1EA7u", descriptionVi: "VIX t\u0103ng 2 v\xE0 d\xF2ng v\u1ED1n th\u1ECB tr\u01B0\u1EDDng m\u1EDBi n\u1ED5i gi\u1EA3m 1,5 \u0111\u1ED9 l\u1EC7ch chu\u1EA9n.", shocks: [{ factor: "VIX", sigma: 2 }, { factor: "EM_FLOWS", sigma: -1.5 }] }
];
var ApiError2 = class extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
};
function createWorldApi(deps) {
  const { world, store, catalog } = deps;
  const today = deps.today ?? (() => (/* @__PURE__ */ new Date()).toISOString().slice(0, 10));
  const macro = createMacroApi({ store, catalog, today, notice: deps.notice });
  const nameOf = Object.fromEntries(catalog.map((m) => [m.id, m.nameVi]));
  const sectorName = Object.fromEntries(VN_SECTORS.map((s) => [s.id, s.nameVi]));
  const cache = /* @__PURE__ */ new Map();
  const memo = (key, f) => {
    const k = `${store.dataVersion()}|${key}`;
    if (!cache.has(k)) cache.set(k, f());
    return cache.get(k);
  };
  const asOfOf = (v) => {
    const s = typeof v === "string" && v ? v : today();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new ApiError2(400, "asOf ph\u1EA3i c\xF3 d\u1EA1ng YYYY-MM-DD.");
    return s;
  };
  const intIn = (v, name, lo, hi, dflt) => {
    if (v === void 0 || v === null || v === "") return dflt;
    const n = Number(v);
    if (!Number.isInteger(n) || n < lo || n > hi) throw new ApiError2(400, `${name} ph\u1EA3i l\xE0 s\u1ED1 nguy\xEAn trong [${lo}, ${hi}].`);
    return n;
  };
  const monthly = (asOf) => memo(`monthly|${asOf}`, () => {
    const factors = WORLD_FACTOR_IDS.filter((id) => store.getSeries(id, asOf).length >= 60);
    const targets = VN_SECTORS.map((s) => s.id).filter((id) => store.getSeries(id, asOf).length >= 60);
    if (!factors.length || !targets.length) throw new ApiError2(422, "Ch\u01B0a \u0111\u1EE7 d\u1EEF li\u1EC7u th\xE1ng (c\u1EA7n \xEDt nh\u1EA5t 60 th\xE1ng) cho y\u1EBFu t\u1ED1 th\u1EBF gi\u1EDBi v\xE0 ng\xE0nh.");
    const ds = buildDataset(store, [...factors, ...targets], asOf);
    if (ds.dates.length < 60) throw new ApiError2(422, "S\u1ED1 th\xE1ng chung gi\u1EEFa c\xE1c chu\u1ED7i d\u01B0\u1EDBi 60.");
    const prep = prepareStationary({ dates: ds.dates, factors: toMacroSeries(ds, catalog, factors), targets: toMacroSeries(ds, catalog, targets) });
    return { factors, targets, ds, prep };
  });
  const matrix = (asOf, maxLag) => memo(`matrix|${asOf}|${maxLag}`, () => {
    const m = monthly(asOf);
    const r = macro.handle({ method: "POST", path: "/api/macro/impact", query: {}, body: { asOf, factors: m.factors, targets: m.targets, maxLag } });
    return r.then((resp) => {
      if (resp.status !== 200) throw new ApiError2(resp.status, String(resp.body.error ?? "L\u1ED7i ma tr\u1EADn"));
      const b = resp.body;
      const cells = b.best.map((c) => {
        const key = `${c.factor}|${c.target}`;
        const st = b.stability[key];
        let oosPass = null;
        if (c.q < 0.05) {
          oosPass = memo(`oos|${asOf}|${key}|${c.lag}`, () => {
            const bt = backtestMacroScore({ y: m.prep.targets[c.target], factors: { [c.factor]: m.prep.factors[c.factor] }, lag: Math.max(1, c.lag), B: 149, seed: 3 });
            return bt ? bt.gate.pass : false;
          });
        }
        const { tier, reasonVi } = assignTier({ q: c.q, stable: st ? st.stable : null, oosPass });
        return { factor: c.factor, sector: c.target, direction: c.direction, beta: c.beta, t: c.t, q: c.q, lag: c.lag, tier, reasonVi, stable: st ? st.stable : null, oosPass };
      });
      return {
        asOf,
        firstPeriod: b.firstPeriod,
        lastPeriod: b.lastPeriod,
        notice: b.notice,
        factors: m.factors.map((id) => ({ id, nameVi: nameOf[id], ...WORLD_FACTOR_INFO[id], channelVi: CHANNEL_NAMES_VI[WORLD_FACTOR_INFO[id].channel] })),
        sectors: m.targets.map((id) => ({ id, nameVi: sectorName[id] })),
        cells,
        counts: summarizeTiers(cells.map((c) => c.tier)),
        tierMeaning: TIER_MEANING_VI,
        warnings: b.warnings
      };
    });
  });
  const confirmatory = (asOf) => memo(`confirmatory|${asOf}`, () => {
    const m = monthly(asOf);
    const r = runConfirmatory(m.prep);
    return {
      asOf,
      firstPeriod: m.ds.dates[0],
      lastPeriod: m.ds.dates[m.ds.dates.length - 1],
      notice: deps.notice,
      ...r,
      rows: r.rows.map((x) => ({ ...x, factorName: nameOf[x.factor], sectorName: sectorName[x.sector] }))
    };
  });
  const marketMatrix = () => world.tradingDays.map((_, t) => WORLD_MARKETS.map((m) => world.markets[m.id][t]));
  const connectednessReport = (window, H, step) => memo(`conn|${window}|${H}|${step}`, () => {
    const Y = marketMatrix();
    const names = WORLD_MARKETS.map((m) => m.nameVi);
    const full = connectedness(Y, names, { p: 1, H });
    const recent = connectedness(Y.slice(-window), names, { p: 1, H });
    const roll = rollingConnectedness(Y, names, { window, step, p: 1, H });
    const vn = WORLD_MARKETS.findIndex((m) => m.id === "VN");
    const vnSeries = world.markets.VN;
    return {
      names,
      window,
      H,
      p: 1,
      full: { table: full.table, from: full.from, to: full.to, net: full.net, total: full.total },
      recent: { table: recent.table, from: recent.from, to: recent.to, net: recent.net, total: recent.total },
      rolling: roll.map((r) => ({ date: world.tradingDays[r.end], total: r.total, vnFrom: r.from[vn] })),
      vnReceivesFrom: WORLD_MARKETS.filter((_, i) => i !== vn).map((m, i) => ({ market: m.id, nameVi: m.nameVi, share: recent.table[vn][WORLD_MARKETS.findIndex((x) => x.id === m.id)], i })).sort((a, b) => b.share - a.share).map(({ i: _i, ...rest }) => rest),
      tailDependence: WORLD_MARKETS.filter((m) => m.id !== "VN").map((m) => ({ market: m.id, nameVi: m.nameVi, lowerTail: tailDependence(world.markets[m.id], vnSeries, 0.05, "lower"), independentBaseline: 0.05 }))
    };
  });
  const EVENT_WINDOW = { lo: -1, hi: 3 };
  const studies = () => memo("studies", () => {
    const list = world.events.map((ev) => {
      const align = alignEventToSession(ev.tsUtc, world.tradingDays);
      const results = {};
      if (align) for (const s of VN_SECTORS) {
        const r = eventStudy(world.sectors[s.id], world.markets.VN, align.index);
        if (r) results[s.id] = r;
      }
      const h0 = ev.sectorsHint[0];
      const primary = h0 && results[h0] ? h0 : null;
      return { id: ev.id, ev, align, results, q: {}, primary, qPrimary: null, overlapsWith: [] };
    });
    const span = EVENT_WINDOW.hi - EVENT_WINDOW.lo;
    for (const a of list) for (const b of list)
      if (a !== b && a.align && b.align && Math.abs(a.align.index - b.align.index) <= span) a.overlapsWith.push(b.id);
    const flat = [];
    list.forEach((s, i) => Object.entries(s.results).forEach(([sec, r]) => flat.push({ i, sec, p: r.p })));
    const q = adjustPValues(flat.map((f) => f.p), "by");
    flat.forEach((f, k) => list[f.i].q[f.sec] = q[k]);
    const prim = list.map((s, i) => ({ i, p: s.primary ? s.results[s.primary].p : NaN })).filter((x) => Number.isFinite(x.p));
    const qp = adjustPValues(prim.map((x) => x.p), "by");
    prim.forEach((x, k) => list[x.i].qPrimary = qp[k]);
    return list;
  });
  const bmpFor = (type, sector) => {
    const seen = /* @__PURE__ */ new Set();
    const items = [];
    for (const s of studies().filter((x) => x.ev.type === type && x.results[sector]).sort((a, b) => a.align.index - b.align.index)) {
      if (s.overlapsWith.some((o) => seen.has(o))) {
        seen.add(s.id);
        continue;
      }
      seen.add(s.id);
      items.push({ car: s.results[sector].car * (s.ev.polarityHint || 1), varCar: s.results[sector].varCar });
    }
    return bmpTest(items);
  };
  const eventRow = (s) => {
    const candidates = Object.keys(s.results);
    if (!candidates.length || !s.align) return { id: s.id, titleVi: s.ev.titleVi, kind: s.ev.kind, type: s.ev.type, region: s.ev.region, tsUtc: s.ev.tsUtc, sessionDate: s.align?.date ?? null, tier: "pending", status: "Ch\u1EDD \u0111\u1EE7 phi\xEAn sau s\u1EF1 ki\u1EC7n" };
    const exploratoryBest = candidates.reduce((a, b) => s.results[b].p < s.results[a].p ? b : a);
    const overlapTitles = s.overlapsWith.map((id) => world.events.find((e) => e.id === id)?.titleVi ?? id);
    if (!s.primary) {
      const r2 = s.results[exploratoryBest];
      return {
        id: s.id,
        titleVi: s.ev.titleVi,
        kind: s.ev.kind,
        type: s.ev.type,
        region: s.ev.region,
        tsUtc: s.ev.tsUtc,
        sessionDate: s.align.date,
        sameDay: s.align.sameDay,
        sector: exploratoryBest,
        sectorName: sectorName[exploratoryBest],
        prespecified: false,
        car: r2.car,
        se: r2.se,
        t: r2.t,
        p: r2.p,
        q: s.q[exploratoryBest],
        ci90: [r2.car - 1.645 * r2.se, r2.car + 1.645 * r2.se],
        bmp: null,
        tier: "C",
        polarity: s.ev.polarityHint,
        signOk: null,
        overlapsWith: overlapTitles,
        reasonVi: "Kh\xF4ng c\xF3 ng\xE0nh m\u1EE5c ti\xEAu \u0111\u1ECBnh tr\u01B0\u1EDBc \u2014 ng\xE0nh hi\u1EC3n th\u1ECB l\xE0 ng\xE0nh c\xF3 p nh\u1ECF nh\u1EA5t (th\u0103m d\xF2), kh\xF4ng ph\u1EA3i b\u1EB1ng ch\u1EE9ng.",
        limitDays: r2.limitDaysInWindow,
        extraction: s.ev.extraction ?? null
      };
    }
    const best = s.primary;
    const r = s.results[best];
    const bmp = bmpFor(s.ev.type, best);
    const signOk = s.ev.polarityHint === 0 ? null : Math.sign(r.car) === s.ev.polarityHint;
    const replicated = !!bmp && bmp.p < 0.05 && Math.sign(bmp.caar) === Math.sign(r.car * (s.ev.polarityHint || 1));
    let { tier, reasonVi } = assignTier({ q: s.qPrimary ?? 1, stable: replicated, oosPass: replicated });
    if (signOk === false && tier !== "C") {
      tier = "C";
      reasonVi = "Ng\u01B0\u1EE3c chi\u1EC1u d\u1EF1 ki\u1EBFn c\u1EE7a s\u1EF1 ki\u1EC7n \u2014 kh\xF4ng t\xEDnh l\xE0 b\u1EB1ng ch\u1EE9ng.";
    }
    if (s.overlapsWith.length && tier !== "C") {
      tier = "C";
      reasonVi = `C\u1EEDa s\u1ED5 (\u22121,+3) tr\xF9ng s\u1EF1 ki\u1EC7n kh\xE1c (${overlapTitles.join("; ")}) \u2014 kh\xF4ng t\xE1ch \u0111\u01B0\u1EE3c t\xE1c \u0111\u1ED9ng.`;
    }
    return {
      id: s.id,
      titleVi: s.ev.titleVi,
      kind: s.ev.kind,
      type: s.ev.type,
      region: s.ev.region,
      tsUtc: s.ev.tsUtc,
      sessionDate: s.align.date,
      sameDay: s.align.sameDay,
      sector: best,
      sectorName: sectorName[best],
      prespecified: true,
      car: r.car,
      se: r.se,
      t: r.t,
      p: r.p,
      q: s.qPrimary ?? 1,
      qAllCells: s.q[best],
      ci90: [r.car - 1.645 * r.se, r.car + 1.645 * r.se],
      polarity: s.ev.polarityHint,
      signOk,
      overlapsWith: overlapTitles,
      exploratoryBest: exploratoryBest !== best ? { sector: exploratoryBest, sectorName: sectorName[exploratoryBest], car: s.results[exploratoryBest].car, p: s.results[exploratoryBest].p } : null,
      bmp: bmp ? { n: bmp.n, t: bmp.t, p: bmp.p } : null,
      tier,
      reasonVi,
      limitDays: r.limitDaysInWindow,
      extraction: s.ev.extraction ?? null
    };
  };
  const shrunkBetas = (factor) => memo(`shrink|${factor}`, () => {
    const groups = {};
    for (const b of world.stockBetas[factor] ?? []) (groups[b.sectorId] ??= []).push({ id: b.code, beta: b.beta, se: b.se });
    return hierarchicalShrink(groups);
  });
  async function overview(asOf) {
    const m = monthly(asOf);
    const mx = await matrix(asOf, 6);
    const pulse = m.factors.map((id) => {
      const z = expandingZ(m.prep.factors[id]);
      let last = NaN;
      for (let i = z.length - 1; i >= 0; i--) if (Number.isFinite(z[i])) {
        last = z[i];
        break;
      }
      return { id, nameVi: nameOf[id], z: last, unusual: Math.abs(last) >= 2, links: mx.cells.filter((c) => c.factor === id && c.tier !== "C").length, ...WORLD_FACTOR_INFO[id] };
    });
    const conn = connectednessReport(250, 10, 40);
    const studs = studies();
    return {
      asOf,
      notice: mx.notice,
      pulse,
      tierCounts: mx.counts,
      spillover: { total: conn.recent.total, fullSample: conn.full.total },
      events: { total: world.events.length, pending: studs.filter((s) => !Object.keys(s.results).length).length, tiers: summarizeTiers(studs.map(eventRow).filter((r) => r.tier !== "pending").map((r) => r.tier)) }
    };
  }
  async function scenario(body) {
    const asOf = asOfOf(body.asOf);
    const horizon = intIn(body.horizon, "horizon", 1, 12, 3);
    let shocks;
    let meta;
    if (typeof body.scenarioId === "string") {
      const sc = WORLD_SCENARIOS.find((s) => s.id === body.scenarioId);
      if (!sc) throw new ApiError2(404, `Kh\xF4ng c\xF3 k\u1ECBch b\u1EA3n '${body.scenarioId}'.`);
      shocks = sc.shocks;
      meta = { id: sc.id, nameVi: sc.nameVi, descriptionVi: sc.descriptionVi };
    } else if (Array.isArray(body.shocks) && body.shocks.length) {
      shocks = body.shocks.map((s, i) => {
        if (typeof s?.factor !== "string" || !WORLD_FACTOR_IDS.includes(s.factor) || typeof s?.sigma !== "number" || !Number.isFinite(s.sigma) || Math.abs(s.sigma) > 6)
          throw new ApiError2(400, `shocks[${i}] c\u1EA7n factor h\u1EE3p l\u1EC7 v\xE0 sigma trong [-6, 6].`);
        return { factor: s.factor, sigma: s.sigma };
      });
      meta = { id: "custom", nameVi: "K\u1ECBch b\u1EA3n tu\u1EF3 ch\u1EC9nh", descriptionVi: "" };
    } else throw new ApiError2(400, "C\u1EA7n scenarioId ho\u1EB7c danh s\xE1ch shocks.");
    const m = monthly(asOf);
    const names = m.factors;
    const sdOf = (id) => std(m.prep.factors[id].filter(Number.isFinite));
    const shockVec = names.map((id) => (shocks.find((s) => s.factor === id)?.sigma ?? 0) * sdOf(id));
    const warnings = shocks.filter((s) => !names.includes(s.factor)).map((s) => `B\u1ECF qua ${s.factor}: kh\xF4ng c\xF3 d\u1EEF li\u1EC7u.`);
    const xs = names.map((id) => m.prep.factors[id]);
    const mx = await matrix(asOf, 6);
    const sectors = m.targets.map((sec) => {
      const irf = localProjectionIRF({ y: m.prep.targets[sec], xs, shock: shockVec, horizon, arLags: 1, level: 0.9 });
      const at = irf[irf.length - 1];
      return { sector: sec, nameVi: sectorName[sec], irf, est: at?.est ?? NaN, lo: at?.lo ?? NaN, hi: at?.hi ?? NaN, conclusive: !!at && (at.lo > 0 || at.hi < 0) };
    });
    sectors.sort((a, b) => a.est - b.est);
    const lead = shocks.find((s) => world.stockBetas[s.factor]);
    let stocks = [];
    if (lead) {
      const h = shrunkBetas(lead.factor);
      stocks = Object.entries(h.groups).flatMap(
        ([sec, g]) => g.items.map((it) => {
          const cell2 = mx.cells.find((c) => c.factor === lead.factor && c.sector === sec);
          const own = Math.abs(it.beta / it.se) > 1.96;
          return { code: it.id, sector: sec, sectorName: sectorName[sec], beta: it.shrunk, ownWeight: it.weight, est: it.shrunk * lead.sigma, tier: stockTier(cell2?.tier ?? "C", own) };
        })
      ).sort((a, b) => a.est - b.est).slice(0, 8);
    }
    return { asOf, scenario: meta, shocks, horizon, notice: deps.notice, sectors, stocks, stockFactor: lead?.factor ?? null, warnings, conclusiveCount: sectors.filter((s) => s.conclusive).length };
  }
  async function stock(code) {
    const x = world.exposures.find((e) => e.code === code);
    if (!x) throw new ApiError2(404, `Kh\xF4ng c\xF3 c\u1ED5 phi\u1EBFu ${code}.`);
    const mx = await matrix(asOfOf(void 0), 6);
    const betas = Object.keys(world.stockBetas).map((factor) => {
      const h = shrunkBetas(factor);
      const g = h.groups[x.sectorId];
      const it = g?.items.find((i) => i.id === code);
      if (!it) return null;
      const cell2 = mx.cells.find((c) => c.factor === factor && c.sector === x.sectorId);
      const own = Math.abs(it.beta / it.se) > 1.96;
      return { factor, nameVi: nameOf[factor], own: it.beta, se: it.se, sectorPrior: g.priorMu, shrunk: it.shrunk, ownWeight: it.weight, postSd: it.postSd, sectorTier: cell2?.tier ?? "C", tier: stockTier(cell2?.tier ?? "C", own), sectorPeers: g.items.length };
    }).filter(Boolean);
    return { code, sector: x.sectorId, sectorName: sectorName[x.sectorId], exposure: x, channels: channelExposure(x), betas, notice: deps.notice };
  }
  async function handle(req) {
    try {
      const path = req.path.replace(/\/+$/, "");
      const m = req.method.toUpperCase();
      const q = req.query;
      const body = req.body && typeof req.body === "object" ? req.body : {};
      if (m === "GET" && path === "/api/world/series")
        return { status: 200, body: { notice: deps.notice, factors: WORLD_FACTOR_IDS.map((id) => ({ id, nameVi: nameOf[id], ...WORLD_FACTOR_INFO[id] })), sectors: VN_SECTORS, markets: WORLD_MARKETS, scenarios: WORLD_SCENARIOS, tierMeaning: TIER_MEANING_VI } };
      if (m === "GET" && path === "/api/world/overview") return { status: 200, body: await overview(asOfOf(q.asOf)) };
      if (m === "POST" && path === "/api/world/matrix") return { status: 200, body: await matrix(asOfOf(body.asOf), intIn(body.maxLag, "maxLag", 1, 12, 6)) };
      if (m === "GET" && path === "/api/world/confirmatory") return { status: 200, body: confirmatory(asOfOf(q.asOf)) };
      if (m === "GET" && path === "/api/world/connectedness") return { status: 200, body: { notice: deps.notice, ...connectednessReport(intIn(q.window, "window", 120, 1e3, 250), intIn(q.H, "H", 1, 30, 10), intIn(q.step, "step", 5, 200, 40)) } };
      if (m === "GET" && path === "/api/world/events") return { status: 200, body: { notice: deps.notice, events: studies().map(eventRow), family: "X\xE1c nh\u1EADn: Benjamini-Yekutieli tr\xEAn ng\xE0nh m\u1EE5c ti\xEAu \u0111\u1ECBnh tr\u01B0\u1EDBc (1 ki\u1EC3m \u0111\u1ECBnh / s\u1EF1 ki\u1EC7n); q to\xE0n b\u1EA3ng s\u1EF1 ki\u1EC7n \xD7 ng\xE0nh ch\u1EC9 \u0111\u1EC3 th\u0103m d\xF2" } };
      const em = /^\/api\/world\/events\/([A-Za-z0-9_-]+)$/.exec(path);
      if (m === "GET" && em) {
        const s = studies().find((x) => x.id === em[1]);
        if (!s) throw new ApiError2(404, `Kh\xF4ng c\xF3 s\u1EF1 ki\u1EC7n ${em[1]}.`);
        const row2 = eventRow(s);
        const bestRes = row2.sector ? s.results[row2.sector] : null;
        return {
          status: 200,
          body: {
            notice: deps.notice,
            event: row2,
            alignment: s.align,
            path: bestRes ? bestRes.path : [],
            model: bestRes ? { alpha: bestRes.alpha, beta: bestRes.beta, sigma: bestRes.sigma, nEst: bestRes.nEst } : null,
            sectors: Object.entries(s.results).map(([sec, r]) => ({ sector: sec, nameVi: sectorName[sec], car: r.car, se: r.se, ci90: [r.car - 1.645 * r.se, r.car + 1.645 * r.se], t: r.t, p: r.p, q: s.q[sec] })).sort((a, b) => a.car - b.car)
          }
        };
      }
      const sm = /^\/api\/world\/stock\/([A-Za-z0-9_-]+)$/.exec(path);
      if (m === "GET" && sm) return { status: 200, body: await stock(sm[1]) };
      if (m === "POST" && path === "/api/world/scenario") return { status: 200, body: await scenario(body) };
      if (path.startsWith("/api/world/")) return { status: 405, body: { error: "Ph\u01B0\u01A1ng th\u1EE9c ho\u1EB7c \u0111\u01B0\u1EDDng d\u1EABn kh\xF4ng \u0111\u01B0\u1EE3c h\u1ED7 tr\u1EE3." } };
      return { status: 404, body: { error: "Kh\xF4ng t\xECm th\u1EA5y." } };
    } catch (e) {
      if (e instanceof ApiError2) return { status: e.status, body: { error: e.message } };
      return { status: 500, body: { error: "L\u1ED7i t\xEDnh to\xE1n n\u1ED9i b\u1ED9." } };
    }
  }
  return { handle, macro };
}

// src/macro-center/src/world-seed.ts
var EVENT_SCALE = 1.9;
var WORLD_SYNTHETIC_NOTICE = "D\u1EEE LI\u1EC6U M\xD4 PH\u1ECENG \u2014 th\u1EBF gi\u1EDBi, ng\xE0nh v\xE0 c\u1ED5 phi\u1EBFu trong b\u1EA3n n\xE0y kh\xF4ng ph\u1EA3i s\u1ED1 li\u1EC7u th\u1EADt.";
var TRUE_WORLD_EFFECTS = {
  S_PORT: { CONTAINER: 0.35, PMI_CN: 1 },
  S_SEAFOOD: { TARIFF: -0.5, CONTAINER: -0.15 },
  S_TEXTILE: { TARIFF: -0.5 },
  S_STEEL: { STEEL: 0.45, PMI_CN: 1.2, TARIFF: -0.2 },
  S_OIL: { OIL: 0.35 },
  S_BANK: { FED: -4, VIX: -0.25 },
  S_SEC: { VIX: -0.4, EM_FLOWS: 0.6 },
  S_RE: { FED: -5 },
  S_TECH: { SEMI: 0.4, VIX: -0.3 },
  S_POWER: {}
};
var WORLD_CATALOG = [...VN_CATALOG, ...WORLD_EXTRA_FACTORS, ...SECTOR_TARGETS];
function weekdays(start, n) {
  const out = [];
  const d = /* @__PURE__ */ new Date(`${start}T00:00:00Z`);
  while (out.length < n) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}
function makeSyntheticWorld(seed = 11) {
  const rng = mulberry32(seed);
  const N = 1600;
  const tradingDays = weekdays("2020-01-01", N);
  const ids = WORLD_MARKETS.map((m) => m.id);
  const K = ids.length;
  const A = Array.from({ length: K }, () => new Array(K).fill(0));
  for (let i = 0; i < K; i++) A[i][i] = 0.05;
  const fromUs = [0.02, 0.1, 0.25, 0.2, 0.15, 0.18];
  fromUs.forEach((v, i) => A[i][0] = i === 0 ? 0.05 : v);
  A[5][1] = 0.08;
  A[5][3] = 0.05;
  A[5][4] = 0.04;
  const sd = [1, 1.2, 1.1, 1.3, 1.1, 1.2];
  const R = [new Array(K).fill(0)];
  for (let t = 1; t < N; t++) {
    const common = randn(rng);
    R.push(R[t - 1].map((_, i) => A[i].reduce((s, a, j) => s + a * R[t - 1][j], 0) + sd[i] * (0.92 * randn(rng) + 0.39 * common)));
  }
  const markets = {};
  ids.forEach((id, i) => markets[id] = R.map((r) => r[i]));
  const specs = [
    { idx: 320, kind: "surprise", type: "trade_policy", title: "Th\xF4ng b\xE1o thu\u1EBF quan m\u1EDBi c\u1EE7a M\u1EF9 [1]", region: "US", hint: ["S_SEAFOOD", "S_TEXTILE"], pol: -1, effects: { S_SEAFOOD: -2.6, S_TEXTILE: -2.2 }, llm: 0.86 },
    { idx: 520, kind: "surprise", type: "trade_policy", title: "Th\xF4ng b\xE1o thu\u1EBF quan m\u1EDBi c\u1EE7a M\u1EF9 [2]", region: "US", hint: ["S_SEAFOOD", "S_TEXTILE"], pol: -1, effects: { S_SEAFOOD: -2.8, S_TEXTILE: -2 }, llm: 0.9 },
    { idx: 700, kind: "surprise", type: "trade_policy", title: "Th\xF4ng b\xE1o thu\u1EBF quan m\u1EDBi c\u1EE7a M\u1EF9 [3]", region: "US", hint: ["S_SEAFOOD", "S_TEXTILE"], pol: -1, effects: { S_SEAFOOD: -2.4, S_TEXTILE: -2.4, S_STEEL: -1 }, llm: 0.88 },
    { idx: 400, kind: "scheduled", type: "monetary_policy", title: "H\u1ECDp ch\xEDnh s\xE1ch c\u1EE7a Fed [1]", region: "US", hint: ["S_BANK", "S_RE"], pol: -1, effects: { S_BANK: -1.5, S_RE: -1.8, S_SEC: -1.2 } },
    { idx: 600, kind: "scheduled", type: "monetary_policy", title: "H\u1ECDp ch\xEDnh s\xE1ch c\u1EE7a Fed [2]", region: "US", hint: ["S_BANK", "S_RE"], pol: -1, effects: { S_BANK: -1.4, S_RE: -2 } },
    { idx: 800, kind: "scheduled", type: "monetary_policy", title: "H\u1ECDp ch\xEDnh s\xE1ch c\u1EE7a Fed [3]", region: "US", hint: ["S_BANK", "S_RE"], pol: -1, effects: { S_RE: -1.7, S_SEC: -1.5 } },
    { idx: 450, kind: "scheduled", type: "macro_release", title: "C\xF4ng b\u1ED1 PMI s\u1EA3n xu\u1EA5t Trung Qu\u1ED1c [1]", region: "CN", hint: ["S_STEEL", "S_PORT"], pol: 1, effects: { S_STEEL: 1.4, S_PORT: 1.2 } },
    { idx: 650, kind: "scheduled", type: "macro_release", title: "C\xF4ng b\u1ED1 PMI s\u1EA3n xu\u1EA5t Trung Qu\u1ED1c [2]", region: "CN", hint: ["S_STEEL", "S_PORT"], pol: 1, effects: { S_STEEL: 1.2, S_PORT: 1 } },
    { idx: 900, kind: "surprise", type: "commodity_shock", title: "Bi\u1EBFn \u0111\u1ED9ng m\u1EA1nh c\u1EE7a gi\xE1 d\u1EA7u", region: "GLOBAL", hint: ["S_OIL"], pol: 1, effects: {}, llm: 0.8 },
    { idx: 1e3, kind: "surprise", type: "geopolitical", title: "S\u1EF1 ki\u1EC7n \u0111\u1ECBa ch\xEDnh tr\u1ECB [1]", region: "GLOBAL", hint: ["S_SEC"], pol: -1, effects: {}, llm: 0.75 },
    { idx: 1100, kind: "scheduled", type: "macro_release", title: "S\u1ED1 li\u1EC7u vi\u1EC7c l\xE0m M\u1EF9", region: "US", hint: ["S_SEC"], pol: -1, effects: {} },
    { idx: N - 2, kind: "scheduled", type: "index_reclassification", title: "\u0110\xE1nh gi\xE1 ph\xE2n lo\u1EA1i th\u1ECB tr\u01B0\u1EDDng c\u1EE7a t\u1ED5 ch\u1EE9c ch\u1EC9 s\u1ED1", region: "GLOBAL", hint: ["S_SEC", "S_BANK"], pol: 1, effects: {} }
  ];
  const events = [];
  const plantedEventEffects = {};
  specs.forEach((s, k) => {
    const id = `ev${k + 1}`;
    const prev = tradingDays[s.idx - 1];
    events.push({
      id,
      kind: s.kind,
      type: s.type,
      titleVi: s.title,
      tsUtc: `${prev}T09:30:00Z`,
      region: s.region,
      sectorsHint: s.hint,
      polarityHint: s.pol,
      source: { name: "[t\xEAn ngu\u1ED3n]", url: "[\u0111\u01B0\u1EDDng d\u1EABn]" },
      extraction: s.llm ? { method: "llm", confidence: s.llm, reviewed: true } : { method: "manual", confidence: 1, reviewed: true }
    });
    plantedEventEffects[id] = Object.fromEntries(Object.entries(s.effects).map(([k2, v]) => [k2, Math.round(v * EVENT_SCALE * 10) / 10]));
  });
  const betaMkt = { S_BANK: 1.2, S_SEC: 1.4, S_RE: 1.3, S_STEEL: 1.1, S_OIL: 0.9, S_SEAFOOD: 0.8, S_TEXTILE: 0.9, S_PORT: 1, S_TECH: 1.1, S_POWER: 0.7 };
  const sectors = {};
  VN_SECTORS.forEach((s) => sectors[s.id] = markets.VN.map((m) => betaMkt[s.id] * m + 0.55 * randn(rng)));
  specs.forEach((s, k) => {
    for (const sec of Object.keys(s.effects)) {
      const eff = plantedEventEffects[`ev${k + 1}`][sec];
      sectors[sec][s.idx] += eff;
      if (s.idx + 1 < N) sectors[sec][s.idx + 1] += eff * 0.5;
    }
  });
  const exposures = [];
  const stockBetas = { TARIFF: [], CONTAINER: [] };
  const plan = [
    // sector, prefix, count, US share, sector beta TARIFF, sector beta CONTAINER, tau
    ["S_SEAFOOD", "SEA", 6, 35, -1.8, -0.2, 0.5],
    ["S_TEXTILE", "TEX", 6, 40, -1.6, -0.1, 0.5],
    ["S_STEEL", "STL", 5, 8, -0.5, 0, 0.25],
    ["S_PORT", "PRT", 5, 12, -0.3, 1.4, 0.4],
    ["S_OIL", "OIL", 4, 3, 0, 0, 0.2],
    ["S_BANK", "BNK", 6, 0, -0.1, 0, 0.15],
    ["S_TECH", "TCH", 4, 25, -0.3, 0.1, 0.3]
  ];
  for (const [sec, pre, n2, us, bT, bC, tau] of plan) {
    for (let i = 0; i < n2; i++) {
      const code = `${pre}${i + 1}`;
      const usShare = Math.max(0, Math.min(70, Math.round(us * (0.6 + 0.8 * rng()))));
      const eu = Math.round((100 - usShare) * (us > 0 ? 0.25 : 0.05) * (0.6 + 0.8 * rng()));
      const cn = Math.round((100 - usShare - eu) * 0.12);
      const vn = 100 - usShare - eu - cn;
      exposures.push({
        code,
        sectorId: sec,
        revenueByRegion: { VN: vn, US: usShare, EU: eu, CN: cn },
        commodityCostShare: Math.round((0.15 + 0.4 * rng()) * 100) / 100,
        fxRevenueShare: Math.round((100 - vn) / 100 * 100) / 100,
        fxDebtShare: Math.round(0.35 * rng() * 100) / 100,
        asOfPeriod: "2026-03",
        sourceRef: "BCTC [k\u1EF3], thuy\u1EBFt minh [m\u1EE5c]"
      });
      const se = 0.35 + 0.9 * rng();
      stockBetas.TARIFF.push({ code, sectorId: sec, beta: bT + tau * randn(rng) + se * randn(rng), se });
      const se2 = 0.35 + 0.9 * rng();
      stockBetas.CONTAINER.push({ code, sectorId: sec, beta: bC + tau * randn(rng) + se2 * randn(rng), se: se2 });
    }
  }
  const store = new InMemoryVintageStore();
  const n = 222;
  const start = "2008-01";
  const ar = (phi, mu, s, x0, floor = -Infinity) => {
    const y = [x0];
    for (let i = 1; i < n; i++) y.push(Math.max(floor, mu + phi * (y[i - 1] - mu) + s * randn(rng)));
    return y;
  };
  const lvl = (s, x0) => {
    const y = [x0];
    for (let i = 1; i < n; i++) y.push(y[i - 1] * Math.exp(s * randn(rng) / 100));
    return y;
  };
  const raw = {
    FED: ar(0.985, 2, 0.35, 2, 0),
    DXY: lvl(1.5, 85),
    OIL: lvl(8, 80),
    CNY: lvl(0.6, 7),
    STEEL: lvl(5, 600),
    CONTAINER: lvl(5, 1500),
    PMI_CN: ar(0.7, 50, 1.2, 50),
    PMI_US: ar(0.7, 52, 1.4, 52),
    SEMI: lvl(4, 100),
    VIX: ar(0.8, 18, 3, 18, 9),
    EM_FLOWS: ar(0.5, 0, 2, 0),
    TARIFF: lvl(6, 100),
    MSCI_EM: lvl(4.5, 1e3)
  };
  const ld = (x) => x.map((v, i) => i === 0 ? 0 : 100 * Math.log(v / x[i - 1]));
  const dd = (x) => x.map((v, i) => i === 0 ? 0 : v - x[i - 1]);
  const stat = {
    FED: dd(raw.FED),
    DXY: ld(raw.DXY),
    OIL: ld(raw.OIL),
    CNY: ld(raw.CNY),
    STEEL: ld(raw.STEEL),
    CONTAINER: ld(raw.CONTAINER),
    PMI_CN: raw.PMI_CN.map((v) => v - 50),
    PMI_US: raw.PMI_US.map((v) => v - 52),
    SEMI: ld(raw.SEMI),
    VIX: raw.VIX.map((v) => v - 18),
    EM_FLOWS: raw.EM_FLOWS.slice(),
    TARIFF: ld(raw.TARIFF),
    MSCI_EM: ld(raw.MSCI_EM)
  };
  const pub = Object.fromEntries(Object.entries(catalogById(WORLD_CATALOG)).map(([id, m]) => [id, m.pubLagMonths]));
  const market = Array.from({ length: n }, () => 2.4 * randn(rng));
  for (const [sec, eff] of Object.entries(TRUE_WORLD_EFFECTS)) {
    const ret = new Array(n).fill(0);
    for (let t = 1; t < n; t++) {
      let r = 0.5 + market[t] + 1.2 * randn(rng);
      for (const [f, b] of Object.entries(eff)) {
        const src = t - 1 - (pub[f] ?? 0);
        if (src >= 0) r += b * stat[f][src];
      }
      ret[t] = r;
    }
    const idx = [1e3];
    for (let t = 1; t < n; t++) idx.push(idx[t - 1] * Math.exp(ret[t] / 100));
    raw[sec] = idx;
  }
  const obs = [];
  for (const meta of [...WORLD_EXTRA_FACTORS, ...SECTOR_TARGETS, ...VN_CATALOG.filter((m) => ["FED", "DXY", "OIL"].includes(m.id))]) {
    const v = raw[meta.id];
    if (!v) continue;
    for (let i = 0; i < n; i++) {
      const period = addMonths(start, i);
      obs.push({ seriesId: meta.id, period, value: v[i], asOf: estimateAsOf(period, meta.pubLagMonths, meta.typicalReleaseDay) });
    }
  }
  store.upsert(obs);
  return { data: { tradingDays, markets, sectors, events, plantedEventEffects, exposures, stockBetas }, store, catalog: WORLD_CATALOG };
}

// src/macro-center/src/world-chat-tools.ts
var factorIds2 = WORLD_FACTOR_IDS;
var sectorIds = VN_SECTORS.map((s) => s.id);
var ASOF2 = { type: "string", description: "Ng\xE0y tham chi\u1EBFu YYYY-MM-DD; b\u1ECF tr\u1ED1ng \u0111\u1EC3 d\xF9ng d\u1EEF li\u1EC7u m\u1EDBi nh\u1EA5t." };
var obj = (properties, required = []) => ({ type: "object", properties, required, additionalProperties: false });
var WORLD_TOOL_SPECS = [
  { name: "world_links", description: 'Tra c\u1EE9u li\xEAn k\u1EBFt gi\u1EEFa y\u1EBFu t\u1ED1 th\u1EBF gi\u1EDBi v\xE0 ng\xE0nh Vi\u1EC7t Nam, k\xE8m b\u1EADc b\u1EB1ng ch\u1EE9ng (A/B/C), h\u01B0\u1EDBng, \u0111\u1ED9 tr\u1EC5, q-value. M\u1EB7c \u0111\u1ECBnh ch\u1EC9 tr\u1EA3 li\xEAn k\u1EBFt b\u1EADc A v\xE0 B. D\xF9ng khi h\u1ECFi "y\u1EBFu t\u1ED1 th\u1EBF gi\u1EDBi n\xE0o t\xE1c \u0111\u1ED9ng t\u1EDBi ng\xE0nh X?".', parameters: obj({ factor: { type: "string", description: "M\xE3 y\u1EBFu t\u1ED1 th\u1EBF gi\u1EDBi.", enum: factorIds2 }, sector: { type: "string", description: "M\xE3 ng\xE0nh.", enum: sectorIds }, includeC: { type: "boolean", description: "G\u1ED3m c\u1EA3 li\xEAn k\u1EBFt b\u1EADc C (ch\u01B0a \u0111\u1EE7 b\u1EB1ng ch\u1EE9ng); m\u1EB7c \u0111\u1ECBnh false." }, topN: { type: "number", description: "S\u1ED1 d\xF2ng t\u1ED1i \u0111a 1..15, m\u1EB7c \u0111\u1ECBnh 8.", minimum: 1, maximum: 15 }, asOf: ASOF2 }) },
  { name: "world_events", description: "Danh s\xE1ch s\u1EF1 ki\u1EC7n th\u1EBF gi\u1EDBi \u0111\xE3 \u0111o ph\u1EA3n \u1EE9ng c\u1EE7a ng\xE0nh Vi\u1EC7t Nam (CAR, q, b\u1EADc) ho\u1EB7c chi ti\u1EBFt m\u1ED9t s\u1EF1 ki\u1EC7n n\u1EBFu truy\u1EC1n eventId.", parameters: obj({ eventId: { type: "string", description: "M\xE3 s\u1EF1 ki\u1EC7n \u0111\u1EC3 xem chi ti\u1EBFt (v\xED d\u1EE5 ev1)." } }) },
  { name: "world_connectedness", description: "M\u1EE9c lan truy\u1EC1n gi\u1EEFa c\xE1c th\u1ECB tr\u01B0\u1EDDng (M\u1EF9, Trung Qu\u1ED1c, Nh\u1EADt, H\xE0n Qu\u1ED1c, Th\xE1i Lan, Vi\u1EC7t Nam): ch\u1EC9 s\u1ED1 lan truy\u1EC1n t\u1ED5ng, Vi\u1EC7t Nam nh\u1EADn t\u1EEB \u0111\xE2u, ph\u1EE5 thu\u1ED9c \u0111u\xF4i.", parameters: obj({}) },
  { name: "world_scenario", description: "M\xF4 ph\u1ECFng k\u1ECBch b\u1EA3n c\u1EE7a th\u1EBF gi\u1EDBi (\u0111\u1ED9 l\u1EC7ch chu\u1EA9n) v\xE0 x\u1EBFp h\u1EA1ng ng\xE0nh, c\u1ED5 phi\u1EBFu ch\u1ECBu t\xE1c \u0111\u1ED9ng. Truy\u1EC1n scenarioId HO\u1EB6C shocks [{factor, sigma}].", parameters: obj({ scenarioId: { type: "string", description: "K\u1ECBch b\u1EA3n c\xF3 s\u1EB5n: tariff-up, usd-strong, oil-spike, fed-cut, china-recovery, risk-off.", enum: ["tariff-up", "usd-strong", "oil-spike", "fed-cut", "china-recovery", "risk-off"] }, shocks: { type: "array", description: "C\xFA s\u1ED1c tu\u1EF3 ch\u1EC9nh [{factor, sigma}], sigma trong [-6, 6] t\xEDnh b\u1EB1ng \u0111\u1ED9 l\u1EC7ch chu\u1EA9n.", items: { type: "object" } }, horizon: { type: "number", description: "T\u1EA7m nh\xECn 1..12 th\xE1ng, m\u1EB7c \u0111\u1ECBnh 3.", minimum: 1, maximum: 12 } }) },
  { name: "world_stock_profile", description: "H\u1ED3 s\u01A1 ph\u01A1i nhi\u1EC5m qu\u1ED1c t\u1EBF c\u1EE7a m\u1ED9t c\u1ED5 phi\u1EBFu: doanh thu theo v\xF9ng, ngo\u1EA1i t\u1EC7, \u0111\u1ED9 nh\u1EA1y sau co r\xFAt v\u1EC1 ng\xE0nh v\xE0 b\u1EADc b\u1EB1ng ch\u1EE9ng.", parameters: obj({ code: { type: "string", description: "M\xE3 c\u1ED5 phi\u1EBFu." } }, ["code"]) }
];
var WORLD_CHAT_GUIDELINES = `Quy t\u1EAFc b\u1ED5 sung khi d\xF9ng c\xF4ng c\u1EE5 world_*:
1. B\u1EADc A: v\u01B0\u1EE3t ki\u1EC3m \u0111\u1ECBnh b\u1ED9i, \u1ED5n \u0111\u1ECBnh v\xE0 v\u01B0\u1EE3t ngo\xE0i m\u1EABu. B\u1EADc B: c\xF3 \xFD ngh\u0129a trong m\u1EABu. B\u1EADc C: gi\u1EA3 thuy\u1EBFt ho\u1EB7c ch\u01B0a \u0111\u1EE7 b\u1EB1ng ch\u1EE9ng. Lu\xF4n n\xEAu b\u1EADc khi n\xEAu m\u1ED9t li\xEAn k\u1EBFt; kh\xF4ng g\u1ECDi b\u1EADc C l\xE0 "c\xF3 t\xE1c \u0111\u1ED9ng".
2. S\u1EF1 ki\u1EC7n: n\xF3i r\xF5 ph\u1EA3n \u1EE9ng l\xE0 l\u1EE3i su\u1EA5t b\u1EA5t th\u01B0\u1EDDng so v\u1EDBi m\xF4 h\xECnh th\u1ECB tr\u01B0\u1EDDng, k\xE8m c\u1EEDa s\u1ED5 (\u22121, +3). S\u1EF1 ki\u1EC7n "pending" ch\u01B0a \u0111o \u0111\u01B0\u1EE3c.
3. C\u1ED5 phi\u1EBFu: \u0111\u1ED9 nh\u1EA1y \u0111\xE3 co r\xFAt v\u1EC1 ng\xE0nh; b\u1EADc c\u1EE7a m\xE3 kh\xF4ng cao h\u01A1n b\u1EADc c\u1EE7a ng\xE0nh.
4. K\u1EBFt n\u1ED1i th\u1ECB tr\u01B0\u1EDDng m\xF4 t\u1EA3 tr\u1EA1ng th\xE1i truy\u1EC1n bi\u1EBFn \u0111\u1ED9ng, kh\xF4ng d\u1EF1 b\xE1o h\u01B0\u1EDBng \u0111i; ph\u1EE5 thu\u1ED9c \u0111u\xF4i ch\u1EC9 n\xF3i v\u1EC1 x\xE1c su\u1EA5t c\xF9ng s\u1EE5t m\u1EA1nh.
5. K\u1ECBch b\u1EA3n: conclusive = false ngh\u0129a l\xE0 ch\u01B0a k\u1EBFt lu\u1EADn \u0111\u01B0\u1EE3c h\u01B0\u1EDBng. \u0110\xE2y l\xE0 suy di\u1EC5n l\u1ECBch s\u1EED, kh\xF4ng ph\u1EA3i d\u1EF1 b\xE1o hay khuy\u1EBFn ngh\u1ECB mua b\xE1n.
6. N\u1EBFu k\u1EBFt qu\u1EA3 c\xF3 notice (d\u1EEF li\u1EC7u m\xF4 ph\u1ECFng) h\xE3y n\xEAu ngay \u0111\u1EA7u c\xE2u tr\u1EA3 l\u1EDDi.`;
var round2 = (v, d = 2) => Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : NaN;
function createWorldChatTools(api) {
  const call = async (method, path, body) => {
    const r = await api.handle({ method, path: `/api/world/${path}`, query: method === "GET" ? Object.fromEntries(Object.entries(body ?? {}).map(([k, v]) => [k, String(v)])) : {}, body: method === "POST" ? body : void 0 });
    return { status: r.status, body: r.body };
  };
  const fail = (r) => ({ ok: false, error: String(r.body.error ?? `L\u1ED7i ${r.status}`) });
  const withAsOf = (a, extra = {}) => ({ ...extra, ...a.asOf ? { asOf: a.asOf } : {} });
  const handlers = {
    async world_links(a) {
      const r = await call("POST", "matrix", withAsOf(a));
      if (r.status !== 200) return fail(r);
      const name = Object.fromEntries(r.body.factors.map((f) => [f.id, f.nameVi]));
      const sname = Object.fromEntries(r.body.sectors.map((s) => [s.id, s.nameVi]));
      const all = r.body.cells.filter((c) => (!a.factor || c.factor === a.factor) && (!a.sector || c.sector === a.sector));
      const rows = all.filter((c) => a.includeC === true || c.tier !== "C").sort((x, y) => Math.abs(y.t) - Math.abs(x.t)).slice(0, Math.min(15, Math.max(1, Math.floor(a.topN ?? 8))));
      return {
        ok: true,
        notice: r.body.notice,
        data: { counts: r.body.counts, matched: all.length, rows: rows.map((c) => ({ factor: c.factor, factorName: name[c.factor], sector: c.sector, sectorName: sname[c.sector], direction: c.direction === "+" ? "t\u0103ng" : "gi\u1EA3m", beta: round2(c.beta), t: round2(c.t, 1), q: c.q < 1e-3 ? "<0.001" : round2(c.q, 3), lagMonths: c.lag, tier: c.tier, reason: c.reasonVi })) },
        guidance: ["Lu\xF4n n\xEAu b\u1EADc (A/B/C), h\u01B0\u1EDBng v\xE0 \u0111\u1ED9 tr\u1EC5 khi n\xEAu m\u1ED9t li\xEAn k\u1EBFt.", 'B\u1EADc C l\xE0 ch\u01B0a \u0111\u1EE7 b\u1EB1ng ch\u1EE9ng ho\u1EB7c gi\u1EA3 thuy\u1EBFt, kh\xF4ng ph\u1EA3i "c\xF3 t\xE1c \u0111\u1ED9ng".', ...rows.length === 0 ? ["Kh\xF4ng c\xF3 li\xEAn k\u1EBFt b\u1EADc A/B n\xE0o tho\u1EA3 \u0111i\u1EC1u ki\u1EC7n: n\xF3i th\u1EADt l\xE0 ch\u01B0a t\xECm th\u1EA5y b\u1EB1ng ch\u1EE9ng."] : []]
      };
    },
    async world_events(a) {
      if (a.eventId) {
        const r2 = await call("GET", `events/${a.eventId}`);
        if (r2.status !== 200) return fail(r2);
        const e = r2.body.event;
        return {
          ok: true,
          notice: r2.body.notice,
          data: { id: e.id, title: e.titleVi, tier: e.tier, status: e.status ?? null, sessionDate: r2.body.alignment?.date ?? null, sector: e.sectorName ?? null, carPct: e.car === void 0 ? null : round2(e.car), q: e.q === void 0 ? null : round2(e.q, 4), ci90: e.ci90 ? [round2(e.ci90[0]), round2(e.ci90[1])] : null, bmp: e.bmp ?? null, topSectors: r2.body.sectors.slice(0, 3).map((s) => ({ name: s.nameVi, carPct: round2(s.car) })), reason: e.reasonVi ?? null },
          guidance: ["Ph\u1EA3n \u1EE9ng l\xE0 l\u1EE3i su\u1EA5t b\u1EA5t th\u01B0\u1EDDng t\xEDch lu\u1EF9 (\u22121, +3) so v\u1EDBi m\xF4 h\xECnh th\u1ECB tr\u01B0\u1EDDng.", 'S\u1EF1 ki\u1EC7n c\xF3 tier "pending" ch\u01B0a \u0111o \u0111\u01B0\u1EE3c; kh\xF4ng suy di\u1EC5n.']
        };
      }
      const r = await call("GET", "events");
      if (r.status !== 200) return fail(r);
      return {
        ok: true,
        notice: r.body.notice,
        data: { events: r.body.events.map((e) => ({ id: e.id, title: e.titleVi, tier: e.tier, sector: e.sectorName ?? null, carPct: e.car === void 0 ? null : round2(e.car, 1), q: e.q === void 0 ? null : round2(e.q, 4) })) },
        guidance: ["Hi\u1EC7u ch\u1EC9nh ki\u1EC3m \u0111\u1ECBnh b\u1ED9i tr\xEAn to\xE0n b\u1ED9 s\u1EF1 ki\u1EC7n \xD7 ng\xE0nh.", "Tier C l\xE0 ch\u01B0a \u0111\u1EE7 b\u1EB1ng ch\u1EE9ng; pending l\xE0 ch\u01B0a \u0111\u1EE7 phi\xEAn \u0111\u1EC3 \u0111o."]
      };
    },
    async world_connectedness() {
      const r = await call("GET", "connectedness");
      if (r.status !== 200) return fail(r);
      const b = r.body;
      return {
        ok: true,
        notice: b.notice,
        data: { totalRecentPct: round2(b.recent.total, 1), totalFullSamplePct: round2(b.full.total, 1), vnReceivesFrom: b.vnReceivesFrom.map((x) => ({ market: x.nameVi, sharePct: round2(x.share, 1) })), netTransmitters: b.names.map((n, i) => ({ market: n, netPct: round2(b.recent.net[i], 1) })).sort((x, y) => y.netPct - x.netPct), tailDependence: b.tailDependence.map((t) => ({ market: t.nameVi, jointCrashProb: round2(t.lowerTail, 2), independentBaseline: t.independentBaseline })) },
        guidance: ["\u0110o m\u1EE9c truy\u1EC1n bi\u1EBFn \u0111\u1ED9ng, kh\xF4ng d\u1EF1 b\xE1o h\u01B0\u1EDBng \u0111i.", "Ph\u1EE5 thu\u1ED9c \u0111u\xF4i l\xE0 x\xE1c su\u1EA5t c\xF9ng n\u1EB1m trong 5% ng\xE0y t\u1EC7 nh\u1EA5t; hai th\u1ECB tr\u01B0\u1EDDng \u0111\u1ED9c l\u1EADp cho kho\u1EA3ng 0,05."]
      };
    },
    async world_scenario(a) {
      if (!a.scenarioId && !(Array.isArray(a.shocks) && a.shocks.length)) return { ok: false, error: "C\u1EA7n scenarioId (tariff-up, usd-strong, oil-spike, fed-cut, china-recovery, risk-off) ho\u1EB7c shocks." };
      const body = { horizon: a.horizon ?? 3 };
      if (a.scenarioId) body.scenarioId = a.scenarioId;
      else body.shocks = a.shocks;
      const r = await call("POST", "scenario", body);
      if (r.status !== 200) return fail(r);
      return {
        ok: true,
        notice: r.body.notice,
        data: { scenario: r.body.scenario.nameVi, horizonMonths: r.body.horizon, conclusiveSectors: r.body.conclusiveCount, sectors: r.body.sectors.map((s) => ({ name: s.nameVi, estPct: round2(s.est, 1), ciLowPct: round2(s.lo, 1), ciHighPct: round2(s.hi, 1), conclusive: s.conclusive })), stocks: r.body.stocks.slice(0, 5).map((s) => ({ code: s.code, sector: s.sectorName, estPct: round2(s.est, 1), tier: s.tier })), warnings: r.body.warnings },
        guidance: ["Kho\u1EA3ng tin c\u1EADy 90%; conclusive = false ngh\u0129a l\xE0 ch\u01B0a k\u1EBFt lu\u1EADn \u0111\u01B0\u1EE3c h\u01B0\u1EDBng.", "B\u1EADc c\u1EE7a m\xE3 kh\xF4ng cao h\u01A1n b\u1EADc c\u1EE7a ng\xE0nh.", "Suy di\u1EC5n l\u1ECBch s\u1EED, kh\xF4ng ph\u1EA3i d\u1EF1 b\xE1o hay khuy\u1EBFn ngh\u1ECB."]
      };
    },
    async world_stock_profile(a) {
      const r = await call("GET", `stock/${a.code}`);
      if (r.status !== 200) return fail(r);
      const b = r.body;
      return {
        ok: true,
        notice: b.notice,
        data: { code: b.code, sector: b.sectorName, revenueByRegionPct: b.exposure.revenueByRegion, fxRevenuePct: round2(b.exposure.fxRevenueShare * 100, 0), fxDebtPct: round2(b.exposure.fxDebtShare * 100, 0), source: `${b.exposure.sourceRef}, k\u1EF3 ${b.exposure.asOfPeriod}`, betas: b.betas.map((x) => ({ factor: x.nameVi, own: round2(x.own), sectorPrior: round2(x.sectorPrior), shrunk: round2(x.shrunk), ownDataWeightPct: round2(x.ownWeight * 100, 0), tier: x.tier })) },
        guidance: ["Ph\u01A1i nhi\u1EC5m l\xE0 d\u1EEF ki\u1EC7n t\u1EEB b\xE1o c\xE1o t\xE0i ch\xEDnh; \u0111\u1ED9 nh\u1EA1y l\xE0 \u01B0\u1EDBc l\u01B0\u1EE3ng \u0111\xE3 co r\xFAt v\u1EC1 ng\xE0nh.", "B\u1EADc c\u1EE7a m\xE3 kh\xF4ng cao h\u01A1n b\u1EADc c\u1EE7a ng\xE0nh."]
      };
    }
  };
  return {
    specs: WORLD_TOOL_SPECS,
    async run(name, args) {
      const spec = WORLD_TOOL_SPECS.find((s) => s.name === name);
      if (!spec) return { ok: false, error: `Kh\xF4ng c\xF3 c\xF4ng c\u1EE5 ${name}. C\xF4ng c\u1EE5 h\u1EE3p l\u1EC7: ${WORLD_TOOL_SPECS.map((s) => s.name).join(", ")}.` };
      const bad = validateArgs(spec.parameters, args);
      if (bad) return { ok: false, error: bad };
      try {
        return await handlers[name](args ?? {});
      } catch {
        return { ok: false, error: "L\u1ED7i n\u1ED9i b\u1ED9 khi ch\u1EA1y c\xF4ng c\u1EE5 th\u1EBF gi\u1EDBi." };
      }
    }
  };
}
export {
  InMemoryVintageStore,
  MACRO_CHAT_SYSTEM_PROMPT,
  MACRO_TOOL_SPECS,
  SYNTHETIC_NOTICE,
  VN_CATALOG,
  VN_SECTORS,
  WORLD_CATALOG,
  WORLD_CHAT_GUIDELINES,
  WORLD_EXTRA_FACTORS,
  WORLD_FACTOR_IDS,
  WORLD_FACTOR_INFO,
  WORLD_MARKETS,
  WORLD_PREREG_PAIRS,
  WORLD_PREREG_VERSION,
  WORLD_SCENARIOS,
  WORLD_SYNTHETIC_NOTICE,
  WORLD_TOOL_SPECS,
  catalogById,
  checkQuality,
  createMacroApi,
  createMacroChatTools,
  createWorldApi,
  createWorldChatTools,
  importSeriesCsv,
  makeSyntheticStore,
  makeSyntheticWorld,
  normalizePeriod,
  runConfirmatory,
  toAnthropicTools,
  validateArgs,
  validateWorldEvent
};
