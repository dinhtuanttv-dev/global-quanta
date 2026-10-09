// SEPA — chỉ báo dùng chung (chuyển 1:1 từ sepa_screener/indicators.py).
// Quy ước point-in-time: mọi hàm nhận (S, t) và chỉ đọc chỉ số ≤ t — tương đương df.iloc[:t + 1] của bản Python.
// Số học bám pandas/numpy để đối chiếu chính xác: trung bình trượt Kahan (pandas roll_mean), tổng từng cặp (numpy),
// làm tròn nửa-về-chẵn trên giá trị nhị phân chính xác (round()/format của Python).

const DAY = 86_400_000;

/** bars [{date, open, high, low, close, volume}] tăng dần -> mảng cột + bộ nhớ đệm chỉ báo nhân quả. */
export function prepareSepa(bars) {
  const n = bars.length;
  const S = { n, date: bars.map((b) => b.date), O: new Float64Array(n), H: new Float64Array(n), L: new Float64Array(n), C: new Float64Array(n), V: new Float64Array(n), _cache: new Map() };
  bars.forEach((b, i) => { S.O[i] = b.open; S.H[i] = b.high; S.L[i] = b.low; S.C[i] = b.close; S.V[i] = b.volume; });
  return S;
}

/** Bộ nhớ đệm theo khóa — các chỉ báo nhân quả tính một lần trên cả chuỗi (giá trị tại i chỉ phụ thuộc dữ liệu ≤ i). */
export function cached(S, key, fn) {
  if (!S._cache) S._cache = new Map();
  if (!S._cache.has(key)) S._cache.set(key, fn());
  return S._cache.get(key);
}

// ------------------------------------------------------------------ số học kiểu Python/numpy

/** round(x, nd) của Python: nửa-về-chẵn trên giá trị nhị phân chính xác. */
export function pyRound(x, nd = 0) {
  if (!Number.isFinite(x)) return x;
  const dv = new DataView(new ArrayBuffer(8)); dv.setFloat64(0, x);
  const hi = dv.getUint32(0), lo = dv.getUint32(4);
  const neg = hi >>> 31 === 1, eb = (hi >>> 20) & 0x7ff;
  let m = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo), e;
  if (eb === 0) e = -1074; else { m |= 1n << 52n; e = eb - 1075; }
  let num = m * 10n ** BigInt(nd), den = 1n;
  if (e >= 0) num <<= BigInt(e); else den <<= BigInt(-e);
  let q = num / den; const r2 = 2n * (num % den);
  if (r2 > den || (r2 === den && (q & 1n) === 1n)) q += 1n;
  const v = Number(q) / 10 ** nd;
  return neg ? -v : v;
}

/** f"{x:.{nd}f}" của Python. */
export function fmtFixed(x, nd = 0) {
  if (Number.isNaN(x)) return "nan";
  if (!Number.isFinite(x)) return x > 0 ? "inf" : "-inf";
  const v = pyRound(x, nd);
  return (x < 0 || Object.is(x, -0) ? "-" : "") + Math.abs(v).toFixed(nd);
}
/** f"{x:.{nd}%}" của Python. */
export const fmtPct = (x, nd = 0) => `${fmtFixed(x * 100, nd)}%`;

/** Tổng từng cặp của numpy (pairwise_sum) trên A[a, b). */
export function npSum(A, a = 0, b = A.length) {
  const n = b - a;
  if (n < 8) { let s = 0; for (let i = a; i < b; i++) s += A[i]; return s; }
  if (n <= 128) {
    const r = [A[a], A[a + 1], A[a + 2], A[a + 3], A[a + 4], A[a + 5], A[a + 6], A[a + 7]];
    let i = 8;
    for (; i < n - (n % 8); i += 8) for (let j = 0; j < 8; j++) r[j] += A[a + i + j];
    let s = ((r[0] + r[1]) + (r[2] + r[3])) + ((r[4] + r[5]) + (r[6] + r[7]));
    for (; i < n; i++) s += A[a + i];
    return s;
  }
  let n2 = Math.floor(n / 2); n2 -= n2 % 8;
  return npSum(A, a, a + n2) + npSum(A, a + n2, b);
}
/** np.mean / Series.mean trên A[a, b) (NaN nếu rỗng). */
export const npMean = (A, a = 0, b = A.length) => (b > a ? npSum(A, a, b) / (b - a) : NaN);

export function maxOf(A, a, b) { let m = -Infinity; for (let i = a; i < b; i++) if (A[i] > m) m = A[i]; return m; }
export function minOf(A, a, b) { let m = Infinity; for (let i = a; i < b; i++) if (A[i] < m) m = A[i]; return m; }
/** np.argmax / argmin: vị trí xuất hiện ĐẦU TIÊN (tuyệt đối). */
export function argmaxOf(A, a, b) { let k = a; for (let i = a + 1; i < b; i++) if (A[i] > A[k]) k = i; return k; }
export function argminOf(A, a, b) { let k = a; for (let i = a + 1; i < b; i++) if (A[i] < A[k]) k = i; return k; }

/** np.percentile(A[a, b), q) — phương pháp "linear" của numpy. */
export function npPercentile(A, a, b, q) {
  const v = Array.from(A.slice(a, b)).sort((x, y) => x - y), n = v.length;
  if (!n) return NaN;
  const vi = (n - 1) * (q / 100), p = Math.floor(vi), nx = Math.min(p + 1, n - 1), g = vi - p;
  const lo = v[p], hi = v[nx], d = hi - lo;
  return g >= 0.5 ? hi - d * (1 - g) : lo + d * g;
}

/** Series.rolling(w, min_periods).mean() của pandas (thuật toán Kahan cộng/trừ + chống nhiễu giá trị lặp). */
export function rollMean(A, w, minp = w) {
  const N = A.length, out = new Float64Array(N).fill(NaN);
  let sum = 0, cAdd = 0, cRem = 0, nobs = 0, neg = 0, same = 0, prev = NaN;
  const add = (v) => { nobs++; const y = v - cAdd, t = sum + y; cAdd = t - sum - y; sum = t; if (v < 0 || Object.is(v, -0)) neg++; if (v === prev) same++; else same = 1; prev = v; };
  const rem = (v) => { nobs--; const y = -v - cRem, t = sum + y; cRem = t - sum - y; sum = t; if (v < 0 || Object.is(v, -0)) neg--; };
  for (let i = 0; i < N; i++) {
    const s = Math.max(0, i - w + 1);
    if (i === 0) { prev = A[s]; same = 0; sum = cAdd = cRem = 0; nobs = neg = 0; for (let j = s; j <= i; j++) add(A[j]); }
    else { for (let j = Math.max(0, i - w); j < s; j++) rem(A[j]); add(A[i]); }
    if (nobs >= minp && nobs > 0) {
      let r = sum / nobs;
      if (same >= nobs) r = prev; else if (neg === 0 && r < 0) r = 0; else if (neg === nobs && r > 0) r = 0;
      out[i] = r;
    }
  }
  return out;
}
/** Dịch 1 phiên (Series.shift(1)). */
export function shift1(A) { const o = new Float64Array(A.length).fill(NaN); for (let i = 1; i < A.length; i++) o[i] = A[i - 1]; return o; }

/** SMA nhân quả trên giá đóng cửa (bộ nhớ đệm). */
export const smaC = (S, n) => cached(S, `smaC${n}`, () => rollMean(S.C, n, n));
/** KL trung bình trượt (min_periods tùy chọn), có thể dịch 1 phiên. */
export const volRoll = (S, n, minp, lag = false) => cached(S, `vol${n}_${minp}_${lag}`, () => { const r = rollMean(S.V, n, minp); return lag ? shift1(r) : r; });

// ------------------------------------------------------------------ khung tuần

/** Ngày thứ Sáu kết thúc tuần (resample "W-FRI": khoảng (thứ Sáu trước, thứ Sáu này]). */
export function weekFriday(date) {
  const d = new Date(`${date}T00:00:00Z`), dow = d.getUTCDay();
  const add = dow <= 5 ? 5 - dow : 6;
  return new Date(d.getTime() + add * DAY).toISOString().slice(0, 10);
}

/** to_weekly(df.iloc[a:t+1]) — nến tuần {key, start, end, open, high, low, close, volume}. */
export function toWeekly(S, t, a = 0) {
  const out = [];
  for (let i = a; i <= t; i++) {
    const k = weekFriday(S.date[i]), w = out[out.length - 1];
    if (!w || w.key !== k) out.push({ key: k, start: i, end: i, open: S.O[i], high: S.H[i], low: S.L[i], close: S.C[i], volume: S.V[i], _v: [S.V[i]] });
    else { w.end = i; w.high = Math.max(w.high, S.H[i]); w.low = Math.min(w.low, S.L[i]); w.close = S.C[i]; w._v.push(S.V[i]); }
  }
  for (const w of out) { // groupby-sum của pandas: tổng Kahan
    let s = 0, c = 0; for (const v of w._v) { const y = v - c, z = s + y; c = z - s - y; s = z; }
    w.volume = s; delete w._v;
  }
  return out;
}

// ------------------------------------------------------------------ MA / độ dốc

/** Số tháng liên tiếp (lùi từ hiện tại) MA cao hơn tháng trước — TC3. `ma` là mảng tới t (NaN đầu bị bỏ). */
export function monthsRising(ma, t, step = 21, maxMonths = 12) {
  const vals = []; for (let i = 0; i <= t; i++) if (!Number.isNaN(ma[i])) vals.push(ma[i]);
  let cnt = 0;
  for (let i = 0; i < maxMonths; i++) {
    const a = vals.length - 1 - i * step, b = a - step;
    if (b < 0) break;
    if (vals[a] > vals[b]) cnt++; else break;
  }
  return cnt;
}

// ------------------------------------------------------------------ sóng (swing) bất đối xứng — VCP / nền giá

/**
 * Bắt đầu từ ĐỈNH tại `start`, quét tới t:
 *  - nhịp giảm: đáy được xác nhận khi giá hồi ≥ upRetrace × (đỉnh trước − đáy) và ≥ upMin;
 *  - nhịp hồi: đỉnh được xác nhận khi giá giảm ≥ downMin từ đỉnh.
 * Trả về chuỗi H, L, H, L … xen kẽ (phần tử cuối có thể chưa xác nhận).
 */
export function extractSwings(H, L, start, t, downMin = 0.025, upRetrace = 0.4, upMin = 0.03) {
  const sw = [{ kind: "H", idx: start, price: H[start] }];
  let mode = "down", lastH = H[start], ei = start, ev = L[start];
  for (let i = start + 1; i <= t; i++) {
    if (mode === "down") {
      if (L[i] < ev) { ei = i; ev = L[i]; }
      const leg = lastH - ev, rise = H[i] - ev;
      if (leg > 0 && rise >= upRetrace * leg && rise / ev >= upMin) { sw.push({ kind: "L", idx: ei, price: ev }); mode = "up"; ei = i; ev = H[i]; }
    } else {
      if (H[i] > ev) { ei = i; ev = H[i]; }
      if ((ev - L[i]) / ev >= downMin) { sw.push({ kind: "H", idx: ei, price: ev }); lastH = ev; mode = "down"; ei = i; ev = L[i]; }
    }
  }
  sw.push({ kind: mode === "down" ? "L" : "H", idx: ei, price: ev });
  return sw;
}

/** Đỉnh/đáy fractal trên chuỗi giá (tuần) — kiểm tra đỉnh cao hơn / đáy cao hơn. */
export function weeklySwings(v, order = 3) {
  const highs = [], lows = [];
  for (let i = order; i < v.length - order; i++) {
    let mx = -Infinity, mn = Infinity;
    for (let k = i - order; k <= i + order; k++) { if (v[k] > mx) mx = v[k]; if (v[k] < mn) mn = v[k]; }
    if (v[i] === mx) highs.push(v[i]);
    if (v[i] === mn) lows.push(v[i]);
  }
  return { highs, lows };
}

// ------------------------------------------------------------------ sức mạnh giá tương đối

/** Điểm hiệu suất có trọng số (quý gần nhất ×2) — xấp xỉ RS Rating IBD. C = mảng giá đóng cửa tới t. */
export function rsRawScore(C, t, periods = [63, 126, 189, 252], weights = [0.4, 0.2, 0.2, 0.2]) {
  let score = 0, wsum = 0;
  for (let k = 0; k < periods.length; k++) {
    const p = periods[k];
    if (t + 1 > p) { score += weights[k] * (C[t] / C[t - p] - 1); wsum += weights[k]; }
  }
  return wsum ? score / wsum : NaN;
}

/** RS Rating 1–99 theo phân vị trong vũ trụ: raw {symbol: điểm} -> {symbol: rating}. Hạng trung bình khi bằng nhau. */
export function rsRatings(raw) {
  const ent = Object.entries(raw).filter(([, v]) => Number.isFinite(v));
  const sorted = ent.map(([, v]) => v).sort((a, b) => a - b), n = sorted.length, out = {};
  for (const [k, v] of ent) {
    let lo = 0, hi = n; while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] < v) lo = m + 1; else hi = m; }
    let e = lo; while (e < n && sorted[e] === v) e++;
    const rank = (lo + 1 + e) / 2; // hạng trung bình (1-based)
    out[k] = Math.min(99, Math.max(1, pyRound((rank / n) * 98 + 1, 0)));
  }
  return out;
}

/** Tổng KL phiên tăng / phiên giảm trong n phiên tới t (> 1 = tích lũy). */
export function upDownVolumeRatio(S, t, n = 50) {
  const a = Math.max(0, t - n), up = [], dn = [];
  for (let i = a + 1; i <= t; i++) { if (S.C[i] > S.C[i - 1]) up.push(S.V[i]); else if (S.C[i] < S.C[i - 1]) dn.push(S.V[i]); }
  const d = npSum(dn);
  return d > 0 ? npSum(up) / d : Infinity;
}

/** Ngoại suy KL cả phiên từ KL trong phiên [s.270]. HOSE: 9:00–11:30 + 13:00–14:45 ≈ 255 phút. */
export function projectIntradayVolume(volumeSoFar, minutesElapsed, sessionMinutes = 255) {
  return minutesElapsed > 0 ? (volumeSoFar * sessionMinutes) / minutesElapsed : NaN;
}
