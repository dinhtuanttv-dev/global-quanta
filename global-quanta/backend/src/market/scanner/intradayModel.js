// Mô hình chu kỳ & xác suất khối lượng trong phiên (hàm thuần, không gọi mạng).
//
// Khung phiên (17): ATO · 9 khung 15' sáng (09:15–11:30) · 6 khung 15' chiều (13:00–14:30) · ATC.
// Thống kê trên thang log (KL phân phối lệch nặng). Xác suất = tần suất có điều kiện
// làm mượt Bayes về tần suất nền của CHÍNH khung đó (α = 20), kèm cỡ mẫu và khoảng
// tin cậy 90%; chỉ "đạt kiểm định" khi walk-forward có Brier skill > 0 so với nền.
// Đây là xác suất lịch sử đã hiệu chỉnh, KHÔNG phải dự báo chắc chắn.

export const BUCKETS = [
  { id: "ATO", label: "ATO", start: 0, end: 9 * 60 + 16 },
  ...[15, 30, 45].map((m, i) => ({ id: `M${i}`, label: `09:${String(m).padStart(2, "0")}`, start: 9 * 60 + (i === 0 ? 16 : m), end: 9 * 60 + m + 15 })),
  ...[0, 15, 30, 45].map((m, i) => ({ id: `M${i + 3}`, label: `10:${String(m).padStart(2, "0")}`, start: 10 * 60 + m, end: 10 * 60 + m + 15 })),
  ...[0, 15].map((m, i) => ({ id: `M${i + 7}`, label: `11:${String(m).padStart(2, "0")}`, start: 11 * 60 + m, end: 11 * 60 + m + 15 + (m === 15 ? 1 : 0) })),
  ...[0, 15, 30, 45].map((m, i) => ({ id: `A${i}`, label: `13:${String(m).padStart(2, "0")}`, start: 13 * 60 + m, end: 13 * 60 + m + 15 })),
  ...[0, 15].map((m, i) => ({ id: `A${i + 4}`, label: `14:${String(m).padStart(2, "0")}`, start: 14 * 60 + m, end: 14 * 60 + m + 15 })),
  { id: "ATC", label: "ATC", start: 14 * 60 + 30, end: 24 * 60 },
];
export const BUCKET_COUNT = BUCKETS.length; // 17

const ALPHA = 20;
const MIN_N = 15;
const Z90 = 1.645;

export function minuteOf(isoTime) {
  const m = String(isoTime).match(/T(\d{2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function bucketIndexOfMinute(minute) {
  if (minute === null) return -1;
  for (let i = 0; i < BUCKETS.length; i++) if (minute >= BUCKETS[i].start && minute < BUCKETS[i].end) return i;
  return -1; // nghỉ trưa / ngoài phiên
}

/** Gom nến phút của MỘT phiên thành 17 khung. */
export function sessionToBuckets(bars) {
  const out = BUCKETS.map(() => null);
  for (const b of [...bars].sort((a, c) => String(a.date).localeCompare(String(c.date)))) {
    const i = bucketIndexOfMinute(minuteOf(b.date));
    if (i < 0) continue;
    const v = b.volume || 0;
    const cur = out[i];
    if (!cur) out[i] = { open: b.open, high: b.high, low: b.low, close: b.close, volume: v, pv: b.close * v };
    else {
      cur.high = Math.max(cur.high, b.high);
      cur.low = Math.min(cur.low, b.low);
      cur.close = b.close;
      cur.volume += v;
      cur.pv += b.close * v;
    }
  }
  return out;
}

const quantile = (sorted, q) => {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
};
const logq = (values, q) => {
  const logs = values.filter((v) => v > 0).map(Math.log).sort((a, b) => a - b);
  const r = quantile(logs, q);
  return r === null ? null : Math.exp(r);
};

/** Hồ sơ KL điển hình từng khung + tỷ trọng lũy kế điển hình tới hết khung. */
export function buildProfile(sessions) {
  const perBucket = BUCKETS.map((_, i) => sessions.map((s) => s.buckets[i]?.volume ?? 0));
  const perBucketRange = BUCKETS.map((_, i) => sessions
    .map((s) => s.buckets[i]).filter((b) => b && b.close > 0).map((b) => (b.high - b.low) / b.close));
  const cumShares = BUCKETS.map((_, i) => sessions.map((s) => {
    const total = s.buckets.reduce((a, b) => a + (b?.volume ?? 0), 0);
    if (!total) return null;
    return s.buckets.slice(0, i + 1).reduce((a, b) => a + (b?.volume ?? 0), 0) / total;
  }).filter((v) => v !== null).sort((a, b) => a - b));
  const cumVols = BUCKETS.map((_, i) => sessions.map((s) => s.buckets.slice(0, i + 1).reduce((a, b) => a + (b?.volume ?? 0), 0)));
  return BUCKETS.map((bk, i) => ({
    id: bk.id,
    label: bk.label,
    median: logq(perBucket[i], 0.5) ?? 0,
    p25: logq(perBucket[i], 0.25) ?? 0,
    p75: logq(perBucket[i], 0.75) ?? 0,
    medianRange: quantile([...perBucketRange[i]].sort((a, b) => a - b), 0.5) ?? 0,
    cumShare: quantile(cumShares[i], 0.5),
    cumShareP25: quantile(cumShares[i], 0.25),
    cumShareP75: quantile(cumShares[i], 0.75),
    medianCumVolume: logq(cumVols[i], 0.5) ?? 0,
  }));
}

/**
 * Hồ sơ TRƯỢT: hồ sơ của phiên i chỉ dựng từ `window` phiên liền trước (không dùng
 * dữ liệu tương lai, tự thích nghi khi thị trường đổi nhịp). null nếu < minHistory phiên.
 */
export function rollingProfiles(sessions, window = 20, minHistory = 10) {
  return sessions.map((_, i) => (i < minHistory ? null : buildProfile(sessions.slice(Math.max(0, i - window), i))));
}

// ---------- Trạng thái & kết cục ----------

export function priceBin(changePct) {
  if (changePct <= -2) return "P--";
  if (changePct <= -0.5) return "P-";
  if (changePct < 0.5) return "P0";
  if (changePct < 2) return "P+";
  return "P++";
}
export const PRICE_BIN_LABEL = { "P--": "giảm ≥ 2%", "P-": "giảm 0,5–2%", "P0": "đi ngang", "P+": "tăng 0,5–2%", "P++": "tăng ≥ 2%" };

export function rvolBin(rvol) {
  if (rvol === null || !Number.isFinite(rvol)) return "R?";
  if (rvol < 0.7) return "Rlow";
  if (rvol > 1.5) return "Rhigh";
  return "Rnorm";
}
export const RVOL_BIN_LABEL = { Rlow: "KL lũy kế thấp", Rnorm: "KL lũy kế bình thường", Rhigh: "KL lũy kế cao", "R?": "chưa rõ KL" };

/**
 * Trạng thái tại LÚC BẮT ĐẦU khung `b` (chỉ dùng dữ liệu các khung < b).
 * @returns {{ key: string, priceBin: string, vwapPos: string, rvolBin: string, changePct: number, cumRvol: number|null } | null}
 */
export function stateBefore(buckets, b, refPrice, profile) {
  if (b <= 0) return null;
  const done = buckets.slice(0, b).filter(Boolean);
  if (!done.length || !refPrice) return null;
  const last = done.at(-1).close;
  const vol = done.reduce((a, x) => a + x.volume, 0);
  const pv = done.reduce((a, x) => a + x.pv, 0);
  const vwap = vol ? pv / vol : last;
  const changePct = (last / refPrice - 1) * 100;
  const expected = profile[b - 1]?.medianCumVolume;
  const cumRvol = expected ? vol / expected : null;
  const p = priceBin(changePct);
  const w = last >= vwap ? "Vup" : "Vdn";
  const r = rvolBin(cumRvol);
  return { key: `${b}|${p}|${w}|${r}`, priceBin: p, vwapPos: w, rvolBin: r, changePct, cumRvol, lastPrice: last, vwap };
}

/** Kết cục của khung b: bùng nổ / cạn KL so với trung vị khung; chiều giá so với biên độ điển hình. */
export function outcomeOf(buckets, b, profile, prevClose) {
  const bk = buckets[b];
  const med = profile[b].median;
  if (!bk || !med) return null;
  const rvol = bk.volume / med;
  const base = buckets[b - 1]?.close ?? prevClose;
  const ret = base ? bk.close / base - 1 : 0;
  const threshold = (profile[b].medianRange || 0.002) * 0.5;
  const dir = ret > threshold ? "up" : ret < -threshold ? "down" : "flat";
  const range = bk.close ? (bk.high - bk.low) / bk.close : 0;
  return {
    rvol, surge: rvol >= 2, dry: rvol <= 0.5, dir,
    volRegime: rvol < 0.7 ? "low" : rvol > 1.5 ? "high" : "norm",
    width: range > (profile[b].medianRange || 0) ? "wide" : "narrow",
  };
}

// ---------- Xác suất có làm mượt ----------

export function smoothed(k, n, prior, alpha = ALPHA) {
  const a = k + alpha * prior;
  const bb = n - k + alpha * (1 - prior);
  const mean = a / (a + bb);
  const sd = Math.sqrt((a * bb) / ((a + bb) ** 2 * (a + bb + 1)));
  return { p: mean, low: Math.max(0, mean - Z90 * sd), high: Math.min(1, mean + Z90 * sd), n, k, enough: n >= MIN_N };
}

/** Bảng đếm: trạng thái -> kết cục; khung -> kết cục (nền). */
function emptyCounts() {
  return { byState: new Map(), byBucket: Array.from({ length: BUCKET_COUNT }, () => ({ n: 0, surge: 0, dry: 0, up: 0, down: 0 })) };
}
function addSession(counts, s, profile) {
  if (!profile) return;
  for (let b = 1; b < BUCKET_COUNT; b++) {
    const st = stateBefore(s.buckets, b, s.refPrice, profile);
    const oc = outcomeOf(s.buckets, b, profile, s.refPrice);
    if (!st || !oc) continue;
    const rec = counts.byState.get(st.key) ?? { n: 0, surge: 0, dry: 0, up: 0, down: 0 };
    for (const r of [rec, counts.byBucket[b]]) {
      r.n++; if (oc.surge) r.surge++; if (oc.dry) r.dry++; if (oc.dir === "up") r.up++; if (oc.dir === "down") r.down++;
    }
    counts.byState.set(st.key, rec);
  }
}
function predict(counts, key, b) {
  const base = counts.byBucket[b];
  const rec = counts.byState.get(key) ?? { n: 0, surge: 0, dry: 0, up: 0, down: 0 };
  const prior = (x) => (base.n ? (base[x] + 1) / (base.n + 2) : 0.5);
  return {
    surge: smoothed(rec.surge, rec.n, prior("surge")),
    dry: smoothed(rec.dry, rec.n, prior("dry")),
    up: smoothed(rec.up, rec.n, prior("up")),
    down: smoothed(rec.down, rec.n, prior("down")),
    baseline: { surge: prior("surge"), dry: prior("dry"), up: prior("up"), down: prior("down") },
  };
}

/**
 * Kiểm định walk-forward: duyệt phiên theo thời gian, dự báo phiên d bằng bảng đếm
 * từ các phiên < d, rồi mới cộng phiên d vào. Brier skill = 1 − Brier(mô hình)/Brier(nền).
 */
export function walkForward(sessions, profiles, { warmup = 30 } = {}) {
  const profileOf = (i) => (Array.isArray(profiles) ? profiles[i] : profiles);
  const counts = emptyCounts();
  const acc = { surge: { m: 0, b: 0, n: 0, pos: 0, bins: Array.from({ length: 10 }, () => ({ p: 0, o: 0, n: 0 })) }, dry: { m: 0, b: 0, n: 0, pos: 0 } };
  sessions.forEach((s, idx) => {
    const profile = profileOf(idx);
    if (idx >= warmup && profile) {
      for (let b = 1; b < BUCKET_COUNT; b++) {
        const st = stateBefore(s.buckets, b, s.refPrice, profile);
        const oc = outcomeOf(s.buckets, b, profile, s.refPrice);
        if (!st || !oc) continue;
        const pr = predict(counts, st.key, b);
        for (const ev of ["surge", "dry"]) {
          const y = oc[ev] ? 1 : 0;
          acc[ev].m += (pr[ev].p - y) ** 2;
          acc[ev].b += (pr.baseline[ev] - y) ** 2;
          acc[ev].n++;
          acc[ev].pos += y;
        }
        const bin = acc.surge.bins[Math.min(9, Math.floor(pr.surge.p * 10))];
        bin.p += pr.surge.p; bin.o += oc.surge ? 1 : 0; bin.n++;
      }
    }
    addSession(counts, s, profile);
  });
  // Sự kiện quá hiếm (cả hai phía) thì Brier của mô hình lẫn nền đều ~0 và tỷ số cho ra
  // "skill" ảo -> không công nhận khi có < MIN_EVENTS lần xảy ra hoặc < MIN_EVENTS lần không xảy ra.
  const MIN_EVENTS = 20;
  const skill = (x) => (x.n && x.b && x.pos >= MIN_EVENTS && x.n - x.pos >= MIN_EVENTS ? 1 - x.m / x.b : null);
  return {
    evaluatedSessions: Math.max(0, sessions.length - warmup),
    surge: { brierSkill: skill(acc.surge), samples: acc.surge.n, events: acc.surge.pos },
    dry: { brierSkill: skill(acc.dry), samples: acc.dry.n, events: acc.dry.pos },
    calibration: acc.surge.bins.filter((x) => x.n).map((x) => ({ predicted: x.p / x.n, observed: x.o / x.n, n: x.n })),
    counts,
  };
}

// ---------- Ma trận giá – khối lượng (chuyển pha giữa các khung) ----------

const DIRS = ["up", "flat", "down"];
const REGIMES = ["low", "norm", "high"];
export const CELLS = DIRS.flatMap((d) => REGIMES.map((r) => `${d}:${r}`));

export function buildTransitions(sessions, profiles) {
  const profileOf = (i) => (Array.isArray(profiles) ? profiles[i] : profiles);
  const counts = new Map(CELLS.map((c) => [c, new Map(CELLS.map((x) => [x, 0]))]));
  const marginal = new Map(CELLS.map((c) => [c, 0]));
  let total = 0;
  for (const [i, s] of sessions.entries()) {
    const profile = profileOf(i);
    if (!profile) continue;
    let prev = null;
    for (let b = 1; b < BUCKET_COUNT; b++) {
      const oc = outcomeOf(s.buckets, b, profile, s.refPrice);
      if (!oc) { prev = null; continue; }
      const cell = `${oc.dir}:${oc.volRegime}`;
      marginal.set(cell, marginal.get(cell) + 1);
      total++;
      if (prev) counts.get(prev).set(cell, counts.get(prev).get(cell) + 1);
      prev = cell;
    }
  }
  const matrix = {};
  for (const from of CELLS) {
    const row = counts.get(from);
    const n = [...row.values()].reduce((a, b) => a + b, 0);
    matrix[from] = { n, to: Object.fromEntries(CELLS.map((to) => {
      const prior = total ? (marginal.get(to) + 1) / (total + CELLS.length) : 1 / CELLS.length;
      return [to, smoothed(row.get(to), n, prior)];
    })) };
  }
  return matrix;
}

/**
 * Xác suất CHẠM ô `target` trong `steps` khung tới: ô đích là trạng thái hấp thụ,
 * cộng dồn khối xác suất chảy vào đích ở mỗi bước (mỗi hàng ma trận có tổng = 1).
 */
export function probabilityWithin(matrix, fromCell, target, steps = 2) {
  let dist = Object.fromEntries(CELLS.map((c) => [c, c === fromCell ? 1 : 0]));
  let hit = 0;
  for (let s = 0; s < steps; s++) {
    const next = Object.fromEntries(CELLS.map((c) => [c, 0]));
    for (const from of CELLS) {
      if (!dist[from]) continue;
      for (const to of CELLS) next[to] += dist[from] * matrix[from].to[to].p;
    }
    hit += next[target];
    next[target] = 0;
    dist = next;
  }
  return Math.min(1, hit);
}

// ---------- Ghép tất cả cho một mã ----------

/**
 * @param {{ sessions: { date: string, refPrice: number, buckets: any[] }[], today?: { date: string, refPrice: number, buckets: any[] }, nowMinute?: number|null }} p
 */
export function buildIntradayCycle({ sessions, today = null, nowMinute = null }) {
  const usable = sessions.filter((s) => s.buckets.some(Boolean) && s.refPrice > 0);
  if (usable.length < 20) return { ready: false, reason: `Cần ≥ 20 phiên có nến phút, mới có ${usable.length}.`, sessions: usable.length };
  // Bảng đếm & kiểm định dùng hồ sơ TRƯỢT 20 phiên; hôm nay so với 20 phiên gần nhất.
  const profiles = rollingProfiles(usable);
  const profile = buildProfile(usable.slice(-20));
  const validation = walkForward(usable, profiles);
  const counts = validation.counts;
  delete validation.counts;
  const transitions = buildTransitions(usable, profiles);
  const validated = {
    surge: (validation.surge.brierSkill ?? -1) > 0,
    dry: (validation.dry.brierSkill ?? -1) > 0,
  };

  let current = null;
  if (today && today.buckets.some(Boolean)) {
    const lastDone = today.buckets.reduce((acc, b, i) => (b ? i : acc), -1);
    const nowIdx = nowMinute !== null ? bucketIndexOfMinute(nowMinute) : -1;
    const inProgress = nowIdx >= 0 && nowIdx === lastDone;
    const nextIdx = lastDone + 1;
    const cumVol = today.buckets.reduce((a, b) => a + (b?.volume ?? 0), 0);
    const share = profile[lastDone]?.cumShare;
    const projected = share ? cumVol / share : null;
    const st = nextIdx < BUCKET_COUNT ? stateBefore(today.buckets, nextIdx, today.refPrice, profile) : null;
    const lastOc = outcomeOf(today.buckets, lastDone, profile, today.refPrice);
    const cell = lastOc ? `${lastOc.dir}:${lastOc.volRegime}` : null;
    current = {
      date: today.date,
      lastBucket: lastDone,
      inProgress,
      sessionDone: lastDone >= BUCKET_COUNT - 1,
      cumVolume: cumVol,
      timeAdjustedRvol: (() => {
        // Khung đang chạy dở: KL kỳ vọng = lũy kế điển hình tới khung trước + phần của khung hiện tại theo số phút đã qua.
        let expected = profile[lastDone]?.medianCumVolume ?? 0;
        if (inProgress && nowMinute !== null) {
          const bk = BUCKETS[lastDone];
          const frac = Math.min(1, Math.max(0.1, (nowMinute - bk.start + 1) / Math.max(1, Math.min(bk.end, 15 * 60) - bk.start)));
          expected = (lastDone > 0 ? profile[lastDone - 1].medianCumVolume : 0) + profile[lastDone].median * frac;
        }
        return expected ? cumVol / expected : null;
      })(),
      projectedVolume: projected,
      projectedRange: share && profile[lastDone].cumShareP25 && profile[lastDone].cumShareP75
        ? [cumVol / profile[lastDone].cumShareP75, cumVol / profile[lastDone].cumShareP25] : null,
      bucketRvol: today.buckets.map((b, i) => (b && profile[i].median ? b.volume / profile[i].median : null)),
      state: st ? { priceBin: st.priceBin, priceLabel: PRICE_BIN_LABEL[st.priceBin], vwapPos: st.vwapPos, rvolBin: st.rvolBin, rvolLabel: RVOL_BIN_LABEL[st.rvolBin], changePct: st.changePct, cumRvol: st.cumRvol } : null,
      next: st ? { bucket: nextIdx, label: BUCKETS[nextIdx].label, ...predict(counts, st.key, nextIdx) } : null,
      cell,
      transitionsFromCell: cell ? transitions[cell] : null,
      enterHighUpWithin2: cell ? probabilityWithin(transitions, cell, "up:high", 2) : null,
      enterHighDownWithin2: cell ? probabilityWithin(transitions, cell, "down:high", 2) : null,
      buckets: today.buckets.map((b) => (b ? { volume: b.volume, open: b.open, high: b.high, low: b.low, close: b.close } : null)),
    };
  }

  return {
    ready: true,
    sessions: usable.length,
    from: usable[0].date,
    to: usable.at(-1).date,
    buckets: BUCKETS.map((b) => ({ id: b.id, label: b.label })),
    profile,
    profileSessions: Math.min(20, usable.length),
    validation: { ...validation, validated },
    current,
  };
}
