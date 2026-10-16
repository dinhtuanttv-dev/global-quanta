// Kiểm định đặt trước WS (WS-prereg.md) — hàm thuần, có test. Điểm tính POINT-IN-TIME, không tham số ước lượng.
import { MATCH_WEIGHT } from "./catalog.js";
import { Z_CAP as Z_CAP_DEFAULT } from "./worldSectorAnalytics.js";

export const WS_PREREG = { start: "2023-01-01", sigmaWindow: 250, block: 5, B: 5000, seed: 20261017, alpha: 0.05, nwShort: 5, nwMedium: 2, h3p: 0.025, h4p: 0.05, minCross: 10 };
const clamp = (z) => Math.max(-Z_CAP_DEFAULT, Math.min(Z_CAP_DEFAULT, z));

/** Chuỗi giá -> { dates, r (log), sigma (σ 250 kết thúc tại phiên đó, NaN khi chưa đủ) }. */
export function prepare(points, window = WS_PREREG.sigmaWindow) {
  const dates = [], r = [], sigma = [];
  for (let i = 1; i < points.length; i++) {
    if (!(points[i - 1][1] > 0 && points[i][1] > 0)) continue;
    dates.push(points[i][0]); r.push(Math.log(points[i][1] / points[i - 1][1]));
  }
  // σ cuộn O(n): tổng và tổng bình phương
  let s = 0, s2 = 0;
  for (let i = 0; i < r.length; i++) {
    s += r[i]; s2 += r[i] * r[i];
    if (i >= window) { s -= r[i - window]; s2 -= r[i - window] ** 2; }
    const n = Math.min(i + 1, window);
    sigma.push(i + 1 >= window ? Math.sqrt(Math.max(0, (s2 - (s * s) / n) / (n - 1))) : NaN);
  }
  return { dates, r, sigma, closeDates: points.map((p) => p[0]), close: points.map((p) => p[1]) };
}

/** Chỉ số phần tử cuối có ngày < d (strict) hoặc <= d. */
export function lastIdx(dates, d, strict = true) {
  let lo = 0, hi = dates.length - 1, ans = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (strict ? dates[m] < d : dates[m] <= d) { ans = m; lo = m + 1; } else hi = m - 1; }
  return ans;
}

/** z ngắn hạn của một mã cho phiên VN d: phiên gần nhất TRƯỚC d. */
export function zShortAt(p, d) {
  const i = lastIdx(p.dates, d, true);
  if (i < 0 || !Number.isFinite(p.sigma[i]) || !(p.sigma[i] > 0)) return null;
  return clamp(p.r[i] / p.sigma[i]);
}

/** z trung hạn h phiên tại cuối ngày t (phiên nước ngoài < t — chặt, point-in-time tại giờ đóng cửa VN). */
export function zMediumAt(p, t, h = 63) {
  const i = lastIdx(p.closeDates, t, true);
  if (i < h) return null;
  const ri = lastIdx(p.dates, t, true);
  if (ri < 0 || !(p.sigma[ri] > 0)) return null;
  return clamp(Math.log(p.close[i] / p.close[i - h]) / (p.sigma[ri] * Math.sqrt(h)));
}

/** Gộp như engine: trung bình theo mức khớp trong khu vực, trung bình đều giữa khu vực. items [{region, match, z}] */
export function aggregateZ(items) {
  const by = {};
  for (const it of items) {
    if (it.z == null || !Number.isFinite(it.z)) continue;
    const w = MATCH_WEIGHT[it.match] ?? 0;
    const r = (by[it.region] ??= { sw: 0, swz: 0 });
    r.sw += w; r.swz += w * it.z;
  }
  const v = Object.values(by).filter((x) => x.sw > 0).map((x) => x.swz / x.sw);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}
export const blend = (a, b) => (a == null ? b : b == null ? a : 0.7 * a + 0.3 * b);

const rank = (xs) => {
  const idx = xs.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const r = new Array(xs.length);
  for (let k = 0; k < idx.length;) { let j = k; while (j + 1 < idx.length && idx[j + 1][0] === idx[k][0]) j++; const a = (k + j) / 2 + 1; for (let t = k; t <= j; t++) r[idx[t][1]] = a; k = j + 1; }
  return r;
};
export function spearman(x, y) {
  const n = x.length;
  if (n < 3) return null;
  const rx = rank(x), ry = rank(y);
  const mx = (n + 1) / 2;
  let c = 0, vx = 0, vy = 0;
  for (let i = 0; i < n; i++) { c += (rx[i] - mx) * (ry[i] - mx); vx += (rx[i] - mx) ** 2; vy += (ry[i] - mx) ** 2; }
  return vx > 0 && vy > 0 ? c / Math.sqrt(vx * vy) : null;
}

function mulberry32(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** p một phía (IC ≤ 0) bằng bootstrap khối dừng, phân phối dời tâm về 0. */
export function bootstrapP(x, y, { B = WS_PREREG.B, block = WS_PREREG.block, seed = WS_PREREG.seed } = {}) {
  const ic = spearman(x, y);
  if (ic == null) return { ic: null, p: 1 };
  const n = x.length, rnd = mulberry32(seed), pNew = 1 / block;
  let ge = 0, cnt = 0;
  for (let b = 0; b < B; b++) {
    const xs = new Array(n), ys = new Array(n);
    let cur = Math.floor(rnd() * n);
    for (let i = 0; i < n; i++) { if (i > 0) cur = rnd() < pNew ? Math.floor(rnd() * n) : (cur + 1) % n; xs[i] = x[cur]; ys[i] = y[cur]; }
    const v = spearman(xs, ys);
    if (v == null) continue;
    cnt++; if (v - ic >= ic) ge++;
  }
  return { ic, p: (ge + 1) / (cnt + 1) };
}

/** Benjamini–Yekutieli. */
export function adjustBY(ps) {
  const m = ps.length, c = Array.from({ length: m }, (_, i) => 1 / (i + 1)).reduce((a, b) => a + b, 0);
  const order = ps.map((p, i) => [p, i]).sort((a, b) => a[0] - b[0]);
  const q = new Array(m);
  let prev = 1;
  for (let k = m - 1; k >= 0; k--) { const [p, i] = order[k]; prev = Math.min(prev, (p * m * c) / (k + 1)); q[i] = Math.min(1, prev); }
  return q;
}

const normCdf = (z) => { const t = 1 / (1 + 0.2316419 * Math.abs(z)); const d = 0.3989423 * Math.exp((-z * z) / 2); const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return z > 0 ? 1 - p : p; };

/** Trung bình + t Newey–West (trễ L) + p một phía (xấp xỉ chuẩn). */
export function nwMean(xs, L) {
  const n = xs.length;
  if (n < 5) return { mean: null, t: null, p: 1, n };
  const m = xs.reduce((a, b) => a + b, 0) / n;
  const e = xs.map((x) => x - m);
  let v = e.reduce((a, x) => a + x * x, 0) / n;
  for (let l = 1; l <= L; l++) { let g = 0; for (let i = l; i < n; i++) g += e[i] * e[i - l]; v += 2 * (1 - l / (L + 1)) * (g / n); }
  const se = Math.sqrt(Math.max(v, 1e-18) / n);
  const t = m / se;
  return { mean: m, t, p: 1 - normCdf(t), n };
}

const halves = (arr) => { const h = Math.floor(arr.length / 2); return [arr.slice(0, h), arr.slice(h)]; };

/**
 * Chạy H1–H4. data:
 *   vnIndex: points; sectors: { [icb]: points }; instruments: { [icb]: [{ region, match, p: prepare(points) }] };
 *   dailyDrivers: { [icb]: [{ sign, p }] }; monthlyDrivers: { [icb]: [{ sign, points (YYYY-MM) }] }; dailyDriverMedium uses p.
 */
export function runWs(data, cfg = WS_PREREG) {
  const icbs = Object.keys(data.sectors);
  const vn = prepare(data.vnIndex);
  const vnR = new Map(vn.dates.map((d, i) => [d, vn.r[i]]));
  const secR = Object.fromEntries(icbs.map((s) => { const p = prepare(data.sectors[s]); return [s, new Map(p.dates.map((d, i) => [d, p.r[i]]))]; }));
  const days = vn.dates.filter((d) => d >= cfg.start);
  // ── điểm ngắn hạn theo ngày ──
  const S = {}; // S[d][s]
  for (const d of days) {
    const row = {};
    for (const s of icbs) {
      const sec = aggregateZ((data.instruments[s] ?? []).map((i) => ({ region: i.region, match: i.match, z: zShortAt(i.p, d) })));
      const cz = (data.dailyDrivers[s] ?? []).map((c) => { const z = zShortAt(c.p, d); return z == null ? null : z * c.sign; }).filter((z) => z != null);
      const v = blend(sec, cz.length ? cz.reduce((a, b) => a + b, 0) / cz.length : null);
      if (v != null && secR[s].has(d)) row[s] = { S: v, r: secR[s].get(d) };
    }
    S[d] = row;
  }
  // ── H1, H2 theo ngành ──
  const perSector = icbs.map((s) => {
    const xs = [], ys = [], xr = [], yr = [];
    for (const d of days) {
      const row = S[d];
      if (!row[s] || !vnR.has(d)) continue;
      const keys = Object.keys(row);
      if (keys.length < cfg.minCross) continue;
      const meanS = keys.reduce((a, k) => a + row[k].S, 0) / keys.length;
      xs.push(row[s].S); ys.push(row[s].r);
      xr.push(row[s].S - meanS); yr.push(row[s].r - vnR.get(d));
    }
    const h1 = spearman(xs, ys);
    const bp = bootstrapP(xr, yr, cfg);
    const [a, b] = [halves(xr), halves(yr)];
    return { icb: s, n: xr.length, h1ic: h1, h2ic: bp.ic, h2p: bp.p, h2half: [spearman(a[0], b[0]), spearman(a[1], b[1])] };
  });
  const q = adjustBY(perSector.map((x) => x.h2p));
  perSector.forEach((x, i) => { x.h2q = q[i]; x.h2pass = q[i] < cfg.alpha && x.h2ic > 0 && x.h2half.every((h) => h != null && h > 0); });
  // ── H3: IC cắt ngang theo ngày ──
  const cross = [];
  for (const d of days) {
    const row = S[d];
    const keys = Object.keys(row).filter(() => vnR.has(d));
    if (keys.length < cfg.minCross) continue;
    const ic = spearman(keys.map((k) => row[k].S), keys.map((k) => row[k].r - vnR.get(d)));
    if (ic != null) cross.push(ic);
  }
  const h3 = nwMean(cross, cfg.nwShort);
  const [c1, c2] = halves(cross);
  const h3half = [nwMean(c1, cfg.nwShort).mean, nwMean(c2, cfg.nwShort).mean];
  const h3pass = h3.mean > 0 && h3.p < cfg.h3p && h3half.every((h) => h > 0);
  // ── H4: trung hạn theo tháng ──
  const monthEnds = [];
  for (let i = 0; i < days.length; i++) if (i === days.length - 1 || days[i + 1].slice(0, 7) !== days[i].slice(0, 7)) monthEnds.push(days[i]);
  const secClose = Object.fromEntries(icbs.map((s) => [s, prepare(data.sectors[s])]));
  const lvl = (p, d) => { const i = lastIdx(p.closeDates, d, false); return i < 0 ? null : p.close[i]; };
  const vnP = vn;
  const monthly = [];
  for (let k = 0; k + 1 < monthEnds.length; k++) {
    const t = monthEnds[k], t1 = monthEnds[k + 1];
    const prevMonth = (() => { const [y, m] = t.slice(0, 7).split("-").map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`; })();
    const vnRet = Math.log(lvl(vnP, t1) / lvl(vnP, t));
    const xs = [], ys = [];
    for (const s of icbs) {
      const sec = aggregateZ((data.instruments[s] ?? []).map((i) => ({ region: i.region, match: i.match, z: zMediumAt(i.p, t, 63) })));
      const cz = [
        ...(data.dailyDrivers[s] ?? []).map((c) => { const z = zMediumAt(c.p, t, 63); return z == null ? null : z * c.sign; }),
        ...(data.monthlyDrivers[s] ?? []).map((c) => {
          const pts = c.points.filter(([p]) => p <= prevMonth);
          if (pts.length < 30) return null;
          const lr = []; for (let i = 1; i < pts.length; i++) lr.push(Math.log(pts[i][1] / pts[i - 1][1]));
          const w = lr.slice(-240), mu = w.reduce((a, b) => a + b, 0) / w.length;
          const sd = Math.sqrt(w.reduce((a, x) => a + (x - mu) ** 2, 0) / (w.length - 1));
          return sd > 0 ? clamp(Math.log(pts.at(-1)[1] / pts.at(-4)[1]) / (sd * Math.sqrt(3))) * c.sign : null;
        }),
      ].filter((z) => z != null);
      const M = blend(sec, cz.length ? cz.reduce((a, b) => a + b, 0) / cz.length : null);
      const a0 = lvl(secClose[s], t), a1 = lvl(secClose[s], t1);
      if (M == null || !(a0 > 0 && a1 > 0)) continue;
      xs.push(M); ys.push(Math.log(a1 / a0) - vnRet);
    }
    if (xs.length >= cfg.minCross) monthly.push({ month: t.slice(0, 7), ic: spearman(xs, ys), n: xs.length });
  }
  const mIcs = monthly.map((m) => m.ic).filter((x) => x != null);
  const h4 = nwMean(mIcs, cfg.nwMedium);
  const [m1, m2] = halves(mIcs);
  const h4half = [nwMean(m1, cfg.nwMedium).mean, nwMean(m2, cfg.nwMedium).mean];
  const h4pass = h4.mean > 0 && h4.p < cfg.h4p && h4half.every((h) => h > 0);
  return {
    prereg: cfg, from: days[0] ?? null, to: days.at(-1) ?? null, sessions: days.length,
    H1: perSector.map(({ icb, n, h1ic }) => ({ icb, n, ic: h1ic })),
    H2: perSector.map(({ icb, n, h2ic, h2p, h2q, h2half, h2pass }) => ({ icb, n, ic: h2ic, p: h2p, q: h2q, halves: h2half, pass: h2pass })),
    H3: { ...h3, halves: h3half, pass: h3pass, days: cross.length },
    H4: { ...h4, halves: h4half, pass: h4pass, months: monthly.length, monthly },
  };
}
