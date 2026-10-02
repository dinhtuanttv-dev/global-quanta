/**
 * core/announce-date-model.ts — Mô hình Bayes cho "khi nào KQKD quý q được công bố".
 *
 * Thay vì "trung vị ± độ lệch chuẩn" (một điểm và một dải đối xứng, sai lệch khi n nhỏ vì
 * bỏ qua bất định của chính độ lệch chuẩn), ta dùng liên hợp Normal-Inverse-Gamma:
 *
 *   x_i | μ,σ² ~ N(μ,σ²)            x_i = số ngày từ cuối kỳ báo cáo đến ngày công bố
 *   (μ,σ²)     ~ NIG(μ0,κ0,a0,b0)    prior (yếu, hoặc ước lượng liên mã)
 *
 * Hậu nghiệm (công thức chuẩn, Murphy 2007 "Conjugate Bayesian analysis of the Gaussian"):
 *   κn = κ0+n,  μn = (κ0·μ0 + n·x̄)/κn,  an = a0+n/2,
 *   bn = b0 + ½·Σ(xi−x̄)² + κ0·n·(x̄−μ0)² / (2·κn)
 *
 * Dự báo cho MỘT ngày công bố mới là phân phối Student-t (không phải chuẩn):
 *   x_new ~ t_{2an}( μn , bn·(κn+1)/(an·κn) )   (tham số vị trí, bình phương tham số tỷ lệ)
 * Đuôi dày của Student-t tự động "phạt" mẫu nhỏ: n=3 cho khoảng dự báo rộng hơn nhiều so với
 * chuẩn cùng std mẫu — đúng bản chất bất định, không cần vá thủ công.
 *
 * CDF Student-t tính qua hàm beta không đầy đủ (đã có ở beta-binomial.ts), không cần thư viện.
 */
import { invertRegularizedIncompleteBeta, logGamma, regularizedIncompleteBeta } from './beta-binomial';

export interface AnnouncePrior {
  mu0: number;
  kappa0: number;
  a0: number;
  b0: number;
}

/**
 * Prior yếu mặc định: kỳ vọng ~30 ngày sau cuối kỳ, độ lệch chuẩn tiên nghiệm ~15 ngày, độ
 * tin cậy tương đương ~1 quan sát cho trung bình và ~3 cho phương sai. ĐÂY LÀ GIẢ ĐỊNH, không
 * phải sự thật — nên dùng `estimateAnnouncePriorFromUniverse` để thay bằng prior liên mã.
 */
export const WEAK_ANNOUNCE_PRIOR: AnnouncePrior = { mu0: 30, kappa0: 1, a0: 1.5, b0: 1.5 * 15 * 15 };

export interface AnnouncePredictive {
  /** Vị trí (trung bình dự báo), đơn vị ngày sau cuối kỳ báo cáo. */
  mu: number;
  /** Tham số tỷ lệ (KHÔNG phải độ lệch chuẩn; std = scale·sqrt(dof/(dof−2)) khi dof>2). */
  scale: number;
  dof: number;
  n: number;
}

export function announcePredictive(offsetsDays: number[], prior: AnnouncePrior = WEAK_ANNOUNCE_PRIOR): AnnouncePredictive {
  const xs = offsetsDays.filter((v) => Number.isFinite(v));
  const n = xs.length;
  const kappaN = prior.kappa0 + n;
  const aN = prior.a0 + n / 2;
  if (n === 0) {
    const scale = Math.sqrt((prior.b0 * (prior.kappa0 + 1)) / (prior.a0 * prior.kappa0));
    return { mu: prior.mu0, scale, dof: 2 * prior.a0, n: 0 };
  }
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const ss = xs.reduce((a, b) => a + (b - mean) ** 2, 0);
  const muN = (prior.kappa0 * prior.mu0 + n * mean) / kappaN;
  const bN = prior.b0 + 0.5 * ss + (prior.kappa0 * n * (mean - prior.mu0) ** 2) / (2 * kappaN);
  const scale = Math.sqrt((bN * (kappaN + 1)) / (aN * kappaN));
  return { mu: muN, scale, dof: 2 * aN, n };
}

/** Mật độ Student-t chuẩn hoá (vị trí 0, tỷ lệ 1). */
function tPdfStd(t: number, nu: number): number {
  const logC = logGamma((nu + 1) / 2) - logGamma(nu / 2) - 0.5 * Math.log(nu * Math.PI);
  return Math.exp(logC - ((nu + 1) / 2) * Math.log(1 + (t * t) / nu));
}

/** CDF Student-t chuẩn hoá qua I_x(ν/2, ½), x = ν/(ν+t²). */
function tCdfStd(t: number, nu: number): number {
  if (t === 0) return 0.5;
  const x = nu / (nu + t * t);
  const tail = 0.5 * regularizedIncompleteBeta(x, nu / 2, 0.5); // P(T > |t|)
  return t > 0 ? 1 - tail : tail;
}

/** Mật độ xác suất của ngày công bố (đơn vị: xác suất / ngày) tại `day` ngày sau cuối kỳ. */
export function announceDensity(m: AnnouncePredictive, day: number): number {
  return tPdfStd((day - m.mu) / m.scale, m.dof) / m.scale;
}

export function announceCdf(m: AnnouncePredictive, day: number): number {
  return tCdfStd((day - m.mu) / m.scale, m.dof);
}

/** P(công bố trong [loDay, hiDay] ngày sau cuối kỳ). */
export function probAnnounceBetween(m: AnnouncePredictive, loDay: number, hiDay: number): number {
  if (hiDay < loDay) return 0;
  return Math.max(0, announceCdf(m, hiDay) - announceCdf(m, loDay));
}

/** Phân vị p của ngày công bố. Dùng đối xứng của Student-t + nghịch đảo I_x, không cần bisection rộng. */
export function announceQuantile(m: AnnouncePredictive, p: number): number {
  if (p <= 0 || p >= 1) throw new Error('announceQuantile: p phải trong (0,1)');
  if (p === 0.5) return m.mu;
  const upper = p > 0.5;
  const tail = upper ? 1 - p : p; // xác suất một đuôi
  // P(T > |t|) = ½·I_x(ν/2,½) = tail  ⇒  I_x = 2·tail  ⇒  x = I⁻¹(2·tail), |t| = sqrt(ν(1−x)/x)
  const x = invertRegularizedIncompleteBeta(2 * tail, m.dof / 2, 0.5);
  const absT = x <= 0 ? Infinity : Math.sqrt((m.dof * (1 - x)) / x);
  return m.mu + (upper ? 1 : -1) * absT * m.scale;
}

export function announceCredibleInterval(m: AnnouncePredictive, level = 0.9): [number, number] {
  return [announceQuantile(m, (1 - level) / 2), announceQuantile(m, (1 + level) / 2)];
}

/**
 * Prior liên mã cho ngày công bố của một quý: mu0 = trung bình các trung bình mã; kappa0 suy
 * từ tỷ số phương sai trong-mã/giữa-mã (kẹp [0,5; 10]); (a0,b0) từ phương sai trong-mã gộp,
 * độ mạnh 2·a0 = 4 (tương đương 4 quan sát). Ít hơn 2 mã ⇒ trả prior yếu mặc định.
 */
export function estimateAnnouncePriorFromUniverse(offsetsPerTicker: number[][]): AnnouncePrior {
  const groups = offsetsPerTicker.map((g) => g.filter(Number.isFinite)).filter((g) => g.length > 0);
  if (groups.length < 2) return WEAK_ANNOUNCE_PRIOR;
  const means = groups.map((g) => g.reduce((a, b) => a + b, 0) / g.length);
  const mu0 = means.reduce((a, b) => a + b, 0) / means.length;
  const tau2 = means.reduce((a, b) => a + (b - mu0) ** 2, 0) / (means.length - 1);
  let ssWithin = 0;
  let dfWithin = 0;
  for (const g of groups) {
    const m = g.reduce((a, b) => a + b, 0) / g.length;
    ssWithin += g.reduce((a, b) => a + (b - m) ** 2, 0);
    dfWithin += g.length - 1;
  }
  const sigma2 = dfWithin > 0 ? ssWithin / dfWithin : 15 * 15;
  const kappa0 = Math.min(10, Math.max(0.5, tau2 > 1e-9 ? sigma2 / tau2 : 10));
  const a0 = 2;
  return { mu0, kappa0, a0, b0: Math.max(a0 * sigma2, 1e-6) };
}

/**
 * P(công bố trong (elapsed, elapsed+horizon] | CHƯA công bố đến ngày `elapsed`) — xác suất có
 * điều kiện kiểu "hazard": (F(e+h) − F(e)) / (1 − F(e)). Đây là đại lượng đúng để trả lời
 * "còn N ngày nữa có công bố không" khi đã biết đến hôm nay vẫn chưa có KQKD; dùng xác suất
 * không điều kiện sẽ đánh giá thấp khi đã trôi qua phần lớn thời gian điển hình. Nếu phần đuôi
 * còn lại quá nhỏ (<1e-9) thì trả 1 (gần như chắc chắn sắp công bố hoặc mô hình đã lạc hậu).
 */
export function probAnnounceWithinGivenNotYet(m: AnnouncePredictive, elapsedDays: number, horizonDays: number): number {
  if (horizonDays <= 0) return 0;
  const survive = 1 - announceCdf(m, elapsedDays);
  if (survive < 1e-9) return 1;
  return Math.min(1, Math.max(0, (announceCdf(m, elapsedDays + horizonDays) - announceCdf(m, elapsedDays)) / survive));
}
