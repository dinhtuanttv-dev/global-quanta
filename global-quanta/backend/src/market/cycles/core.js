// Cycle Fingerprint v2 (CF2) — lõi số học thuần: chuẩn hoá z đường log-giá, PAA, DTW có dải Sakoe-Chiba, đặc trưng bối cảnh.
// Không I/O. Dùng chung cho engine trực tuyến (Gateway) và kiểm định đặt trước CF3 (scripts/cycles-validate.mjs).

/** log-giá chuẩn hoá z (trung bình 0, độ lệch 1) của closes[s..e] — so HÌNH DẠNG, bất biến theo mức giá & biên độ. */
export function zLogWindow(closes, s, e, out = new Float64Array(e - s + 1)) {
  const n = e - s + 1;
  let m = 0;
  for (let i = 0; i < n; i++) { out[i] = Math.log(closes[s + i]); m += out[i]; }
  m /= n;
  let v = 0;
  for (let i = 0; i < n; i++) { out[i] -= m; v += out[i] * out[i]; }
  const sd = Math.sqrt(v / n);
  // Gần như phẳng (biến động < 0,1%): coi là đường thẳng 0 — không phóng đại nhiễu thành "hình dạng".
  if (!(sd > 1e-3)) out.fill(0);
  else for (let i = 0; i < n; i++) out[i] /= sd;
  return out;
}

/** Piecewise Aggregate Approximation: n điểm -> m đoạn trung bình (lọc thô trước DTW). */
export function paa(z, m, out = new Float64Array(m)) {
  const n = z.length;
  for (let k = 0; k < m; k++) {
    const a = Math.floor((k * n) / m), b = Math.floor(((k + 1) * n) / m);
    let s = 0;
    for (let i = a; i < b; i++) s += z[i];
    out[k] = s / Math.max(b - a, 1);
  }
  return out;
}

/**
 * DTW với dải Sakoe-Chiba bán kính r (giới hạn co giãn thời gian), chi phí bình phương.
 * Trả căn của chi phí trung bình theo độ dài (≈ RMS sau khi căn chỉnh) — so được giữa các cửa sổ cùng độ dài.
 * `cutoff`: dừng sớm khi mọi ô của hàng đã vượt cutoff² · n (kết quả > cutoff -> trả Infinity).
 */
export function dtwBand(a, b, r, cutoff = Infinity, buf) {
  const n = a.length;
  const prev = buf?.prev ?? new Float64Array(n + 1), cur = buf?.cur ?? new Float64Array(n + 1);
  const lim = cutoff === Infinity ? Infinity : cutoff * cutoff * n;
  prev.fill(Infinity); prev[0] = 0;
  let p = prev, c = cur;
  for (let i = 1; i <= n; i++) {
    c.fill(Infinity);
    const lo = Math.max(1, i - r), hi = Math.min(n, i + r);
    let rowMin = Infinity;
    for (let j = lo; j <= hi; j++) {
      const d = a[i - 1] - b[j - 1];
      const best = Math.min(p[j], c[j - 1], p[j - 1]);
      const v = d * d + best;
      c[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > lim) return Infinity;
    const t = p; p = c; c = t;
  }
  return Math.sqrt(p[n] / n);
}

export const CONTEXT_KEYS = Object.freeze(["volRatio", "fromHigh", "valueTrend", "market", "rsSector"]);

/** σ của lợi suất log ngày trên [e−n+1, e]. */
function sigma(closes, e, n) {
  if (e - n < 0) return null;
  let s = 0, s2 = 0;
  for (let i = e - n + 1; i <= e; i++) { const r = Math.log(closes[i] / closes[i - 1]); s += r; s2 += r * r; }
  const m = s / n; return Math.sqrt(Math.max(s2 / n - m * m, 0));
}

/**
 * Đặc trưng bối cảnh tại chỉ số e của một mã (điểm cuối cửa sổ). Mọi giá trị chỉ dùng dữ liệu ≤ e.
 *   volRatio   log(σ20 / σ250)         — biến động co/giãn
 *   fromHigh   log(close / max250)     — khoảng cách tới đỉnh 52 tuần (≤ 0)
 *   valueTrend log(GTGD TB20 / TB250)  — dòng tiền vào/ra mã
 *   market     log(VN-Index / MA200)   — trạng thái thị trường chung
 *   rsSector   lợi suất log 60 phiên của mã − trung vị cùng ngành ICB cấp 2 (cùng ngày)
 * Trả null khi thiếu lịch sử (cần ≥ 251 phiên).
 */
export function contextAt({ closes, values }, e, { marketLogMa200 = 0, sectorMedianRet60 = null } = {}) {
  if (e < 251) return null;
  const s20 = sigma(closes, e, 20), s250 = sigma(closes, e, 250);
  let hi = 0; for (let i = e - 249; i <= e; i++) if (closes[i] > hi) hi = closes[i];
  let v20 = 0, v250 = 0;
  for (let i = e - 249; i <= e; i++) { const v = values[i] > 0 ? values[i] : 0; v250 += v; if (i > e - 20) v20 += v; }
  const ret60 = Math.log(closes[e] / closes[e - 60]);
  const out = [
    s20 > 0 && s250 > 0 ? Math.log(s20 / s250) : 0,
    Math.log(closes[e] / hi),
    v20 > 0 && v250 > 0 ? Math.log((v20 / 20) / (v250 / 250)) : 0,
    marketLogMa200,
    sectorMedianRet60 == null ? 0 : ret60 - sectorMedianRet60,
  ];
  return out.every(Number.isFinite) ? out : null;
}

/** Trung bình GTGD 60 phiên tới e (đơn vị đồng) — lọc thanh khoản theo thời điểm. */
export function avgValue(values, e, n = 60) {
  if (e - n + 1 < 0) return 0;
  let s = 0; for (let i = e - n + 1; i <= e; i++) s += values[i] > 0 ? values[i] : 0;
  return s / n;
}

/** Bộ sinh số ngẫu nhiên có hạt giống (mulberry32) — kết quả tái lập được. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Phân vị có trọng số (giá trị đã sắp xếp tăng dần theo y). */
export function weightedQuantile(ys, ws, q) {
  const idx = ys.map((_, i) => i).sort((i, j) => ys[i] - ys[j]);
  const tot = ws.reduce((s, w) => s + w, 0);
  let acc = 0;
  for (const i of idx) { acc += ws[i]; if (acc >= q * tot) return ys[i]; }
  return ys[idx[idx.length - 1]];
}

/** Spearman (hạng trung bình cho giá trị trùng). */
export function spearman(x, y) {
  const n = x.length; if (n < 3) return null;
  const rank = (v) => {
    const idx = v.map((_, i) => i).sort((a, b) => v[a] - v[b]); const r = new Array(n);
    for (let k = 0; k < n;) { let j = k; while (j + 1 < n && v[idx[j + 1]] === v[idx[k]]) j++; const avg = (k + j) / 2; for (let t = k; t <= j; t++) r[idx[t]] = avg; k = j + 1; }
    return r;
  };
  const rx = rank(x), ry = rank(y), mx = (n - 1) / 2;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) { num += (rx[i] - mx) * (ry[i] - mx); dx += (rx[i] - mx) ** 2; dy += (ry[i] - mx) ** 2; }
  return dx > 0 && dy > 0 ? num / Math.sqrt(dx * dy) : null;
}
