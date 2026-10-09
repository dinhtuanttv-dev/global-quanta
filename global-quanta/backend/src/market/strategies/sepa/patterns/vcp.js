// SEPA — Mẫu hình thu hẹp độ biến động VCP [s.237–270] (chuyển 1:1 từ sepa_screener/patterns/vcp.py).
//   Nền trong GĐ2, 3–65 tuần [s.252]; 2–6 lần thu hẹp, thường 2–4 [s.238–239]; lần đầu 10–35% (> 60% là quá sâu
//   [s.250]); mỗi lần sau ~1/2 lần trước; tại pivot giá gần như đứng yên, KL dưới TB50, có 1–2 phiên KL cực thấp
//   [s.268]; không "nén thời gian" chữ V [s.251]; dấu chân "40W 31/3 4T" [s.242].
// Khác bản Python (có chủ ý): khi mọi nhịp chỉnh < 2% bị lọc hết, bản Python ném IndexError (mã bị bỏ qua);
// ở đây trả về "không nhận diện" với cùng lý do "Không tìm thấy nhịp điều chỉnh".

import { SEPA } from "../config.js";
import { argminOf, extractSwings, fmtFixed, fmtPct, maxOf, minOf, npMean, npPercentile, pyRound } from "../indicators.js";
import { countShakeouts, evaluateBreakout, findLeftPeak, heavyGapDowns, patternResult, spikeUps, volAvg, withRecentBreakout } from "./common.js";

function contractions(S, t, start, cfg) {
  const sw = extractSwings(S.H, S.L, start, t, cfg.swingDownMin, cfg.swingUpRetrace, cfg.swingUpMin), out = [];
  for (let k = 0; k + 1 < sw.length; k++) {
    const a = sw[k], b = sw[k + 1];
    if (a.kind === "H" && b.kind === "L") out.push({ dinh_idx: a.idx, dinh: a.price, day_idx: b.idx, day: b.price, do_sau: 1 - b.price / a.price, so_phien: b.idx - a.idx });
  }
  return mergeRallyPullbacks(out);
}

/**
 * Gộp các nhịp chỉnh nhỏ NẰM TRONG một nhịp hồi: (1) nếu sau nhịp i giá lập đỉnh cao hơn và nhịp i nông hơn nhịp i+1
 * thì nhịp i chỉ là nhiễu (nhịp đầu tiên luôn giữ); (2) đỉnh thấp hơn & đáy thấp hơn mà hồi < 50% hoặc nhịp sau sâu hơn
 * -> cùng một nhịp giảm, gộp.
 */
function mergeRallyPullbacks(input) {
  const cons = [...input];
  let changed = true;
  while (changed && cons.length >= 2) {
    changed = false;
    for (let i = 0; i < cons.length - 1; i++) {
      const a = cons[i], b = cons[i + 1];
      if (i >= 1 && b.dinh > a.dinh && a.do_sau < b.do_sau) { cons.splice(i, 1); changed = true; break; }
      const bounce = (b.dinh - a.day) / Math.max(a.dinh - a.day, 1e-9);
      if (b.dinh < a.dinh && b.day < a.day && (bounce < 0.5 || a.do_sau < b.do_sau)) {
        cons[i] = { dinh_idx: a.dinh_idx, dinh: a.dinh, day_idx: b.day_idx, day: b.day, do_sau: 1 - b.day / a.dinh, so_phien: b.day_idx - a.dinh_idx };
        cons.splice(i + 1, 1); changed = true; break;
      }
    }
  }
  return cons;
}

/** Dãy độ sâu giảm dần? -> { ok, viol, ratio } (cho phép 1 vi phạm khi > 3 lần thu hẹp). */
function isContracting(depths, tol) {
  let viol = 0; const ratios = [];
  for (let k = 0; k + 1 < depths.length; k++) {
    const p = depths[k], q = depths[k + 1];
    ratios.push(p > 0 ? q / p : 1);
    if (q > p * (1 + tol)) viol++;
  }
  const allowed = depths.length <= 3 ? 0 : 1;
  return { ok: viol <= allowed, viol, ratio: ratios.length ? npMean(ratios) : 1 };
}

export function detectVcp(S, t, { cfg = SEPA.vcp } = {}) {
  const res = patternResult("VCP"), n = t + 1;
  if (n < 40) { res.reasonsFailed.push("Không đủ dữ liệu"); return res; }
  const s = findLeftPeak(S, t, Math.trunc(cfg.maxBaseWeeks * 5));
  const weeks = (n - 1 - s) / 5;
  if (weeks < cfg.minBaseWeeks) { res.reasonsFailed.push(`Nền quá ngắn (${fmtFixed(weeks, 1)} tuần) / giá đang ở đỉnh mới`); return res; }
  let cons = contractions(S, t, s, cfg);
  if (!cons.length) { res.reasonsFailed.push("Không tìm thấy nhịp điều chỉnh"); return res; }
  cons = cons.filter((c) => c.do_sau >= 0.02); // giữ các lần thu hẹp có ý nghĩa (≥ 2%)
  if (!cons.length) { res.reasonsFailed.push("Không tìm thấy nhịp điều chỉnh"); return res; }
  const depths = cons.map((c) => c.do_sau);
  const leftHigh = S.H[s], lastPeak = cons[cons.length - 1].dinh_idx;
  const pivot = maxOf(S.H, lastPeak, n);
  // vùng pivot = phần chặt nhất bên phải
  const pa = Math.max(0, n - cfg.pivotWindow);
  const tightRange = maxOf(S.H, pa, n) / minOf(S.L, pa, n) - 1;
  const finalDepth = Math.min(depths[depths.length - 1], tightRange);
  const baseLow = minOf(S.L, s, n), depthMax = 1 - baseLow / leftHigh, T = cons.length;

  const ctr = isContracting(depths, cfg.contractionTolerance);
  const v50 = volAvg(S, t, cfg.volAvgWindow);
  const segVol = cons.map((c) => npMean(S.V, c.dinh_idx, c.day_idx + 1));
  const pivotVol = npMean(S.V, pa, n);
  let dryup = 0, pwMinVol = Infinity;
  for (let i = pa; i < n; i++) { if (S.V[i] < cfg.dryupRatio * v50) dryup++; if (S.V[i] < pwMinVol) pwMinVol = S.V[i]; }
  const lowestVolInPivot = pwMinVol <= npPercentile(S.V, s, n, 10);

  const shakeouts = countShakeouts(S, t, cons.slice(0, -1).map((c) => [c.day_idx, c.day]));
  const spikes = spikeUps(S, t, s + Math.floor((n - s) / 2));
  const gapdowns = heavyGapDowns(S, t, s);

  // nén thời gian / chữ V: hồi phục quá nhanh từ đáy sâu nhất
  const deepest = argminOf(S.L, s, n), declineBars = Math.max(1, deepest - s);
  let recov = -1; for (let i = deepest; i < n; i++) if (S.H[i] >= leftHigh * (1 - 0.05)) { recov = i - deepest; break; }
  const vShape = recov >= 0 && recov < cfg.vShapeRecoveryRatio * declineBars && T < 3;

  const det = {
    so_lan_thu_hep_T: T,
    cac_lan_thu_hep_pct: depths.map((d) => pyRound(d * 100, 1)),
    ty_le_thu_hep_TB: pyRound(ctr.ratio, 2),
    vi_pham_thu_hep: ctr.viol,
    do_sau_lon_nhat: pyRound(depthMax, 3),
    lan_cuoi_pct: pyRound(finalDepth * 100, 1),
    bien_do_vung_pivot_pct: pyRound(tightRange * 100, 1),
    KL_TB_tung_nhip: segVol.map((v) => pyRound(v)),
    KL_giam_dan: segVol.length >= 2 && segVol[segVol.length - 1] < segVol[0],
    KL_vung_pivot_x_TB50: v50 ? pyRound(pivotVol / v50, 2) : NaN,
    so_phien_KL_can_kiet: dryup,
    KL_thap_nhat_nen_o_pivot: lowestVolInPivot,
    ru_bo_undercut: shakeouts.length,
    ban_vot_KL_lon: spikes.length,
    gap_giam_KL_lon: gapdowns,
    chu_V_nen_thoi_gian: vShape,
    dinh_trai: leftHigh,
    pivot_duoi_dinh_trai_pct: pyRound(1 - pivot / leftHigh, 3),
    thu_hep_chi_tiet: cons.map((c) => ({ ngay_dinh: S.date[c.dinh_idx], dinh: pyRound(c.dinh, 4), ngay_day: S.date[c.day_idx], day: pyRound(c.day, 4) })),
  };
  res.details = det;
  res.baseStart = S.date[s]; res.baseEnd = S.date[t];
  res.baseWeeks = pyRound(weeks, 1); res.depth = depthMax; res.pivot = pivot;
  res.stopRef = minOf(S.L, lastPeak, n);
  res.footprint = `${pyRound(weeks)}W ${pyRound(depthMax * 100)}/${Math.max(1, pyRound(finalDepth * 100))} ${T}T`;

  // ---- luật bắt buộc ----
  const f = res.reasonsFailed;
  if (T < cfg.minContractions) f.push(`Chỉ ${T} lần thu hẹp (< ${cfg.minContractions})`);
  if (T > cfg.maxContractions) f.push(`Quá nhiều lần thu hẹp (${T})`);
  if (depthMax > cfg.firstDepthHardMax) f.push(`Điều chỉnh quá sâu ${fmtPct(depthMax)} (> 60%) [s.250]`);
  if (depths[0] < cfg.firstDepthMin && depthMax < cfg.firstDepthMin) f.push("Nền quá nông để là VCP (xem nền phẳng)");
  if (!ctr.ok) f.push(`Độ biến động không thu hẹp dần từ trái sang phải ${pyList(det.cac_lan_thu_hep_pct)}`);
  if (finalDepth > cfg.finalDepthMax) f.push(`Lần thu hẹp cuối còn rộng (${fmtPct(finalDepth)} > ${fmtPct(cfg.finalDepthMax)})`);
  if (1 - pivot / leftHigh > cfg.pivotMaxBelowHigh) f.push("Pivot nằm quá xa đỉnh trái – nền chưa hoàn thiện bên phải");
  if (vShape) f.push("Nén thời gian – hành động giá chữ V [s.251]");
  res.detected = f.length === 0;

  // ---- điểm chất lượng ----
  let sc = 40;
  sc += T >= 2 && T <= 4 ? 10 : 5;
  sc += 10 * Math.max(0, 1 - Math.abs(ctr.ratio - cfg.contractionRatioIdeal) / 0.5);
  sc += depthMax <= cfg.firstDepthMax ? 10 : 0;
  sc += pivotVol < cfg.pivotVolRatioMax * v50 ? 10 : 0;
  sc += dryup >= 1 ? 5 : 0;
  sc += det.KL_giam_dan ? 5 : 0;
  sc += shakeouts.length ? 5 : 0;
  sc += spikes.length ? 5 : 0;
  sc -= 5 * gapdowns;
  res.score = Math.min(100, Math.max(0, sc));
  if (!res.detected) return res;

  const bo = evaluateBreakout(S, t, pivot, t, res.stopRef, cfg.breakoutVolRatio, cfg.maxChasePct);
  res.status = bo.status; res.breakout = bo;
  if (pivotVol >= v50) res.notes.push("KL vùng pivot chưa cạn kiệt (>= TB50) [s.268]");
  if (shakeouts.length) res.notes.push(`${shakeouts.length} phiên rũ bỏ/undercut trong nền – tín hiệu tốt [s.254]`);
  if (spikes.length) res.notes.push(`${spikes.length} cú bắn vọt kèm KL lớn bên phải nền – dấu hiệu thu gom [s.257]`);
  return res;
}

/** repr(list[float]) của Python, ví dụ [26.1, 14.0, 7.3]. */
function pyList(a) { return `[${a.map((x) => (Number.isInteger(x) ? x.toFixed(1) : String(x))).join(", ")}]`; }

/** Nhận diện VCP, kể cả khi pivot vừa bị phá vỡ trong vài phiên gần nhất. */
export function scanVcp(S, t, cfg = SEPA.vcp) {
  return withRecentBreakout(detectVcp, S, t, cfg.breakoutLookback, { cfg, volRatioReq: cfg.breakoutVolRatio });
}
