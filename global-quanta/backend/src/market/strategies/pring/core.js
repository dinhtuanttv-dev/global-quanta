// Pattern Scanner v2 — lõi hình học point-in-time: ATR, pivot zigzag đa bậc (chỉ dùng pivot ĐÃ XÁC NHẬN tới t), đường
// biên đếm số lần chạm/tiếp cận (ch4, ch6), xu hướng trước đó, đặc tính khối lượng, RSI / MA200 cho bối cảnh (ch17).

import { PRING } from "./config.js";
import { cached, prepareSepa, rollMean, smaC } from "../sepa/indicators.js";

export { prepareSepa as preparePattern };

/** ATR Wilder (bộ nhớ đệm). */
export function atrOf(S, n = PRING.atrPeriod) {
  return cached(S, `atr${n}`, () => {
    // Wilder: ATR(n) đầu tiên = TB TR của n thanh đầu (1..n), sau đó a = (a×(n−1) + TR)/n.
    const out = new Float64Array(S.n).fill(NaN);
    let a = 0;
    for (let i = 1; i < S.n; i++) {
      const tr = Math.max(S.H[i] - S.L[i], Math.abs(S.H[i] - S.C[i - 1]), Math.abs(S.L[i] - S.C[i - 1]));
      if (i <= n) { a += tr; if (i === n) { a /= n; out[i] = a; } continue; }
      a = (a * (n - 1) + tr) / n;
      out[i] = a;
    }
    return out;
  });
}
// Trước khi đủ 14 thanh: 3% (không nhìn trước).
export const atrPctAt = (S, i) => { const a = atrOf(S)[i]; return Number.isFinite(a) ? a / S.C[i] : 0.03; };

/**
 * Pivot zigzag tuần tự trên cả chuỗi; mỗi pivot ghi `ci` = phiên XÁC NHẬN (đảo chiều đủ ngưỡng). Vì thuật toán đi tuần tự
 * và ngưỡng tại phiên i chỉ dùng dữ liệu ≤ i, các pivot có ci ≤ t trùng hệt kết quả tính trên dữ liệu cắt tới t.
 * Ngưỡng = max(minPct, atrMult × ATR%).
 */
export function zigzag(S, degree = "intermediate") {
  return cached(S, `zz_${degree}`, () => {
    const { minPct, atrMult } = PRING.degrees[degree];
    const piv = [];
    let dir = 0, ei = 0, ev = S.C[0], hi = 0, lo = 0;
    for (let i = 1; i < S.n; i++) {
      const thr = Math.max(minPct, atrMult * atrPctAt(S, i));
      if (dir === 0) {
        if (S.H[i] > S.H[hi]) hi = i;
        if (S.L[i] < S.L[lo]) lo = i;
        if (S.H[hi] / S.L[lo] - 1 >= thr) {
          if (hi > lo) { piv.push({ type: "L", i: lo, price: S.L[lo], ci: i }); dir = 1; ei = hi; ev = S.H[hi]; }
          else { piv.push({ type: "H", i: hi, price: S.H[hi], ci: i }); dir = -1; ei = lo; ev = S.L[lo]; }
        }
        continue;
      }
      if (dir === 1) {
        if (S.H[i] >= ev) { ev = S.H[i]; ei = i; }
        else if (1 - S.L[i] / ev >= thr) { piv.push({ type: "H", i: ei, price: ev, ci: i }); dir = -1; ei = i; ev = S.L[i]; }
      } else {
        if (S.L[i] <= ev) { ev = S.L[i]; ei = i; }
        else if (S.H[i] / ev - 1 >= thr) { piv.push({ type: "L", i: ei, price: ev, ci: i }); dir = 1; ei = i; ev = S.H[i]; }
      }
    }
    return piv;
  });
}
/** Pivot đã xác nhận tới t (kèm ngày). */
export function pivotsAt(S, t, degree = "intermediate") {
  const out = [];
  for (const p of zigzag(S, degree)) { if (p.ci > t) break; out.push({ ...p, date: S.date[p.i] }); }
  return out;
}

// ------------------------------------------------------------------ đường thẳng

/** Đường qua hai điểm (i, giá) -> { a, b, value(i), slope }. */
export function lineThrough(p, q) {
  const slope = (q.price - p.price) / (q.i - p.i || 1);
  return { i0: p.i, p0: p.price, i1: q.i, p1: q.price, slope, value: (i) => p.price + slope * (i - p.i) };
}
export const touchTol = (S, i, price) => Math.max(PRING.touchTolPct * price, PRING.touchTolAtr * (Number.isFinite(atrOf(S)[i]) ? atrOf(S)[i] : 0.02 * price));

/**
 * Đường biên tốt nhất qua các pivot cùng loại (đỉnh -> biên trên, đáy -> biên dưới): thử mọi cặp (đầu, cuối), yêu cầu không
 * pivot nào xuyên quá dung sai, đếm số lần chạm/tiếp cận; ưu tiên nhiều điểm chạm rồi khoảng rộng.
 */
export function fitBoundary(S, pts, side) {
  if (pts.length < 2) return null;
  let best = null;
  for (let a = 0; a < pts.length - 1; a++) for (let b = pts.length - 1; b > a; b--) {
    const L = lineThrough(pts[a], pts[b]);
    let ok = true, touches = 0;
    const touched = [];
    for (const p of pts) {
      const v = L.value(p.i), tol = touchTol(S, p.i, p.price);
      const over = side === "upper" ? p.price - v : v - p.price;
      if (over > tol) { ok = false; break; }
      if (Math.abs(p.price - v) <= tol) { touches++; touched.push(p); }
    }
    if (!ok) continue;
    const span = pts[b].i - pts[a].i;
    if (!best || touches > best.touches || (touches === best.touches && span > best.span)) best = { line: L, touches, span, touched, first: pts[a], last: pts[b] };
  }
  return best;
}

/** Đóng cửa có xuyên đường quá dung sai giữa [a, b] (thân mô hình phải nằm trong biên — cho phép râu nến). */
export function closesInside(S, line, a, b, side, tolMult = 1) {
  for (let i = a; i <= b; i++) {
    const v = line.value(i), tol = tolMult * touchTol(S, i, v);
    if (side === "upper" ? S.C[i] > v + tol : S.C[i] < v - tol) return false;
  }
  return true;
}

// ------------------------------------------------------------------ bối cảnh

/** Xu hướng trước điểm bắt đầu mô hình: dịch chuyển log từ cực trị ngược chiều trong `lookback` thanh. */
export function priorTrend(S, start, lookback = PRING.priorLookback) {
  const a = Math.max(0, start - lookback);
  let lo = Infinity, hi = -Infinity;
  for (let i = a; i <= start; i++) { if (S.L[i] < lo) lo = S.L[i]; if (S.H[i] > hi) hi = S.H[i]; }
  const ref = S.C[start];
  return { rise: ref / lo - 1, fall: 1 - ref / hi };
}

/** Xu hướng chính tại i (ch17): giá so MA200 và độ dốc MA200 21 phiên. +1 tăng, −1 giảm, 0 chưa rõ. */
export function majorTrend(S, i) {
  const ma = smaC(S, 200);
  if (i < 221 || Number.isNaN(ma[i]) || Number.isNaN(ma[i - 21])) return 0;
  const up = S.C[i] > ma[i] && ma[i] > ma[i - 21], dn = S.C[i] < ma[i] && ma[i] < ma[i - 21];
  return up ? 1 : dn ? -1 : 0;
}

/** KL trung bình `n` thanh kết thúc tại i (không gồm i). */
export const volAvgBefore = (S, i, n = PRING.volAvg) => cached(S, `vavg${n}`, () => { const r = rollMean(S.V, n, Math.min(n, 5)); const o = new Float64Array(S.n).fill(NaN); for (let k = 1; k < S.n; k++) o[k] = r[k - 1]; return o; })[i];

/** Độ dốc chuẩn hoá của khối lượng trong [a, b] (hồi quy tuyến tính, %/thanh so với TB) — âm = co lại (ch5, ch6). */
export function volumeSlope(S, a, b) {
  const n = b - a + 1;
  if (n < 5) return 0;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = a; i <= b; i++) { const x = i - a, y = S.V[i]; sx += x; sy += y; sxx += x * x; sxy += x * y; }
  const mean = sy / n, den = n * sxx - sx * sx;
  if (!den || !mean) return 0;
  return ((n * sxy - sx * sy) / den) / mean; // tỷ lệ thay đổi mỗi thanh
}

/** RSI Wilder 14 (bộ nhớ đệm) — phân kỳ động lượng tại điểm phá vỡ (ch17). */
export function rsiOf(S, n = 14) {
  return cached(S, `rsi${n}`, () => {
    const out = new Float64Array(S.n).fill(NaN);
    let g = 0, l = 0;
    for (let i = 1; i < S.n; i++) {
      const d = S.C[i] - S.C[i - 1], up = Math.max(0, d), dn = Math.max(0, -d);
      if (i <= n) { g += up; l += dn; if (i === n) { g /= n; l /= n; out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); } continue; }
      g = (g * (n - 1) + up) / n; l = (l * (n - 1) + dn) / n;
      out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
    }
    return out;
  });
}

/** Mục tiêu đo lường trên THANG LOG (ch6): level × e^(±k × ln(cao/thấp)). */
export const logTarget = (level, height, k, dir) => level * Math.exp(dir * k * height);
