// SEPA — Chương 7 (yếu tố cơ bản), Chương 8 (chất lượng lợi nhuận) — chuyển 1:1 từ sepa_screener/fundamentals.py,
// cộng bộ chuyển đổi dữ liệu VN (VCI) point-in-time.
//
// Đầu vào lõi `q` (giống DataFrame quý của bản Python, cũ -> mới, các quý LIÊN TIẾP — quý thiếu là NaN):
//   { date: ["YYYY-MM-DD" ngày kết thúc quý], cols: { eps, revenue, net_income?, gross_profit?, inventory?, receivables?,
//     nonrecurring?, eps_estimate?, est_cur_q_now?, est_cur_q_30d?, est_next_q_now?, est_next_q_30d?, est_fy_now?, est_fy_30d? } }
//   Cột vắng mặt = bản Python "không có cột" (cờ tương ứng không xét).
//
// Khác bản Python khi dùng dữ liệu VN (vnQuarterly — có chủ ý, ghi rõ để giao diện hiển thị đúng):
//   1. "EPS" = LNST của cổ đông công ty mẹ (VCI isa22): EPS quý của VCI chưa điều chỉnh theo cổ tức cổ phiếu / phát hành,
//      so sánh cùng kỳ bằng EPS sẽ sai. Các khóa cờ giữ tên gốc (EPS_…) để đối chiếu; giao diện ghi "LNST".
//   2. Chỉ dùng quý đã công bố tại ngày đánh giá (ước tính hết quý + 45 ngày) — không nhìn trước.
//   3. Không có dữ liệu ước tính / bất ngờ lợi nhuận / khoản bất thường của giới phân tích VN -> các cờ đó không xét (N/A).


import { npMean, pyRound, rollMean, rollSum } from "./indicators.js";

export const FUND_DEFAULTS = Object.freeze({
  epsGrowthMin: 0.2, epsGrowthGood: 0.3, epsGrowthBull: 0.4, salesGrowthMin: 0.15, accelQuarters: 3,
  turnaroundGrowth: 1.0, decelDrop: 0.4, breakoutYearMult: 2.0, estimateRevisionMin: 0.0,
  inventoryWarnMult: 1.0, inventorySevereMult: 2.0, peExpansionWarn: 2.0,
});

const isNum = (x) => typeof x === "number" && !Number.isNaN(x);
const dropna = (a) => Array.from(a).filter(isNum);
const r = (x, nd) => (isNum(x) ? pyRound(x, nd) : null);

/** Tăng trưởng cùng kỳ (quý t so với t−4); mẫu số 0 / NaN -> NaN. */
export function yoyGrowth(s) {
  const out = new Float64Array(s.length).fill(NaN);
  for (let i = 4; i < s.length; i++) { const p = s[i - 4]; if (isNum(p) && p !== 0) out[i] = (s[i] - p) / Math.abs(p); }
  return out;
}
/** Số quý liên tiếp gần nhất có tốc độ tăng trưởng tăng tốc (bỏ NaN). */
function consecAccel(g) { const v = dropna(g); let c = 0; for (let i = v.length - 1; i > 0; i--) { if (v[i] > v[i - 1]) c++; else break; } return c; }
const consecUp = consecAccel;
function countTail(mask) { let c = 0; for (let i = mask.length - 1; i >= 0 && mask[i]; i--) c++; return c; }
const tail = (a, k) => Array.from(a).slice(Math.max(0, a.length - k));
const maxNan = (a) => { const v = dropna(a); return v.length ? Math.max(...v) : NaN; };
const meanNan = (a) => { const v = dropna(a); return v.length ? npMean(v) : NaN; };

/** analyze_fundamentals() của bản Python. */
export function analyzeFundamentals(q, cfg = FUND_DEFAULTS) {
  const cols = q?.cols ?? {};
  if (!q || q.date.length < 5 || !cols.eps || !cols.revenue) return { score: 0, passedMin: false, flags: {}, metrics: {}, warnings: ["Thiếu dữ liệu cơ bản (cần >= 5 quý eps, revenue)"], positives: [] };
  const n = q.date.length, F = (k) => Float64Array.from(cols[k], (x) => (x == null ? NaN : Number(x)));
  // ---- EPS điều chỉnh: loại bỏ khoản bất thường [s.171] ----
  let eps = F("eps");
  if (cols.nonrecurring) { const nr = F("nonrecurring"); eps = eps.map((x, i) => x - (isNum(nr[i]) ? nr[i] : 0)); }
  const rev = F("revenue"), eg = yoyGrowth(eps), sg = yoyGrowth(rev);
  const m = { tang_truong_EPS_cac_quy: tail(eg, 6).map((x) => r(x, 3)), tang_truong_DT_cac_quy: tail(sg, 6).map((x) => r(x, 3)) };
  const gLast = eg[n - 1], sLast = sg[n - 1];
  const eg3 = tail(dropna(eg), 3), flags = {};
  flags["EPS_quy_gan_nhat_>=20pct"] = gLast >= cfg.epsGrowthMin;
  flags["EPS_2-3_quy_>=30pct"] = eg3.length >= 2 && tail(eg3, 2).every((x) => x >= cfg.epsGrowthGood);
  flags["EPS_2-3_quy_>=40pct_(thi_truong_tang)"] = eg3.length >= 2 && tail(eg3, 2).every((x) => x >= cfg.epsGrowthBull);
  flags["DT_quy_gan_nhat_>=15pct"] = sLast >= cfg.salesGrowthMin;
  const accE = consecAccel(eg), accS = consecAccel(sg);
  flags.EPS_tang_toc_so_quy = accE;
  flags.DT_tang_toc_so_quy = accS;
  flags.EPS_tang_toc_3_quy = accE >= cfg.accelQuarters;
  flags.DT_tang_toc = accS >= 2;

  // ---- Biên lợi nhuận ròng & Mật mã 33 [s.190–192] ----
  if (cols.net_income) {
    const ni = F("net_income"), npm = ni.map((x, i) => (rev[i] === 0 ? NaN : x / rev[i]));
    m.bien_LN_rong_cac_quy = tail(npm, 6).map((x) => r(x, 4));
    const upM = consecUp(npm);
    flags.bien_LN_tang_so_quy = upM;
    flags.MAT_MA_33 = accE >= 3 && accS >= 3 && upM >= 3;
    if (isNum(gLast) && isNum(sLast) && gLast > 0.25 && sLast < 0.05) flags.LN_tang_nho_cat_giam_chi_phi = true; // [s.173–174]
  }
  if (cols.gross_profit) {
    const gp = F("gross_profit"), gm = gp.map((x, i) => (rev[i] === 0 ? NaN : x / rev[i]));
    m.bien_gop_cac_quy = tail(gm, 6).map((x) => r(x, 4));
    flags.bien_gop_mo_rong = consecUp(gm) >= 2;
  }
  // ---- Xu hướng làm phẳng MA2 quý [s.162–163] ----
  flags.EPS_MA2_quy_di_len = consecUp(tail(rollMean(eps, 2), 8)) >= 3;
  flags.DT_MA2_quy_di_len = consecUp(tail(rollMean(rev, 2), 8)) >= 3;

  // ---- Giảm tốc – cảnh báo [s.167] ----
  const egv = dropna(eg);
  if (egv.length >= 3) {
    const recentPeak = egv.length >= 4 ? Math.max(...egv.slice(-4, -1)) : Math.max(...egv.slice(0, -1));
    if (recentPeak >= 0.4 && egv.at(-1) < recentPeak * (1 - cfg.decelDrop)) flags.GIAM_TOC_TANG_TRUONG = true;
  }
  // ---- Phục hồi từ khó khăn (turnaround) [s.165–166, s.131] ----
  const ttm = rollSum(eps, 4);
  if (egv.length >= 2 && n >= 12) {
    const baseGrowth = meanNan(Array.from(yoyGrowth(ttm)).slice(n - 12, n - 4));
    const recent = tail(egv, 2), priorPeak = maxNan(Array.from(ttm).slice(0, n - 4));
    flags.PHUC_HOI_TU_KHO_KHAN = recent.some((x) => x >= cfg.turnaroundGrowth) && (Number.isNaN(baseGrowth) || baseGrowth < 0.15) && ttm[n - 1] >= 0.9 * priorPeak;
  }
  // ---- Năm đột phá & tăng trưởng năm [s.163–164] ----
  if (n >= 8) {
    const years = new Map();
    q.date.forEach((d, i) => { const y = d.slice(0, 4), a = years.get(y) ?? { s: 0, c: 0, v: [] }; if (isNum(eps[i])) { a.v.push(eps[i]); a.c++; } years.set(y, a); });
    const ann = [...years].filter(([, a]) => a.c === 4).map(([, a]) => groupSum(a.v));
    if (ann.length >= 3) {
      const ag = []; for (let i = 1; i < ann.length; i++) { const v = ann[i] / Math.abs(ann[i - 1]) - 1; if (!Number.isNaN(v)) ag.push(v); }
      m.tang_truong_EPS_nam = tail(ag, 5).map((x) => r(x, 3));
      flags.EPS_nam_tang_toc = consecAccel(ag) >= 2;
      if (ag.length >= 3) {
        const prior = tail(ag.slice(0, -1), 4), last = ag.at(-1);
        flags.NAM_DOT_PHA = last > Math.max(Math.max(...prior), 0) && last >= cfg.breakoutYearMult * Math.max(npMean(prior), 0.05);
      }
    }
  }
  // ---- Bất ngờ lợi nhuận & hiệu ứng con gián [s.146–149] ----
  if (cols.eps_estimate) {
    const raw = F("eps"), est = F("eps_estimate"), sv = dropna(raw.map((x, i) => (x - est[i]) / Math.abs(est[i])));
    m.bat_ngo_LN_cac_quy = tail(sv, 4).map((x) => r(x, 3));
    flags.bat_ngo_duong_lien_tiep = countTail(sv.map((x) => x > 0));
    if (sv.length && sv.at(-1) < 0) flags.BAT_NGO_AM = true;
  }
  // ---- Điều chỉnh ước tính so với 30 ngày trước [s.151–152] ----
  const revFlags = [];
  for (const [now, ago] of [["est_cur_q_now", "est_cur_q_30d"], ["est_next_q_now", "est_next_q_30d"], ["est_fy_now", "est_fy_30d"]]) {
    if (cols[now] && cols[ago]) {
      const a = F(now)[n - 1], b = F(ago)[n - 1];
      if (isNum(a) && isNum(b)) { revFlags.push(a > b * (1 + cfg.estimateRevisionMin)); if (a < b) flags.UOC_TINH_BI_HA = true; }
    }
  }
  if (revFlags.length) flags.uoc_tinh_duoc_nang = revFlags.every(Boolean);
  // ---- Hàng tồn kho & phải thu so với doanh số [s.184–188] ----
  for (const [col, name] of [["inventory", "ton_kho"], ["receivables", "phai_thu"]]) {
    if (!cols[col]) continue;
    const gi = yoyGrowth(F(col))[n - 1];
    if (isNum(gi) && isNum(sLast)) {
      m[`tang_truong_${name}`] = pyRound(gi, 3);
      const base = Math.max(sLast, 0.01);
      if (gi > base * cfg.inventorySevereMult && gi > sLast + 0.1) flags[`${name.toUpperCase()}_TANG_GAP_DOI_DT`] = true;
      else if (gi > base * cfg.inventoryWarnMult + 0.05) flags[`${name}_tang_nhanh_hon_DT`] = true;
    }
  }
  // ---- Chấm điểm ----
  let sc = 0;
  sc += flags["EPS_quy_gan_nhat_>=20pct"] ? 20 : 0;
  sc += flags["EPS_2-3_quy_>=30pct"] ? 10 : 0;
  sc += flags["EPS_2-3_quy_>=40pct_(thi_truong_tang)"] ? 5 : 0;
  sc += flags["DT_quy_gan_nhat_>=15pct"] ? 10 : 0;
  sc += flags.EPS_tang_toc_3_quy ? 10 : accE >= 2 ? 5 : 0;
  sc += flags.DT_tang_toc ? 10 : 0;
  sc += flags.MAT_MA_33 ? 10 : (flags.bien_LN_tang_so_quy ?? 0) >= 2 ? 5 : 0;
  sc += flags.NAM_DOT_PHA || flags.EPS_nam_tang_toc ? 5 : 0;
  sc += flags.PHUC_HOI_TU_KHO_KHAN ? 5 : 0;
  sc += (flags.bat_ngo_duong_lien_tiep ?? 0) >= 2 ? 5 : 0;
  sc += flags.uoc_tinh_duoc_nang ? 5 : 0;
  sc += flags.EPS_MA2_quy_di_len ? 5 : 0;
  const warn = [];
  if (flags.GIAM_TOC_TANG_TRUONG) { sc -= 15; warn.push("Tăng trưởng EPS giảm tốc mạnh – tín hiệu cảnh báo [s.167]"); }
  if (flags.BAT_NGO_AM) { sc -= 10; warn.push("Bất ngờ âm quý gần nhất – hiệu ứng con gián [s.148]"); }
  if (flags.UOC_TINH_BI_HA) { sc -= 10; warn.push("Ước tính lợi nhuận bị hạ – dấu hiệu cảnh báo [s.152]"); }
  if (flags.LN_tang_nho_cat_giam_chi_phi) { sc -= 5; warn.push("LN tăng nhưng DT không tăng – nghi do cắt giảm chi phí [s.173]"); }
  for (const k of Object.keys(flags)) {
    if (k.endsWith("_TANG_GAP_DOI_DT")) { sc -= 10; warn.push(`${k}: tồn kho/phải thu tăng >= 2 lần DT [s.188]`); }
    else if (k.endsWith("_tang_nhanh_hon_DT")) { sc -= 5; warn.push(`${k} [s.186]`); }
  }
  const pos = ["MAT_MA_33", "NAM_DOT_PHA", "PHUC_HOI_TU_KHO_KHAN", "EPS_tang_toc_3_quy"].filter((k) => flags[k]);
  m.EPS_gan_nhat = gLast;
  m.DT_gan_nhat = sLast;
  return { score: Math.min(100, Math.max(0, sc)), passedMin: Boolean(flags["EPS_quy_gan_nhat_>=20pct"]), flags, metrics: m, warnings: warn, positives: pos };
}

/** Tổng nhóm của pandas (groupby.sum): Kahan. */
function groupSum(v) { let s = 0, c = 0; for (const x of v) { const y = x - c, t = s + y; c = t - s - y; s = t; } return s; }

/** P/E mở rộng 2–3 lần từ điểm mua thường trùng đỉnh [s.76–77]. */
export function peExpansion(priceNow, priceBuy, ttmEpsNow, ttmEpsBuy, cfg = FUND_DEFAULTS) {
  if (ttmEpsNow <= 0 || ttmEpsBuy <= 0) return { pe_mo_rong: NaN };
  const peNow = priceNow / ttmEpsNow, peBuy = priceBuy / ttmEpsBuy, ratio = peNow / peBuy;
  return { pe_luc_mua: peBuy, pe_hien_tai: peNow, pe_mo_rong: ratio, CANH_BAO_DINH_PE: ratio >= cfg.peExpansionWarn };
}

// ------------------------------------------------------------------ dữ liệu VN (VCI, kho market_fundamentals)

const DAY = 86_400_000;
const quarterEndIso = (y, qq) => new Date(Date.UTC(y, qq * 3, 0)).toISOString().slice(0, 10);

/**
 * BCTC VCI tại ngày `date` -> `q` của lõi. Chỉ quý đã công bố (hết quý + lagDays), xếp cũ -> mới, LIÊN TIẾP (quý thiếu = NaN,
 * để tăng trưởng cùng kỳ luôn so đúng quý năm trước). "eps" = LNST cổ đông công ty mẹ (xem đầu tệp).
 * Cột chỉ đưa vào khi có ≥ 5 quý có số (ngân hàng không có lợi nhuận gộp / tồn kho -> cột vắng, cờ không xét).
 */
export function vnQuarterly(fa, date, { lagDays = 45, maxQuarters = 20 } = {}) {
  const t = Date.parse(`${date}T00:00:00Z`);
  const avail = (rows) => (rows ?? []).filter((x) => Date.parse(`${quarterEndIso(x.year, x.quarter)}T00:00:00Z`) + lagDays * DAY <= t);
  const inc = avail(fa?.income?.quarters), bal = avail(fa?.balance?.quarters);
  if (!inc.length) return null;
  const key = (y, qq) => y * 4 + (qq - 1);
  const incBy = new Map(inc.map((x) => [key(x.year, x.quarter), x])), balBy = new Map(bal.map((x) => [key(x.year, x.quarter), x]));
  const hi = Math.max(...incBy.keys()), lo = Math.max(Math.min(...incBy.keys()), hi - maxQuarters + 1);
  const date_ = [], C = { eps: [], revenue: [], net_income: [], gross_profit: [], inventory: [], receivables: [] };
  const v = (x) => (x == null || !Number.isFinite(Number(x)) ? NaN : Number(x));
  for (let k = lo; k <= hi; k++) {
    const y = Math.floor(k / 4), qq = (k % 4) + 1, a = incBy.get(k), b = balBy.get(k);
    date_.push(quarterEndIso(y, qq));
    C.eps.push(v(a?.netProfit)); C.net_income.push(v(a?.netProfit)); C.revenue.push(v(a?.revenue)); C.gross_profit.push(v(a?.grossProfit));
    C.inventory.push(v(b?.inventory)); C.receivables.push(v(b?.receivables));
  }
  const cols = {};
  for (const [k, arr] of Object.entries(C)) if (arr.filter((x) => !Number.isNaN(x)).length >= 5) cols[k] = arr;
  return { date: date_, cols, latestQuarter: `Q${(hi % 4) + 1}/${Math.floor(hi / 4)}`, source: "VCI · LNST cổ đông công ty mẹ · quý đã công bố (hết quý + 45 ngày)" };
}


