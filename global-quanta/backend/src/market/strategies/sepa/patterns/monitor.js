// SEPA — theo dõi SAU khi mua tại điểm phá vỡ [s.271–284] (chuyển 1:1 từ sepa_screener/patterns/monitor.py):
//   squat & bật dậy (1–2 ngày, có thể 10 ngày; giữ trên MA20) [s.272]; phá vỡ thất bại: quay lại nền, đóng cửa dưới MA20
//   nhiều lần, giá hỗn loạn [s.275]; "quả bóng tennis": điều chỉnh vài ngày–2 tuần, KL giảm, rồi lập đỉnh mới [s.282–285].

import { npMean, pyRound, smaC, volRoll } from "../indicators.js";

/** breakoutDate: "YYYY-MM-DD" (phiên phá vỡ); đánh giá tới t. */
export function postBreakoutMonitor(S, t, breakoutDate, pivot, stop = null) {
  let b = 0; while (b <= t && S.date[b] < breakoutDate) b++;
  const m = t - b + 1;
  if (m <= 0) return {};
  const C = S.C.subarray(b, t + 1), H = S.H.subarray(b, t + 1), Lw = S.L.subarray(b, t + 1), V = S.V.subarray(b, t + 1);
  const ma20 = smaC(S, 20).subarray(b, t + 1), v50 = volRoll(S, 50, 50, true).subarray(b, t + 1);
  let hmax = -Infinity, lmin = Infinity; for (let i = 0; i < m; i++) { if (H[i] > hmax) hmax = H[i]; if (Lw[i] < lmin) lmin = Lw[i]; }
  const out = { so_phien: m, lai_lo_hien_tai: C[m - 1] / pivot - 1, dinh_cao_nhat_sau_pha_vo: hmax / pivot - 1 };
  let squat = 0; for (let i = 0; i < m; i++) if (C[i] < pivot) squat++;
  out.squat = squat > 0;
  if (squat) { out.squat_bat_day = C[m - 1] > pivot; out.so_phien_squat = squat; }
  const below = Array.from(C, (c, i) => c < ma20[i]);
  let crosses = 0; for (let i = 1; i < m; i++) if (below[i] !== below[i - 1]) crosses++;
  const nBelow = below.filter(Boolean).length;
  out.so_phien_duoi_MA20 = nBelow; out.so_lan_cat_MA20 = crosses; out.hon_loan_quanh_MA20 = crosses >= 4;
  // quả bóng tennis: các nhịp điều chỉnh sau phá vỡ
  const pulls = [];
  let i = 1, run = 0;
  while (i < m) {
    if (H[i] >= H[run]) { run = i; i++; continue; }
    let j = i; while (j < m && H[j] < H[run]) j++;
    let lo = Infinity; for (let k = run + 1; k < j; k++) if (Lw[k] < lo) lo = Lw[k];
    const den = v50[run] || NaN; // TB50 = 0 hoặc chưa đủ 50 phiên -> NaN (như bản Python)
    pulls.push({ so_phien: j - run - 1, do_sau: pyRound(1 - lo / H[run], 3), KL_x_TB50: pyRound(npMean(V, run + 1, j) / den, 2), da_lap_dinh_moi: j < m });
    if (j < m) run = j;
    i = j + 1;
  }
  out.cac_nhip_dieu_chinh = pulls;
  const made = pulls.filter((p) => p.da_lap_dinh_moi);
  const good = made.filter((p) => p.so_phien <= 10 && p.KL_x_TB50 < 1);
  out.qua_bong_tennis = pulls.length > 0 && good.length === made.length;
  const alerts = [];
  if (stop != null && lmin < stop) alerts.push("Đã chạm dừng lỗ – bán, không ngoại lệ [s.358]");
  if (below[m - 1] && nBelow >= 3) alerts.push("Đóng cửa dưới MA20 nhiều lần sau phá vỡ – xác suất thành công giảm [s.272]");
  if (out.hon_loan_quanh_MA20) alerts.push("Giá hỗn loạn quanh MA20 – điểm phá vỡ kém [s.275]");
  if (out.squat && !out.squat_bat_day && m > 10) alerts.push("Squat > 10 phiên chưa bật dậy");
  out.canh_bao = alerts;
  return out;
}
