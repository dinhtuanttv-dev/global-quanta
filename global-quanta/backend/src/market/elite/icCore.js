// Elite 10 E2 — thống kê thuần cho engine bằng chứng, đúng định nghĩa trong E2-prereg.md (ghi trước khi đo).
// Không đọc dữ liệu, không gọi mạng: kiểm thử được từng hàm.

export const E2_VERSION = "E2-v1 (prereg 2026-10-17)";
export const HORIZONS = [1, 5, 10, 20];
export const MIN_NAMES = 30;
export const MIN_DAYS_FDR = 40;

/** Hạng trung bình (1-based) cho giá trị trùng. */
export function averageRanks(values) {
  const idx = values.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const ranks = new Array(values.length);
  for (let i = 0; i < idx.length;) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const r = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[idx[k][1]] = r;
    i = j + 1;
  }
  return ranks;
}

function pearson(x, y) {
  const n = x.length;
  let mx = 0, my = 0;
  for (let i = 0; i < n; i++) { mx += x[i]; my += y[i]; }
  mx /= n; my /= n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const a = x[i] - mx, b = y[i] - my; sxy += a * b; sxx += a * a; syy += b * b; }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
}

/** IC ngày: Spearman giữa tín hiệu và lợi suất tương lai trên các cặp hợp lệ. null nếu n < MIN_NAMES hoặc tín hiệu hằng. */
export function dailyIc(pairs) {
  const ok = pairs.filter(([s, r]) => Number.isFinite(s) && Number.isFinite(r));
  if (ok.length < MIN_NAMES) return null;
  if (new Set(ok.map((p) => p[0])).size < 2) return null;
  const ic = pearson(averageRanks(ok.map((p) => p[0])), averageRanks(ok.map((p) => p[1])));
  return ic == null ? null : { ic, n: ok.length };
}

/** CDF chuẩn (Abramowitz–Stegun 7.1.26 qua erf). */
export function normCdf(z) {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

/** Trung bình + SE Newey–West (Bartlett, độ trễ L) + t + p một phía (IC>0 và IC<0) + ổn định hai nửa. */
export function summarize(series, lag) {
  const x = series.filter(Number.isFinite);
  const n = x.length;
  if (n < 2) return { n, mean: n ? x[0] : null, se: null, t: null, pPos: null, pNeg: null, halves: null, stable: false };
  const mean = x.reduce((a, b) => a + b, 0) / n;
  const e = x.map((v) => v - mean);
  let s = e.reduce((a, v) => a + v * v, 0) / n;
  const L = Math.min(Math.max(0, lag), n - 1);
  for (let l = 1; l <= L; l++) {
    let g = 0;
    for (let i = l; i < n; i++) g += e[i] * e[i - l];
    s += 2 * (1 - l / (L + 1)) * (g / n);
  }
  const se = s > 0 ? Math.sqrt(s / n) : null;
  const t = se ? mean / se : null;
  const h = Math.floor(n / 2);
  const m1 = x.slice(0, h).reduce((a, b) => a + b, 0) / Math.max(1, h);
  const m2 = x.slice(h).reduce((a, b) => a + b, 0) / Math.max(1, n - h);
  return {
    n, mean, se, t,
    pPos: t == null ? null : 1 - normCdf(t),
    pNeg: t == null ? null : normCdf(t),
    halves: [m1, m2], stable: h > 0 && m1 > 0 && m2 > 0,
  };
}

/** Benjamini–Hochberg: trả q cho từng p (cùng thứ tự). */
export function bhQ(pvals) {
  const m = pvals.length;
  const order = pvals.map((p, i) => [p, i]).sort((a, b) => a[0] - b[0]);
  const q = new Array(m);
  let prev = 1;
  for (let k = m - 1; k >= 0; k--) {
    const [p, i] = order[k];
    prev = Math.min(prev, (p * m) / (k + 1));
    q[i] = Math.min(1, prev);
  }
  return q;
}

const TIERS = ["C", "B", "A"];
const up = (t) => TIERS[Math.min(2, TIERS.indexOf(t) + 1)];
const down = (t) => TIERS[Math.max(0, TIERS.indexOf(t) - 1)];

/**
 * Luật bậc E2 (prereg): giáng xét trước, đi một bậc mỗi lần.
 * @param {string} prior bậc khởi điểm
 * @param {Record<number, { n:number, mean:number|null, pPos:number|null, pNeg:number|null, stable:boolean, q?:number|null }>} byH
 * @param {number} mainH kỳ hạn chính
 */
export function decideTier(prior, byH, mainH) {
  const main = byH[mainH];
  if (main && main.n >= 60 && main.mean != null && main.mean < 0 && main.pNeg != null && main.pNeg <= 0.10 && prior !== "C") {
    return { tier: down(prior), change: "down", reasonVi: `Giáng: kỳ hạn chính ${mainH} phiên có IC TB ${main.mean.toFixed(4)} < 0 (p ${main.pNeg.toFixed(3)}, ${main.n} ngày).` };
  }
  const hs = Object.entries(byH).map(([h, s]) => ({ h: Number(h), ...s }));
  if (prior === "B") {
    const hit = hs.find((s) => s.n >= 120 && s.mean != null && s.mean >= 0.02 && s.q != null && s.q <= 0.05 && s.stable);
    if (hit) return { tier: "A", change: "up", reasonVi: `Thăng A: kỳ hạn ${hit.h} phiên IC TB ${hit.mean.toFixed(4)}, q ${hit.q.toFixed(3)}, ${hit.n} ngày, ổn định hai nửa.` };
  }
  if (prior === "C") {
    const hit = hs.find((s) => s.n >= 60 && s.mean != null && s.mean > 0 && s.q != null && s.q <= 0.10 && s.stable);
    if (hit) return { tier: "B", change: "up", reasonVi: `Thăng B: kỳ hạn ${hit.h} phiên IC TB ${hit.mean.toFixed(4)}, q ${hit.q.toFixed(3)}, ${hit.n} ngày, ổn định hai nửa.` };
  }
  const maxN = Math.max(0, ...hs.map((s) => s.n));
  return { tier: prior, change: "none", reasonVi: maxN < 60 ? `Giữ bậc: mới có ${maxN} ngày đo (cần ≥ 60).` : "Giữ bậc: chưa đạt điều kiện thăng/giáng." };
}


