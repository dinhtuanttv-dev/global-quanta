// Elite 10 E6 (2026-10-17) — lõi RỦI RO DANH MỤC (hàm thuần, có test). Mô tả rủi ro của danh mục đã khoá, không tối ưu lại danh mục.
//
//   - Hiệp phương sai co rút Ledoit–Wolf (2004, "Honey, I shrunk the sample covariance matrix") về mục tiêu TƯƠNG QUAN HẰNG SỐ;
//     cường độ co rút δ* ước lượng từ dữ liệu (π̂, ρ̂, γ̂), cắt về [0, 1].
//   - Đóng góp rủi ro Euler: RC_i = w_i·(Σw)_i / σ_p (tổng = σ_p); tỷ lệ RC_i / σ_p.
//   - Tỷ số đa dạng hoá DR = Σ w_i σ_i / σ_p (Choueifaty–Coignard). Số mã hiệu dụng 1/Σw². Số "cược" hiệu dụng ENB (Meucci 2009):
//     phân rã danh mục theo thành phần chính của Σ, p_k = (v_k'w)²·λ_k / σ_p², ENB = exp(−Σ p_k ln p_k).
//   - VaR / CVaR 1 phiên ở 95% và 99%: lịch sử (mô phỏng lại danh mục tỷ trọng cố định trên các phiên quá khứ), Gauss và
//     Cornish–Fisher (hiệu chỉnh độ lệch và độ nhọn). Quy đổi 10 phiên theo √10 chỉ là xấp xỉ, ghi rõ.
//   - Beta và tương quan với VN-Index (OLS), sụt giảm tối đa của danh mục tỷ trọng cố định, kiểm tra căng thẳng trên các phiên
//     VN-Index tệ nhất và chuỗi 10 phiên sụt mạnh nhất trong cửa sổ.

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;

export function sampleCov(R) {
  const T = R.length, N = R[0].length;
  const mu = Array.from({ length: N }, (_, j) => mean(R.map((r) => r[j])));
  const S = Array.from({ length: N }, () => new Array(N).fill(0));
  for (const r of R) for (let i = 0; i < N; i++) for (let j = i; j < N; j++) S[i][j] += (r[i] - mu[i]) * (r[j] - mu[j]);
  for (let i = 0; i < N; i++) for (let j = i; j < N; j++) { S[i][j] /= T; S[j][i] = S[i][j]; }
  return { S, mu };
}

/** Ledoit–Wolf co rút về tương quan hằng số. Trả { sigma, delta, rBar }. */
export function ledoitWolf(R) {
  const T = R.length, N = R[0].length;
  const { S, mu } = sampleCov(R);
  const sd = S.map((row, i) => Math.sqrt(row[i]));
  let rSum = 0, rCount = 0;
  for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) { if (sd[i] > 0 && sd[j] > 0) { rSum += S[i][j] / (sd[i] * sd[j]); rCount++; } }
  const rBar = rCount ? rSum / rCount : 0;
  const F = S.map((row, i) => row.map((v, j) => (i === j ? v : rBar * sd[i] * sd[j])));
  const X = R.map((r) => r.map((v, j) => v - mu[j]));
  // π̂: tổng phương sai tiệm cận của các phần tử hiệp phương sai mẫu
  let pi = 0;
  const piMat = Array.from({ length: N }, () => new Array(N).fill(0));
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    let s = 0;
    for (const x of X) s += (x[i] * x[j] - S[i][j]) ** 2;
    piMat[i][j] = s / T;
    pi += piMat[i][j];
  }
  // ρ̂: đường chéo + phần ngoài chéo theo θ (Ledoit–Wolf 2004, mục tiêu tương quan hằng số)
  let rho = 0;
  for (let i = 0; i < N; i++) rho += piMat[i][i];
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    if (i === j || !(sd[i] > 0 && sd[j] > 0)) continue;
    let tii = 0, tjj = 0;
    for (const x of X) {
      const c = x[i] * x[j] - S[i][j];
      tii += (x[i] * x[i] - S[i][i]) * c;
      tjj += (x[j] * x[j] - S[j][j]) * c;
    }
    tii /= T; tjj /= T;
    rho += (rBar / 2) * ((sd[j] / sd[i]) * tii + (sd[i] / sd[j]) * tjj);
  }
  let gamma = 0;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) gamma += (F[i][j] - S[i][j]) ** 2;
  const kappa = gamma > 0 ? (pi - rho) / gamma : 0;
  const delta = Math.max(0, Math.min(1, kappa / T));
  const sigma = S.map((row, i) => row.map((v, j) => delta * F[i][j] + (1 - delta) * v));
  return { sigma, delta, rBar };
}

/** Trị riêng / vectơ riêng của ma trận đối xứng (Jacobi). Trả { values, vectors } (vectors[k] là vectơ riêng thứ k). */
export function jacobiEigen(A, maxSweeps = 100) {
  const n = A.length;
  const a = A.map((r) => [...r]);
  const V = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += a[i][j] ** 2;
    if (off < 1e-30) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(a[p][q]) < 1e-300) continue;
      const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) {
        const akp = a[k][p], akq = a[k][q];
        a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq;
      }
      for (let k = 0; k < n; k++) {
        const apk = a[p][k], aqk = a[q][k];
        a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk;
      }
      for (let k = 0; k < n; k++) {
        const vkp = V[k][p], vkq = V[k][q];
        V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq;
      }
    }
  }
  return { values: a.map((r, i) => r[i]), vectors: Array.from({ length: n }, (_, k) => V.map((row) => row[k])) };
}

const matVec = (M, v) => M.map((row) => row.reduce((s, x, j) => s + x * v[j], 0));
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
const quantile = (sorted, q) => { const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos); return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo); };
const normInvQ = { 0.95: 1.6448536269514722, 0.99: 2.3263478740408408 };
const normPdf = (z) => Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI);

/** VaR/CVaR (số dương = mức lỗ) 1 phiên ở mức `level` từ chuỗi lợi suất danh mục. */
export function varSuite(port, level) {
  const s = [...port].sort((a, b) => a - b);
  const q = 1 - level;
  const hVar = -quantile(s, q);
  const tail = s.filter((x) => x <= -hVar);
  const hCvar = tail.length ? -mean(tail) : hVar;
  const mu = mean(port);
  const sd = Math.sqrt(port.reduce((a, x) => a + (x - mu) ** 2, 0) / (port.length - 1));
  const z = normInvQ[level];
  const skew = port.reduce((a, x) => a + ((x - mu) / sd) ** 3, 0) / port.length;
  const exKurt = port.reduce((a, x) => a + ((x - mu) / sd) ** 4, 0) / port.length - 3;
  const zl = -z;
  const zcf = zl + (zl * zl - 1) * skew / 6 + (zl ** 3 - 3 * zl) * exKurt / 24 - (2 * zl ** 3 - 5 * zl) * skew * skew / 36;
  return {
    level,
    historical: { var: hVar, cvar: hCvar },
    gaussian: { var: -(mu - z * sd), cvar: -(mu - sd * normPdf(z) / (1 - level)) },
    cornishFisher: { var: -(mu + zcf * sd) },
    moments: { mean: mu, sd, skew, exKurt },
  };
}

/**
 * Rủi ro danh mục tỷ trọng cố định.
 * @param {{ tickers: string[], weights: number[], returns: number[][], dates: string[], bench: (number|null)[], sectors?: (string|null)[] }} p
 *   returns[t][i]: lợi suất ngày của mã i tại phiên dates[t] (đã căn ngày, không thiếu); bench[t]: lợi suất VN-Index.
 */
export function portfolioRisk({ tickers, weights, returns, dates, bench, sectors = [] }) {
  const N = tickers.length, T = returns.length;
  const w = weights;
  const { sigma, delta, rBar } = ledoitWolf(returns);
  const Sw = matVec(sigma, w);
  const varP = dot(w, Sw);
  const volP = Math.sqrt(varP);
  const vols = sigma.map((row, i) => Math.sqrt(row[i]));
  const rc = w.map((wi, i) => (wi * Sw[i]) / volP);
  const { values, vectors } = jacobiEigen(sigma);
  const p = values.map((lam, k) => (Math.max(lam, 0) * dot(vectors[k], w) ** 2) / varP).filter((x) => x > 1e-12);
  const ps = p.reduce((a, b) => a + b, 0);
  const enb = Math.exp(-p.reduce((a, x) => a + (x / ps) * Math.log(x / ps), 0));
  const port = returns.map((r) => dot(r, w));
  const okB = bench.map((b, t) => (Number.isFinite(b) ? [port[t], b] : null)).filter(Boolean);
  let beta = null, corr = null;
  if (okB.length >= 30) {
    const mp = mean(okB.map((x) => x[0])), mb = mean(okB.map((x) => x[1]));
    let cov = 0, vb = 0, vp = 0;
    for (const [a, b] of okB) { cov += (a - mp) * (b - mb); vb += (b - mb) ** 2; vp += (a - mp) ** 2; }
    beta = vb > 0 ? cov / vb : null;
    corr = vb > 0 && vp > 0 ? cov / Math.sqrt(vb * vp) : null;
  }
  let peak = 1, nav = 1, mdd = 0, mddFrom = null, mddTo = null, peakDate = dates[0];
  for (let t = 0; t < T; t++) {
    nav *= 1 + port[t];
    if (nav > peak) { peak = nav; peakDate = dates[t]; }
    const dd = nav / peak - 1;
    if (dd < mdd) { mdd = dd; mddFrom = peakDate; mddTo = dates[t]; }
  }
  const benchDays = bench.map((b, t) => [b, t]).filter(([b]) => Number.isFinite(b)).sort((a, b) => a[0] - b[0]).slice(0, 5)
    .map(([b, t]) => ({ date: dates[t], vnIndex: b, portfolio: port[t] }));
  let worst10 = null;
  for (let t = 9; t < T; t++) {
    let bc = 1, pc = 1, ok = true;
    for (let k = t - 9; k <= t; k++) { if (!Number.isFinite(bench[k])) { ok = false; break; } bc *= 1 + bench[k]; pc *= 1 + port[k]; }
    if (ok && (!worst10 || bc - 1 < worst10.vnIndex)) worst10 = { from: dates[t - 9], to: dates[t], vnIndex: bc - 1, portfolio: pc - 1 };
  }
  const bySector = new Map();
  tickers.forEach((t, i) => { const k = sectors[i] ?? "?"; bySector.set(k, (bySector.get(k) ?? 0) + w[i]); });
  const corrM = sigma.map((row, i) => row.map((v, j) => (vols[i] > 0 && vols[j] > 0 ? v / (vols[i] * vols[j]) : null)));
  return {
    sessions: T, from: dates[0], to: dates[T - 1],
    shrinkage: { delta, avgCorrelation: rBar, method: "Ledoit–Wolf (2004), mục tiêu tương quan hằng số" },
    volatility: { daily: volP, annual: volP * Math.sqrt(252) },
    holdings: tickers.map((t, i) => ({ ticker: t, weight: w[i], volAnnual: vols[i] * Math.sqrt(252), riskContribution: rc[i] / volP, sector: sectors[i] ?? null })),
    diversification: { ratio: dot(w, vols) / volP, effectiveN: 1 / dot(w, w), enb, hhi: dot(w, w) },
    var: { 0.95: varSuite(port, 0.95), 0.99: varSuite(port, 0.99), tenDayNoteVi: "Quy đổi 10 phiên ≈ VaR 1 phiên × √10 (giả định lợi suất độc lập, cùng phân phối)." },
    beta, corrWithVnIndex: corr,
    maxDrawdown: { value: mdd, from: mddFrom, to: mddTo },
    stress: { worstVnIndexDays: benchDays, worst10Sessions: worst10 },
    sectors: [...bySector].map(([key, weight]) => ({ key, weight })).sort((a, b) => b.weight - a.weight),
    correlation: { tickers, matrix: corrM },
  };
}
