// MV1 (29/10/2026) — Beta-Binomial: bản chuyển 1:1 của Project A lib/cotuc/timing-v3/seasonality/beta-binomial.ts (log-Gamma Lanczos,
// beta không đầy đủ chuẩn hoá bằng phân số liên tục Lentz, nghịch đảo bằng chia đôi, prior mô-men có trần độ mạnh). Cùng công thức để
// xác suất mùa vụ (Gateway) và xác suất cổ tức / KQKD (Project A) cùng một thang. Sửa ở đây phải sửa cả hai nơi.

const LANCZOS_G = 7;
const LANCZOS = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
  12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];

export function logGamma(x) {
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  const xx = x - 1;
  let a = LANCZOS[0];
  const t = xx + LANCZOS_G + 0.5;
  for (let i = 1; i < LANCZOS_G + 2; i++) a += LANCZOS[i] / (xx + i);
  return 0.5 * Math.log(2 * Math.PI) + (xx + 0.5) * Math.log(t) - t + Math.log(a);
}
const logBeta = (a, b) => logGamma(a) + logGamma(b) - logGamma(a + b);

const MAX_CF_ITER = 200, CF_EPS = 1e-14, TINY = 1e-300;
function betaContinuedFraction(x, a, b) {
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < TINY) d = TINY;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAX_CF_ITER; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d; h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < CF_EPS) break;
  }
  return h;
}

/** I_x(a,b) = P(X ≤ x), X ~ Beta(a,b). */
export function regularizedIncompleteBeta(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  if (a <= 0 || b <= 0) throw new Error("regularizedIncompleteBeta: a và b phải dương");
  const front = Math.exp(a * Math.log(x) + b * Math.log(1 - x) - logBeta(a, b));
  if (x < (a + 1) / (a + b + 2)) return (front * betaContinuedFraction(x, a, b)) / a;
  return 1 - (front * betaContinuedFraction(1 - x, b, a)) / b;
}

export function invertRegularizedIncompleteBeta(p, a, b, tolerance = 1e-10) {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  let lo = 0, hi = 1;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (hi - lo < tolerance) return mid;
    if (regularizedIncompleteBeta(mid, a, b) < p) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Hậu nghiệm Beta(α₀+thắng, β₀+thua) + khoảng tin cậy hai phía mức `level`. */
export function betaBinomialPosterior(wins, losses, alpha0 = 1, beta0 = 1, level = 0.9) {
  if (wins < 0 || losses < 0) throw new Error("betaBinomialPosterior: wins/losses không được âm");
  if (alpha0 <= 0 || beta0 <= 0) throw new Error("betaBinomialPosterior: alpha0/beta0 phải dương");
  const alpha = alpha0 + wins, beta = beta0 + losses;
  return {
    alpha, beta, mean: alpha / (alpha + beta), level,
    ci: [invertRegularizedIncompleteBeta((1 - level) / 2, alpha, beta), invertRegularizedIncompleteBeta((1 + level) / 2, alpha, beta)],
  };
}

/** Prior mô-men từ tỷ lệ thắng của NHỮNG mã KHÁC (leave-one-out ở tầng gọi); độ mạnh α₀+β₀ ≤ priorStrength. */
export function estimatePriorFromRates(rates, priorStrength = 10) {
  const clean = rates.filter((r) => Number.isFinite(r) && r >= 0 && r <= 1);
  if (clean.length === 0) return { alpha0: 1, beta0: 1 };
  const mean = clean.reduce((a, b) => a + b, 0) / clean.length;
  if (clean.length === 1) return { alpha0: mean * priorStrength, beta0: (1 - mean) * priorStrength };
  const variance = clean.reduce((a, b) => a + (b - mean) ** 2, 0) / (clean.length - 1);
  const impliedStrength = variance > 1e-9 ? Math.max(0, (mean * (1 - mean)) / variance - 1) : priorStrength;
  const strength = Math.min(priorStrength, Math.max(2, impliedStrength));
  return { alpha0: Math.max(mean * strength, 1e-6), beta0: Math.max((1 - mean) * strength, 1e-6) };
}
