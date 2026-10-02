/**
 * core/beta-binomial.ts — Suy luận Bayes Beta-Binomial cho "xác suất phản ứng dương" của một
 * cửa sổ mua quanh một sự kiện lặp lại theo mùa (KQKD theo quý). Đây là phần thay thế
 * `winRate` (một con số điểm, vô nghĩa với mẫu 3-4 sự kiện/quý) bằng một PHÂN PHỐI hậu
 * nghiệm đầy đủ: Beta(α₀+thắng, β₀+thua), từ đó suy ra khoảng tin cậy (credible interval)
 * thay vì chỉ báo cáo trung bình.
 *
 * Toàn bộ hàm THUẦN, tất định, không phụ thuộc thư viện thống kê ngoài — tự cài đặt hàm beta
 * không đầy đủ đã chuẩn hoá (regularized incomplete beta, I_x(a,b)) bằng thuật toán phân số
 * liên tục Lentz (chuẩn "Numerical Recipes", ổn định số học và đã được kiểm chứng rộng rãi),
 * rồi lấy nghịch đảo bằng chia đôi (bisection) — đơn điệu tăng ngặt nên luôn hội tụ, không cần
 * đạo hàm như Newton-Raphson (tránh rủi ro số học ở biên 0/1).
 */

export interface BetaPosterior {
  alpha: number;
  beta: number;
  /** Kỳ vọng hậu nghiệm: alpha / (alpha + beta). */
  mean: number;
  /** Khoảng tin cậy Bayes hai phía, mức `level` (mặc định 90%): [phân vị (1-level)/2, phân vị (1+level)/2]. */
  ci: [number, number];
  /** Mức tin cậy đã dùng để tính `ci`, ví dụ 0.9. */
  level: number;
}

// ---------------------------------------------------------------------------
// log-Gamma (Lanczos) — cần cho hệ số chuẩn hoá của hàm beta không đầy đủ.
// ---------------------------------------------------------------------------

const LANCZOS_G = 7;
const LANCZOS_COEFFICIENTS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
  12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];

export function logGamma(x: number): number {
  if (x < 0.5) {
    // Công thức phản xạ: Γ(x)Γ(1-x) = π / sin(πx)
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  }
  const xx = x - 1;
  let a = LANCZOS_COEFFICIENTS[0];
  const t = xx + LANCZOS_G + 0.5;
  for (let i = 1; i < LANCZOS_G + 2; i++) a += LANCZOS_COEFFICIENTS[i] / (xx + i);
  return 0.5 * Math.log(2 * Math.PI) + (xx + 0.5) * Math.log(t) - t + Math.log(a);
}

function logBeta(a: number, b: number): number {
  return logGamma(a) + logGamma(b) - logGamma(a + b);
}

// ---------------------------------------------------------------------------
// Hàm beta không đầy đủ đã chuẩn hoá I_x(a,b) — phân số liên tục Lentz (Numerical Recipes §6.4)
// ---------------------------------------------------------------------------

const MAX_CF_ITER = 200;
const CF_EPS = 1e-14;
const TINY = 1e-300;

/** Khai triển phân số liên tục dùng trong betainc — KHÔNG export, chỉ là bước trung gian. */
function betaContinuedFraction(x: number, a: number, b: number): number {
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < TINY) d = TINY;
  d = 1 / d;
  let h = d;

  for (let m = 1; m <= MAX_CF_ITER; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    h *= d * c;

    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c;
    if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const del = d * c;
    h *= del;

    if (Math.abs(del - 1) < CF_EPS) break;
  }
  return h;
}

/**
 * Hàm beta không đầy đủ đã chuẩn hoá I_x(a,b) = P(X ≤ x) với X ~ Beta(a,b), x ∈ [0,1].
 * Dùng công thức đối xứng I_x(a,b) = 1 - I_{1-x}(b,a) khi x lớn để phân số liên tục hội tụ nhanh.
 */
export function regularizedIncompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  if (a <= 0 || b <= 0) throw new Error('regularizedIncompleteBeta: a và b phải dương');

  const logFront = a * Math.log(x) + b * Math.log(1 - x) - logBeta(a, b);
  const front = Math.exp(logFront);

  if (x < (a + 1) / (a + b + 2)) {
    return (front * betaContinuedFraction(x, a, b)) / a;
  }
  return 1 - (front * betaContinuedFraction(1 - x, b, a)) / b;
}

/**
 * Nghịch đảo của regularizedIncompleteBeta theo x, với a,b cố định: tìm x sao cho I_x(a,b) = p.
 * Hàm I_x đơn điệu tăng ngặt theo x trên (0,1) nên chia đôi luôn hội tụ — không cần đạo hàm.
 */
export function invertRegularizedIncompleteBeta(p: number, a: number, b: number, tolerance = 1e-10): number {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (hi - lo < tolerance) return mid;
    if (regularizedIncompleteBeta(mid, a, b) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// ---------------------------------------------------------------------------
// API bậc cao: posterior + khoảng tin cậy
// ---------------------------------------------------------------------------

/**
 * Hậu nghiệm Beta(α₀+wins, β₀+losses) và khoảng tin cậy `level` (mặc định 90%, hai phía đối
 * xứng theo xác suất — [phân vị (1-level)/2, phân vị (1+level)/2]).
 *
 * `alpha0`/`beta0` là prior — nên lấy từ dữ liệu liên mã/liên quý (mục "shrinkage phân tầng"),
 * KHÔNG hardcode Beta(1,1) một cách máy móc trừ khi thật sự không có prior nào tốt hơn.
 */
export function betaBinomialPosterior(wins: number, losses: number, alpha0 = 1, beta0 = 1, level = 0.9): BetaPosterior {
  if (wins < 0 || losses < 0) throw new Error('betaBinomialPosterior: wins/losses không được âm');
  if (alpha0 <= 0 || beta0 <= 0) throw new Error('betaBinomialPosterior: alpha0/beta0 phải dương');
  const alpha = alpha0 + wins;
  const beta = beta0 + losses;
  const mean = alpha / (alpha + beta);
  const lo = invertRegularizedIncompleteBeta((1 - level) / 2, alpha, beta);
  const hi = invertRegularizedIncompleteBeta((1 + level) / 2, alpha, beta);
  return { alpha, beta, mean, ci: [lo, hi], level };
}

/**
 * Prior liên mã/liên quý theo phương pháp mô-men (method of moments): từ một danh sách tỷ lệ
 * thắng quan sát được ở NHỮNG mã/quý KHÁC (không phải mã đang xét — leave-one-out ở tầng gọi),
 * suy ra (α₀, β₀) sao cho Beta(α₀,β₀) có cùng trung bình và phương sai với các tỷ lệ đó.
 * `priorStrength` giới hạn α₀+β₀ (mặc định 10 — prior "vừa phải", không lấn át dữ liệu thật
 * của mã đang xét khi mã đó đã có vài sự kiện).
 */
export function estimatePriorFromRates(rates: number[], priorStrength = 10): { alpha0: number; beta0: number } {
  const clean = rates.filter((r) => Number.isFinite(r) && r >= 0 && r <= 1);
  if (clean.length === 0) return { alpha0: 1, beta0: 1 }; // không có gì để ước lượng ⇒ uniform, trung tính
  const mean = clean.reduce((a, b) => a + b, 0) / clean.length;
  if (clean.length === 1) return { alpha0: mean * priorStrength, beta0: (1 - mean) * priorStrength };

  const variance = clean.reduce((a, b) => a + (b - mean) ** 2, 0) / (clean.length - 1);
  // (α₀+β₀) suy từ variance = mean(1-mean)/(α₀+β₀+1); giới hạn bởi priorStrength để prior
  // không bao giờ mạnh hơn một lượng dữ liệu thật hợp lý.
  const impliedStrength = variance > 1e-9 ? Math.max(0, (mean * (1 - mean)) / variance - 1) : priorStrength;
  const strength = Math.min(priorStrength, Math.max(2, impliedStrength));
  return { alpha0: Math.max(mean * strength, 1e-6), beta0: Math.max((1 - mean) * strength, 1e-6) };
}
