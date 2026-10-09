// SEPA — Chương 5 (chuyển 1:1 từ sepa_screener/trend.py), point-in-time tại phiên t:
//   Hình mẫu xu hướng 8 tiêu chí [s.101–102]; 4 giai đoạn [s.86–100]; chuyển GĐ1 -> GĐ2 [s.88–89];
//   dấu hiệu GĐ3 / tín hiệu bán do hành động giá [s.93–94, s.111–113]; đếm nền trong GĐ2 [s.102–104].
// Khóa của criteria/values/evidence giữ đúng tên bản Python (giao diện hiển thị trực tiếp, đối chiếu dễ).

import { SEPA } from "./config.js";
import { maxOf, minOf, monthsRising, npMean, npSum, pyRound, rollMean, smaC, toWeekly, weeklySwings } from "./indicators.js";

export const STAGE_LABELS = Object.freeze({
  0: "Không xác định",
  1: "GĐ1 – Thờ ơ / tích luỹ",
  2: "GĐ2 – Tăng giá / tăng tốc",
  3: "GĐ3 – Tạo đỉnh / phân phối",
  4: "GĐ4 – Giảm giá / tháo chạy",
});

// ------------------------------------------------------------------ TREND TEMPLATE

export function trendTemplate(S, t, rsRating, cfg = SEPA.trend) {
  const n = t + 1;
  if (n < cfg.maLong + cfg.ma200UpMinDays) return { passed: false, score: 0, criteria: { du_lieu: false }, values: { ghi_chu: "Không đủ dữ liệu (cần > 220 phiên)" } };
  const m50 = smaC(S, cfg.maShort)[t], m150 = smaC(S, cfg.maMid)[t], ma200 = smaC(S, cfg.maLong), m200 = ma200[t];
  const price = S.C[t], a = Math.max(0, n - cfg.lookback52w);
  const hi52 = maxOf(S.H, a, n), lo52 = minOf(S.L, a, n);
  const rising = monthsRising(ma200, t);
  const rsOk = rsRating != null && !Number.isNaN(rsRating);
  const criteria = {
    TC1_gia_tren_MA150_MA200: price > m150 && price > m200,
    TC2_MA150_tren_MA200: m150 > m200,
    TC3_MA200_doc_len_1thang: m200 > ma200[t - cfg.ma200UpMinDays],
    TC4_MA50_tren_MA150_MA200: m50 > m150 && m50 > m200,
    TC5_gia_tren_MA50: price > m50,
    TC6_cao_hon_day52t_30pct: price >= lo52 * (1 + cfg.minAbove52wLow),
    "TC7_cach_dinh52t_toi_da_25pct": price >= hi52 * (1 - cfg.maxBelow52wHigh),
    "TC8_RS_rating_>=70": rsOk && rsRating >= cfg.minRsRating,
  };
  const score = Object.values(criteria).filter(Boolean).length;
  const values = {
    gia: price, ma50: m50, ma150: m150, ma200: m200, dinh_52t: hi52, day_52t: lo52,
    pct_tren_day52t: price / lo52 - 1, pct_duoi_dinh52t: 1 - price / hi52,
    so_thang_MA200_tang: rising, MA200_tang_4_5_thang: rising >= cfg.ma200UpPrefMonths,
    rs_rating: rsRating ?? null, rs_ua_thich_80_90: rsRating != null && rsRating >= cfg.prefRsRating,
  };
  return { passed: score === 8, score, criteria, values };
}

// ------------------------------------------------------------------ 4 GIAI ĐOẠN

/** Tuần tăng KL lớn vs tuần giảm KL lớn (đặc điểm GĐ2/GĐ4) — 27 nến tuần cuối. */
function volumeCharacter(w, weeks = 26) {
  const tw = w.slice(-(weeks + 1));
  const avgv = npMean(Float64Array.from(tw, (x) => x.volume));
  let upHeavy = 0, dnHeavy = 0; const up = [], dn = [];
  for (let i = 1; i < tw.length; i++) {
    const chg = tw[i].close - tw[i - 1].close, v = tw[i].volume;
    if (chg > 0) { up.push(v); if (v > avgv) upHeavy++; }
    if (chg < 0) { dn.push(v); if (v > avgv) dnHeavy++; }
  }
  const upV = npSum(up), dnV = npSum(dn);
  return { tuan_tang_KL_cao: upHeavy, tuan_giam_KL_cao: dnHeavy, ty_le_KL_tang_giam: dnV ? upV / dnV : Infinity };
}

function higherHighsLows(w, weeks = 40) {
  const { highs, lows } = weeklySwings(w.slice(-weeks).map((x) => x.close), 2);
  const H = highs.length, L = lows.length;
  const hh = H >= 2 && highs[H - 1] > highs[H - 2], hl = L >= 2 && lows[L - 1] > lows[L - 2];
  const lh = H >= 2 && highs[H - 1] < highs[H - 2], ll = L >= 2 && lows[L - 1] < lows[L - 2];
  return { up: hh && hl, down: lh && ll };
}

/** Vị trí bắt đầu chuỗi liên tục giá > MA200 và MA200 dốc lên (cho phép "thủng" ≤ 10 phiên) — xấp xỉ khởi đầu GĐ2. */
export function findStage2Start(S, t) {
  const ma200 = smaC(S, 200);
  const ok = (i) => i >= 21 && S.C[i] > ma200[i] && ma200[i] > ma200[i - 21];
  let end = t; while (end >= 0 && !ok(end)) end--;
  if (end < 0) return null;
  let start = end, gap = 0;
  for (let i = end; i >= 0; i--) {
    if (ok(i)) { start = i; gap = 0; } else if (++gap > 10) break;
  }
  return start;
}

/**
 * Đếm nền giá từ khi bắt đầu GĐ2 [s.102–104]: mỗi lần giá điều chỉnh ≥ baseMinDepth, kéo dài ≥ baseMinWeeks rồi
 * ĐÓNG CỬA vượt đỉnh cũ = 1 nền. Nền 1–2 tốt nhất, nền 3 còn mua được, nền 4–5 là "nền cuối" dễ thất bại.
 */
export function countBases(S, t, start, cfg = SEPA.stage) {
  if (start == null) return [];
  const bases = [];
  let pi = start, peak = S.H[start], trough = S.L[start];
  for (let i = start + 1; i <= t; i++) {
    if (S.C[i] > peak) {
      const depth = 1 - trough / peak, weeks = (i - pi) / 5;
      if (depth >= cfg.baseMinDepth && weeks >= cfg.baseMinWeeks) bases.push({ bat_dau: S.date[pi], pha_vo: S.date[i], so_tuan: pyRound(weeks, 1), do_sau: pyRound(depth, 3) });
      pi = i; peak = S.H[i]; trough = S.L[i];
    } else trough = Math.min(trough, S.L[i]);
  }
  const depth = 1 - trough / peak, weeks = (t - pi) / 5;
  if (depth >= cfg.baseMinDepth && weeks >= cfg.baseMinWeeks) bases.push({ bat_dau: S.date[pi], pha_vo: null, so_tuan: pyRound(weeks, 1), do_sau: pyRound(depth, 3), dang_hinh_thanh: true });
  return bases;
}

/**
 * Dấu hiệu GĐ3 / tín hiệu bán [s.93–94, s.112]: ngày/tuần giảm mạnh nhất kể từ khi bắt đầu GĐ2 kèm KL lớn
 * => "trong phần lớn trường hợp, đây là tín hiệu bán".
 */
export function stageSignalsOfTop(S, t, since) {
  if (since == null || t - since + 1 < 30) return {};
  const m = t - since + 1;
  const ret = new Float64Array(m).fill(NaN);
  for (let k = 1; k < m; k++) ret[k] = S.C[since + k] / S.C[since + k - 1] - 1;
  let wk = 1; for (let k = 2; k < m; k++) if (ret[k] < ret[wk]) wk = k;
  const rs = Math.max(0, m - 10);
  let worstRecent = Infinity; for (let k = Math.max(1, rs); k < m; k++) if (ret[k] < worstRecent) worstRecent = ret[k];
  const vol50 = rollMean(S.V.subarray(since, t + 1), 50, 10);
  const w = toWeekly(S, t, since);
  const wret = w.map((x, i) => (i ? x.close / w[i - 1].close - 1 : NaN));
  const valid = wret.filter((x) => !Number.isNaN(x)).length;
  let wmin = -1; for (let i = 1; i < w.length; i++) if (wmin < 0 || wret[i] < wret[wmin]) wmin = i;
  let vmax = 0; for (let i = 1; i < w.length; i++) if (w[i].volume > w[vmax].volume) vmax = i;
  const out = {
    ngay_giam_manh_nhat_tu_GD2: S.date[since + wk],
    pct_ngay_giam_manh_nhat: ret[wk],
    ngay_giam_manh_nhat_moi_xay_ra: wk >= rs,
    KL_ngay_giam_manh_nhat_vs_TB50: vol50[wk] > 0 ? S.V[since + wk] / vol50[wk] : NaN,
    tuan_giam_manh_nhat_moi_xay_ra: valid > 3 && wmin >= w.length - 2,
    KL_tuan_lon_nhat_la_tuan_giam: Number.isNaN(wret[vmax]) ? false : w.length > 3 && wret[vmax] < 0,
    pct_giam_toi_te_10_phien: worstRecent,
  };
  out.CANH_BAO_BAN = (out.ngay_giam_manh_nhat_moi_xay_ra && out.KL_ngay_giam_manh_nhat_vs_TB50 > 1.5) || out.tuan_giam_manh_nhat_moi_xay_ra;
  return out;
}

export function classifyStage(S, t, cfg = SEPA.stage) {
  const n = t + 1;
  if (n < 230) return { stage: 0, label: STAGE_LABELS[0], confidence: 0, evidence: { ghi_chu: "Không đủ dữ liệu" }, stage2Start: null, baseCount: 0, bases: [], warnings: [] };
  const ma200 = smaC(S, 200), m50 = smaC(S, 50)[t], m150 = smaC(S, 150)[t], m200 = ma200[t], price = S.C[t];
  const sw = cfg.slopeWindow;
  const slope = ma200[t] / ma200[t - sw] - 1;
  const slopePrev = n - 199 > 4 * sw ? ma200[t - 3 * sw] / ma200[t - 4 * sw] - 1 : slope;
  const flat = Math.abs(slope) < cfg.flatSlopePct;
  let crosses = 0;
  for (let i = Math.max(1, n - cfg.ma200CrossLookback + 1); i <= t; i++) if ((S.C[i] > ma200[i]) !== (S.C[i - 1] > ma200[i - 1])) crosses++;
  const lo52 = minOf(S.L, Math.max(0, n - 252), n), hi52 = maxOf(S.H, Math.max(0, n - 252), n);
  const w = toWeekly(S, t);
  const struct = higherHighsLows(w), volc = volumeCharacter(w);
  const volRecent = npMean(S.V, n - 60, n), volPrior = n > 250 ? npMean(S.V, n - 250, n - 60) : volRecent;

  const ev = {
    gia: price, ma50: m50, ma150: m150, ma200: m200, doc_MA200_1thang: slope, doc_MA200_3thang_truoc: slopePrev,
    MA200_di_ngang: flat, so_lan_cat_MA200_60phien: crosses,
    dinh_cao_hon_day_cao_hon: struct.up, dinh_thap_hon_day_thap_hon: struct.down,
    pct_tren_day52t: price / lo52 - 1, pct_duoi_dinh52t: 1 - price / hi52, ...volc,
  };
  ev.tieu_chi_chuyen_GD1_GD2 = { // [s.88–89]
    "1_gia_tren_MA150_MA200": price > m150 && price > m200,
    "2_MA150_tren_MA200": m150 > m200,
    "3_MA200_doc_len": slope > 0,
    "4_dinh_day_cao_dan": struct.up,
    "5_tuan_tang_KL_lon_hon_tuan_giam": volc.tuan_tang_KL_cao > volc.tuan_giam_KL_cao,
    "6_KL_tang_lon_hon_KL_giam": volc.ty_le_KL_tang_giam > 1,
    "7_da_tang_25pct_tu_day52t": price >= lo52 * (1 + cfg.rallyOffLowMin),
  };
  const sum = (a) => a.filter(Boolean).length;
  const s2 = sum([price > m200, slope > 0, m150 > m200, m50 > m150, price > m50, struct.up, volc.ty_le_KL_tang_giam > 1]);
  const s4 = sum([price < m200, slope < 0, m50 < m150 && m150 < m200, price < lo52 * 1.15, struct.down, volc.tuan_giam_KL_cao > volc.tuan_tang_KL_cao]);
  const s3 = sum([slopePrev > 0 && slope < slopePrev * 0.5, flat || crosses >= 2, crosses >= 2, price < m50, hi52 / lo52 > 1.5]);
  const s1 = sum([flat, crosses >= 2, slopePrev <= 0, volRecent < volPrior, price < hi52 * 0.75]);
  const scores = { 1: s1 / 5, 2: s2 / 7, 3: s3 / 5, 4: s4 / 6 };
  ev.diem_GD = Object.fromEntries(Object.entries(scores).map(([k, v]) => [k, pyRound(v, 2)]));
  let stage = 1; for (const k of [2, 3, 4]) if (scores[k] > scores[stage]) stage = k;
  if (s2 >= 6 && slope > 0) stage = 2; // luật ưu tiên rõ ràng
  else if (price < m200 && slope < 0 && m50 < m200) stage = 4;
  const conf = scores[stage];

  const st2 = stage === 2 || stage === 3 ? findStage2Start(S, t) : null;
  const bases = st2 != null ? countBases(S, t, st2, cfg) : [];
  const res = {
    stage, label: STAGE_LABELS[stage], confidence: pyRound(conf, 2), evidence: ev,
    stage2Start: st2 == null ? null : S.date[st2], baseCount: bases.filter((b) => b.pha_vo != null).length, bases, warnings: [],
  };
  if (stage === 2 || stage === 3) {
    const top = stageSignalsOfTop(S, t, st2);
    ev.dau_hieu_dinh = top;
    if (top.CANH_BAO_BAN) res.warnings.push("Ngày/tuần giảm mạnh nhất kể từ GĐ2 vừa xuất hiện (KL lớn) – tín hiệu bán [s.112]");
    if (res.baseCount >= 4) res.warnings.push(`Nền thứ ${res.baseCount + 1}: nền muộn, dễ thất bại [s.103]`);
  }
  if (stage === 4) res.warnings.push("GĐ4 – tránh mua [s.95]");
  return res;
}
