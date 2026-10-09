// SEPA — các mô hình nền giá khác (chuyển 1:1 từ sepa_screener/patterns/bases.py), point-in-time tại t:
//   Nền phẳng 4–7 tuần, biên độ 10–15% [s.239, s.271]; Cốc–tay cầm, tay cầm ở 1/3 trên [s.286–289];
//   3-C (Cup Completion Cheat) và low cheat [s.289–293]; Tấn công tổng lực / cờ cao thắt chặt [s.299–302];
//   Nền giá đầu tiên sau niêm yết [s.305–310].

import { SEPA } from "../config.js";
import { argmaxOf, argminOf, fmtFixed, fmtPct, maxOf, minOf, npMean, pyRound, smaC } from "../indicators.js";
import { evaluateBreakout, findLeftPeak, patternResult, volAvg, withRecentBreakout } from "./common.js";

const clip = (x, a, b) => Math.min(b, Math.max(a, x));

// ------------------------------------------------------------------ NỀN PHẲNG

/** np.arange(start, stop, step) — numpy điền start + i·(phần tử thứ 2 − start). */
function npArange(start, stop, step) {
  const len = Math.max(0, Math.ceil((stop - start) / step));
  const v1 = start + step, delta = v1 - start, out = [];
  for (let i = 0; i < len; i++) out.push(i === 0 ? start : i === 1 ? v1 : start + i * delta);
  return out;
}

export function detectFlatBase(S, t, { cfg = SEPA.flat } = {}) {
  const res = patternResult("Nền phẳng"), n = t + 1;
  let best = null;
  for (const wks of npArange(cfg.maxWeeks, cfg.minWeeks - 0.01, -0.2)) {
    const L = Math.trunc(pyRound(wks * 5));
    if (L + 20 > n) continue;
    const hi = maxOf(S.H, n - L, n), lo = minOf(S.L, n - L, n), depth = 1 - lo / hi;
    if (depth <= cfg.maxDepth) { best = { L, hi, lo, depth }; break; }
  }
  if (!best) { res.reasonsFailed.push("Không có vùng đi ngang 4–7 tuần với biên độ <= 15%"); return res; }
  const { L, hi, lo, depth } = best, start = n - L;
  const pa = Math.max(0, start - 60);
  const priorGain = start > pa ? hi / minOf(S.C, pa, start) - 1 : 0;
  res.baseStart = S.date[start]; res.baseEnd = S.date[t];
  res.baseWeeks = pyRound(L / 5, 1); res.depth = depth; res.pivot = hi; res.stopRef = lo;
  res.footprint = `${pyRound(L / 5)}W ${pyRound(depth * 100)}% phẳng`;
  res.details = { tang_truoc_nen: pyRound(priorGain, 3), KL_nen_x_TB50: pyRound(npMean(S.V, n - L, n) / volAvg(S, t, 50, start), 2) };
  if (priorGain < 0.2) res.reasonsFailed.push("Không có đợt tăng trước nền (>=20%)");
  res.detected = res.reasonsFailed.length === 0;
  res.score = clip(60 + (cfg.maxDepth - depth) * 200, 0, 100);
  if (res.detected) { res.breakout = evaluateBreakout(S, t, hi, t, lo); res.status = res.breakout.status; }
  return res;
}

// ------------------------------------------------------------------ CHIẾC CỐC – TAY CẦM

export function detectCupHandle(S, t, { cfg = SEPA.cup } = {}) {
  const res = patternResult("Cốc–tay cầm"), n = t + 1;
  const s = findLeftPeak(S, t, Math.trunc(cfg.maxWeeks * 5)), weeks = (n - 1 - s) / 5;
  if (weeks < cfg.minWeeks) { res.reasonsFailed.push(`Nền quá ngắn (${fmtFixed(weeks, 1)} tuần)`); return res; }
  const left = S.H[s], cl = argminOf(S.L, s, n), cupLow = S.L[cl], depth = 1 - cupLow / left;
  if (cl >= n - 3) { res.reasonsFailed.push("Đáy cốc đang hình thành"); return res; }
  const rimI = argmaxOf(S.H, cl, n), rim = S.H[rimI];
  const handleDays = n - (rimI + 1);
  const handleLow = handleDays ? minOf(S.L, rimI + 1, n) : rim;
  const handleDepth = handleDays ? 1 - handleLow / rim : 0;
  const height = left - cupLow, upperThird = cupLow + cfg.handleUpperThird * height;
  const recovery = height > 0 ? (rim - cupLow) / height : 0;
  const v50 = volAvg(S, t, 50, rimI);
  const handleVol = handleDays ? npMean(S.V, rimI + 1, n) : NaN;
  const declineBars = cl - s, riseBars = rimI - cl;
  res.details = {
    do_sau_coc: pyRound(depth, 3), dinh_trai: left, day_coc: cupLow, vanh_phai: rim,
    vanh_phai_hoi_phuc_pct_chieu_cao: pyRound(recovery, 2),
    so_phien_tay_cam: handleDays, do_sau_tay_cam: pyRound(handleDepth, 3),
    tay_cam_o_1_3_tren: handleLow >= upperThird,
    KL_tay_cam_x_TB50: v50 && handleDays ? pyRound(handleVol / v50, 2) : NaN,
    so_phien_giam: declineBars, so_phien_hoi: riseBars,
  };
  res.baseStart = S.date[s]; res.baseEnd = S.date[t];
  res.baseWeeks = pyRound(weeks, 1); res.depth = depth; res.pivot = rim; res.stopRef = handleLow;
  res.footprint = `${pyRound(weeks)}W cốc ${pyRound(depth * 100)}% / tay cầm ${pyRound(handleDepth * 100)}%`;
  const f = res.reasonsFailed;
  if (!(cfg.minDepth <= depth && depth <= cfg.hardMaxDepth)) f.push(`Độ sâu cốc ${fmtPct(depth)} ngoài khoảng ${fmtPct(cfg.minDepth)}–${fmtPct(cfg.hardMaxDepth)}`);
  if (recovery < cfg.rightSideRecovery) f.push("Vành phải chưa hồi phục đủ (tay cầm chưa hình thành ở 1/3 trên)");
  if (handleDays < cfg.handleMinDays) f.push(`Tay cầm mới ${handleDays} phiên (< ${cfg.handleMinDays})`);
  if (handleDays && handleLow < upperThird) f.push("Tay cầm rơi xuống dưới 1/3 trên của cốc (xem 3-C) [s.289]");
  if (handleDepth > cfg.handleMaxDepth) f.push(`Tay cầm quá sâu (${fmtPct(handleDepth)})`);
  if (riseBars < 0.35 * declineBars) f.push("Vành phải dựng đứng – chữ V");
  res.detected = f.length === 0;
  let sc = 50 + (depth <= cfg.maxDepth ? 20 : 5);
  sc += handleDays && handleVol < v50 ? 15 : 0;
  sc += handleDepth <= 0.5 * depth ? 15 : 0;
  res.score = Math.min(sc, 100);
  if (res.detected) {
    res.breakout = evaluateBreakout(S, t, rim, t, handleLow); res.status = res.breakout.status;
    if (handleDays && handleVol >= v50) res.notes.push("KL tay cầm chưa cạn kiệt");
  }
  return res;
}

// ------------------------------------------------------------------ 3-C / LOW CHEAT

/**
 * Bốn pha [s.291–292]: A) chân giảm  B) hồi phục 1/3–1/2  C) tạm ngưng 5–10% (vùng cheat, tốt nhất có cú "drift"
 * thủng đáy cũ rồi bật lên)  D) vượt đỉnh vùng tạm ngưng = điểm mua. Cheat ở 1/3 giữa = 3-C; 1/3 dưới = low cheat.
 */
export function detectThreeC(S, t, { cfg = SEPA.threeC } = {}) {
  const res = patternResult("3-C"), n = t + 1;
  const s = findLeftPeak(S, t, Math.trunc(cfg.maxWeeks * 5)), weeks = (n - 1 - s) / 5;
  if (weeks < cfg.minWeeks) { res.reasonsFailed.push("Nền quá ngắn"); return res; }
  const H = S.H, L = S.L, C = S.C;
  const left = H[s], cl = argminOf(L, s, n), cupLow = L[cl], depth = 1 - cupLow / left;
  // vùng tạm ngưng: dài nhất tính từ cuối, biên độ ≤ pauseMaxRange
  let kBest = 0;
  for (let k = cfg.pauseMinDays; k <= cfg.pauseMaxDays; k++) {
    if (k >= n - s) break;
    if (maxOf(H, n - k, n) / minOf(L, n - k, n) - 1 <= cfg.pauseMaxRange) kBest = k;
  }
  if (!kBest) { res.reasonsFailed.push("Không có vùng tạm ngưng chặt (5%–10%)"); return res; }
  const pHi = maxOf(H, n - kBest, n), pLo = minOf(L, n - kBest, n), pauseStart = n - kBest;
  const height = left - cupLow, pos = height > 0 ? (pHi - cupLow) / height : 1;
  const rallyBeforePause = cl < pauseStart;
  const pa = Math.max(0, s - cfg.priorAdvanceLookbackDays);
  const priorAdv = left / minOf(L, pa, s + 1) - 1; // tăng giá trước đó trong 3–36 tháng
  const ma200 = smaC(S, 200)[t], above200 = !Number.isNaN(ma200) && C[t] > ma200;
  const v50 = volAvg(S, t, 50, pauseStart), pauseVol = npMean(S.V, n - kBest, n);
  const ba = Math.max(cl, pauseStart - 15);
  const beforeMin = pauseStart > ba ? minOf(L, ba, pauseStart) : NaN;
  const drift = pauseStart > ba && pLo < beforeMin && C[t] > beforeMin;
  const kind = pos < 1 / 3 ? "Low cheat (cheat ở đáy)" : pos <= 2 / 3 ? "3-C" : "vùng tay cầm";
  res.name = kind === "3-C" ? "3-C" : pos < 1 / 3 ? "Low cheat" : "3-C";
  res.details = {
    loai: kind, vi_tri_vung_cheat_trong_coc: pyRound(pos, 2), do_sau_coc: pyRound(depth, 3),
    so_phien_tam_ngung: kBest, bien_do_tam_ngung: pyRound(pHi / pLo - 1, 3),
    tang_truoc_do: pyRound(priorAdv, 3), tren_MA200: above200,
    KL_tam_ngung_x_TB50: v50 ? pyRound(pauseVol / v50, 2) : NaN, drift_thung_day_cu: drift,
  };
  res.baseStart = S.date[s]; res.baseEnd = S.date[t];
  res.baseWeeks = pyRound(weeks, 1); res.depth = depth; res.pivot = pHi; res.stopRef = pLo;
  res.footprint = `${pyRound(weeks)}W ${pyRound(depth * 100)}% cheat@${fmtPct(pos)}`;
  const f = res.reasonsFailed;
  if (pos > 2 / 3) f.push("Vùng tạm ngưng ở 1/3 trên – đó là tay cầm, không phải cheat");
  if (!rallyBeforePause) f.push("Chưa có nhịp hồi (pha B) trước vùng tạm ngưng");
  if (!(cfg.minDepth <= depth && depth <= cfg.hardMaxDepth)) f.push(`Độ sâu cốc ${fmtPct(depth)} ngoài 15%–60% [s.290]`);
  if (priorAdv < cfg.priorAdvanceMin) f.push(`Đợt tăng trước đó chỉ ${fmtPct(priorAdv)} (< 25%) [s.290]`);
  if (cfg.aboveMa200 && !above200) res.notes.push("Giá dưới MA200 – sách khuyến nghị 3-C nên trên MA200");
  res.detected = f.length === 0;
  let sc = 50 + (depth <= cfg.maxDepth ? 15 : 0) + (pauseVol < v50 ? 15 : 0);
  sc += drift ? 10 : 0;
  sc += above200 ? 10 : 0;
  res.score = Math.min(sc, 100);
  if (res.detected) {
    res.breakout = evaluateBreakout(S, t, pHi, t, pLo); res.status = res.breakout.status;
    if (drift) res.notes.push("Vùng cheat có cú drift thủng đáy cũ rồi bật lên – rũ bỏ [s.292]");
  }
  return res;
}

// ------------------------------------------------------------------ TẤN CÔNG TỔNG LỰC (POWER PLAY / HIGH TIGHT FLAG)

export function detectPowerPlay(S, t, { cfg = SEPA.power } = {}) {
  const res = patternResult("Tấn công tổng lực (cờ cao)"), n = t + 1;
  if (n < cfg.thrustMaxDays + cfg.flagMinDays + 50) { res.reasonsFailed.push("Không đủ dữ liệu"); return res; }
  const H = S.H, L = S.L, V = S.V;
  const lo = n - 1 - cfg.flagMaxDays, hi = n - 1 - cfg.flagMinDays;
  let peak = argmaxOf(H, lo, hi + 1);
  if (maxOf(H, peak + 1, n) > H[peak]) peak = argmaxOf(H, peak + 1, n);
  const flagDays = n - 1 - peak;
  const t0 = Math.max(0, peak - cfg.thrustMaxDays), tLow = argminOf(L, t0, peak + 1);
  const gain = H[peak] / L[tLow] - 1;
  const pa = Math.max(0, tLow - 50);
  const preMean = tLow > pa ? npMean(V, pa, tLow) : NaN, thrustMean = npMean(V, tLow, peak + 1);
  const volRatio = tLow > pa && preMean > 0 ? thrustMean / preMean : NaN;
  const fl = n - (peak + 1);
  const flagLow = fl ? minOf(L, peak + 1, n) : H[peak], flagDepth = 1 - flagLow / H[peak];
  const half = Math.max(1, Math.floor(fl / 2)), fa = peak + 1;
  const r1 = fl >= 4 ? maxOf(H, fa, fa + half) / minOf(L, fa, fa + half) - 1 : NaN;
  const r2 = fl >= 4 ? maxOf(H, fa + half, n) / minOf(L, fa + half, n) - 1 : NaN;
  const last5 = npMean(V, n - 5, n);
  res.details = {
    tang_trong_pha_dam: pyRound(gain, 3), so_phien_pha_dam: peak - tLow,
    KL_pha_dam_x_truoc: pyRound(volRatio, 2), so_phien_co: flagDays, do_sau_co: pyRound(flagDepth, 3),
    co_that_chat_dan: !Number.isNaN(r1) && r2 < r1,
    KL_5_phien_x_pha_dam: thrustMean ? pyRound(last5 / thrustMean, 2) : NaN,
  };
  res.baseStart = S.date[peak]; res.baseEnd = S.date[t];
  res.baseWeeks = pyRound(flagDays / 5, 1); res.depth = flagDepth; res.pivot = H[peak]; res.stopRef = flagLow;
  res.footprint = `+${fmtPct(gain)}/${peak - tLow}p, cờ ${flagDays}p ${fmtPct(flagDepth)}`;
  const f = res.reasonsFailed;
  if (gain < cfg.thrustMinGain) f.push(`Pha đâm chỉ +${fmtPct(gain)} (< +100% trong 8 tuần)`);
  if (!Number.isNaN(volRatio) && volRatio < cfg.thrustVolRatio) f.push("Pha đâm không kèm KL lớn");
  if (flagDepth > cfg.flagMaxDepth) f.push(`Cờ điều chỉnh ${fmtPct(flagDepth)} (> 25%)`);
  if (!(cfg.flagMinDays <= flagDays && flagDays <= cfg.flagMaxDays)) f.push(`Thời gian cờ ${flagDays} phiên ngoài 10–30`);
  if (res.details.co_that_chat_dan === false) f.push("Cờ không có đặc tính VCP (không thắt chặt dần) – bắt buộc [s.301]");
  res.detected = f.length === 0;
  res.score = clip(60 + 20 * (gain - 1) + (last5 < thrustMean * 0.6 ? 10 : 0) + (flagDepth < 0.15 ? 10 : 0), 0, 100);
  if (res.detected) { res.breakout = evaluateBreakout(S, t, res.pivot, t, flagLow); res.status = res.breakout.status; }
  return res;
}

// ------------------------------------------------------------------ NỀN GIÁ ĐẦU TIÊN (PRIMARY BASE)

/** listingDate: "YYYY-MM-DD" hoặc null (null + < 252 phiên => coi phiên đầu tiên là ngày niêm yết). */
export function detectPrimaryBase(S, t, { cfg = SEPA.primary, listingDate = null } = {}) {
  const res = patternResult("Nền giá đầu tiên (mới niêm yết)"), n = t + 1;
  if (listingDate == null && n >= 252) { res.reasonsFailed.push("Không có ngày niêm yết và đã có > 1 năm dữ liệu"); return res; }
  const first = listingDate ?? S.date[0];
  let fi = 0; while (fi < n && S.date[fi] < first) fi++;
  const age = n - fi;
  if (age > cfg.maxListingDays) { res.reasonsFailed.push("Niêm yết đã lâu (> ~2 năm)"); return res; }
  if (age < cfg.minBaseDays + 10) { res.reasonsFailed.push("Chưa đủ lịch sử giao dịch để có nền giá đầu tiên [s.309]"); return res; }
  const ath = argmaxOf(S.H, fi, n), athV = S.H[ath];
  const baseDays = n - 1 - ath, depth = 1 - minOf(S.L, ath, n) / athV, runUp = athV / S.C[fi] - 1;
  res.details = { so_phien_tu_niem_yet: age, tang_tu_niem_yet_den_dinh: pyRound(runUp, 3), so_phien_nen: baseDays, do_sau: pyRound(depth, 3) };
  res.baseStart = S.date[ath]; res.baseEnd = S.date[t];
  res.baseWeeks = pyRound(baseDays / 5, 1); res.depth = depth; res.pivot = athV;
  res.stopRef = minOf(S.L, Math.max(fi, n - 10), n);
  res.footprint = `${pyRound(baseDays / 5)}W ${pyRound(depth * 100)}% (nền đầu tiên)`;
  const f = res.reasonsFailed;
  if (baseDays < cfg.minBaseDays) f.push("Nền đầu tiên < 3 tuần");
  const lim = baseDays <= 20 ? cfg.maxDepth3w : cfg.maxDepth;
  if (depth > lim) f.push(`Điều chỉnh ${fmtPct(depth)} quá sâu cho nền đầu tiên (>${fmtPct(lim)})`);
  if (runUp < 0.15) f.push("Chưa có xu hướng tăng rõ sau niêm yết");
  res.detected = f.length === 0;
  res.score = clip(70 + (lim - depth) * 100, 0, 100);
  if (res.detected) { res.breakout = evaluateBreakout(S, t, athV, t, res.stopRef); res.status = res.breakout.status; }
  return res;
}

/** Năm mô hình nền (kèm nhận diện phá vỡ gần đây) theo thứ tự của bản Python. */
export function scanAllBases(S, t, { cfg = SEPA, listingDate = null } = {}) {
  const lb = cfg.vcp.breakoutLookback;
  return [
    withRecentBreakout(detectFlatBase, S, t, lb, { cfg: cfg.flat }),
    withRecentBreakout(detectCupHandle, S, t, lb, { cfg: cfg.cup }),
    withRecentBreakout(detectThreeC, S, t, lb, { cfg: cfg.threeC }),
    withRecentBreakout(detectPowerPlay, S, t, lb, { cfg: cfg.power }),
    withRecentBreakout(detectPrimaryBase, S, t, lb, { cfg: cfg.primary, listingDate }),
  ];
}
