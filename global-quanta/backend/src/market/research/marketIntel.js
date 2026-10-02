// Market Intelligence cấp VN-Index (hàm thuần, KHÔNG nhìn tương lai: mọi giá trị ngày t chỉ dùng dữ liệu ≤ t).
//   ① Dấu chân dòng tiền lớn toàn thị trường: Σ delta lệnh "tay to" (theo giá trị) / Σ KL khớp liên tục, khối ngoại ròng
//   ② Ngày phân phối / tích luỹ (VN-Index giảm/tăng ≥ 0,2% với KL cao hơn phiên trước, đếm 25 phiên) + nỗ lực/kết quả (VSA theo giá đóng cửa)
//   ③ HMM Gauss 3 trạng thái (Baum–Welch, fit lại mỗi 20 phiên trên dữ liệu quá khứ) -> P(Tăng / Đi ngang / Giảm)
//   ④ Phân kỳ đa khung 5/20/60 phiên: giá vs độ rộng, giá vs dấu chân tay to luỹ kế
//   ⑤ Impulse 2.0 = 75% Impulse cũ + 25% điểm dấu chân tay to
//   ⑥ Xác suất Bayes VN-Index tăng sau T+3/5/10 theo điều kiện hiện tại (Beta–Binomial co về mức nền, n hiệu dụng ≈ n/h)
//   ⑦ Mô hình logistic Bayes (prior Gauss = ridge) walk-forward có purge, Brier skill ngoài mẫu + KTC bootstrap khối;
//      trọng số kèm KTC bootstrap. Chỉ "đạt" khi cận dưới KTC 95% của skill > 0.

import { HORIZONS } from "./feedback.js";

export const INTEL_KV = "research:intel";
export const INTEL_SIGNALS_KV = "research:intel-signals-through";
export const MODEL_FEATURES = [
  { name: "zLd5", label: "Dấu chân tay to 5 phiên (z)" },
  { name: "zFr5", label: "Khối ngoại ròng 5 phiên (z)" },
  { name: "dist25", label: "Ngày phân phối 25 phiên" },
  { name: "hmmTilt", label: "HMM: P(tăng) − P(giảm)" },
  { name: "breadth", label: "Độ rộng (% trên MA20)" },
  { name: "div", label: "Phân kỳ đa khung" },
  { name: "impulse", label: "Market Impulse" },
];

// ---------------------------------------------------------------- tiện ích số
const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const sd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length); };
const clip = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const r4 = (v) => (isNum(v) ? Math.round(v * 1e4) / 1e4 : null);
const sigmoid = (z) => 1 / (1 + Math.exp(-z));

/** PRNG tất định (bootstrap lặp lại được). */
export function rng(seed = 7) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

/** z của giá trị hôm nay so với `window` giá trị TRƯỚC đó (không gồm hôm nay). */
export function pastZ(values, window = 60, minN = 20) {
  return values.map((v, i) => {
    if (!isNum(v)) return null;
    const past = values.slice(Math.max(0, i - window), i).filter(isNum);
    if (past.length < minN) return null;
    const s = sd(past);
    return s > 0 ? (v - mean(past)) / s : 0;
  });
}

/** Phân vị của giá trị hôm nay trong `window` giá trị TRƯỚC đó (0..1; bằng nhau tính một nửa). */
export function pastPercentile(values, window = 250, minN = 60) {
  return values.map((v, i) => {
    if (!isNum(v)) return null;
    const past = values.slice(Math.max(0, i - window), i).filter(isNum);
    if (past.length < minN) return null;
    return (past.filter((x) => x < v).length + 0.5 * past.filter((x) => x === v).length) / past.length;
  });
}

export function rollingSum(values, w) {
  return values.map((_, i) => {
    if (i + 1 < w) return null;
    const win = values.slice(i - w + 1, i + 1);
    return win.every(isNum) ? win.reduce((a, b) => a + b, 0) : null;
  });
}

// ---------------------------------------------------------------- ① dấu chân dòng tiền
/**
 * @param {Map<string, {date, close, delta, largeDelta, continuousVolume}[]>} flowBySymbol
 * @param {Map<string, {date, value, foreignBuyVal, foreignSellVal}[]>} dailyBySymbol
 */
export function footprintByDate(flowBySymbol, dailyBySymbol, minSymbols = 20) {
  const acc = new Map();
  for (const rows of flowBySymbol.values()) for (const f of rows) {
    if (!(f.close > 0) || !(f.continuousVolume > 0)) continue;
    const a = acc.get(f.date) ?? { ld: 0, dl: 0, cv: 0, n: 0 };
    a.ld += (f.largeDelta ?? 0) * f.close;
    a.dl += (f.delta ?? 0) * f.close;
    a.cv += f.continuousVolume * f.close;
    a.n++;
    acc.set(f.date, a);
  }
  const fr = new Map();
  for (const rows of dailyBySymbol.values()) for (const d of rows) {
    if (!isNum(d.foreignBuyVal) && !isNum(d.foreignSellVal)) continue;
    const a = fr.get(d.date) ?? { net: 0, val: 0 };
    a.net += (d.foreignBuyVal ?? 0) - (d.foreignSellVal ?? 0);
    a.val += d.value ?? 0;
    fr.set(d.date, a);
  }
  return [...acc.keys()].filter((d) => acc.get(d).n >= minSymbols).sort().map((date) => {
    const a = acc.get(date), f = fr.get(date);
    return { date, ld: a.ld / a.cv, dl: a.dl / a.cv, fr: f && f.val > 0 ? f.net / f.val : null, symbols: a.n };
  });
}

// ---------------------------------------------------------------- ② ngày phân phối + VSA
/** @param {{date, close, volume}[]} bars cũ -> mới */
export function distributionDays(bars, window = 25) {
  const flags = bars.map((b, i) => {
    if (i === 0 || !(bars[i - 1].close > 0)) return { dist: false, acc: false, ret: null };
    const ret = b.close / bars[i - 1].close - 1;
    const more = (b.volume ?? 0) > (bars[i - 1].volume ?? 0);
    return { dist: ret <= -0.002 && more, acc: ret >= 0.002 && more, ret };
  });
  const logVol = bars.map((b) => (b.volume > 0 ? Math.log(b.volume) : null));
  const absRet = flags.map((f) => (f.ret === null ? null : Math.abs(f.ret)));
  const zVol = pastZ(logVol, 60, 20), zMove = pastZ(absRet, 60, 20);
  return bars.map((b, i) => {
    const win = flags.slice(Math.max(0, i - window + 1), i + 1);
    // Nỗ lực lớn (KL cao) nhưng kết quả nhỏ (giá đi ít) = hấp thụ / phân phối ngầm theo VSA.
    const effortNoResult = isNum(zVol[i]) && isNum(zMove[i]) && zVol[i] >= 1.5 && zMove[i] <= 0.5;
    return {
      date: b.date, dist: win.filter((f) => f.dist).length, acc: win.filter((f) => f.acc).length,
      isDist: flags[i].dist, isAcc: flags[i].acc, zVol: r4(zVol[i]), zMove: r4(zMove[i]), effortNoResult,
    };
  });
}

// ---------------------------------------------------------------- ③ HMM Gauss (đường chéo)
const LOG2PI = Math.log(2 * Math.PI);
function logEmission(model, x) {
  return model.mu.map((mu, k) => {
    let ll = 0;
    for (let d = 0; d < x.length; d++) {
      const v = model.var[k][d];
      ll += -0.5 * (LOG2PI + Math.log(v) + ((x[d] - mu[d]) ** 2) / v);
    }
    return ll;
  });
}
/** Xác suất phát xạ đã chia hằng số theo từng t (không đổi gamma/xi sau chuẩn hoá). */
function emissions(model, X) {
  return X.map((x) => {
    const l = logEmission(model, x);
    const m = Math.max(...l);
    return l.map((v) => Math.exp(v - m));
  });
}

/** Baum–Welch, khởi tạo theo tam phân vị của chiều 0; trạng thái sắp theo trung bình chiều 0 (thấp -> cao). */
export function fitGaussianHmm(X, K = 3, { iters = 60, varFloor = 0.02 } = {}) {
  const T = X.length, D = X[0].length;
  const order = X.map((x, i) => [x[0], i]).sort((a, b) => a[0] - b[0]).map((p) => p[1]);
  const groups = Array.from({ length: K }, (_, k) => order.slice(Math.floor((k * T) / K), Math.floor(((k + 1) * T) / K)));
  const allVar = Array.from({ length: D }, (_, d) => Math.max(varFloor, sd(X.map((x) => x[d])) ** 2));
  let model = {
    pi: Array(K).fill(1 / K),
    A: Array.from({ length: K }, (_, i) => Array.from({ length: K }, (_, j) => (i === j ? 0.9 : 0.1 / (K - 1)))),
    mu: groups.map((g) => Array.from({ length: D }, (_, d) => mean(g.map((i) => X[i][d])))),
    var: groups.map(() => [...allVar]),
  };
  for (let it = 0; it < iters; it++) {
    const B = emissions(model, X);
    const alpha = [], c = [];
    for (let t = 0; t < T; t++) {
      const a = Array(K).fill(0);
      for (let j = 0; j < K; j++) {
        let s = 0;
        if (t === 0) s = model.pi[j];
        else for (let i = 0; i < K; i++) s += alpha[t - 1][i] * model.A[i][j];
        a[j] = s * B[t][j];
      }
      const n = a.reduce((x, y) => x + y, 0) || 1e-300;
      c.push(n);
      alpha.push(a.map((v) => v / n));
    }
    const beta = Array(T);
    beta[T - 1] = Array(K).fill(1);
    for (let t = T - 2; t >= 0; t--) {
      const b = Array(K).fill(0);
      for (let i = 0; i < K; i++) for (let j = 0; j < K; j++) b[i] += model.A[i][j] * B[t + 1][j] * beta[t + 1][j];
      beta[t] = b.map((v) => v / c[t + 1]);
    }
    const gamma = alpha.map((a, t) => { const g = a.map((v, k) => v * beta[t][k]); const s = g.reduce((x, y) => x + y, 0) || 1e-300; return g.map((v) => v / s); });
    const xiSum = Array.from({ length: K }, () => Array(K).fill(0));
    for (let t = 0; t < T - 1; t++) {
      let s = 0;
      const xi = Array.from({ length: K }, (_, i) => Array.from({ length: K }, (_, j) => { const v = alpha[t][i] * model.A[i][j] * B[t + 1][j] * beta[t + 1][j]; s += v; return v; }));
      for (let i = 0; i < K; i++) for (let j = 0; j < K; j++) xiSum[i][j] += xi[i][j] / (s || 1e-300);
    }
    const gSum = Array.from({ length: K }, (_, k) => gamma.reduce((x, g) => x + g[k], 0));
    const gSumNoLast = gSum.map((v, k) => v - gamma[T - 1][k]);
    model = {
      pi: gamma[0],
      A: xiSum.map((row, i) => { const s = gSumNoLast[i] || 1e-300; const r = row.map((v) => v / s); const t = r.reduce((x, y) => x + y, 0) || 1; return r.map((v) => v / t); }),
      mu: Array.from({ length: K }, (_, k) => Array.from({ length: D }, (_, d) => gamma.reduce((x, g, t) => x + g[k] * X[t][d], 0) / (gSum[k] || 1e-300))),
      var: null,
    };
    model.var = Array.from({ length: K }, (_, k) => Array.from({ length: D }, (_, d) => Math.max(varFloor, gamma.reduce((x, g, t) => x + g[k] * (X[t][d] - model.mu[k][d]) ** 2, 0) / (gSum[k] || 1e-300))));
  }
  // Sắp trạng thái theo trung bình chiều 0 (lợi suất 5 phiên): 0 = Giảm, 1 = Đi ngang, 2 = Tăng.
  const idx = model.mu.map((m, k) => [m[0], k]).sort((a, b) => a[0] - b[0]).map((p) => p[1]);
  return {
    pi: idx.map((k) => model.pi[k]),
    A: idx.map((i) => idx.map((j) => model.A[i][j])),
    mu: idx.map((k) => model.mu[k]),
    var: idx.map((k) => model.var[k]),
  };
}

/** Lọc thuận: P(trạng thái_t | x_1..x_t) — chỉ dùng dữ liệu tới t. */
export function forwardFilter(model, X) {
  const K = model.pi.length;
  const B = emissions(model, X);
  const out = [];
  let prev = null;
  for (let t = 0; t < X.length; t++) {
    const a = Array(K).fill(0);
    for (let j = 0; j < K; j++) {
      let s = 0;
      if (!prev) s = model.pi[j];
      else for (let i = 0; i < K; i++) s += prev[i] * model.A[i][j];
      a[j] = s * B[t][j];
    }
    const n = a.reduce((x, y) => x + y, 0) || 1e-300;
    prev = a.map((v) => v / n);
    out.push(prev);
  }
  return out;
}

/** Đặc trưng HMM từ VN-Index: lợi suất log 5 phiên (%) và độ biến động 20 phiên (% / phiên). */
export function hmmFeatures(closes) {
  const lr = closes.map((c, i) => (i > 0 && closes[i - 1] > 0 && c > 0 ? Math.log(c / closes[i - 1]) : null));
  return closes.map((c, i) => {
    if (i < 20 || !(closes[i - 5] > 0)) return null;
    const win = lr.slice(i - 19, i + 1);
    if (!win.every(isNum)) return null;
    return [100 * Math.log(c / closes[i - 5]), 100 * sd(win)];
  });
}

/**
 * Walk-forward: tại mỗi mốc t0 (bắt đầu từ minTrain, cách nhau `refit`), chuẩn hoá + fit trên X[0..t0),
 * rồi lọc thuận để có xác suất cho các ngày t0..t0+refit−1. Trước minTrain: null.
 */
export function walkForwardHmm(feats, { minTrain = 250, refit = 20, iters = 50 } = {}) {
  const valid = feats.map((f, i) => (f ? i : -1)).filter((i) => i >= 0);
  const out = feats.map(() => null);
  let last = null;
  for (let s = minTrain; s < valid.length; s += refit) {
    const train = valid.slice(0, s).map((i) => feats[i]);
    const D = train[0].length;
    const m = Array.from({ length: D }, (_, d) => mean(train.map((x) => x[d])));
    const v = Array.from({ length: D }, (_, d) => sd(train.map((x) => x[d])) || 1);
    const z = (x) => x.map((val, d) => (val - m[d]) / v[d]);
    const model = fitGaussianHmm(train.map(z), 3, { iters });
    const upto = Math.min(valid.length, s + refit);
    const probs = forwardFilter(model, valid.slice(0, upto).map((i) => z(feats[i])));
    for (let k = s; k < upto; k++) out[valid[k]] = probs[k];
    last = { model, mean: m, sd: v, trainedThrough: valid[s - 1] };
  }
  return { probs: out, last };
}

// ---------------------------------------------------------------- ④ phân kỳ đa khung
const rankIn = (arr, i, w) => {
  if (i - w + 1 < 0) return null;
  const win = arr.slice(i - w + 1, i + 1);
  if (!win.every(isNum)) return null;
  return win.filter((x) => x < arr[i]).length / (w - 1);
};
/** Giá ở vùng cao của cửa sổ mà chỉ báo ở vùng thấp -> phân kỳ âm; ngược lại -> phân kỳ dương. */
export function divergencesAt(closes, indicators, i, windows = [5, 20, 60]) {
  const out = [];
  for (const w of windows) for (const [name, values] of Object.entries(indicators)) {
    const pr = rankIn(closes, i, w), ir = rankIn(values, i, w);
    if (pr === null || ir === null) continue;
    const type = pr >= 0.8 && ir <= 0.4 ? "bearish" : pr <= 0.2 && ir >= 0.6 ? "bullish" : null;
    out.push({ window: w, indicator: name, priceRank: r4(pr), indRank: r4(ir), type });
  }
  return out;
}
export const divergenceScore = (list) => list.reduce((s, d) => s + (d.type === "bullish" ? 1 : d.type === "bearish" ? -1 : 0), 0);

// ---------------------------------------------------------------- ⑥ Beta / Bayes
function betacf(a, b, x) {
  const MAXIT = 200, EPS = 3e-14, FPMIN = 1e-300;
  let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}
function lgamma(z) {
  const g = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let x = z, y = z, tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (const c of g) ser += c / ++y;
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}
/** Hàm beta không đầy đủ chuẩn hoá I_x(a, b). */
export function ibeta(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b;
}
export function betaInv(p, a, b) {
  let lo = 0, hi = 1;
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (ibeta(mid, a, b) < p) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

/**
 * Hậu nghiệm Beta của P(tăng) cho một nhóm ngày: prior Beta(k·p0, k·(1−p0)) (co về mức nền),
 * dữ liệu được giảm trọng số về n hiệu dụng ≈ n/h vì cửa sổ T+h của các ngày liền nhau chồng lấn.
 */
export function betaPosterior(ups, n, h, p0, k = 10) {
  const w = n ? Math.max(1, n / h) / n : 0;
  const a = k * p0 + ups * w, b = k * (1 - p0) + (n - ups) * w;
  return { n, nEff: Math.round(n * w), ups, mean: r4(a / (a + b)), lo: r4(betaInv(0.025, a, b)), hi: r4(betaInv(0.975, a, b)), raw: n ? r4(ups / n) : null };
}

// ---------------------------------------------------------------- ⑦ logistic Bayes (MAP, prior Gauss)
/** Newton–Raphson cho logistic có phạt L2 (prior Gauss σ² = 1/λ trên hệ số, không phạt hệ số chặn). */
export function fitLogistic(X, y, { lambda = 2, iters = 30 } = {}) {
  const D = X[0].length + 1;
  let w = Array(D).fill(0);
  const rows = X.map((x) => [1, ...x]);
  for (let it = 0; it < iters; it++) {
    const g = Array(D).fill(0);
    const H = Array.from({ length: D }, () => Array(D).fill(0));
    for (let i = 0; i < rows.length; i++) {
      const p = sigmoid(rows[i].reduce((s, v, j) => s + v * w[j], 0));
      const e = p - y[i], s = p * (1 - p);
      for (let j = 0; j < D; j++) {
        g[j] += e * rows[i][j];
        for (let k = 0; k < D; k++) H[j][k] += s * rows[i][j] * rows[i][k];
      }
    }
    for (let j = 1; j < D; j++) { g[j] += lambda * w[j]; H[j][j] += lambda; }
    H[0][0] += 1e-6;
    const step = solve(H, g);
    if (!step) break;
    w = w.map((v, j) => v - step[j]);
    if (Math.max(...step.map(Math.abs)) < 1e-8) break;
  }
  return w;
}
function solve(A, b) {
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((r, i) => r[n] / r[i]);
}
const predict = (w, x) => sigmoid(w[0] + x.reduce((s, v, j) => s + v * w[j + 1], 0));
function standardizer(X) {
  const D = X[0].length;
  const m = Array.from({ length: D }, (_, d) => mean(X.map((x) => x[d])));
  const s = Array.from({ length: D }, (_, d) => sd(X.map((x) => x[d])) || 1);
  return (x) => x.map((v, d) => (v - m[d]) / s[d]);
}

/** Bootstrap khối (giữ phụ thuộc chuỗi thời gian): trả về chỉ số mẫu. */
function blockSample(n, block, r) {
  const idx = [];
  while (idx.length < n) {
    const start = Math.floor(r() * Math.max(1, n - block + 1));
    for (let k = 0; k < block && idx.length < n; k++) idx.push(start + k);
  }
  return idx;
}
const quantile = (arr, q) => { const s = [...arr].sort((a, b) => a - b); const p = (s.length - 1) * q; const lo = Math.floor(p); return s[lo] + (s[Math.ceil(p)] - s[lo]) * (p - lo); };

/**
 * @param {{ i: number, x: number[], y: 0|1 }[]} samples theo thứ tự thời gian (i = chỉ số ngày)
 * Huấn luyện tại ngày t chỉ dùng mẫu có i ≤ t − h (purge: nhãn T+h đã biết). Mức nền = tỷ lệ tăng trong tập huấn luyện.
 */
export function walkForwardLogistic(samples, h, { minTrain = 120, refit = 20, lambda = 2, bootstrap = 300, block = 20, seed = 11 } = {}) {
  const preds = [];
  let w = null, zf = null, baseRate = null;
  for (let s = 0; s < samples.length; s++) {
    const t = samples[s].i;
    const train = samples.filter((p) => p.i <= t - h);
    if (train.length < minTrain) continue;
    if (!w || preds.length % refit === 0) {
      zf = standardizer(train.map((p) => p.x));
      w = fitLogistic(train.map((p) => zf(p.x)), train.map((p) => p.y), { lambda });
      baseRate = mean(train.map((p) => p.y));
    }
    preds.push({ i: t, p: predict(w, zf(samples[s].x)), base: baseRate, y: samples[s].y });
  }
  if (preds.length < 30) return { n: preds.length, skill: null, lo: null, hi: null, passed: false, preds };
  const skillOf = (idx) => {
    let bm = 0, bb = 0;
    for (const k of idx) { const q = preds[k]; bm += (q.p - q.y) ** 2; bb += (q.base - q.y) ** 2; }
    return bb > 0 ? 1 - bm / bb : 0;
  };
  const all = preds.map((_, k) => k);
  const skill = skillOf(all);
  const r = rng(seed);
  const boots = Array.from({ length: bootstrap }, () => skillOf(blockSample(preds.length, Math.max(h, block), r)));
  const lo = quantile(boots, 0.025), hi = quantile(boots, 0.975);
  const hit = mean(preds.map((q) => ((q.p >= 0.5 ? 1 : 0) === q.y ? 1 : 0)));
  return { n: preds.length, nEff: Math.round(preds.length / h), skill: r4(skill), lo: r4(lo), hi: r4(hi), hitRate: r4(hit), passed: lo > 0, preds };
}

/** Trọng số mô hình cuối (fit toàn bộ mẫu có nhãn) + KTC 95% bootstrap khối. Đặc trưng đã chuẩn hoá -> so sánh được độ lớn. */
export function finalModel(samples, h, latestX, { lambda = 2, bootstrap = 200, block = 20, seed = 5 } = {}) {
  if (samples.length < 60) return null;
  const zf = standardizer(samples.map((p) => p.x));
  const X = samples.map((p) => zf(p.x)), y = samples.map((p) => p.y);
  const w = fitLogistic(X, y, { lambda });
  const r = rng(seed);
  const boots = Array.from({ length: bootstrap }, () => {
    const idx = blockSample(samples.length, Math.max(h, block), r);
    return fitLogistic(idx.map((k) => X[k]), idx.map((k) => y[k]), { lambda, iters: 15 });
  });
  const weights = MODEL_FEATURES.map((f, j) => {
    const bs = boots.map((b) => b[j + 1]);
    return { name: f.name, label: f.label, coef: r4(w[j + 1]), lo: r4(quantile(bs, 0.025)), hi: r4(quantile(bs, 0.975)) };
  });
  return { n: samples.length, weights, prob: latestX ? r4(predict(w, zf(latestX))) : null, baseRate: r4(mean(y)) };
}

// ---------------------------------------------------------------- lắp ráp
/**
 * @param {{ index: {date, close, volume}[], regimes: {date, regime, impulseScore, breadthPct}[], footprint: ReturnType<typeof footprintByDate> }} input
 */
export function buildMarketIntel({ index, regimes, footprint }, { hmm = {}, model = {} } = {}) {
  if (index.length < 80) return null;
  const dates = index.map((b) => b.date);
  const closes = index.map((b) => b.close);
  const reg = new Map(regimes.map((r) => [r.date, r]));
  const fp = new Map(footprint.map((f) => [f.date, f]));

  // ① dấu chân: căn theo ngày VN-Index, cộng dồn 5 phiên, z so 60 phiên trước.
  const ld = dates.map((d) => fp.get(d)?.ld ?? null), fr = dates.map((d) => fp.get(d)?.fr ?? null);
  const ld5 = rollingSum(ld, 5), fr5 = rollingSum(fr, 5);
  const zLd5 = pastZ(ld5), zFr5 = pastZ(fr5);
  let cum = 0;
  const ldCum = ld.map((v) => (isNum(v) ? (cum += v) : null));
  // ② ngày phân phối + VSA
  const dd = distributionDays(index);
  // Ngưỡng tương đối: với VN-Index, "≥ 5 ngày phân phối / 25 phiên" (chuẩn Mỹ) đúng ở hơn nửa số phiên -> dùng phân vị 250 phiên trước.
  const distPct = pastPercentile(dd.map((x) => x.dist));
  // ③ HMM
  const { probs, last } = walkForwardHmm(hmmFeatures(closes), hmm);
  // ④ phân kỳ
  const breadth = dates.map((d) => reg.get(d)?.breadthPct ?? null);
  const divs = dates.map((_, i) => divergencesAt(closes, { breadth, footprint: ldCum }, i));

  const days = dates.map((date, i) => {
    const r = reg.get(date);
    const imp = r?.impulseScore ?? null;
    const p = probs[i];
    const footScore = isNum(zLd5[i]) ? 50 + 25 * clip(zLd5[i], -2, 2) : null;
    const impulse2 = isNum(imp) && isNum(footScore) ? clip(0.75 * imp + 0.25 * footScore, 0, 100) : null;
    const div = divergenceScore(divs[i]);
    const riskParts = [distPct[i], isNum(zLd5[i]) ? sigmoid(-zLd5[i]) : null, isNum(breadth[i]) ? 1 - breadth[i] / 100 : null, p ? p[0] : null].filter(isNum);
    return {
      date, close: closes[i], regime: r?.regime ?? null, impulse: imp, impulse2: r4(impulse2), breadth: breadth[i],
      zLd5: r4(zLd5[i]), zFr5: r4(zFr5[i]), dist25: dd[i].dist, distPct: r4(distPct[i]), acc25: dd[i].acc, isDist: dd[i].isDist, effortNoResult: dd[i].effortNoResult,
      pBear: p ? r4(p[0]) : null, pNeutral: p ? r4(p[1]) : null, pBull: p ? r4(p[2]) : null,
      div, risk: riskParts.length >= 2 ? Math.round(mean(riskParts) * 100) : null,
    };
  });

  // ⑥ Bayes theo điều kiện hiện tại
  const cur = days.at(-1);
  const hmmState = (d) => (d.pBull === null ? null : [d.pBear, d.pNeutral, d.pBull].indexOf(Math.max(d.pBear, d.pNeutral, d.pBull)));
  const fpBucket = (z) => (!isNum(z) ? null : z >= 1 ? "HIGH" : z <= -1 ? "LOW" : "MID");
  const ddBucket = (q) => (!isNum(q) ? null : q >= 0.8 ? "HIGH" : q <= 0.2 ? "LOW" : "MID");
  const divBucket = (s) => (s >= 2 ? "BULL" : s <= -2 ? "BEAR" : "NONE");
  const conditions = [
    { id: "hmm", label: "Chế độ HMM", value: hmmState(cur), of: hmmState, names: ["Giảm", "Đi ngang", "Tăng"] },
    { id: "regime", label: "Trạng thái (luật MA)", value: cur.regime, of: (d) => d.regime, names: { UPTREND: "Uptrend", SIDEWAY: "Sideway", DOWNTREND: "Downtrend" } },
    { id: "footprint", label: "Dấu chân tay to", value: fpBucket(cur.zLd5), of: (d) => fpBucket(d.zLd5), names: { HIGH: "z ≥ 1 (gom mạnh)", MID: "trung tính", LOW: "z ≤ −1 (xả mạnh)" } },
    { id: "dist", label: "Ngày phân phối 25 phiên", value: ddBucket(cur.distPct), of: (d) => ddBucket(d.distPct), names: { HIGH: "nhiều bất thường (top 20%)", MID: "bình thường", LOW: "ít (đáy 20%)" } },
    { id: "div", label: "Phân kỳ đa khung", value: divBucket(cur.div), of: (d) => divBucket(d.div), names: { BULL: "dương", NONE: "không", BEAR: "âm" } },
  ];
  const bayes = {};
  for (const h of HORIZONS) {
    const known = days.map((d, i) => ({ d, i })).filter(({ i }) => i + h < days.length);
    const up = (i) => (days[i + h].close > days[i].close ? 1 : 0);
    const p0 = mean(known.map(({ i }) => up(i)));
    bayes[h] = {
      base: { n: known.length, p: r4(p0) },
      rows: conditions.filter((c) => c.value !== null && c.value !== undefined).map((c) => {
        const match = known.filter(({ d }) => c.of(d) === c.value);
        const ups = match.reduce((s, { i }) => s + up(i), 0);
        return { id: c.id, label: c.label, value: Array.isArray(c.names) ? c.names[c.value] : c.names[c.value] ?? String(c.value), ...betaPosterior(ups, match.length, h, p0) };
      }),
    };
  }

  // ⑦ mô hình logistic Bayes
  const featOf = (d) => [d.zLd5, d.zFr5, d.dist25, d.pBull !== null ? d.pBull - d.pBear : null, d.breadth, d.div, d.impulse];
  const models = {};
  for (const h of HORIZONS) {
    const samples = days.map((d, i) => ({ i, x: featOf(d), y: i + h < days.length ? (days[i + h].close > d.close ? 1 : 0) : null }))
      .filter((s) => s.x.every(isNum));
    const labeled = samples.filter((s) => s.y !== null);
    const latest = samples.at(-1)?.i === days.length - 1 ? samples.at(-1).x : null;
    const wf = walkForwardLogistic(labeled, h, model);
    const fm = finalModel(labeled, h, latest, model);
    models[h] = {
      samples: labeled.length, oos: { n: wf.n, nEff: wf.nEff ?? null, skill: wf.skill, lo: wf.lo, hi: wf.hi, hitRate: wf.hitRate ?? null }, passed: wf.passed,
      prob: fm?.prob ?? null, baseRate: fm?.baseRate ?? null, weights: fm?.weights ?? [],
    };
  }

  const series = days.slice(-120);
  return {
    asOf: cur.date,
    current: { ...cur, divergences: divs.at(-1), hmmState: hmmState(cur) },
    hmm: last && {
      states: ["Giảm", "Đi ngang", "Tăng"].map((label, k) => ({ label, ret5: r4(last.model.mu[k][0] * last.sd[0] + last.mean[0]), vol20: r4(last.model.mu[k][1] * last.sd[1] + last.mean[1]), stay: r4(last.model.A[k][k]) })),
      trainedThrough: dates[last.trainedThrough] ?? null,
    },
    series,
    bayes,
    models,
    coverage: { indexDays: index.length, footprintDays: footprint.length, from: dates[0], to: cur.date },
    /** Toàn bộ chuỗi ngày (để ghi tín hiệu vào sổ cái); job KHÔNG lưu trường này vào KV. */
    allDays: days,
    notes: "Mọi giá trị ngày t chỉ dùng dữ liệu ≤ t (HMM fit lại mỗi 20 phiên trên quá khứ; mô hình walk-forward có purge T+h). "
      + "Xác suất Bayes co về mức nền và dùng n hiệu dụng ≈ n/h. Thống kê quá khứ, không phải dự báo chắc chắn.",
  };
}

/** Tín hiệu cấp VN-Index đưa vào vòng phản hồi (chấm T+3/5/10 như các tín hiệu khác). */
export function intelSignals(day) {
  const out = [];
  if (isNum(day.zLd5) && Math.abs(day.zLd5) >= 1) out.push({ signal: "FOOTPRINT", direction: Math.sign(day.zLd5), score: day.zLd5 });
  if (isNum(day.impulse2) && (day.impulse2 >= 60 || day.impulse2 <= 40)) out.push({ signal: "IMPULSE2", direction: day.impulse2 >= 60 ? 1 : -1, score: day.impulse2 });
  if (isNum(day.pBull) && (day.pBull >= 0.6 || day.pBear >= 0.6)) out.push({ signal: "HMM_REGIME", direction: day.pBull >= 0.6 ? 1 : -1, score: day.pBull >= 0.6 ? day.pBull : day.pBear });
  if (Math.abs(day.div) >= 2) out.push({ signal: "DIVERGENCE", direction: Math.sign(day.div), score: day.div });
  if (isNum(day.distPct) && day.distPct >= 0.8) out.push({ signal: "DIST_DAYS", direction: -1, score: day.dist25 });
  return out;
}
