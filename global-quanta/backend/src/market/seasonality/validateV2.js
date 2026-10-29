// SEAS-prereg-v2 (29/10/2026) — kiểm định mùa vụ tháng trên dữ liệu CHƯA TỪNG NHÌN (VNDirect 2013–2019), engine SEAS-v1.1 (đặc tả:
// SEAS-prereg-v2.md). Dấu chốt trước `cfg.sign` (+1 = mùa vụ LẶP LẠI — giả thuyết ban đầu). Dùng cho cả MÃ và chỉ số NGÀNH. Hàm thuần.
// (Thay SEAS-REV "đảo chiều ngành" — đã huỷ vì tiền đề là ảo giác của lỗi engine v1.)
// Không phụ thuộc benchmark: IC hạng mặt cắt ngang và long–short không đổi khi trừ cùng một số cho mọi ngành trong tháng; benchmark
// dùng ở đây = bình quân đều lợi suất ngày của các chỉ số ngành (cần cho C5 long-only).
import { forecastsForYear, spearman, bootstrapMeanCi } from "./validate.js";
import { monthlyReturns } from "./monthly.js";

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs) => { const m = mean(xs); return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1)); };

/** Chỉ số bình quân đều (lợi suất ngày TB của các chuỗi có mặt cả hai phiên liền kề) — benchmark "trung bình ngành". */
export function equalWeightIndex(seriesOf) {
  const ret = new Map();
  for (const bars of seriesOf.values()) for (let i = 1; i < bars.length; i++) {
    const r = bars[i].close / bars[i - 1].close - 1;
    if (!Number.isFinite(r)) continue;
    const e = ret.get(bars[i].date) ?? [0, 0]; e[0] += r; e[1]++; ret.set(bars[i].date, e);
  }
  let level = 100;
  return [...ret.keys()].sort().map((d) => { const [s, n] = ret.get(d); level *= 1 + s / n; return { date: d, close: level }; });
}

/** Hồi quy hạng y theo các biến kiểm soát (OLS trên hạng, có hệ số chặn) -> phần dư. */
function residualize(y, controls) {
  const n = y.length, k = controls.length + 1;
  const X = y.map((_, i) => [1, ...controls.map((c) => c[i])]);
  const XtX = Array.from({ length: k }, (_, a) => Array.from({ length: k }, (_, b) => X.reduce((s, r) => s + r[a] * r[b], 0)));
  const Xty = Array.from({ length: k }, (_, a) => X.reduce((s, r, i) => s + r[a] * y[i], 0));
  // Gauss-Jordan
  const M = XtX.map((r, i) => [...r, Xty[i]]);
  for (let c = 0; c < k; c++) {
    let p = c; for (let r = c + 1; r < k; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < k; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let j = c; j <= k; j++) M[r][j] -= f * M[c][j]; }
  }
  const beta = M.map((r, i) => r[k] / r[i]);
  return y.map((v, i) => v - X[i].reduce((s, x, j) => s + x * beta[j], 0));
}
const rankOf = (xs) => { const s = xs.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]); const r = new Array(xs.length); s.forEach(([, i], k) => { r[i] = k + 1; }); return r; };

export function runValidationV2({ seriesOf, sectorOf = null, cfg }) {
  const benchBars = equalWeightIndex(seriesOf);
  const bench = monthlyReturns(benchBars, { asOf: "9999-12-31" }).returns;
  const realized = new Map([...seriesOf].map(([t, b]) => [t, monthlyReturns(b, { asOf: "9999-12-31" }).returns]));
  const ymAdd = (ym, k) => { let y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7)) - 1 + k; y += Math.floor(m / 12); m = ((m % 12) + 12) % 12; return `${y}-${String(m + 1).padStart(2, "0")}`; };
  /** Excess tích luỹ của ngành trong n tháng TRƯỚC ym (kiểm soát cơ chế). */
  const trailing = (t, ym, n) => { let s = 0; for (let k = 1; k <= n; k++) { const p = ymAdd(ym, -k); const r = realized.get(t)?.get(p), rb = bench.get(p); if (r == null || rb == null) return null; s += r - rb; } return s; };

  const months = [];
  for (const Y of cfg.testYears) {
    const fc = forecastsForYear({ seriesOf, sectorOf, benchBars, Y, cfg });
    if (!fc) continue;
    for (let m = 0; m < 12; m++) {
      const ym = `${Y}-${String(m + 1).padStart(2, "0")}`;
      if (ym > cfg.testEnd || !bench.has(ym)) continue;
      const rows = [];
      for (const [t, f] of fc) {
        const r = realized.get(t)?.get(ym);
        if (r == null) continue;
        rows.push({ t, f: f.map((v) => (v == null ? null : cfg.sign * v)), ex: r - bench.get(ym), c12: trailing(t, ym, 12), c1: trailing(t, ym, 1) });
      }
      months.push({ Y, m, ym, rows });
    }
  }
  const cost = cfg.engine.roundTripCost;
  const evaluate = (shift) => months.map(({ Y, m, ym, rows }) => {
    const use = rows.map((r) => ({ ...r, f: r.f[(m + shift) % 12] })).filter((r) => r.f != null);
    if (use.length < cfg.minCrossSection) return { Y, ym, n: use.length, ic: null };
    const ic = spearman(use.map((r) => r.f), use.map((r) => r.ex));
    const s = [...use].sort((a, b) => a.f - b.f), q = Math.floor(s.length / cfg.quantiles);
    const top = mean(s.slice(-q).map((r) => r.ex)), bot = mean(s.slice(0, q).map((r) => r.ex));
    let partialIc = null;
    const ctl = use.filter((r) => r.c12 != null && r.c1 != null);
    if (shift === 0 && ctl.length >= cfg.minCrossSection) {
      const rf = residualize(rankOf(ctl.map((r) => r.f)), [rankOf(ctl.map((r) => r.c12)), rankOf(ctl.map((r) => r.c1))]);
      if (rf) partialIc = spearman(rf, ctl.map((r) => r.ex));
    }
    return { Y, ym, n: use.length, ic, ls: top - bot - 2 * cost, top: top - cost, partialIc };
  });
  const real = evaluate(0).filter((x) => x.ic != null);
  const ics = real.map((x) => x.ic);
  const icMean = ics.length ? mean(ics) : null, icT = ics.length > 2 ? icMean / (sd(ics) / Math.sqrt(ics.length)) : null;
  const byYear = cfg.testYears.map((Y) => { const v = real.filter((x) => x.Y === Y).map((x) => x.ic); return { year: Y, months: v.length, icMean: v.length ? mean(v) : null }; });
  const lss = real.map((x) => x.ls), tops = real.map((x) => x.top);
  const lsCi = lss.length > 2 ? bootstrapMeanCi(lss, cfg.bootstrap) : [null, null];
  const topCi = tops.length > 2 ? bootstrapMeanCi(tops, { ...cfg.bootstrap, seed: cfg.bootstrap.seed + 1 }) : [null, null];
  const placebo = [];
  for (let k = 1; k <= 11; k++) { const v = evaluate(k).filter((x) => x.ic != null).map((x) => x.ic); placebo.push({ shift: k, icMean: v.length ? mean(v) : null }); }
  const rank = 1 + placebo.filter((p) => p.icMean != null && icMean != null && p.icMean >= icMean).length;
  const pics = real.map((x) => x.partialIc).filter((v) => v != null);
  const criteria = {
    C1_ic: { pass: icMean != null && icMean > 0 && icT >= cfg.thresholds.tMin, icMean, t: icT, months: ics.length },
    C2_years: { pass: byYear.filter((y) => y.icMean != null && y.icMean > 0).length >= cfg.thresholds.yearsPositiveMin, byYear },
    C3_longShort: { pass: lss.length > 0 && mean(lss) > 0 && lsCi[0] > 0, mean: lss.length ? mean(lss) : null, ci: lsCi, cost: 2 * cost },
    C4_placebo: { pass: icMean != null && rank === 1, rank, of: 12, placebo },
    C5_longOnly: { pass: tops.length > 0 && mean(tops) > 0 && topCi[0] > 0, mean: tops.length ? mean(tops) : null, ci: topCi, cost, benchmark: "EQUAL_WEIGHT_SECTORS" },
  };
  const verdict = Object.values(criteria).every((c) => c.pass) ? "PASS" : "FAIL";
  return {
    prereg: cfg.prereg, configSha256: cfg.sha256, verdict, label: verdict === "PASS" ? "GẦN ĐẠT (chờ sổ tiến R3)" : "THĂM DÒ (không đạt kiểm định)",
    criteria,
    mechanism: { partialIcMean: pics.length ? mean(pics) : null, partialIcT: pics.length > 2 ? mean(pics) / (sd(pics) / Math.sqrt(pics.length)) : null, months: pics.length,
      controls: ["excess 12 tháng trước", "excess tháng trước"] },
    descriptive: { monthsTested: real.length, avgCrossSection: real.length ? mean(real.map((x) => x.n)) : null },
    monthly: evaluate(0),
  };
}
