// SEPA — thành phần dùng chung cho các mô hình nền giá (chuyển 1:1 từ sepa_screener/patterns/common.py):
// kết quả, đỉnh trái, phá vỡ pivot, rũ bỏ (undercut), bắn vọt, gap giảm. Point-in-time tại phiên t.

import { argmaxOf, npMean, smaC, volRoll } from "../indicators.js";

/** Kết quả một mô hình. status: FORMING | NEAR_PIVOT | BREAKOUT | EXTENDED | SQUAT | FAILED | NONE. */
export function patternResult(name) {
  return {
    name, detected: false, status: "NONE", pivot: null, baseStart: null, baseEnd: null, baseWeeks: null, depth: null,
    footprint: "", stopRef: null, score: 0, details: {}, notes: [], reasonsFailed: [], breakout: {},
  };
}

/** KL trung bình n phiên kết thúc tại `end` (mặc định t). */
export function volAvg(S, t, n = 50, end = t) {
  const b = end + 1, a = Math.max(0, b - n);
  return npMean(S.V, a, b);
}

/** Vị trí đỉnh cao nhất (đỉnh trái của nền) trong `maxBars` phiên tới t — lần xuất hiện đầu tiên. */
export function findLeftPeak(S, t, maxBars) {
  return argmaxOf(S.H, Math.max(0, t + 1 - maxBars), t + 1);
}

/**
 * Rũ bỏ / undercut [s.253–255]: giá xuyên thủng một đáy trước đó trong nền rồi đóng cửa trở lại trên đáy đó
 * trong vòng `recoverBars` phiên. swingLows: [[idx, giá], …].
 */
export function countShakeouts(S, t, swingLows, recoverBars = 3) {
  const out = [];
  for (const [li, lv] of swingLows) {
    for (let i = li + 3; i <= t; i++) {
      if (S.L[i] < lv) {
        let rec = false; for (let k = i; k <= Math.min(t, i + recoverBars); k++) if (S.C[k] > lv) { rec = true; break; }
        if (rec) out.push({ ngay: S.date[i], day_bi_thung: lv, do_sau: 1 - S.L[i] / lv });
        break;
      }
    }
  }
  return out;
}

/** Cú bắn vọt của giá kèm KL lớn bên trong nền = dấu hiệu thu gom [s.256–260]. */
export function spikeUps(S, t, start, volMult = 1.8, minRet = 0.03) {
  const v50 = volRoll(S, 50, 10, true), out = [];
  for (let i = Math.max(1, start); i <= t; i++) {
    const r = S.C[i] / S.C[i - 1] - 1;
    if (r >= minRet && S.V[i] >= volMult * v50[i]) out.push({ ngay: S.date[i], pct: r, KL_x_TB50: S.V[i] / v50[i] });
  }
  return out;
}

export function heavyGapDowns(S, t, start, volMult = 1.5, gap = 0.02) {
  const v50 = volRoll(S, 50, 10, true);
  let k = 0;
  for (let i = Math.max(1, start); i <= t; i++) if (S.H[i] < S.L[i - 1] * (1 - gap) && S.V[i] > volMult * v50[i]) k++;
  return k;
}

/**
 * Trạng thái so với pivot sau khi nền kết thúc tại baseEnd (đánh giá tới t):
 *   BREAKOUT  : đóng cửa vượt pivot, chưa vượt quá vùng mua 5%
 *   EXTENDED  : đã cách pivot > 5% – không đuổi giá [s.265]
 *   SQUAT     : vượt pivot rồi quay lại trong nền (chờ 1–2 ngày, có khi 10 ngày) [s.272]
 *   FAILED    : thủng mức dừng lỗ / đóng cửa dưới MA20 sau phá vỡ [s.275]
 */
export function evaluateBreakout(S, t, pivot, baseEnd, stopRef, volRatioReq = 1.4, maxChase = 0.05) {
  const C = S.C, V = S.V;
  let bo = -1; for (let i = baseEnd + 1; i <= t; i++) if (C[i] > pivot) { bo = i; break; }
  const last = C[t], v50 = volAvg(S, t, 50, baseEnd);
  const info = { pivot, gia_hien_tai: last, pct_so_voi_pivot: last / pivot - 1 };
  if (bo < 0) {
    const dist = pivot / last - 1;
    info.status = dist <= 0.03 ? "NEAR_PIVOT" : "FORMING";
    info.khoang_cach_den_pivot = dist;
    return info;
  }
  const ma20 = smaC(S, 20);
  Object.assign(info, {
    ngay_pha_vo: S.date[bo],
    so_phien_tu_pha_vo: t - bo,
    KL_pha_vo_x_TB50: v50 > 0 ? V[bo] / v50 : NaN,
    KL_pha_vo_dat: v50 > 0 && V[bo] >= volRatioReq * v50,
    dong_cua_gan_dinh_phien: C[bo] - S.L[bo] >= 0.5 * (S.H[bo] - S.L[bo]),
  });
  let below = 0, minLow = Infinity;
  for (let i = bo; i <= t; i++) { if (C[i] < ma20[i]) below++; if (S.L[i] < minLow) minLow = S.L[i]; }
  info.so_phien_dong_cua_duoi_MA20 = below;
  if (stopRef != null && minLow < stopRef) { info.status = "FAILED"; info.ly_do = "Thủng mức hỗ trợ cấu trúc / dừng lỗ"; }
  else if (below >= 3 && last < ma20[t]) { info.status = "FAILED"; info.ly_do = "Đóng cửa dưới MA20 nhiều lần sau phá vỡ [s.275]"; }
  else if (last < pivot) info.status = "SQUAT";
  else if (last > pivot * (1 + maxChase)) info.status = "EXTENDED";
  else info.status = "BREAKOUT";
  return info;
}

/**
 * Nếu nền đã bị phá vỡ trong vài phiên gần đây, đỉnh của nền không còn là đỉnh cao nhất => chạy lại bộ nhận diện tại
 * t − j rồi đánh giá phá vỡ tới t. Duyệt từ xa đến gần để lấy phiên phá vỡ ĐẦU TIÊN.
 */
export function withRecentBreakout(detector, S, t, lookback = 5, opts = {}) {
  for (let j = lookback; j >= 1; j--) {
    if (t + 1 - j < 60) continue;
    const end = t - j, r = detector(S, end, opts);
    if (r.detected && r.pivot != null && S.C[end + 1] > r.pivot && r.pivot >= S.C[end]) {
      r.breakout = evaluateBreakout(S, t, r.pivot, end, r.stopRef, opts.volRatioReq ?? 1.4);
      r.status = r.breakout.status;
      return r;
    }
  }
  return detector(S, t, opts);
}

export const STATUS_RANK = Object.freeze({ BREAKOUT: 5, NEAR_PIVOT: 4, SQUAT: 3, FORMING: 2, EXTENDED: 1, FAILED: 0, NONE: -1 });

/** Mô hình tốt nhất: trạng thái gần điểm mua nhất, rồi điểm chất lượng (bằng nhau -> giữ thứ tự quét). */
export function bestPattern(pats) {
  const det = pats.filter((p) => p.detected);
  if (!det.length) return null;
  const key = (p) => [STATUS_RANK[p.status] ?? -1, p.score];
  // sorted(..., reverse=True) của Python ổn định: phần tử bằng khóa giữ thứ tự gốc -> lấy phần tử ĐẦU trong nhóm lớn nhất
  let best = det[0];
  for (const p of det.slice(1)) { const [a, b] = key(p), [c, d] = key(best); if (a > c || (a === c && b > d)) best = p; }
  return best;
}

