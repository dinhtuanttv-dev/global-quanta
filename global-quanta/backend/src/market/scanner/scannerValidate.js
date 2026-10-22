// Q4 — kiểm định đặt trước Smart Score v2 và từng thành phần (SQ-prereg.md). Hàm thuần, chạy cục bộ (scripts/scanner-validate.mjs).
// Chạy ĐÚNG engine production (runScan) tại từng ngày trong quá khứ với dữ liệu chỉ tới ngày đó:
//   nến điều chỉnh cộng dồn (≤ t, 260 phiên), BCTC công bố trước t (quý kết thúc + FA_LAG_DAYS), VN-Index ≤ t.
// Đo IC xếp hạng Spearman theo ngày giữa điểm và lợi suất t -> t+h; khoảng tin cậy bằng bootstrap khối theo ngày.
import { runScan } from "./scanEngine.js";
import { addDays } from "../util.js";

export const SQ_PREREG = Object.freeze({
  id: "SQ-v2-r1",
  horizons: [5, 10, 20],
  primaryHorizon: 20,
  step: 5,                       // ngày tái cân bằng: mỗi 5 phiên
  warmup: 200,                   // phiên tối thiểu trước ngày đầu (MA200)
  history: 260,                  // phiên đưa vào engine (như production)
  faLagDays: 45,                 // BCTC quý dùng được từ (ngày kết thúc quý + 45 ngày) — hạn nộp BCTC hợp nhất
  isEnd: "2024-12-31",           // trong mẫu: đầu -> 31/12/2024; ngoài mẫu: 01/01/2025 -> cuối
  minNames: 30,                  // số mã tối thiểu có điểm trong một ngày
  bootstrap: { iters: 2000, seed: 11 },
  scores: ["smartScore", "faScore", "taScore", "rsRating", "confluenceBoost", "riskAdjustedMomentum"],
  primary: "smartScore",
});

const QEND = ["03-31", "06-30", "09-30", "12-31"];
export const quarterAvailableOn = (q, lag = SQ_PREREG.faLagDays) => addDays(`${q.year}-${QEND[q.quarter - 1]}`, lag);

/** BCTC tại thời điểm `date`: chỉ các quý đã công bố (point-in-time). */
export function pitFundamentals(fa, date, lag = SQ_PREREG.faLagDays) {
  if (!fa) return undefined;
  const cut = (s) => (s?.available ? { ...s, quarters: s.quarters.filter((q) => quarterAvailableOn(q, lag) <= date) } : s);
  const income = cut(fa.income), balance = cut(fa.balance);
  return { ...fa, income: income && { ...income, available: Boolean(income.available && income.quarters.length) }, balance: balance && { ...balance, available: Boolean(balance.available && balance.quarters.length) } };
}

function ranks(xs) {
  const idx = xs.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const r = new Array(xs.length);
  for (let i = 0; i < idx.length;) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
    i = j + 1;
  }
  return r;
}

/** Tương quan hạng Spearman (null nếu < 3 cặp hoặc phương sai 0). */
export function spearman(x, y) {
  const n = x.length;
  if (n < 3) return null;
  const rx = ranks(x), ry = ranks(y);
  const mx = rx.reduce((a, b) => a + b, 0) / n, my = ry.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const a = rx[i] - mx, b = ry[i] - my; sxy += a * b; sxx += a * a; syy += b * b; }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
}

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }

/** Trung bình + CI 95% bootstrap khối (khối = ceil(h / step) ngày liền nhau, do lợi suất chồng lấn). */
export function blockBootstrapMean(xs, block, { iters = 2000, seed = 11 } = {}) {
  const n = xs.length;
  if (!n) return { mean: null, lo: null, hi: null, n: 0 };
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const r = rng(seed), means = [];
  const b = Math.max(1, Math.min(block, n));
  for (let it = 0; it < iters; it++) {
    let s = 0, c = 0;
    while (c < n) { const start = Math.floor(r() * (n - b + 1)); for (let k = 0; k < b && c < n; k++, c++) s += xs[start + k]; }
    means.push(s / n);
  }
  means.sort((a, c) => a - c);
  return { mean, lo: means[Math.floor(0.025 * iters)], hi: means[Math.floor(0.975 * iters) - 1], n };
}

/**
 * @param {{ daily: Record<string, {date, open, high, low, close, volume, value}[]>, indexBars, fundamentals: Map, taxonomy: Record<string,{industry, sectorGroup}> }} input
 */
export function runScannerValidation({ daily, indexBars, fundamentals, taxonomy, prereg = SQ_PREREG }) {
  const symbols = Object.keys(daily).filter((s) => s !== "VNINDEX");
  const pos = new Map(symbols.map((s) => [s, new Map(daily[s].map((b, i) => [b.date, i]))]));
  const dates = indexBars.map((b) => b.date);
  const maxH = Math.max(...prereg.horizons);
  const ics = Object.fromEntries(prereg.scores.map((k) => [k, Object.fromEntries(prereg.horizons.map((h) => [h, []]))]));
  const spreads = Object.fromEntries(prereg.horizons.map((h) => [h, []]));
  const coverage = [];

  for (let di = prereg.warmup; di + maxH < dates.length; di += prereg.step) {
    const date = dates[di];
    const universe = [], barsByTicker = new Map(), fa = new Map();
    for (const s of symbols) {
      const i = pos.get(s).get(date);
      if (i === undefined || i < 60) continue;
      barsByTicker.set(s, daily[s].slice(Math.max(0, i + 1 - prereg.history), i + 1).map((b) => ({ ...b, closeAdj: b.close })));
      fa.set(s, pitFundamentals(fundamentals.get(s), date, prereg.faLagDays));
      universe.push({ ticker: s, sector: null, industry: taxonomy[s]?.industry ?? null, sectorGroup: taxonomy[s]?.sectorGroup ?? null });
    }
    if (universe.length < prereg.minNames) continue;
    let scan;
    try {
      scan = runScan({ universe, barsByTicker, fundamentals: fa, indexBars: indexBars.slice(Math.max(0, di + 1 - 250), di + 1), events: [], foreignNetBuySet: new Set(), eventsAvailable: false, now: new Date(`${date}T09:00:00Z`) });
    } catch { continue; }
    const fwd = (s, h) => { const i = pos.get(s).get(date), b = daily[s]; return b[i + h]?.close > 0 && b[i].close > 0 ? b[i + h].close / b[i].close - 1 : null; };
    coverage.push({ date, names: scan.items.length, withFa: scan.items.filter((x) => x.faScore !== null).length });
    for (const h of prereg.horizons) {
      for (const k of prereg.scores) {
        const pairs = scan.items.map((x) => [k === "confluenceBoost" ? x.confluenceBoost : x[k], fwd(x.ticker, h)]).filter(([a, b]) => a !== null && a !== undefined && b !== null);
        if (pairs.length < prereg.minNames) continue;
        const ic = spearman(pairs.map((p) => p[0]), pairs.map((p) => p[1]));
        if (ic !== null) ics[k][h].push({ date, ic, n: pairs.length });
      }
      // Chênh lệch lợi suất ngũ phân vị trên − dưới theo Smart Score (thông tin phụ).
      const pr = scan.items.map((x) => [x.smartScore, fwd(x.ticker, h)]).filter(([a, b]) => a !== null && b !== null).sort((a, b) => b[0] - a[0]);
      if (pr.length >= prereg.minNames) {
        const q = Math.floor(pr.length / 5), mean = (xs) => xs.reduce((a, b) => a + b[1], 0) / xs.length;
        spreads[h].push({ date, spread: mean(pr.slice(0, q)) - mean(pr.slice(-q)) });
      }
    }
  }

  const summarize = (rows, h) => {
    const block = Math.ceil(h / prereg.step);
    const part = (f) => blockBootstrapMean(rows.filter(f).map((r) => r.ic), block, prereg.bootstrap);
    const r4 = (x) => (x === null ? null : Math.round(x * 1e4) / 1e4);
    const fmt = (m) => ({ mean: r4(m.mean), lo: r4(m.lo), hi: r4(m.hi), dates: m.n });
    return { is: fmt(part((r) => r.date <= prereg.isEnd)), oos: fmt(part((r) => r.date > prereg.isEnd)) };
  };
  const results = {};
  for (const k of prereg.scores) {
    results[k] = {};
    for (const h of prereg.horizons) results[k][h] = summarize(ics[k][h], h);
  }
  const verdict = (k) => {
    const r = results[k][prereg.primaryHorizon];
    return r.oos.dates > 0 && r.oos.lo > 0 && r.is.mean > 0 ? "PASS" : (r.oos.dates < 10 ? "INSUFFICIENT" : "FAIL");
  };
  const spreadSummary = Object.fromEntries(prereg.horizons.map((h) => {
    const m = (f) => { const xs = spreads[h].filter(f).map((r) => r.spread); return xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 1e4) / 1e4 : null; };
    return [h, { is: m((r) => r.date <= prereg.isEnd), oos: m((r) => r.date > prereg.isEnd) }];
  }));
  return {
    prereg: prereg.id, generatedAt: new Date().toISOString(),
    sample: { dates: coverage.length, from: coverage[0]?.date ?? null, to: coverage.at(-1)?.date ?? null, symbols: symbols.length,
      avgNames: coverage.length ? Math.round(coverage.reduce((a, c) => a + c.names, 0) / coverage.length) : 0,
      avgWithFa: coverage.length ? Math.round(coverage.reduce((a, c) => a + c.withFa, 0) / coverage.length) : 0 },
    results, spreadTopBottomQuintile: spreadSummary,
    verdicts: Object.fromEntries(prereg.scores.map((k) => [k, verdict(k)])),
  };
}
