// Top 20 v2 — kiểm định ĐẶT TRƯỚC T3 (người dùng duyệt 2026-10-10). Xem T3-prereg.md.
// Hai pha (scripts/alpha-validate.mjs): "is" — chạy M1 & M2 walk-forward trên phần trong mẫu, chọn mô hình, chốt cấu hình + SHA-256;
// "oos" — nạp cấu hình chốt (kiểm hash), chạy một lần, xét 6 điều kiện. Hàm thuần — không I/O.
import { createHash } from "node:crypto";
import { factorRows, FACTORS, K, normalizeRows, prepareAlpha, invNorm } from "./factors.js";
import { GB_DEFAULTS, predict, trainLambdaMart } from "./gbrank.js";

export const T3_PREREG = Object.freeze({
  version: "alpha/T3-prereg-2026-10-10",
  step: 5, isFraction: 0.7, embargoDates: 12, minRowsStart: 100, minPerDate: 20,
  topN: 20, maxPerSector: 4, cost: 0.003, minValue: 5e9,
  m1: { lookback: 756, shrink: 0.5, minHistory: 20 },
  m2: { ...GB_DEFAULTS, retrainEvery: 12, lookback: 756, purge: 20, embargo: 20, minGroups: 30 },
  bootstrapIters: 2000, block: 4, placeboPaths: 100, seed: 20261010,
  minOosDates: 40, minOosTickers: 100,
});
const P = T3_PREREG;
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const r4 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 1e4) / 1e4);
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export function spearman(x, y) {
  const n = x.length; if (n < 3) return null;
  const rank = (v) => { const idx = v.map((_, i) => i).sort((a, b) => v[a] - v[b]); const r = new Array(n); for (let k = 0; k < n;) { let j = k; while (j + 1 < n && v[idx[j + 1]] === v[idx[k]]) j++; for (let t = k; t <= j; t++) r[idx[t]] = (k + j) / 2; k = j + 1; } return r; };
  const rx = rank(x), ry = rank(y), m = (n - 1) / 2; let a = 0, b = 0, c = 0;
  for (let i = 0; i < n; i++) { a += (rx[i] - m) * (ry[i] - m); b += (rx[i] - m) ** 2; c += (ry[i] - m) ** 2; }
  return b > 0 && c > 0 ? a / Math.sqrt(b * c) : null;
}

/** Điểm hội tụ HIỆN TẠI (để so sánh, điều kiện 4): RRG ngành + RS 3T + GTGD 20/250 so TT + PVT + A/D, trọng số Risk-On trung lập (50). */
function confluenceScore(it, e, data, quadrantOf, valueMedian) {
  const c = it.c;
  const rs = (Math.exp(Math.log(c[e] / c[e - 63])) - data.cal.closes[it.cal[e]] / data.cal.closes[it.cal[e - 63]]) * 100;
  const rsS = Math.max(0, Math.min(100, ((rs + 20) / 40) * 100));
  let a = 0, b = 0; for (let i = e - 19; i <= e; i++) a += it.val[i]; for (let i = e - 249; i <= e; i++) b += it.val[i];
  const vr = valueMedian > 0 ? ((a / 20) / (b / 250)) / valueMedian : 1;
  const vS = Math.max(0, Math.min(100, ((vr - 0.5) / 2.5) * 100));
  const trend = (series) => { const s = series.slice(-20); const r = Math.max(...s) - Math.min(...s); return r ? ((s[s.length - 1] - s[0]) / r) * 100 : 0; };
  const pvt = [], ad = []; let p = 0, q = 0;
  for (let i = e - 40; i <= e; i++) { const vol = it.val[i] / c[i]; p += vol * ((c[i] - c[i - 1]) / c[i - 1]); const r = it.h[i] - it.l[i]; q += (r > 0 ? ((c[i] - it.l[i]) - (it.h[i] - c[i])) / r : 0) * vol; pvt.push(p); ad.push(q); }
  const qd = { LEADING: 100, IMPROVING: 70, WEAKENING: 40, LAGGING: 10 }[quadrantOf(it.sector, data.cal.dates[it.cal[e]])] ?? 10;
  const w = { rrg: 0.25, rs: 0.275, volume: 0.15, pvt: 0.1625, ad: 0.1625 }; // nội suy Risk-On 50
  return qd * w.rrg + rsS * w.rs + vS * w.volume + ((trend(pvt) + 100) / 2) * w.pvt + ((trend(ad) + 100) / 2) * w.ad;
}

/** Chuẩn bị toàn bộ: dữ liệu, ngày đánh giá, dòng yếu tố đã chuẩn hoá (mỗi ngày), tách IS/OOS. */
export function setup(inputs, { quadrantOf = () => null } = {}) {
  const data = prepareAlpha(inputs);
  const N = data.cal.dates.length, dates = [];
  let start = -1;
  for (let ce = 260; ce < N - 22 && start < 0; ce++) if (factorRows(data, ce, { withOutcomes: false }).length >= P.minRowsStart) start = ce;
  for (let ce = start; ce >= 0 && ce < N - 21; ce += P.step) dates.push(ce);
  const byDate = new Map();
  const itemOf = new Map(data.items.map((x) => [x.ticker, x]));
  for (const ce of dates) {
    const rows = normalizeRows(factorRows(data, ce));
    const vrs = rows.map((r) => r.raw[8]).filter(Number.isFinite).map(Math.exp).sort((a, b) => a - b);
    const vMed = vrs.length ? vrs[vrs.length >> 1] : 1;
    for (const r of rows) {
      const it = itemOf.get(r.ticker);
      r.conf = confluenceScore(it, r.e, data, quadrantOf, vMed);
    }
    byDate.set(ce, rows);
  }
  const nIS = Math.round(dates.length * P.isFraction);
  const isDates = dates.slice(0, Math.max(nIS - P.embargoDates, 0)), oosDates = dates.slice(nIS);
  const market = new Map(dates.map((ce) => { const cl = data.cal.closes; let s = 0; for (let i = ce - 199; i <= ce; i++) s += cl[i]; return [ce, cl[ce] > s / 200]; }));
  return { data, dates, isDates, oosDates, byDate, market };
}

/** IC theo ngày của từng yếu tố (h20) — đầu vào M1. */
export function factorIcByDate(ctx) {
  const out = new Map();
  for (const ce of ctx.dates) {
    const rows = ctx.byDate.get(ce).filter((r) => r.y.h20 != null);
    if (rows.length < P.minPerDate) continue;
    const y = rows.map((r) => r.y.h20);
    out.set(ce, Array.from({ length: K }, (_, k) => spearman(rows.map((r) => r.z[k]), y) ?? 0));
  }
  return out;
}

/** M1 — tổ hợp theo IC 36 tháng trước (chỉ ngày đã biết kết quả: ce_j + 21 < ce), co 50% về trọng số đều. */
export function m1Weights(icByDate, ce) {
  const past = [...icByDate.entries()].filter(([cj]) => cj + 21 < ce && cj >= ce - P.m1.lookback).map(([, v]) => v);
  if (past.length < P.m1.minHistory) return new Array(K).fill(1 / K);
  const ic = Array.from({ length: K }, (_, k) => mean(past.map((v) => v[k])));
  const s = ic.reduce((a, b) => a + Math.abs(b), 0) || 1;
  return ic.map((x) => P.m1.shrink * (x / s) + (1 - P.m1.shrink) * (1 / K));
}

/** Điểm từng mô hình cho các ngày `dates` (đi tới, không nhìn trước). Trả Map(ce -> Map(ticker -> { M1, M2, conf, mom })). */
export function scoreModels(ctx, dates, { onProgress } = {}) {
  const icByDate = factorIcByDate(ctx);
  const out = new Map(); let model = null, lastTrain = -Infinity, trainedAt = null;
  const grade = (rows) => { const ord = rows.map((r, i) => i).sort((a, b) => rows[a].y.h20 - rows[b].y.h20); const g = new Array(rows.length); ord.forEach((i, k) => (g[i] = Math.min(4, Math.floor((5 * k) / rows.length)))); return g; };
  dates.forEach((ce, di) => {
    if (di - lastTrain >= P.m2.retrainEvery || model === null) {
      const groups = [];
      for (const cj of ctx.dates) {
        if (!(cj + 21 + P.m2.embargo <= ce && cj >= ce - P.m2.lookback)) continue;
        const rows = ctx.byDate.get(cj).filter((r) => r.y.h20 != null);
        if (rows.length < P.minPerDate) continue;
        groups.push({ X: rows.map((r) => r.z), labels: grade(rows) });
      }
      model = groups.length >= P.m2.minGroups ? trainLambdaMart(groups, P.m2) : { trees: [], lr: 0, fallback: true };
      lastTrain = di; trainedAt = ce;
    }
    const w = m1Weights(icByDate, ce);
    const m = new Map();
    for (const r of ctx.byDate.get(ce)) {
      const m1 = r.z.reduce((s, z, k) => s + z * w[k], 0);
      // M2 chưa đủ 30 ngày huấn luyện -> dùng điểm trọng số đều (ghi rõ trong báo cáo)
      const m2 = model.fallback ? r.z.reduce((s, z) => s + z, 0) / K : predict(model, r.z);
      m.set(r.ticker, { M1: m1, M2: m2, conf: r.conf, mom: r.raw[1] });
    }
    out.set(ce, m);
    onProgress?.(di + 1, dates.length, trainedAt);
  });
  return out;
}

/** Chọn Top N tối đa `maxPerSector` mã / ngành theo điểm giảm dần. */
export function pickTop(rows, scoreOf, { topN = P.topN, maxPerSector = P.maxPerSector } = {}) {
  const ord = [...rows].filter((r) => Number.isFinite(scoreOf(r))).sort((a, b) => scoreOf(b) - scoreOf(a));
  const per = new Map(), out = [];
  for (const r of ord) { if (out.length >= topN) break; const s = r.sector ?? `_${r.ticker}`; if ((per.get(s) ?? 0) >= maxPerSector) continue; per.set(s, (per.get(s) ?? 0) + 1); out.push(r); }
  return out;
}

/**
 * Mô phỏng danh mục cân bằng mỗi 5 phiên: lợi suất vượt VN-Index 5 phiên (vào đóng cửa t+1) của Top 20 đều tỷ trọng,
 * trừ phí 0,3% × tỷ lệ mã thay mới; chuẩn = TB cả universe thanh khoản. Kèm placebo cùng số mã thay mới, cùng trần ngành.
 */
export function simulate(ctx, dates, scores, key, { placebo = true } = {}) {
  let held = new Set();
  const rand = rng(P.seed ^ key.length);
  let plc = Array.from({ length: P.placeboPaths }, () => new Set());
  const periods = [];
  for (const ce of dates) {
    const rows = ctx.byDate.get(ce).filter((r) => r.y.h5 != null);
    if (rows.length < P.minPerDate) continue;
    const sc = scores.get(ce);
    const top = pickTop(rows, (r) => sc.get(r.ticker)?.[key]);
    const nextSet = new Set(top.map((r) => r.ticker));
    const replaced = [...nextSet].filter((t) => !held.has(t)).length;
    const turnover = replaced / P.topN;
    const y = new Map(rows.map((r) => [r.ticker, r.y.h5]));
    const secOf = new Map(rows.map((r) => [r.ticker, r.sector]));
    const gross = mean(top.map((r) => r.y.h5));
    const net = gross - P.cost * turnover;
    const uni = mean(rows.map((r) => r.y.h5));
    let plcNet = null;
    if (placebo) {
      const vals = [];
      plc = plc.map((set) => {
        // giữ lại các mã còn trong universe, thay ngẫu nhiên đúng `replaced` mã (tối thiểu để đủ 20), trần ngành 4
        const alive = [...set].filter((t) => y.has(t));
        const keepN = Math.max(0, Math.min(alive.length, P.topN - replaced));
        for (let i = alive.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [alive[i], alive[j]] = [alive[j], alive[i]]; }
        const kept = alive.slice(0, keepN);
        const per = new Map(); const out = new Set(kept);
        for (const t of kept) { const s = secOf.get(t) ?? `_${t}`; per.set(s, (per.get(s) ?? 0) + 1); }
        const pool = rows.filter((r) => !out.has(r.ticker));
        let guard = 0;
        while (out.size < P.topN && guard++ < 5000 && pool.length) {
          const r = pool[Math.floor(rand() * pool.length)]; const s = r.sector ?? `_${r.ticker}`;
          if (out.has(r.ticker) || (per.get(s) ?? 0) >= P.maxPerSector) continue;
          out.add(r.ticker); per.set(s, (per.get(s) ?? 0) + 1);
        }
        const newCount = [...out].filter((t) => !set.has(t)).length;
        vals.push(mean([...out].map((t) => y.get(t))) - P.cost * (newCount / P.topN));
        return out;
      });
      plcNet = mean(vals);
    }
    periods.push({ ce, date: ctx.data.cal.dates[ce], gross, net, uni, spread: net - uni, turnover, placebo: plcNet, tickers: [...nextSet] });
    held = nextSet;
  }
  return periods;
}

/** IC theo ngày của điểm mô hình với kết quả h. */
export function icSeries(ctx, dates, scores, key, h = "h20", filter = () => true) {
  const out = [];
  for (const ce of dates) {
    if (!filter(ce)) continue;
    const rows = ctx.byDate.get(ce).filter((r) => r.y[h] != null);
    if (rows.length < P.minPerDate) continue;
    const sc = scores.get(ce);
    const ic = spearman(rows.map((r) => sc.get(r.ticker)[key]), rows.map((r) => r.y[h]));
    if (ic != null) out.push(ic);
  }
  return out;
}

/** Bootstrap khối liên tiếp — KTC 95% & p một phía (H0: TB ≤ 0); < 3 khối -> thiếu mẫu. */
export function blockBootstrap(xs, { iters = P.bootstrapIters, block = P.block, seed = P.seed } = {}) {
  const n = xs.length; if (!n) return { n: 0 };
  if (n < 3 * block) return { n, mean: r4(mean(xs)), lo: null, hi: null, pOneSided: null, insufficient: true };
  const rand = rng(seed), ms = [];
  for (let b = 0; b < iters; b++) { let s = 0, k = 0; while (k < n) { const st = Math.floor(rand() * n); for (let j = 0; j < block && k < n; j++, k++) s += xs[(st + j) % n]; } ms.push(s / n); }
  ms.sort((a, b) => a - b);
  return { n, mean: r4(mean(xs)), lo: r4(ms[Math.floor(0.025 * iters)]), hi: r4(ms[Math.floor(0.975 * iters)]), pOneSided: r4(ms.filter((m) => m <= 0).length / iters) };
}

const normCdf = (x) => { const t = 1 / (1 + 0.2316419 * Math.abs(x)); const d = 0.3989423 * Math.exp(-x * x / 2); const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return x > 0 ? 1 - p : p; };
function moments(xs) { const n = xs.length, m = mean(xs); let s2 = 0, s3 = 0, s4 = 0; for (const x of xs) { const d = x - m; s2 += d * d; s3 += d ** 3; s4 += d ** 4; } const sd = Math.sqrt(s2 / n); return { m, sd, skew: sd ? s3 / n / sd ** 3 : 0, kurt: sd ? s4 / n / sd ** 4 : 3 }; }

/** Deflated Sharpe (Bailey & López de Prado 2014): SR0 = kỳ vọng SR lớn nhất của N thử nghiệm dưới H0. */
export function deflatedSharpe(xs, { nTrials, srVariance }) {
  const { m, sd, skew, kurt } = moments(xs); const T = xs.length;
  const sr = sd > 0 ? m / sd : 0;
  const g = 0.5772156649, N = Math.max(nTrials, 2);
  const sr0 = Math.sqrt(Math.max(srVariance, 0)) * ((1 - g) * invNorm(1 - 1 / N) + g * invNorm(1 - 1 / (N * Math.E)));
  const denom = Math.sqrt(Math.max(1 - skew * sr + ((kurt - 1) / 4) * sr * sr, 1e-9));
  return { sr: r4(sr), sr0: r4(sr0), deflated: r4(sr - sr0), prob: r4(normCdf(((sr - sr0) * Math.sqrt(T - 1)) / denom)), T };
}

export function holm(tests, alpha = 0.05) {
  const sorted = [...tests].filter((t) => t.p != null).sort((a, b) => a.p - b.p); let stop = false;
  return sorted.map((t, k) => { const thr = alpha / (sorted.length - k); const rej = !stop && t.p <= thr; if (!rej) stop = true; return { ...t, threshold: r4(thr), reject: rej }; });
}

export function hashConfig(cfg) { const { sha256: _x, ...rest } = cfg; return createHash("sha256").update(JSON.stringify(rest)).digest("hex"); }

function summarize(ctx, dates, scores, key) {
  const ic = icSeries(ctx, dates, scores, key);
  const sim = simulate(ctx, dates, scores, key);
  return { ic: blockBootstrap(ic), icSeries: ic, sim, spread: blockBootstrap(sim.map((p) => p.spread)), vsPlacebo: blockBootstrap(sim.map((p) => p.net - p.placebo)), turnover: r4(mean(sim.map((p) => p.turnover))) };
}

/** Pha IS: M1 & M2 walk-forward trên ngày trong mẫu; chọn mô hình theo IC trong mẫu; chốt cấu hình. */
export function runInSample(ctx, { onProgress } = {}) {
  const scores = scoreModels(ctx, ctx.isDates, { onProgress });
  const m1 = summarize(ctx, ctx.isDates, scores, "M1"), m2 = summarize(ctx, ctx.isDates, scores, "M2");
  const chosen = (m2.ic.mean ?? -9) > (m1.ic.mean ?? -9) ? "M2" : "M1";
  const srOf = (s) => { const x = s.sim.map((p) => p.spread); const mo = moments(x); return mo.sd ? mo.m / mo.sd : 0; };
  const srs = [srOf(m1), srOf(m2)], srMean = mean(srs);
  const frozen = {
    prereg: P.version, rules: P, factors: FACTORS.map((f) => f.key), chosen, nTrials: 2,
    srVariance: srs.reduce((a, s) => a + (s - srMean) ** 2, 0) / (srs.length - 1),
    isDates: [ctx.data.cal.dates[ctx.isDates[0]], ctx.data.cal.dates[ctx.isDates.at(-1)]],
    oosDates: [ctx.data.cal.dates[ctx.oosDates[0]], ctx.data.cal.dates[ctx.oosDates.at(-1)]],
    isIc: { M1: m1.ic.mean, M2: m2.ic.mean },
  };
  frozen.sha256 = hashConfig(frozen);
  const brief = (s) => ({ ic: s.ic, spread: s.spread, vsPlacebo: s.vsPlacebo, turnover: s.turnover });
  return { frozen, inSample: { M1: brief(m1), M2: brief(m2) } };
}

/** Pha OOS — một lần, cấu hình chốt. */
export function runOutOfSample(ctx, frozen, { onProgress } = {}) {
  if (hashConfig(frozen) !== frozen.sha256) throw new Error("Cấu hình chốt bị sửa (hash không khớp).");
  const all = [...ctx.isDates, ...ctx.oosDates];
  const scores = scoreModels(ctx, all, { onProgress }); // mô hình đi tới cả giai đoạn; chỉ đo trên OOS
  const key = frozen.chosen, D = ctx.oosDates;
  const main = summarize(ctx, D, scores, key);
  const conf = simulate(ctx, D, scores, "conf", { placebo: false }), mom = simulate(ctx, D, scores, "mom", { placebo: false });
  const vsConf = blockBootstrap(main.sim.map((p, i) => p.net - conf[i].net)), vsMom = blockBootstrap(main.sim.map((p, i) => p.net - mom[i].net));
  const dsr = deflatedSharpe(main.sim.map((p) => p.spread), frozen);
  const tickers = new Set(D.flatMap((ce) => ctx.byDate.get(ce).map((r) => r.ticker))).size;
  const isIc = frozen.isIc[key];
  const checks = [
    { id: 1, name: `IC hạng ${key} > 0, cận dưới KTC > 0`, pass: main.ic.mean > 0 && main.ic.lo > 0, value: main.ic },
    { id: 2, name: "Top 20 − universe thanh khoản, sau phí: TB > 0, cận dưới > 0", pass: main.spread.mean > 0 && main.spread.lo > 0, value: main.spread },
    { id: 3, name: "Top 20 hơn placebo cùng ràng buộc, cận dưới > 0", pass: main.vsPlacebo.mean > 0 && main.vsPlacebo.lo > 0, value: main.vsPlacebo },
    { id: 4, name: "Top 20 hơn điểm hội tụ hiện tại VÀ momentum 6-1 (cùng Top 20, cùng phí)", pass: vsConf.mean > 0 && vsMom.mean > 0, value: { vsConfluence: vsConf, vsMomentum: vsMom } },
    { id: 5, name: "Deflated Sharpe > 0 (SR − SR0 > 0)", pass: dsr.deflated > 0, value: dsr },
    { id: 6, name: `IC trong mẫu > 0; OOS ≥ ${P.minOosDates} ngày & ≥ ${P.minOosTickers} mã`, pass: isIc > 0 && main.ic.n >= P.minOosDates && tickers >= P.minOosTickers, value: { isIc, oosDates: main.ic.n, tickers } },
  ];
  const passed = checks.every((c) => c.pass);
  // ---- mô tả thêm (Holm)
  const groupScore = (g) => { const ks = FACTORS.map((f, k) => (f.group === g ? k : -1)).filter((k) => k >= 0); const m = new Map(); for (const ce of D) { const mm = new Map(); for (const r of ctx.byDate.get(ce)) mm.set(r.ticker, { g: ks.reduce((s, k) => s + r.z[k], 0) / ks.length }); m.set(ce, mm); } return m; };
  const sec = [];
  for (const g of ["price", "flow", "fund", "sector"]) sec.push({ name: `IC nhóm ${g}`, ...blockBootstrap(icSeries(ctx, D, groupScore(g), "g")) });
  for (const h of ["h10", "h40", "h60"]) sec.push({ name: `IC ${key} kỳ hạn ${h.slice(1)} phiên`, ...blockBootstrap(icSeries(ctx, D, scores, key, h)) });
  sec.push({ name: `IC ${key} khi VN-Index trên MA200`, ...blockBootstrap(icSeries(ctx, D, scores, key, "h20", (ce) => ctx.market.get(ce))) });
  sec.push({ name: `IC ${key} khi VN-Index dưới MA200`, ...blockBootstrap(icSeries(ctx, D, scores, key, "h20", (ce) => !ctx.market.get(ce))) });
  const other = key === "M1" ? "M2" : "M1";
  sec.push({ name: `IC ${other} (mô hình không chọn)`, ...blockBootstrap(icSeries(ctx, D, scores, other)) });
  let cum = 0, peak = 0, mdd = 0; for (const p of main.sim) { cum += p.spread; peak = Math.max(peak, cum); mdd = Math.min(mdd, cum - peak); }
  return {
    prereg: P.version, configSha256: frozen.sha256, chosen: key, verdict: passed ? "PASS" : "FAIL", label: passed ? "ĐÃ KIỂM ĐỊNH" : "EXPERIMENTAL",
    checks, outOfSample: { ic: main.ic, spread: main.spread, vsPlacebo: main.vsPlacebo, vsConfluence: vsConf, vsMomentum: vsMom, dsr, turnover: main.turnover, maxDrawdownSpread: r4(mdd), periods: main.sim.length },
    secondary: [...holm(sec.filter((s) => s.pOneSided != null).map((s) => ({ name: s.name, mean: s.mean, lo: s.lo, hi: s.hi, n: s.n, p: s.pOneSided }))), ...sec.filter((s) => s.pOneSided == null).map((s) => ({ name: s.name, mean: s.mean, n: s.n, p: null, note: "thiếu mẫu" }))],
    lastPortfolio: main.sim.at(-1) ?? null,
    limitations: [
      "Universe hiện tại (thiên lệch sống sót).",
      "BCTC: số liệu là bản điều chỉnh mới nhất của VNDirect; thời điểm dùng = ngày tạo bản ghi đầu (≈ ngày công bố).",
      "Điểm hội tụ so sánh dùng trọng số Risk-On trung lập (50) vì không có lịch sử DXY/VIX/US10Y theo ngày.",
      "Lee–Ready chưa đủ lịch sử để kiểm định — chỉ đưa vào sổ theo dõi thực tế (T5).",
    ],
  };
}
