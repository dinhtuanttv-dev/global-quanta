// Kiểm định đặt trước Risk-On Index (RON-prereg.md) — hàm thuần. Công thức sao NGUYÊN VĂN từ Project A
// lib/scoring/weighted-macro-score.ts (ngưỡng & trọng số cố định); test đối chiếu từng ngưỡng.
export const RON_PREREG = { horizon: 20, minN: 60, block: 3, B: 10_000, seed: 20261016, minGroup: 10 };
const THRESHOLDS = { dxy: { safe: 102, danger: 105 }, vix: { safe: 15, danger: 25 }, treasury10y: { safe: 4.0, danger: 4.8 } };

function normalizeInverse(value, safe, danger) {
  if (value <= safe) return 100;
  if (value >= danger) return 0;
  return Math.round(((danger - value) / (danger - safe)) * 100);
}
export function riskOnIndex({ dxy, vix, treasury10y }) {
  const score = Math.round(normalizeInverse(dxy, THRESHOLDS.dxy.safe, THRESHOLDS.dxy.danger) * 0.4
    + normalizeInverse(vix, THRESHOLDS.vix.safe, THRESHOLDS.vix.danger) * 0.3
    + normalizeInverse(treasury10y, THRESHOLDS.treasury10y.safe, THRESHOLDS.treasury10y.danger) * 0.3);
  return { score, status: score >= 65 ? "RISK_ON" : score <= 35 ? "RISK_OFF" : "NEUTRAL" };
}

/** Giá đóng cửa gần nhất có ngày < d (giá Mỹ đã biết trước phiên VN ngày d). */
function lastBefore(dates, map, d) {
  let lo = 0, hi = dates.length - 1, ans = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (dates[m] < d) { ans = m; lo = m + 1; } else hi = m - 1; }
  return ans < 0 ? null : map.get(dates[ans]);
}

/** Mẫu không chồng lấn: mỗi `horizon` phiên VN một mẫu { date, score, status, fwd } (fwd = log lợi suất %). */
export function buildSamples(vnBars, dxyBars, vixBars, tnxBars, horizon = RON_PREREG.horizon) {
  const mk = (bars) => { const m = new Map(bars.filter((b) => b.close > 0).map((b) => [b.date, b.close])); return { m, d: [...m.keys()].sort() }; };
  const D = mk(dxyBars), V = mk(vixBars), T = mk(tnxBars);
  const vn = vnBars.filter((b) => b.close > 0);
  const start = [D.d[0], V.d[0], T.d[0]].sort().at(-1);
  const out = [];
  let i = vn.findIndex((b) => b.date > start);
  if (i < 0) return out;
  for (; i + horizon < vn.length; i += horizon) {
    const d = vn[i].date;
    const dxy = lastBefore(D.d, D.m, d), vix = lastBefore(V.d, V.m, d), tnx = lastBefore(T.d, T.m, d);
    if (dxy == null || vix == null || tnx == null) continue;
    const r = riskOnIndex({ dxy, vix, treasury10y: tnx });
    out.push({ date: d, score: r.score, status: r.status, dxy, vix, tnx, fwd: Math.log(vn[i + horizon].close / vn[i].close) * 100 });
  }
  return out;
}

const rank = (xs) => {
  const idx = xs.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const r = new Array(xs.length);
  for (let k = 0; k < idx.length;) {
    let j = k; while (j + 1 < idx.length && idx[j + 1][0] === idx[k][0]) j++;
    const avg = (k + j) / 2 + 1; for (let t = k; t <= j; t++) r[idx[t][1]] = avg; k = j + 1;
  }
  return r;
};
export function spearman(x, y) {
  const rx = rank(x), ry = rank(y), n = x.length;
  const mx = rx.reduce((a, b) => a + b, 0) / n, my = ry.reduce((a, b) => a + b, 0) / n;
  let c = 0, vx = 0, vy = 0;
  for (let i = 0; i < n; i++) { c += (rx[i] - mx) * (ry[i] - my); vx += (rx[i] - mx) ** 2; vy += (ry[i] - my) ** 2; }
  return vx > 0 && vy > 0 ? c / Math.sqrt(vx * vy) : 0;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** Bootstrap khối chuyển động (moving block) cho thống kê f trên chỉ số mẫu. */
export function blockBootstrap(n, f, { B = RON_PREREG.B, block = RON_PREREG.block, seed = RON_PREREG.seed } = {}) {
  const rnd = mulberry32(seed), vals = [];
  for (let b = 0; b < B; b++) {
    const idx = [];
    while (idx.length < n) { const s = Math.floor(rnd() * (n - block + 1)); for (let k = 0; k < block && idx.length < n; k++) idx.push(s + k); }
    const v = f(idx); if (Number.isFinite(v)) vals.push(v);
  }
  vals.sort((a, b) => a - b);
  return { lo: vals[Math.floor(0.025 * vals.length)], hi: vals[Math.floor(0.975 * vals.length) - 1] };
}

export function runRiskOnValidation(samples, prereg = RON_PREREG) {
  const n = samples.length;
  const ic = spearman(samples.map((s) => s.score), samples.map((s) => s.fwd));
  const icCi = blockBootstrap(n, (idx) => spearman(idx.map((i) => samples[i].score), idx.map((i) => samples[i].fwd)), prereg);
  const pass = n >= prereg.minN && icCi.lo > 0;
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const on = samples.filter((s) => s.status === "RISK_ON"), off = samples.filter((s) => s.status === "RISK_OFF"), neu = samples.filter((s) => s.status === "NEUTRAL");
  let h2 = null;
  if (on.length >= prereg.minGroup && off.length >= prereg.minGroup) {
    const diff = (idx) => { const a = idx.map((i) => samples[i]).filter((s) => s.status === "RISK_ON").map((s) => s.fwd), b = idx.map((i) => samples[i]).filter((s) => s.status === "RISK_OFF").map((s) => s.fwd); return a.length && b.length ? mean(a) - mean(b) : NaN; };
    h2 = { diff: mean(on.map((s) => s.fwd)) - mean(off.map((s) => s.fwd)), ci: blockBootstrap(n, diff, prereg) };
  }
  const half = Math.floor(n / 2);
  const icHalf = [samples.slice(0, half), samples.slice(half)].map((p) => ({ from: p[0]?.date, to: p.at(-1)?.date, n: p.length, ic: spearman(p.map((s) => s.score), p.map((s) => s.fwd)) }));
  return {
    prereg, n, from: samples[0]?.date ?? null, to: samples.at(-1)?.date ?? null,
    h1: { ic, ci95: [icCi.lo, icCi.hi] }, verdict: n < prereg.minN ? "INSUFFICIENT_SAMPLE" : pass ? "PASS" : "FAIL",
    evidence: pass ? "VALIDATED" : "HEURISTIC_UNVALIDATED",
    h2, groups: { RISK_ON: { n: on.length, meanFwd: mean(on.map((s) => s.fwd)) }, NEUTRAL: { n: neu.length, meanFwd: mean(neu.map((s) => s.fwd)) }, RISK_OFF: { n: off.length, meanFwd: mean(off.map((s) => s.fwd)) } },
    h3: icHalf, samples,
  };
}
