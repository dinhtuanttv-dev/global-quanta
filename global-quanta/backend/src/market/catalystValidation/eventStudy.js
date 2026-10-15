// X6 — Nghiên cứu sự kiện cho chiều tác động của engine Chất xúc tác (giao thức: X6-prereg.md — KHÔNG đổi tham số).
export const PREREG = { horizons: [5, 20], primary: 20, minN: 30, bootstrap: 10_000, seed: 20261016, forwardFrom: "2026-10-17" };

/** Ngày giờ Việt Nam (UTC+7) của một thời điểm ISO. */
export const vnDateOf = (iso) => new Date(Date.parse(iso) + 7 * 3600_000).toISOString().slice(0, 10);

/** Chỉ số phiên t0: phiên đầu tiên có ngày >= ngày VN của scannedAt. */
export function eventIndex(dates, scannedAt) {
  const d = vnDateOf(scannedAt);
  const i = dates.findIndex((x) => x >= d);
  return i < 0 ? null : i;
}

/** AR(h) = ln(P[t0+h]/P[t0]) − ln(I[t0+h]/I[t0]) trên các ngày có cả giá mã và chỉ số. */
export function abnormalReturns(stockBars, indexBars, scannedAt, horizons = PREREG.horizons) {
  const idx = new Map(indexBars.filter((b) => b.close > 0).map((b) => [b.date, b.close]));
  const bars = stockBars.filter((b) => b.close > 0 && !b.partial && idx.has(b.date));
  const dates = bars.map((b) => b.date);
  const i0 = eventIndex(dates, scannedAt);
  if (i0 == null) return { t0: null, ar: {} };
  const ar = {};
  for (const h of horizons) {
    const j = i0 + h;
    if (j >= bars.length) continue;
    ar[h] = Math.log(bars[j].close / bars[i0].close) - Math.log(idx.get(bars[j].date) / idx.get(bars[i0].date));
  }
  return { t0: dates[i0], ar };
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Trung bình + KTC 95% bootstrap theo cụm (resample cụm có hoàn lại). */
export function clusterBootstrap(values, clusters, { B = PREREG.bootstrap, seed = PREREG.seed } = {}) {
  const n = values.length;
  if (!n) return { n: 0, mean: null, lo: null, hi: null, clusters: 0 };
  const groups = new Map();
  values.forEach((v, i) => {
    const k = clusters[i];
    const g = groups.get(k) ?? [];
    g.push(v);
    groups.set(k, g);
  });
  const gs = [...groups.values()];
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const rnd = mulberry32(seed);
  const means = [];
  for (let b = 0; b < B; b++) {
    let s = 0, c = 0;
    for (let k = 0; k < gs.length; k++) {
      const g = gs[Math.floor(rnd() * gs.length)];
      for (const v of g) { s += v; c++; }
    }
    means.push(s / c);
  }
  means.sort((a, b) => a - b);
  return { n, clusters: gs.length, mean, lo: means[Math.floor(0.025 * B)], hi: means[Math.floor(0.975 * B) - 1] };
}

/** P(X >= k) với X ~ Binomial(n, 0.5) — kiểm định một phía tỷ lệ thắng > 50%. */
export function binomUpperP(k, n) {
  let p = 0;
  let c = 1; // C(n, 0)
  for (let i = 0; i <= n; i++) {
    if (i > 0) c = (c * (n - i + 1)) / i;
    if (i >= k) p += c;
  }
  return p / 2 ** n;
}

/**
 * Chạy giao thức trên các bản ghi sổ (đã kèm chuỗi giá). records: [{ id, ticker, direction, category, sourceId, scannedAt }],
 * bars: { [ticker]: bars }, index: bars VN-Index.
 */
export function runEventStudy(records, bars, index, { prereg = PREREG } = {}) {
  const rows = [];
  const excluded = { noPrice: 0, noT0: 0 };
  for (const r of records) {
    const sb = bars[r.ticker];
    if (!sb?.length) { excluded.noPrice++; continue; }
    const { t0, ar } = abnormalReturns(sb, index, r.scannedAt, prereg.horizons);
    if (!t0) { excluded.noT0++; continue; }
    const d = r.direction === "harm" ? -1 : 1;
    rows.push({ id: r.id, ticker: r.ticker, direction: r.direction, category: r.category, sourceId: r.sourceId, scannedAt: r.scannedAt, t0,
      ...Object.fromEntries(prereg.horizons.map((h) => [`sar${h}`, ar[h] == null ? null : Math.round(d * ar[h] * 1e6) / 1e6])) });
  }
  const stat = (filter, h) => {
    const rs = rows.filter((x) => filter(x) && x[`sar${h}`] != null);
    const bs = clusterBootstrap(rs.map((x) => x[`sar${h}`]), rs.map((x) => x.sourceId));
    const wins = rs.filter((x) => x[`sar${h}`] > 0).length;
    return { ...bs, hitRate: rs.length ? wins / rs.length : null, binomP: rs.length ? binomUpperP(wins, rs.length) : null };
  };
  const all = () => true;
  const primary = stat(all, prereg.primary);
  const enough = primary.n >= prereg.minN;
  const pass = enough && primary.lo > 0;
  const groups = (key) => Object.fromEntries([...new Set(rows.map((x) => x[key]))].map((v) => [v, stat((x) => x[key] === v, prereg.primary)]));
  return {
    prereg,
    sample: { records: records.length, withT0: rows.length, excluded, matured: Object.fromEntries(prereg.horizons.map((h) => [h, rows.filter((x) => x[`sar${h}`] != null).length])) },
    primary: { horizon: prereg.primary, ...primary },
    secondary: { sar5: stat(all, 5), byDirection: groups("direction"), byCategory: groups("category") },
    verdict: !enough ? "INSUFFICIENT_SAMPLE" : pass ? "PASS" : "FAIL",
    evidence: pass ? "VALIDATED_IN_SAMPLE" : "EXPERIMENTAL",
    rows,
  };
}
