// IFE — Intent Footprint Engine (hàm thuần, không gọi mạng).
//
// Ý tưởng: dòng tiền lớn có thể giấu KHỐI LƯỢNG nhưng khó giấu cùng lúc (1) chiều chủ
// động, (2) tác động giá họ gây ra và (3) nhịp chia lệnh. IFE đo các mâu thuẫn
// "nỗ lực – kết quả – tác động" so với CHÍNH lịch sử của từng mã.
//
// Lớp 1  Dòng lệnh có dấu: Lee–Ready trên tick (phiên hiện tại, khi mã đang được theo
//        dõi) hoặc Bulk Volume Classification trên nến phút: buy% = Φ(Δp / σ).
// Lớp 2  Nỗ lực (delta chuẩn hoá) – Kết quả (biến động giá chuẩn hoá) – Tác động (λ Kyle):
//        hấp thụ, đẩy giá, cạn kiệt, thủng thanh khoản (z-score vững: trung vị/MAD theo khung).
// Lớp 3  Chữ ký thực thi: bền bỉ (tự tương quan delta), Hurst R/S, độ ổn định tỷ lệ tham gia,
//        lặp kích thước lệnh (chỉ khi có tick), cụm khớp dồn tại một mức giá.
// Lớp 4  Stealth Score 1/5/20 phiên (gom/xả âm thầm: dòng lệnh lớn bền bỉ + ít tác động giá)
//        và phân kỳ "tay to – tay nhỏ" (nến phút KL ≥ p95 vs phần còn lại — XẤP XỈ, vì
//        không có danh tính tài khoản).
// Lớp 5  HMM diễn giải được: 5 trạng thái ý đồ với nguyên mẫu cố định (không khớp tham số
//        trên dữ liệu -> không rò rỉ), lọc tiến (forward) theo khung và theo phiên.
// Đây là SUY LUẬN XÁC SUẤT từ dấu vết giao dịch, không phải "nhìn thấy" ý đồ.

import { BUCKETS, BUCKET_COUNT, bucketIndexOfMinute, minuteOf } from "./intradayModel.js";

const ATO_END = 9 * 60 + 16;
const ATC_START = 14 * 60 + 30;
const isContinuous = (minute) => minute !== null && minute >= ATO_END && minute < ATC_START;

// ---------- Tiện ích thống kê ----------

/** Φ(x) — hàm phân phối chuẩn tích luỹ (xấp xỉ Abramowitz–Stegun 7.1.26). */
export function normCdf(x) {
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2);
  return x >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}
/** Φ⁻¹(p) — nghịch đảo phân phối chuẩn (xấp xỉ Acklam), dùng cho z theo thứ hạng. */
export function normInv(p) {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const q = Math.min(Math.max(p, 1e-9), 1 - 1e-9);
  if (q < 0.02425) { const t = Math.sqrt(-2 * Math.log(q)); return (((((c[0] * t + c[1]) * t + c[2]) * t + c[3]) * t + c[4]) * t + c[5]) / ((((d[0] * t + d[1]) * t + d[2]) * t + d[3]) * t + 1); }
  if (q > 1 - 0.02425) { const t = Math.sqrt(-2 * Math.log(1 - q)); return -(((((c[0] * t + c[1]) * t + c[2]) * t + c[3]) * t + c[4]) * t + c[5]) / ((((d[0] * t + d[1]) * t + d[2]) * t + d[3]) * t + 1); }
  const t = q - 0.5, r = t * t;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * t / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/**
 * z theo THỨ HẠNG: phân vị của v trong lịch sử -> Φ⁻¹. Vững với phân phối dồn nhiều điểm
 * về 0 (khi đó MAD ≈ 0 làm z thường bị phóng đại — lỗi đã bắt được bằng test).
 */
export function rankZ(v, history) {
  if (!history.length) return 0;
  const below = history.filter((h) => h < v).length, equal = history.filter((h) => h === v).length;
  return normInv((below + 0.5 * equal + 0.5) / (history.length + 1));
}

const sum = (a) => a.reduce((s, v) => s + v, 0);
const mean = (a) => (a.length ? sum(a) / a.length : 0);
const median = (a) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const mad = (a, med = median(a)) => median(a.map((v) => Math.abs(v - med))) * 1.4826;
const quantile = (a, q) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  return s[lo] + (s[Math.ceil(pos)] - s[lo]) * (pos - lo);
};
const robustZ = (v, med, scale) => (scale > 0 ? (v - med) / scale : 0);
const round = (v, d = 2) => (v === null || v === undefined || !Number.isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);
export function autocorr(a, lag = 1) {
  if (a.length <= lag + 2) return null;
  const m = mean(a);
  let num = 0, den = 0;
  for (let i = 0; i < a.length; i++) {
    den += (a[i] - m) ** 2;
    if (i >= lag) num += (a[i] - m) * (a[i - lag] - m);
  }
  return den ? num / den : null;
}

/** Hurst theo R/S (thô) trên chuỗi; > 0,5 = bền bỉ, < 0,5 = đảo chiều. Cần ≥ 32 điểm. */
export function hurstRS(series) {
  if (series.length < 32) return null;
  const pts = [];
  for (const n of [8, 16, 32, 64].filter((k) => k <= series.length)) {
    const rs = [];
    for (let start = 0; start + n <= series.length; start += n) {
      const w = series.slice(start, start + n);
      const m = mean(w);
      let cum = 0, mn = 0, mx = 0;
      for (const v of w) { cum += v - m; mn = Math.min(mn, cum); mx = Math.max(mx, cum); }
      const sd = Math.sqrt(mean(w.map((v) => (v - m) ** 2)));
      if (sd > 0) rs.push((mx - mn) / sd);
    }
    if (rs.length) pts.push([Math.log(n), Math.log(mean(rs))]);
  }
  if (pts.length < 2) return null;
  const mx = mean(pts.map((p) => p[0])), my = mean(pts.map((p) => p[1]));
  const slope = sum(pts.map((p) => (p[0] - mx) * (p[1] - my))) / sum(pts.map((p) => (p[0] - mx) ** 2));
  return Math.max(0, Math.min(1, slope));
}

// ---------- Lớp 1: dòng lệnh có dấu theo phút ----------

/** BVC trên nến phút liên tục: delta = KL × (2Φ(Δp/σ) − 1). ATO/ATC tách riêng (khớp định kỳ). */
export function bvcMinutes(bars, refPrice) {
  const cont = bars.filter((b) => isContinuous(minuteOf(b.date)));
  const diffs = [];
  let prev = null;
  for (const b of cont) {
    if (prev !== null) diffs.push(b.close - prev);
    prev = b.close;
  }
  const nz = diffs.filter((d) => d !== 0).map(Math.abs);
  const sigma = (nz.length ? Math.sqrt(mean(nz.map((d) => d * d))) : 0) || (refPrice || 1) * 0.001;
  const out = [];
  prev = bars.find((b) => minuteOf(b.date) !== null && minuteOf(b.date) < ATO_END)?.close ?? refPrice ?? cont[0]?.open;
  for (const b of cont) {
    const dp = b.close - (prev ?? b.open);
    const buyFrac = normCdf(dp / sigma);
    out.push({ minute: minuteOf(b.date), volume: b.volume || 0, delta: (b.volume || 0) * (2 * buyFrac - 1), close: b.close, high: b.high, low: b.low });
    prev = b.close;
  }
  return out;
}

/** Lee–Ready (từ StreamHub) -> cùng định dạng phút, ghép giá từ nến phút nếu có. */
export function leeReadyMinutes(tickFlow, bars) {
  const byMinute = new Map(bars.map((b) => [minuteOf(b.date), b]));
  return tickFlow.minutes
    .filter((m) => isContinuous(m.minute))
    .map((m) => {
      const b = byMinute.get(m.minute);
      const volume = m.buy + m.sell + m.unknown;
      return { minute: m.minute, volume, delta: m.buy - m.sell, close: b?.close ?? null, high: b?.high ?? null, low: b?.low ?? null, prints: m.prints, sizes: m.sizes };
    });
}

/** Cờ "tay to": nến phút có KL ≥ ngưỡng (p95 KL phút liên tục của lịch sử). */
function splitLargeSmall(minutes, threshold) {
  let large = 0, small = 0, largeVol = 0;
  for (const m of minutes) {
    if (m.volume >= threshold) { large += m.delta; largeVol += m.volume; } else small += m.delta;
  }
  return { largeDelta: large, smallDelta: small, largeVolume: largeVol };
}

// ---------- Lớp 2: tổng hợp theo khung + chuẩn hoá ----------

/** Tổng hợp một phiên thành 17 khung: KL, delta, delta tay to, lợi suất khung. */
export function sessionFootprint(session, minutes, largeThreshold) {
  const buckets = BUCKETS.map(() => ({ volume: 0, delta: 0, largeDelta: 0, close: null }));
  for (const m of minutes) {
    const i = bucketIndexOfMinute(m.minute);
    if (i < 0) continue;
    const b = buckets[i];
    b.volume += m.volume;
    b.delta += m.delta;
    if (m.volume >= largeThreshold) b.largeDelta += m.delta;
    if (m.close !== null) b.close = m.close;
  }
  // Giá đóng khung lấy từ nến phút (kể cả ATO/ATC) để tính lợi suất khung.
  for (let i = 0; i < BUCKET_COUNT; i++) {
    const src = session.buckets?.[i];
    if (src) { buckets[i].close = src.close; if (!buckets[i].volume) buckets[i].volume = i === 0 || i === BUCKET_COUNT - 1 ? src.volume : buckets[i].volume; }
  }
  let prevClose = session.refPrice;
  for (const b of buckets) {
    b.ret = b.close && prevClose ? b.close / prevClose - 1 : 0;
    if (b.close) prevClose = b.close;
  }
  const ls = splitLargeSmall(minutes, largeThreshold);
  const contVol = sum(minutes.map((m) => m.volume));
  const lastClose = [...buckets].reverse().find((b) => b.close)?.close ?? null;
  return {
    date: session.date,
    buckets,
    volume: sum(buckets.map((b) => b.volume)),
    continuousVolume: contVol,
    delta: sum(minutes.map((m) => m.delta)),
    ...ls,
    ret: lastClose && session.refPrice ? lastClose / session.refPrice - 1 : 0,
    minutes,
  };
}

/** Thang chuẩn hoá theo khung từ lịch sử: trung vị KL, trung vị/MAD của nỗ lực & kết quả. */
export function bucketScales(footprints) {
  return BUCKETS.map((_, i) => {
    const vols = footprints.map((f) => f.buckets[i].volume).filter((v) => v > 0);
    const medVol = median(vols) || 1;
    const effort = footprints.map((f) => f.buckets[i].delta / medVol);
    const absRet = footprints.map((f) => Math.abs(f.buckets[i].ret)).filter((v) => v > 0);
    const retScale = median(absRet) || 1e-4;
    const result = footprints.map((f) => f.buckets[i].ret / retScale);
    const large = footprints.map((f) => f.buckets[i].largeDelta / medVol);
    const eMed = median(effort), rMed = median(result), lMed = median(large);
    return {
      medVol, retScale,
      effort: { med: eMed, scale: mad(effort, eMed) || 1 },
      result: { med: rMed, scale: mad(result, rMed) || 1 },
      large: { med: lMed, scale: mad(large, lMed) || 1 },
    };
  });
}

/** λ Kyle: hồi quy qua gốc ret = λ · (delta / KL trung vị khung), trên các khung liên tục. */
export function estimateLambda(footprints, scales) {
  let sxy = 0, sxx = 0;
  for (const f of footprints) {
    for (let i = 1; i < BUCKET_COUNT - 1; i++) {
      const x = f.buckets[i].delta / scales[i].medVol;
      sxy += x * f.buckets[i].ret;
      sxx += x * x;
    }
  }
  return sxx ? sxy / sxx : null;
}

export const FLAG_LABELS = {
  absorbSelling: "Hấp thụ lực bán (bên mua thụ động đỡ giá)",
  absorbBuying: "Hấp thụ lực mua (bên bán thụ động chặn giá)",
  initiativeBuy: "Mua chủ động đẩy giá",
  initiativeSell: "Bán chủ động đạp giá",
  dryUp: "Cạn kiệt (KL thấp, giá đứng)",
  liquidityHole: "Thủng thanh khoản (giá chạy trên ít lệnh)",
};

/** Gắn cờ cho một khung từ z nỗ lực (zE), z kết quả (zR), RVOL khung. Ngưỡng công khai. */
export function bucketFlags(zE, zR, rvol) {
  const flags = [];
  if (zE <= -1.5 && zR >= -0.25) flags.push("absorbSelling");
  if (zE >= 1.5 && zR <= 0.25) flags.push("absorbBuying");
  if (zE >= 1.5 && zR >= 1) flags.push("initiativeBuy");
  if (zE <= -1.5 && zR <= -1) flags.push("initiativeSell");
  if (rvol !== null && rvol <= 0.5 && Math.abs(zR) < 0.5) flags.push("dryUp");
  if (Math.abs(zR) >= 2 && Math.abs(zE) < 0.5) flags.push("liquidityHole");
  return flags;
}

export function scoreBuckets(fp, scales) {
  return fp.buckets.map((b, i) => {
    if (!b.volume) return null;
    const s = scales[i];
    const zE = robustZ(b.delta / s.medVol, s.effort.med, s.effort.scale);
    const zR = robustZ(b.ret / s.retScale, s.result.med, s.result.scale);
    const zL = robustZ(b.largeDelta / s.medVol, s.large.med, s.large.scale);
    const rvol = s.medVol ? b.volume / s.medVol : null;
    const auction = i === 0 || i === BUCKET_COUNT - 1;
    return {
      bucket: i, label: BUCKETS[i].label, volume: b.volume, delta: auction ? null : b.delta,
      deltaPct: !auction && b.volume ? b.delta / b.volume : null, ret: b.ret,
      zEffort: auction ? null : zE, zResult: zR, zLarge: auction ? null : zL, rvol,
      flags: auction ? [] : bucketFlags(zE, zR, rvol),
    };
  });
}

// ---------- Lớp 3: chữ ký thực thi ----------

/** Cụm khớp dồn tại một mức giá: nến phút H = L với KL ≥ 5× trung vị (gợi ý lệnh ẩn/tảng băng). */
export function samePriceClusters(minutes, medMinuteVol) {
  return minutes
    .filter((m) => m.high !== null && m.high === m.low && m.volume >= 5 * medMinuteVol)
    .map((m) => ({ time: `${String(Math.floor(m.minute / 60)).padStart(2, "0")}:${String(m.minute % 60).padStart(2, "0")}`, price: m.close, volume: m.volume, side: m.delta > 0 ? "mua" : m.delta < 0 ? "bán" : "?" }));
}

/** Lặp kích thước lệnh (chỉ có khi có tick): tỷ trọng số lệnh thuộc 3 kích thước phổ biến nhất (bỏ lô 100). */
export function clipRegularity(minutes) {
  const hist = new Map();
  let prints = 0;
  for (const m of minutes) for (const [size, count] of Object.entries(m.sizes ?? {})) {
    if (Number(size) <= 100) continue;
    hist.set(size, (hist.get(size) ?? 0) + count);
    prints += count;
  }
  if (prints < 50) return null;
  const top = [...hist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  return { share: round(sum(top.map((t) => t[1])) / prints, 3), topSizes: top.map(([s, c]) => ({ size: Number(s), prints: c })), prints };
}

export function executionSignature({ recentFootprints, todayScores, dailyDeltas, todayMinutes, medMinuteVol }) {
  // Bền bỉ trong phiên: tự tương quan bậc 1 của delta% giữa các khung (gộp 5 phiên gần nhất).
  const pairs = [];
  for (const f of recentFootprints) {
    const d = f.buckets.slice(1, BUCKET_COUNT - 1).filter((b) => b.volume).map((b) => b.delta / b.volume);
    for (let i = 1; i < d.length; i++) pairs.push([d[i - 1], d[i]]);
  }
  let intraPersistence = null;
  if (pairs.length >= 20) {
    const ma = mean(pairs.map((p) => p[0])), mb = mean(pairs.map((p) => p[1]));
    const cov = sum(pairs.map((p) => (p[0] - ma) * (p[1] - mb)));
    const va = Math.sqrt(sum(pairs.map((p) => (p[0] - ma) ** 2))), vb = Math.sqrt(sum(pairs.map((p) => (p[1] - mb) ** 2)));
    intraPersistence = va && vb ? cov / (va * vb) : null;
  }
  // Tỷ lệ tham gia: các khung cùng chiều với delta cả phiên có |delta%| ổn định (CV thấp) -> thuật toán chia lệnh.
  const scored = todayScores.filter((s) => s && s.deltaPct !== null);
  const sessionSign = Math.sign(sum(scored.map((s) => s.delta)));
  const aligned = scored.filter((s) => Math.sign(s.delta) === sessionSign && sessionSign !== 0).map((s) => Math.abs(s.deltaPct));
  const participationCV = aligned.length >= 4 && mean(aligned) > 0 ? Math.sqrt(mean(aligned.map((v) => (v - mean(aligned)) ** 2))) / mean(aligned) : null;
  return {
    intraPersistence: round(intraPersistence, 3),
    dailyPersistence: round(autocorr(dailyDeltas), 3),
    hurst: round(hurstRS(dailyDeltas), 3),
    participationCV: round(participationCV, 3),
    alignedBuckets: aligned.length,
    clipRegularity: clipRegularity(todayMinutes),
    samePriceClusters: samePriceClusters(todayMinutes, medMinuteVol).slice(0, 6),
  };
}

// ---------- Lớp 4: Stealth Score & phân kỳ tay to – tay nhỏ ----------

/**
 * Stealth thô của cửa sổ n phiên: cường độ dòng lệnh tay to (Σ largeDelta / ADV) × độ "êm"
 * (1 − |giá thực| / |giá kỳ vọng theo λ ngày|, = 1 nếu giá đi ngược dòng lệnh) × hệ số bền bỉ.
 */
function stealthRaw(window, adv, lambdaDaily) {
  const largeFlow = sum(window.map((f) => f.largeDelta));
  const totalFlow = sum(window.map((f) => f.delta));
  const intensity = adv ? largeFlow / adv : 0;
  const actual = window.reduce((acc, f) => acc * (1 + f.ret), 1) - 1;
  const expected = lambdaDaily !== null && adv ? lambdaDaily * (totalFlow / adv) : 0;
  let quiet = 1;
  if (Math.sign(actual) === Math.sign(largeFlow) && Math.abs(expected) > 1e-9) quiet = 1 - Math.min(1, Math.abs(actual) / Math.abs(expected));
  const sameSign = window.filter((f) => Math.sign(f.largeDelta) === Math.sign(largeFlow)).length / window.length;
  return { raw: intensity * quiet * (0.5 + 0.5 * sameSign), intensity, quiet, persistence: sameSign, actualRet: actual };
}

export function stealthScores(footprints, adv, lambdaDaily) {
  const out = {};
  for (const n of [1, 5, 20]) {
    if (footprints.length < n + 20) { out[`s${n}`] = null; continue; }
    const hist = [];
    for (let end = n; end <= footprints.length; end++) hist.push(stealthRaw(footprints.slice(end - n, end), adv, lambdaDaily).raw);
    const cur = stealthRaw(footprints.slice(-n), adv, lambdaDaily);
    const past = hist.slice(0, -1);
    const z = rankZ(cur.raw, past);
    out[`s${n}`] = {
      z: round(z, 2),
      percentile: round(past.filter((v) => v <= cur.raw).length / past.length * 100, 0),
      intensity: round(cur.intensity, 4), quietness: round(cur.quiet, 2), persistence: round(cur.persistence, 2), ret: round(cur.actualRet * 100, 2),
      reading: z >= 1.5 ? "Gom âm thầm" : z <= -1.5 ? "Xả âm thầm" : "Không rõ rệt",
    };
  }
  return out;
}

export function bigSmallDivergence(footprints, adv, n = 20) {
  const w = footprints.slice(-n);
  let cl = 0, cs = 0;
  const series = w.map((f) => {
    cl += f.largeDelta / (adv || 1);
    cs += f.smallDelta / (adv || 1);
    return { date: f.date, large: round(cl, 4), small: round(cs, 4) };
  });
  const divergent = Math.sign(cl) !== Math.sign(cs) && Math.abs(cl) > 0.05 && Math.abs(cs) > 0.05;
  return {
    series, cumLarge: round(cl, 4), cumSmall: round(cs, 4), divergent,
    reading: divergent ? (cl > 0 ? "Tay to gom trong khi tay nhỏ bán" : "Tay to xả trong khi tay nhỏ mua") : "Đồng pha hoặc chưa rõ",
  };
}

// ---------- Lớp 5: HMM diễn giải được ----------

export const INTENT_STATES = [
  { id: "ACC_ACTIVE", label: "Gom chủ động", mu: [1.5, 1.0, 1.5] },
  { id: "ACC_PASSIVE", label: "Gom thụ động / hấp thụ", mu: [-1.2, 0.3, 0] },
  { id: "DIST_ACTIVE", label: "Xả chủ động", mu: [-1.5, -1.0, -1.5] },
  { id: "DIST_PASSIVE", label: "Xả thụ động / kê bán chặn", mu: [1.2, -0.3, 0] },
  { id: "NEUTRAL", label: "Trung tính / nhỏ lẻ chi phối", mu: [0, 0, 0] },
];
const PRIOR = [0.1, 0.1, 0.1, 0.1, 0.6];

function emission(x, mu, dims) {
  let ll = 0;
  for (let d = 0; d < dims; d++) {
    const v = x[d];
    if (v === null || v === undefined || !Number.isFinite(v)) continue;
    const c = Math.max(-4, Math.min(4, v)); // chặn ngoại lai
    ll += -0.5 * (c - mu[d]) ** 2;
  }
  return ll;
}

/**
 * Lọc tiến (forward) — chỉ dùng quan sát tới thời điểm t (không nhìn tương lai).
 * stay: xác suất giữ trạng thái giữa hai bước; dims: số đặc trưng dùng (3 khi có zL).
 */
export function forwardFilter(observations, { stay = 0.85, dims = 3, resetAt = [] } = {}) {
  const K = INTENT_STATES.length;
  let p = [...PRIOR];
  const path = [];
  observations.forEach((x, t) => {
    const s = resetAt.includes(t) ? 0.7 : stay;
    const pred = p.map((_, j) => s * p[j] + ((1 - s) / (K - 1)) * (1 - p[j]));
    if (x) {
      const ll = INTENT_STATES.map((st) => emission(x, st.mu, dims));
      const maxLl = Math.max(...ll);
      const post = pred.map((v, j) => v * Math.exp(ll[j] - maxLl));
      const z = sum(post) || 1;
      p = post.map((v) => v / z);
    } else p = pred;
    path.push(p);
  });
  return path;
}

export function describePosterior(p) {
  const probs = INTENT_STATES.map((s, i) => ({ id: s.id, label: s.label, p: round(p[i], 3) }));
  const top = [...probs].sort((a, b) => b.p - a.p)[0];
  return { probs, top, confident: top.p >= 0.5 };
}

/** z-score TRƯỢT: điểm i chỉ so với tối đa `window` điểm trước nó (không nhìn tương lai). */
export function trailingZ(arr, window = 60, minHistory = 20) {
  return arr.map((v, i) => {
    if (i < minHistory) return null;
    const past = arr.slice(Math.max(0, i - window), i);
    const m = median(past);
    return robustZ(v, m, mad(past, m) || 1);
  });
}

// ---------- Ghép tất cả cho một mã ----------

/**
 * @param {{ history: any[], today: any|null, tickFlow?: any|null, foreign?: any|null }} p
 *   history: các phiên trước (cũ -> mới) có `bars` nến phút & `buckets`; today: phiên đang xem.
 */
export function buildIntentFootprint({ history, today, tickFlow = null }) {
  const usable = history.filter((s) => s.bars?.length && s.refPrice > 0);
  if (usable.length < 30) return { ready: false, reason: `Cần ≥ 30 phiên có nến phút, mới có ${usable.length}.` };

  const contMinuteVols = usable.slice(-60).flatMap((s) => s.bars.filter((b) => isContinuous(minuteOf(b.date))).map((b) => b.volume || 0)).filter((v) => v > 0);
  const largeThreshold = quantile(contMinuteVols, 0.95);
  const medMinuteVol = median(contMinuteVols) || 1;

  const footprints = usable.map((s) => sessionFootprint(s, bvcMinutes(s.bars, s.refPrice), largeThreshold));
  const scales = bucketScales(footprints.slice(-60));
  const lambda = estimateLambda(footprints.slice(-60), scales);
  const lambdaRecent = estimateLambda(footprints.slice(-5), scales);

  // Phiên đang xem: Lee–Ready nếu tick đã phủ ≥ 60% KL liên tục, ngược lại BVC.
  let method = "BVC";
  let todayFp = null;
  if (today?.bars?.length) {
    const bvc = bvcMinutes(today.bars, today.refPrice);
    const contVol = sum(bvc.map((m) => m.volume));
    let minutes = bvc;
    if (tickFlow && tickFlow.date === today.date && contVol > 0 && tickFlow.classifiedVolume >= 0.6 * contVol) {
      minutes = leeReadyMinutes(tickFlow, today.bars);
      method = "LEE_READY";
    }
    todayFp = sessionFootprint(today, minutes, largeThreshold);
  }
  const all = todayFp ? [...footprints.filter((f) => f.date !== todayFp.date), todayFp] : footprints;
  const adv = mean(all.slice(-21, -1).map((f) => f.continuousVolume)) || 1;

  // λ ngày: hồi quy lợi suất phiên theo delta phiên / ADV.
  let sxy = 0, sxx = 0;
  for (const f of all.slice(-120, -1)) { const x = f.delta / adv; sxy += x * f.ret; sxx += x * x; }
  const lambdaDaily = sxx ? sxy / sxx : null;

  const todayScores = todayFp ? scoreBuckets(todayFp, scales) : [];
  const recentScores = all.slice(-3, todayFp ? -1 : undefined).map((f) => scoreBuckets(f, scales));

  // HMM theo khung: 2 phiên trước + phiên đang xem (reset nhẹ ở đầu mỗi phiên).
  const obs = [];
  const resets = [];
  for (const sc of [...recentScores.slice(-2), todayScores]) {
    resets.push(obs.length);
    for (const b of sc) obs.push(b && b.zEffort !== null ? [b.zEffort, b.zResult, b.zLarge] : null);
  }
  const path = forwardFilter(obs, { resetAt: resets.slice(1) });
  const todayPath = path.slice(-todayScores.length);

  // HMM theo phiên (20 phiên): đặc trưng ngày chuẩn hoá theo lịch sử 120 phiên.
  const dEff = all.map((f) => f.delta / adv), dRes = all.map((f) => f.ret), dLarge = all.map((f) => f.largeDelta / adv);
  const zSeries = trailingZ;
  const zE = zSeries(dEff), zR = zSeries(dRes), zL = zSeries(dLarge);
  const dailyPath = forwardFilter(all.map((_, i) => (zE[i] === null ? null : [zE[i], zR[i], zL[i]])), { stay: 0.8 });

  const dailyDeltas = all.map((f) => f.delta / adv);
  const viewTotals = todayFp ? { volume: todayFp.continuousVolume, delta: todayFp.delta, largeDelta: todayFp.largeDelta, smallDelta: todayFp.smallDelta } : null;

  return {
    ready: true,
    method,
    methodNote: method === "LEE_READY"
      ? "Chiều chủ động phân loại theo Lee–Ready từ tick SSI realtime."
      : "Chiều chủ động suy luận bằng Bulk Volume Classification từ nến phút (xấp xỉ; Lee–Ready chỉ có khi mã đang được theo dõi trong phiên).",
    sessions: usable.length,
    viewDate: todayFp?.date ?? null,
    largeMinuteThreshold: Math.round(largeThreshold),
    lambda: { bucket: lambda, recent5: lambdaRecent, ratio: lambda && lambdaRecent ? round(lambdaRecent / lambda, 2) : null, daily: lambdaDaily },
    today: viewTotals && {
      ...viewTotals,
      deltaPct: viewTotals.volume ? round(viewTotals.delta / viewTotals.volume * 100, 1) : null,
      buckets: todayScores.map((b, i) => (b ? { ...b, intent: describePosterior(todayPath[i]).top } : { bucket: i, label: BUCKETS[i].label, volume: 0, flags: [] })),
    },
    // Hai mức KHÁC NHAU, không được trình bày lẫn: "cả phiên" (HMM theo phiên, tổng hợp dòng
    // lệnh cả ngày) và "khung gần nhất" (HMM theo khung, phản ánh nhịp vừa diễn ra).
    sessionIntent: { date: all.at(-1)?.date ?? null, ...describePosterior(dailyPath.at(-1)) },
    intent: todayPath.length ? describePosterior(todayPath.at(-1)) : describePosterior(dailyPath.at(-1)),
    intentBucket: (() => {
      const last = [...todayScores].reverse().find((b) => b && b.zEffort !== null);
      return last ? last.label : null;
    })(),
    dailyIntent: all.slice(-20).map((f, k) => {
      const idx = all.length - 20 + k;
      return { date: f.date, ...describePosterior(dailyPath[idx]).top, deltaPctAdv: round(dEff[idx] * 100, 1), ret: round(f.ret * 100, 2) };
    }).filter((d) => d.date),
    stealth: stealthScores(all, adv, lambdaDaily),
    bigSmall: bigSmallDivergence(all, adv),
    execution: executionSignature({
      recentFootprints: all.slice(-5), todayScores, dailyDeltas: dailyDeltas.slice(-120),
      todayMinutes: todayFp?.minutes ?? [], medMinuteVol,
    }),
    flagLabels: FLAG_LABELS,
    states: INTENT_STATES.map(({ id, label }) => ({ id, label })),
  };
}
