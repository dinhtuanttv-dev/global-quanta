// SEPA — Chương 9: cổ phiếu dẫn dắt; sức khỏe thị trường chung (chuyển 1:1 từ sepa_screener/leadership.py), point-in-time.

import { SEPA } from "./config.js";
import { maxOf, minOf, pyRound, smaC } from "./indicators.js";

/** Giá đóng cửa chỉ số căn theo ngày của mã (reindex + ffill của pandas) tới t — bộ nhớ đệm trên S. */
export function alignIndex(S, indexByDate) {
  const key = "_ix";
  if (S[key]?.src === indexByDate) return S[key].ic;
  const ic = new Float64Array(S.n).fill(NaN);
  for (let i = 0; i < S.n; i++) { const v = indexByDate.get(S.date[i]); ic[i] = v != null ? v : i ? ic[i - 1] : NaN; }
  S[key] = { src: indexByDate, ic };
  return ic;
}

/** Map ngày -> giá đóng cửa của chỉ số. */
export const indexCloseMap = (indexBars) => new Map((indexBars ?? []).map((b) => [b.date, b.close]));

const firstIdx = (A, a, b, pick) => { let k = -1; for (let i = a; i < b; i++) if (!Number.isNaN(A[i]) && (k < 0 || pick(A[i], A[k]))) k = i; return k; };
const minNan = (A, a, b) => { let m = NaN; for (let i = a; i < b; i++) if (!Number.isNaN(A[i]) && !(A[i] >= m)) m = A[i]; return m; };
const maxNan = (A, a, b) => { let m = NaN; for (let i = a; i < b; i++) if (!Number.isNaN(A[i]) && !(A[i] <= m)) m = A[i]; return m; };

/**
 * Dấu hiệu cổ phiếu dẫn dắt [s.198–226]: giữ giá tốt khi thị trường điều chỉnh (≤ 25–35%, tránh mã giảm gấp 2–3 lần thị
 * trường), đường RS đi lên / lập đỉnh trước giá, phân kỳ dương với chỉ số, lập đỉnh 52 tuần sớm (4–8 tuần đầu sau đáy thị
 * trường), tăng 20% trong ≤ 5 tuần, cách đỉnh 52 tuần 5–15% khi thị trường điều chỉnh.
 */
export function leadershipProfile(S, t, indexByDate, cfg = SEPA.lead, lookback = 126) {
  const n = t + 1, C = S.C, out = {};
  const wa = Math.max(0, n - lookback);
  const ddStock = 1 - minOf(S.L, wa, n) / maxOf(S.H, wa, n);
  const hi52 = maxOf(S.H, Math.max(0, n - 252), n);
  out.dist_dinh_52t = 1 - C[t] / hi52;
  let fast = false;
  for (let i = Math.max(cfg.fastMoveDays, n - 126); i < n; i++) if (C[i] / C[i - cfg.fastMoveDays] - 1 >= cfg.fastMovePct) { fast = true; break; }
  out.tang_20pct_trong_5_tuan_gan_day = fast;
  if (!indexByDate || !indexByDate.size) { out.muc_dieu_chinh_cp = ddStock; return out; }
  const ic = alignIndex(S, indexByDate);
  // đỉnh -> đáy của chỉ số trong cửa sổ
  const iPeak = firstIdx(ic, wa, n, (a, b) => a > b);
  if (iPeak < 0) { out.muc_dieu_chinh_cp = ddStock; return out; } // chỉ số không có dữ liệu trong cửa sổ
  const iTrough = firstIdx(ic, iPeak, n, (a, b) => a < b);
  const idxDd = 1 - ic[iTrough] / ic[iPeak];
  const sDd = iTrough > iPeak ? 1 - minOf(C, iPeak, iTrough + 1) / maxOf(C, Math.max(0, iPeak + 1 - 20), iPeak + 1) : 0;
  const rl = Float64Array.from({ length: n }, (_, i) => C[i] / ic[i]);
  const rlHi = maxNan(rl, Math.max(0, n - 252), n);
  const ratio = idxDd > 0.02 ? sDd / idxDd : NaN;
  Object.assign(out, {
    chi_so_dieu_chinh: idxDd,
    cp_dieu_chinh_cung_ky: sDd,
    ty_le_dieu_chinh_vs_chi_so: ratio,
    duong_RS_dinh_moi: rl[t] >= rlHi * 0.995,
    duong_RS_dinh_moi_truoc_gia: rl[t] >= rlHi * 0.995 && C[t] < hi52 * 0.97,
    duong_RS_doc_len_3thang: n > 63 ? rl[t] > rl[n - 63] : false, // rl.iloc[-63]
  });
  // phân kỳ dương: chỉ số đáy thấp hơn, cổ phiếu đáy cao hơn
  if (n > 80) out.phan_ky_duong_voi_chi_so = minNan(ic, n - 40, n) < minNan(ic, n - 80, n - 40) && minOf(C, n - 40, n) > minOf(C, n - 80, n - 40);
  // lập đỉnh mới sớm sau đáy chỉ số
  const iLow = firstIdx(ic, wa, n, (a, b) => a < b);
  const hiBefore = maxOf(S.H, Math.max(0, iLow + 1 - 252), iLow + 1);
  let nh = -1; for (let i = iLow; i < n; i++) if (C[i] > hiBefore) { nh = i; break; }
  out.so_tuan_tu_day_chi_so_den_dinh_moi = nh >= 0 ? pyRound((nh - iLow) / 5, 1) : null;
  out.DINH_MOI_SOM = nh >= 0 && out.so_tuan_tu_day_chi_so_den_dinh_moi <= cfg.newHighAfterBottomWeeks;
  const hiB = cfg.nearHighBand[1];
  out.giu_gia_tot = idxDd > 0.05 && sDd <= cfg.maxCorrection && (Number.isNaN(ratio) || ratio <= cfg.maxVsIndexMult);
  out.gan_dinh_khi_TT_dieu_chinh = idxDd > 0.05 && out.dist_dinh_52t <= hiB;
  out.GIAM_GAP_DOI_THI_TRUONG = !Number.isNaN(ratio) && ratio > cfg.maxVsIndexMult;
  let sc = 0;
  sc += out.duong_RS_dinh_moi ? 25 : out.duong_RS_doc_len_3thang ? 10 : 0;
  sc += out.giu_gia_tot ? 20 : 0;
  sc += out.DINH_MOI_SOM ? 20 : 0;
  sc += out.phan_ky_duong_voi_chi_so ? 10 : 0;
  sc += out.tang_20pct_trong_5_tuan_gan_day ? 10 : 0;
  sc += out.dist_dinh_52t <= hiB ? 15 : 0;
  sc -= out.GIAM_GAP_DOI_THI_TRUONG ? 20 : 0;
  out.diem_dan_dat = Math.min(100, Math.max(0, sc));
  return out;
}

/**
 * Bối cảnh thị trường chung [s.196–200, s.214–226] tại phiên ti của chỉ số: chỉ số trên MA50/MA200; ngày phân phối (giảm ≥ 0,2%
 * với KL cao hơn phiên trước) trong 25 phiên; số mã lập đỉnh 52 tuần so với số mã lập đáy; tỷ lệ mã đạt Trend Template.
 * universe: [{ S, t }] — mỗi mã tại phiên cùng ngày (chỉ dữ liệu ≤ t).
 */
export function marketHealth(IS, ti, universe = null, ttPassRatio = null) {
  const n = ti + 1, C = IS.C, V = IS.V;
  const out = {
    chi_so: C[ti],
    tren_MA50: C[ti] > smaC(IS, 50)[ti],
    tren_MA200: n > 200 ? C[ti] > smaC(IS, 200)[ti] : null,
    dieu_chinh_tu_dinh_52t: 1 - C[ti] / maxOf(C, Math.max(0, n - 252), n),
  };
  let vs = 0; for (let i = 0; i < n; i++) vs += V[i];
  if (vs > 0) {
    let d = 0; for (let i = Math.max(1, n - 25); i < n; i++) if (C[i] / C[i - 1] - 1 <= -0.002 && V[i] > V[i - 1]) d++;
    out.ngay_phan_phoi_25_phien = d;
  }
  if (universe && universe.length) {
    let nh = 0, nl = 0;
    for (const { S, t } of universe) {
      if (t + 1 < 252) continue;
      const last = S.C[t];
      if (last >= maxOf(S.H, t + 1 - 252, t + 1) * 0.99) nh++;
      if (last <= minOf(S.L, t + 1 - 252, t + 1) * 1.01) nl++;
    }
    out.so_dinh_52t = nh; out.so_day_52t = nl;
  }
  if (ttPassRatio != null) out.ty_le_dat_trend_template = ttPassRatio;
  const bad = (!out.tren_MA50 ? 1 : 0) + ((out.ngay_phan_phoi_25_phien ?? 0) >= 5 ? 1 : 0) + ((out.so_day_52t ?? 0) > (out.so_dinh_52t ?? 0) ? 1 : 0);
  out.danh_gia = ["THUẬN LỢI", "TRUNG TÍNH", "THẬN TRỌNG", "BẤT LỢI"][Math.min(bad, 3)];
  out.goi_y_rui_ro = bad >= 2 ? "Thị trường khó: dừng lỗ 5%–6%, chốt lời 10%–12%, giảm quy mô, bỏ margin [s.370]" : "Bình thường: dừng lỗ tối đa 10%, R:R >= 2:1";
  return out;
}

/** Xếp hạng ngành theo RS trung bình — siêu cổ phiếu là "hạt giống tốt nhất" của ngành dẫn dắt [s.199]. */
export function groupStrength(rsBySymbol, sectorBySymbol) {
  const g = new Map();
  for (const [sym, rs] of Object.entries(rsBySymbol)) {
    const s = sectorBySymbol[sym]; if (s == null || !Number.isFinite(rs)) continue;
    const a = g.get(s) ?? []; a.push(rs); g.set(s, a);
  }
  const rows = [...g].map(([nganh, a]) => ({ nganh, mean: a.reduce((x, y) => x + y, 0) / a.length, max: Math.max(...a), count: a.length }));
  rows.sort((a, b) => b.mean - a.mean);
  return rows.map((r, i) => ({ ...r, hang_nganh: i + 1 }));
}


