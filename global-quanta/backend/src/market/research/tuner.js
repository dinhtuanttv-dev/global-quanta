// Tinh chỉnh trọng số thích ứng (Adaptive Flow Score) — hàm thuần, không phụ thuộc mạng.
//
// Mô hình: hồi quy logistic có L2 KÉO VỀ trọng số heuristic (prior) — dữ liệu ít thì gần heuristic,
// dữ liệu nhiều và nhất quán thì trọng số học được mới lệch khỏi prior.
//   P(mã vượt VN-Index sau h phiên) = σ(b + Σ w_j · x_j),  x chuẩn hoá theo tập huấn luyện.
// Theo trạng thái thị trường: w_regime co về w_global (phạt mạnh) — chỉ lệch khi đủ bằng chứng.
// Kiểm định: walk-forward theo NGÀY, purge + embargo = h phiên (nhãn chồng lấn không rò rỉ),
// chọn λ trên các fold đầu, báo cáo trên fold CUỐI chưa từng dùng để chọn (holdout).
// Thăng hạng (champion/challenger): chỉ thay mô hình đang chạy khi ứng viên có kỹ năng ngoài mẫu
// dương và không kém mô hình hiện hành.

import { FEATURE_NAMES } from "./features.js";

/** Trọng số heuristic (trên đặc trưng đã chuẩn hoá) — điểm xuất phát và đích co của L2. */
export const PRIOR_WEIGHTS = {
  zEffort: 0.10, zResult: 0, zLarge: 0.10, stealth5: 0.05, stealth20: 0.10, netIntent: 0.10,
  pocDistAtr: 0, valueAreaPos: 0, logRvol: 0, mom5Atr: 0, impulse: 0,
};
export const LAMBDA_GRID = [3, 30, 300];
export const REGIME_LAMBDA = 200;
export const MIN_TRAIN = 2000;
export const MIN_HOLDOUT = 1000;

const sigmoid = (z) => 1 / (1 + Math.exp(-Math.max(-35, Math.min(35, z))));
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);

function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]];
    if (Math.abs(M[c][c]) < 1e-12) return null;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

export function fitScaler(X) {
  const p = X[0]?.length ?? 0;
  const mean = Array(p).fill(0), sd = Array(p).fill(0);
  for (const x of X) x.forEach((v, j) => { mean[j] += v; });
  mean.forEach((_, j) => { mean[j] /= X.length || 1; });
  for (const x of X) x.forEach((v, j) => { sd[j] += (v - mean[j]) ** 2; });
  sd.forEach((_, j) => { sd[j] = Math.sqrt(sd[j] / Math.max(1, X.length - 1)) || 1; });
  return { mean, sd };
}
const scale = (x, s) => x.map((v, j) => (v - s.mean[j]) / s.sd[j]);

/**
 * Newton–IRLS cho logistic có L2 quanh `prior` (không phạt hệ số chặn).
 * @returns {number[]} [b, w_1..w_p]
 */
export function fitLogistic(Xs, y, { lambda = 30, prior = null, init = null, iters = 30 } = {}) {
  const p = Xs[0].length;
  const pr = prior ?? Array(p + 1).fill(0);
  let w = init ? [...init] : [...pr];
  for (let it = 0; it < iters; it++) {
    const g = Array(p + 1).fill(0);
    const H = Array.from({ length: p + 1 }, () => Array(p + 1).fill(0));
    for (let i = 0; i < Xs.length; i++) {
      const xi = [1, ...Xs[i]];
      const mu = sigmoid(dot(w, xi));
      const r = mu - y[i], s = Math.max(mu * (1 - mu), 1e-6);
      for (let a = 0; a <= p; a++) {
        g[a] += r * xi[a];
        for (let b = a; b <= p; b++) H[a][b] += s * xi[a] * xi[b];
      }
    }
    for (let a = 0; a <= p; a++) for (let b = 0; b < a; b++) H[a][b] = H[b][a];
    for (let j = 1; j <= p; j++) { g[j] += lambda * (w[j] - pr[j]); H[j][j] += lambda; }
    const step = solve(H, g);
    if (!step) break;
    w = w.map((v, j) => v - step[j]);
    if (Math.max(...step.map(Math.abs)) < 1e-7) break;
  }
  return w;
}

export function auc(scores, y) {
  const idx = scores.map((s, i) => [s, y[i]]).sort((a, b) => a[0] - b[0]);
  let rankSum = 0, pos = 0;
  for (let i = 0; i < idx.length;) {
    let j = i;
    while (j < idx.length && idx[j][0] === idx[i][0]) j++;
    const avgRank = (i + j + 1) / 2;
    for (let k = i; k < j; k++) if (idx[k][1]) { rankSum += avgRank; pos++; }
    i = j;
  }
  const neg = idx.length - pos;
  return pos && neg ? (rankSum - pos * (pos + 1) / 2) / (pos * neg) : null;
}

/** Chỉ số ngoài mẫu: log-loss, Brier, Brier skill so với tỷ lệ nền của tập huấn luyện, AUC, hiệu chuẩn, chênh lệch thập phân vị. */
export function evaluate(preds, samples, baseRate) {
  const y = samples.map((s) => s.y);
  const n = y.length;
  if (!n) return null;
  let ll = 0, br = 0, brRef = 0;
  for (let i = 0; i < n; i++) {
    const p = Math.min(1 - 1e-9, Math.max(1e-9, preds[i]));
    ll -= y[i] ? Math.log(p) : Math.log(1 - p);
    br += (p - y[i]) ** 2;
    brRef += (baseRate - y[i]) ** 2;
  }
  const order = preds.map((p, i) => [p, i]).sort((a, b) => a[0] - b[0]);
  const dec = Math.max(1, Math.floor(n / 10));
  const avgEx = (arr) => arr.reduce((s, [, i]) => s + samples[i].excess, 0) / arr.length;
  const calibration = [];
  for (let b = 0; b < 10; b++) {
    const chunk = order.slice(b * dec, b === 9 ? n : (b + 1) * dec);
    if (!chunk.length) continue;
    calibration.push({
      predicted: round(chunk.reduce((s, [p]) => s + p, 0) / chunk.length, 4),
      observed: round(chunk.reduce((s, [, i]) => s + y[i], 0) / chunk.length, 4),
      n: chunk.length,
    });
  }
  const active = preds.map((p, i) => [p, i]).filter(([p]) => Math.abs(p - 0.5) >= 0.05);
  const activeHits = active.filter(([p, i]) => (p > 0.5 ? samples[i].excess > 0 : samples[i].excess < 0)).length;
  return {
    n, baseRate: round(baseRate, 4),
    logLoss: round(ll / n, 5), brier: round(br / n, 5),
    brierSkill: round(1 - br / brRef, 5),
    auc: round(auc(preds, y), 4),
    decileSpread: round(avgEx(order.slice(-dec)) - avgEx(order.slice(0, dec)), 5),
    activeShare: round(active.length / n, 4),
    activeHitRate: active.length ? round(activeHits / active.length, 4) : null,
    calibration,
  };
}

/** Chia fold theo ngày (liên tục), purge các ngày train trong `embargo` phiên trước fold test. */
export function walkForwardFolds(samples, { folds = 5, embargo = 5 } = {}) {
  const dates = [...new Set(samples.map((s) => s.date))].sort();
  const size = Math.ceil(dates.length / folds);
  const out = [];
  for (let k = 1; k < folds; k++) {
    const start = k * size;
    if (start >= dates.length) break;
    const testDates = new Set(dates.slice(start, start + size));
    const cutoff = dates[Math.max(0, start - embargo)];
    out.push({
      train: samples.filter((s) => s.date < cutoff),
      test: samples.filter((s) => testDates.has(s.date)),
      testFrom: dates[start], testTo: dates[Math.min(dates.length, start + size) - 1],
    });
  }
  return out;
}

const priorVector = () => [0, ...FEATURE_NAMES.map((n) => PRIOR_WEIGHTS[n] ?? 0)];

/** Huấn luyện toàn bộ: scaler + w_global + w_regime (co về global). */
export function fitModel(samples, lambda) {
  const scaler = fitScaler(samples.map((s) => s.x));
  const Xs = samples.map((s) => scale(s.x, scaler));
  const y = samples.map((s) => s.y);
  const globalW = fitLogistic(Xs, y, { lambda, prior: priorVector() });
  const regimes = {};
  for (const regime of ["UPTREND", "DOWNTREND", "SIDEWAY"]) {
    const idx = samples.map((s, i) => (s.regime === regime ? i : -1)).filter((i) => i >= 0);
    if (idx.length < 300) continue;
    regimes[regime] = fitLogistic(idx.map((i) => Xs[i]), idx.map((i) => y[i]), { lambda: REGIME_LAMBDA, prior: globalW, init: globalW });
  }
  const baseRate = y.reduce((a, b) => a + b, 0) / y.length;
  return { scaler, global: globalW, regimes, lambda, baseRate };
}

export function predictRaw(model, x, regime) {
  const w = (regime && model.regimes?.[regime]) || model.global;
  return sigmoid(dot(w, [1, ...scale(x, model.scaler)]));
}

/** Xác suất + đóng góp từng đặc trưng (log-odds) để giải thích trên UI. */
export function explain(model, x, regime) {
  const w = (regime && model.regimes?.[regime]) || model.global;
  const xs = scale(x, model.scaler);
  const contributions = FEATURE_NAMES.map((name, j) => ({ name, value: round(x[j], 4), weight: round(w[j + 1], 4), contribution: round(w[j + 1] * xs[j], 4) }));
  return { prob: round(sigmoid(dot(w, [1, ...xs])), 4), regimeModel: Boolean(regime && model.regimes?.[regime]), contributions };
}

/** Heuristic (trọng số prior, không học) — để so sánh "học có giúp không". */
const heuristicScore = (scaler, x) => dot(priorVector().slice(1), scale(x, scaler));

/**
 * @param {{ date, symbol, x: number[], y: 0|1, excess: number, regime }[]} samples
 * @returns {{ ok: boolean, reason?: string, model?: any, metrics?: any }}
 */
export function trainAdaptive(samples, { horizon = 5, folds = 5 } = {}) {
  if (samples.length < MIN_TRAIN + MIN_HOLDOUT) return { ok: false, reason: `Cần ≥ ${MIN_TRAIN + MIN_HOLDOUT} mẫu, mới có ${samples.length}.` };
  const fs = walkForwardFolds(samples, { folds, embargo: horizon }).filter((f) => f.train.length >= MIN_TRAIN && f.test.length);
  if (fs.length < 2) return { ok: false, reason: "Không đủ fold walk-forward có ≥ 2000 mẫu huấn luyện." };
  const selectFolds = fs.slice(0, -1), holdout = fs.at(-1);

  // Chọn λ trên các fold đầu (log-loss ngoài mẫu trung bình).
  const lambdaScores = LAMBDA_GRID.map((lambda) => {
    let ll = 0, n = 0;
    for (const f of selectFolds) {
      const m = fitModel(f.train, lambda);
      const e = evaluate(f.test.map((s) => predictRaw(m, s.x, s.regime)), f.test, m.baseRate);
      ll += e.logLoss * e.n; n += e.n;
    }
    return { lambda, logLoss: round(ll / n, 5) };
  });
  const lambda = [...lambdaScores].sort((a, b) => a.logLoss - b.logLoss)[0].lambda;

  // Holdout: fold cuối, chưa dùng để chọn λ.
  const hm = fitModel(holdout.train, lambda);
  const holdPreds = holdout.test.map((s) => predictRaw(hm, s.x, s.regime));
  const holdoutMetrics = evaluate(holdPreds, holdout.test, hm.baseRate);
  const heur = holdout.test.map((s) => heuristicScore(hm.scaler, s.x));
  const heurOrder = heur.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const dec = Math.max(1, Math.floor(heur.length / 10));
  const avgEx = (arr) => arr.reduce((s, [, i]) => s + holdout.test[i].excess, 0) / arr.length;
  const heuristicMetrics = {
    auc: round(auc(heur, holdout.test.map((s) => s.y)), 4),
    decileSpread: round(avgEx(heurOrder.slice(-dec)) - avgEx(heurOrder.slice(0, dec)), 5),
  };
  const byRegime = {};
  for (const regime of ["UPTREND", "DOWNTREND", "SIDEWAY"]) {
    const idx = holdout.test.map((s, i) => (s.regime === regime ? i : -1)).filter((i) => i >= 0);
    if (idx.length >= 100) byRegime[regime] = evaluate(idx.map((i) => holdPreds[i]), idx.map((i) => holdout.test[i]), hm.baseRate);
  }

  // Mô hình triển khai: huấn luyện lại trên toàn bộ mẫu với λ đã chọn.
  const model = fitModel(samples, lambda);
  const dates = samples.map((s) => s.date).sort();
  return {
    ok: true,
    model: { ...model, features: FEATURE_NAMES, horizon },
    trainFrom: dates[0], trainTo: dates.at(-1),
    metrics: {
      horizon, samples: samples.length, lambda, lambdaScores,
      holdout: { from: holdout.testFrom, to: holdout.testTo, ...holdoutMetrics },
      heuristic: heuristicMetrics,
      byRegime,
      method: "Logistic L2 co về trọng số heuristic; walk-forward theo ngày, purge/embargo = h phiên; λ chọn trên các fold đầu, đánh giá trên fold cuối.",
    },
  };
}

/**
 * Champion / challenger.
 * @returns {{ promote: boolean, reason: string }}
 */
export function decidePromotion(candidate, active, { liveMetrics = null } = {}) {
  const h = candidate.metrics.holdout;
  if (h.n < MIN_HOLDOUT) return { promote: false, reason: `Holdout chỉ có ${h.n} mẫu (< ${MIN_HOLDOUT}).` };
  if (!(h.brierSkill > 0) || !(h.auc > 0.5)) return { promote: false, reason: `Không có kỹ năng ngoài mẫu (Brier skill ${h.brierSkill}, AUC ${h.auc}).` };
  if (!active) return { promote: true, reason: "Chưa có mô hình đang chạy; ứng viên có kỹ năng ngoài mẫu dương." };
  const a = active.metrics?.holdout;
  if (liveMetrics && liveMetrics.n >= 500 && !(liveMetrics.brierSkill > 0)) {
    return { promote: true, reason: `Mô hình đang chạy suy giảm trên dữ liệu mới (Brier skill thực chiến ${liveMetrics.brierSkill}).` };
  }
  if (a && h.brierSkill + 0.001 < a.brierSkill) return { promote: false, reason: `Ứng viên kém mô hình đang chạy (Brier skill ${h.brierSkill} < ${a.brierSkill}).` };
  return { promote: true, reason: "Ứng viên không kém mô hình đang chạy và dùng dữ liệu mới hơn." };
}

function round(v, d) {
  if (v === null || v === undefined || !Number.isFinite(v)) return null;
  const f = 10 ** d;
  return Math.round(v * f) / f;
}
