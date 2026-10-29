// MV2 (29/10/2026) — kiểm định ĐĂNG KÝ TRƯỚC `SEAS-prereg-v1` cho mùa vụ tháng (đặc tả: src/market/seasonality/SEAS-prereg.md).
// Hàm thuần: cùng dữ liệu + cùng cấu hình chốt (SHA-256) -> cùng kết quả. Không I/O, không gọi SSI.
//   Dự báo của mã i cho tháng m năm Y = excess ĐÃ CO (SEAS-v1) học trên các năm [max(trainStart, Y−5), Y−1] (mở rộng, ≥ minTrainYears).
//   Thực tế = lợi suất tháng (Y, m) của mã − VN-Index. Mỗi tháng kiểm tra = một cụm (các mã cùng tháng không độc lập).
//   C1: IC Spearman TB > 0 và t ≥ tMin · C2: ≥ yearsPositiveMin năm có IC TB > 0 · C3: long–short ngũ phân vị sau phí > 0, cận dưới
//   KTC (bootstrap theo tháng) > 0 · C4: placebo dịch nhãn tháng k = 1..11 — IC thật đứng thứ nhất trong 12. ĐẠT = cả bốn.
import { createHash } from "node:crypto";
import { analyzeSeasonality } from "./analyze.js";
import { monthlyReturns } from "./monthly.js";
import { mulberry32 } from "./strength.js";

/** SHA-256 của cấu hình (bỏ trường sha256) — cùng quy ước các prereg khác của dự án. */
export function hashConfig(cfg) {
  const { sha256: _ignore, ...rest } = cfg;
  return createHash("sha256").update(JSON.stringify(rest)).digest("hex");
}

function ranks(xs) {
  const idx = xs.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const r = new Array(xs.length);
  for (let k = 0; k < idx.length;) {
    let j = k;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[k][0]) j++;
    const avg = (k + j) / 2 + 1;
    for (let t = k; t <= j; t++) r[idx[t][1]] = avg;
    k = j + 1;
  }
  return r;
}
/** Tương quan hạng Spearman (hạng trung bình cho giá trị bằng nhau). */
export function spearman(x, y) {
  const n = x.length;
  if (n < 3) return null;
  const rx = ranks(x), ry = ranks(y);
  const mx = rx.reduce((a, b) => a + b, 0) / n, my = ry.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sx = 0, sy = 0;
  for (let i = 0; i < n; i++) { sxy += (rx[i] - mx) * (ry[i] - my); sx += (rx[i] - mx) ** 2; sy += (ry[i] - my) ** 2; }
  return sx > 0 && sy > 0 ? sxy / Math.sqrt(sx * sy) : null;
}
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs) => { const m = mean(xs); return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1)); };

/** Bootstrap theo tháng (cụm) cho trung bình: KTC hai phía mức `level`. */
export function bootstrapMeanCi(xs, { iters, seed, level }) {
  const rng = mulberry32(seed), n = xs.length, ms = new Array(iters);
  for (let b = 0; b < iters; b++) { let s = 0; for (let i = 0; i < n; i++) s += xs[Math.floor(rng() * n)]; ms[b] = s / n; }
  ms.sort((a, b) => a - b);
  const lo = ms[Math.floor(((1 - level) / 2) * iters)], hi = ms[Math.min(iters - 1, Math.floor(((1 + level) / 2) * iters))];
  return [lo, hi];
}

/** Dự báo (đã co) cho từng (mã, tháng) của năm kiểm tra Y — chỉ dùng dữ liệu các năm trước Y. */
export function forecastsForYear({ seriesOf, sectorOf, benchBars, Y, cfg }) {
  const years = Math.min(cfg.maxTrainYears, Y - cfg.trainStartYear);
  if (years < cfg.minTrainYears) return null;
  const cut = `${Y}-01-01`;
  // Cắt dữ liệu tới hết năm Y−1 (point-in-time): engine không thấy bất kỳ phiên nào của năm kiểm tra.
  const clip = (bars) => bars.filter((b) => b.date < cut);
  const res = analyzeSeasonality({
    seriesOf: new Map([...seriesOf].map(([t, b]) => [t, clip(b)])), benchBars: clip(benchBars), sectorOf,
    asOf: `${Y}-01-15`, cfg: { ...cfg.engine, years, permutations: 0 },
  });
  return new Map(res.items.map((it) => [it.ticker, it.months.map((m) => m.shrunkExcess)]));
}

/**
 * @param {{ seriesOf: Map, sectorOf: Map|null, benchBars: [], cfg: object }} input — cfg = cấu hình chốt (prereg)
 */
export function runSeasonalityValidation({ seriesOf, sectorOf, benchBars, cfg }) {
  // Tháng thực tế: mọi tháng có phiên cuối ≥ ngày 20; chỉ dùng tới cfg.testEnd (tháng cuối đã đóng trước ngày chốt cấu hình).
  const bench = monthlyReturns(benchBars, { asOf: "9999-12-31" }).returns;
  const realized = new Map([...seriesOf].map(([t, b]) => [t, monthlyReturns(b, { asOf: "9999-12-31" }).returns]));
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
        rows.push({ t, f: f.map((v) => v ?? null), ex: r - bench.get(ym) });
      }
      months.push({ Y, m, ym, rows });
    }
  }

  /** IC + long–short của một phép dịch nhãn tháng (shift 0 = thật). */
  const evaluate = (shift) => months.map(({ Y, m, ym, rows }) => {
    const use = rows.map((r) => ({ f: r.f[(m + shift) % 12], ex: r.ex })).filter((r) => r.f != null);
    if (use.length < cfg.minCrossSection) return { Y, ym, n: use.length, ic: null, ls: null, top: null };
    const ic = spearman(use.map((r) => r.f), use.map((r) => r.ex));
    const s = [...use].sort((a, b) => a.f - b.f), q = Math.floor(s.length / cfg.quantiles);
    const top = mean(s.slice(-q).map((r) => r.ex)), bot = mean(s.slice(0, q).map((r) => r.ex));
    return { Y, ym, n: use.length, ic, ls: top - bot - 2 * cfg.engine.roundTripCost, top: top - cfg.engine.roundTripCost };
  });

  const real = evaluate(0).filter((x) => x.ic != null);
  const ics = real.map((x) => x.ic), lss = real.map((x) => x.ls);
  const icMean = ics.length ? mean(ics) : null;
  const icT = ics.length > 2 ? icMean / (sd(ics) / Math.sqrt(ics.length)) : null;
  const byYear = cfg.testYears.map((Y) => { const v = real.filter((x) => x.Y === Y).map((x) => x.ic); return { year: Y, months: v.length, icMean: v.length ? mean(v) : null }; });
  const lsMean = lss.length ? mean(lss) : null;
  const lsCi = lss.length > 2 ? bootstrapMeanCi(lss, cfg.bootstrap) : [null, null];
  const placebo = [];
  for (let k = 1; k <= 11; k++) { const v = evaluate(k).filter((x) => x.ic != null).map((x) => x.ic); placebo.push({ shift: k, icMean: v.length ? mean(v) : null }); }
  const rank = 1 + placebo.filter((p) => p.icMean != null && icMean != null && p.icMean >= icMean).length;

  const criteria = {
    C1_ic: { pass: icMean != null && icMean > 0 && icT != null && icT >= cfg.thresholds.tMin, icMean, t: icT, months: ics.length },
    C2_years: { pass: byYear.filter((y) => y.icMean != null && y.icMean > 0).length >= cfg.thresholds.yearsPositiveMin, byYear },
    C3_longShort: { pass: lsMean != null && lsMean > 0 && lsCi[0] != null && lsCi[0] > 0, mean: lsMean, ci: lsCi, cost: 2 * cfg.engine.roundTripCost },
    C4_placebo: { pass: icMean != null && rank === 1, rank, of: 12, placebo },
  };
  const verdict = Object.values(criteria).every((c) => c.pass) ? "PASS" : "FAIL";
  const tops = real.map((x) => x.top);
  return {
    prereg: cfg.prereg, configSha256: cfg.sha256, verdict, label: verdict === "PASS" ? "ĐẠT KIỂM ĐỊNH" : "THĂM DÒ",
    criteria,
    descriptive: {
      longOnlyTopNetExcess: tops.length ? { mean: mean(tops), ci: bootstrapMeanCi(tops, cfg.bootstrap) } : null,
      monthsTested: real.length, avgCrossSection: real.length ? mean(real.map((x) => x.n)) : null,
    },
    monthly: evaluate(0),
  };
}
