// LSK2 (07/11/2026) — DF-v1: dự báo ngày GDKHQ của lần trả cổ tức tiền kế tiếp CHƯA công bố, từ nếp lịch sử của chính mã.
// Đúng mô hình đã đăng ký trước trong DF-prereg.md (không sửa sau khi xem kết quả kiểm định):
//   KDE von Mises trên ngày-trong-năm (κ = 25), trọng số năm bán rã 3 năm, đỉnh mật độ cách nhau ≥ 45 ngày = "đợt trả";
//   mỗi đợt: trung bình vòng tròn có trọng số, σ vòng tròn (sàn 5 ngày), dải P10–P90 = ± 1,2816σ,
//   tần suất năm shrink Beta về tần suất chung của danh mục (độ mạnh prior 2 năm). Point-in-time theo ngày công bố.
export const DF_VERSION = "DF-v1 (2026-11-07)";
export const DF = Object.freeze({ kappa: 25, halfLifeYears: 3, minPeakGapDays: 45, sigmaFloor: 5, z90: 1.2816, priorYears: 2, paidWindow: 60, horizon: 120 });

const YEAR = 365.25;
const TAU = 2 * Math.PI;
const dayOfYear = (iso) => { const t = Date.parse(`${iso}T00:00:00Z`); const y0 = Date.UTC(Number(iso.slice(0, 4)), 0, 1); return (t - y0) / 864e5; };
const toAngle = (doy) => (doy / YEAR) * TAU;
const toDoy = (a) => ((((a % TAU) + TAU) % TAU) / TAU) * YEAR;
const isoAdd = (iso, days) => new Date(Date.parse(`${iso}T00:00:00Z`) + Math.round(days) * 864e5).toISOString().slice(0, 10);
const angDist = (a, b) => { const d = Math.abs(a - b) % TAU; return Math.min(d, TAU - d); };

/**
 * Các "đợt trả" của một mã từ sự kiện cổ tức tiền đã công bố trước `asOf`.
 * events: [{ ex, disclosed }] (ISO). Trả [{ doy, sigma, years, paidYears, weight, lastEx }].
 */
export function payClusters(events, asOf) {
  const past = events.filter((e) => e.ex && (e.disclosed ?? e.ex) < asOf && e.ex < asOf);
  if (!past.length) return { clusters: [], yearsObserved: 0 };
  const yNow = Number(asOf.slice(0, 4));
  const w = (iso) => Math.pow(0.5, (yNow - Number(iso.slice(0, 4))) / DF.halfLifeYears);
  const pts = past.map((e) => ({ a: toAngle(dayOfYear(e.ex)), w: w(e.ex), ex: e.ex, y: Number(e.ex.slice(0, 4)) }));
  // KDE von Mises trên lưới 365 điểm.
  const dens = Array.from({ length: 365 }, (_, i) => { const a = (i / 365) * TAU; return pts.reduce((s, p) => s + p.w * Math.exp(DF.kappa * (Math.cos(a - p.a) - 1)), 0); });
  const peaks = [];
  for (let i = 0; i < 365; i++) { const l = dens[(i + 364) % 365], r = dens[(i + 1) % 365]; if (dens[i] > 0 && dens[i] >= l && dens[i] > r) peaks.push({ i, d: dens[i] }); }
  peaks.sort((a, b) => b.d - a.d);
  const kept = [];
  for (const p of peaks) if (kept.every((k) => Math.min(Math.abs(k.i - p.i), 365 - Math.abs(k.i - p.i)) >= DF.minPeakGapDays)) kept.push(p);
  const centers = kept.map((k) => (k.i / 365) * TAU);
  const groups = centers.map(() => []);
  for (const p of pts) { let best = 0; for (let j = 1; j < centers.length; j++) if (angDist(p.a, centers[j]) < angDist(p.a, centers[best])) best = j; groups[best].push(p); }
  const firstYear = Math.min(...pts.map((p) => p.y));
  const yearsObserved = Math.max(1, yNow - firstYear);
  const clusters = groups.filter((g) => g.length).map((g) => {
    const W = g.reduce((s, p) => s + p.w, 0);
    const C = g.reduce((s, p) => s + p.w * Math.cos(p.a), 0) / W, S = g.reduce((s, p) => s + p.w * Math.sin(p.a), 0) / W;
    const R = Math.min(0.999999, Math.hypot(C, S));
    const sigmaDays = Math.max(DF.sigmaFloor, (Math.sqrt(-2 * Math.log(R)) / TAU) * YEAR);
    const paidYears = new Set(g.map((p) => p.y)).size;
    return { doy: toDoy(Math.atan2(S, C)), sigma: sigmaDays, paidYears, years: yearsObserved, weight: W, lastEx: g.map((p) => p.ex).sort().at(-1) };
  });
  return { clusters, yearsObserved };
}

/** Tần suất chung của danh mục (prior Beta): trung bình paidYears/years trên mọi đợt của mọi mã. */
export function universePrior(clusterSets) {
  const r = clusterSets.flatMap((s) => s.clusters.map((c) => Math.min(1, c.paidYears / c.years)));
  return r.length ? r.reduce((a, b) => a + b, 0) / r.length : 0.5;
}

/**
 * Dự báo tại asOf cho một mã: mỗi đợt -> lần kế tiếp ≥ asOf (bỏ nếu đã có GDKHQ thật công bố trước asOf trong ±60 ngày quanh kỳ này).
 * Trả [{ date, lo, hi, p, sigma, paidYears, years, lastEx }] sắp theo ngày.
 */
export function forecastTicker(events, asOf, prior) {
  const { clusters } = payClusters(events, asOf);
  const known = events.filter((e) => e.ex && (e.disclosed ?? e.ex) < asOf).map((e) => e.ex);
  const y = Number(asOf.slice(0, 4));
  const out = [];
  for (const c of clusters) {
    for (const yy of [y - 1, y, y + 1]) {
      const date = isoAdd(`${yy}-01-01`, c.doy);
      if (date < asOf && isoAdd(date, DF.paidWindow) < asOf) continue;
      const paid = known.some((k) => Math.abs((Date.parse(k) - Date.parse(date)) / 864e5) <= DF.paidWindow);
      if (paid) continue;
      if (date < asOf) continue; // kỳ này đã qua ngày dự kiến mà chưa trả: không dự báo lại (sẽ có ở năm sau)
      const p = (c.paidYears + DF.priorYears * prior) / (c.years + DF.priorYears);
      out.push({ date, lo: isoAdd(date, -DF.z90 * c.sigma), hi: isoAdd(date, DF.z90 * c.sigma), p: Math.min(0.99, Math.max(0.01, p)), sigma: Math.round(c.sigma * 10) / 10, paidYears: c.paidYears, years: c.years, lastEx: c.lastEx });
      break;
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Đường cơ sở ngây thơ: đợt gần nhất cùng mùa năm trước + 365 ngày (GDKHQ thật gần ngày t − 365 nhất, trong ±120 ngày). */
export function naiveForecast(events, asOf) {
  const prev = events.filter((e) => e.ex && (e.disclosed ?? e.ex) < asOf && e.ex < asOf).map((e) => e.ex);
  return prev.map((d) => isoAdd(d, 365)).filter((d) => d >= asOf && d <= isoAdd(asOf, DF.horizon + 60));
}
