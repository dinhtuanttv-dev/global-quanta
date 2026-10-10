// Cycle Fingerprint v2 — kiểm định ĐẶT TRƯỚC CF3 (người dùng duyệt 2026-10-10). Xem CF3-prereg.md.
//
// Hai pha, chạy bằng scripts/cycles-validate.mjs trên chuỗi ADJUSTED_CUMULATIVE của Gateway (chỉ đọc):
//   pha "is"  : hiệu chỉnh (σ bối cảnh, phân phối khoảng cách cặp ngẫu nhiên, ngưỡng nhóm biến động), chọn {λ, hMult}
//               theo IC trong mẫu trên lưới cố định, tính phần dư conformal -> cấu hình CHỐT + SHA-256.
//   pha "oos" : nạp cấu hình chốt (kiểm hash), chạy ngoài mẫu MỘT lần, xét 6 điều kiện ĐẠT.
// Hàm thuần — không I/O.
import { createHash } from "node:crypto";
import { dtwBand, rng, spearman } from "./core.js";
import { buildCalendar, buildLibrary, eligiblePrefix, excessLog, HORIZONS, prepareSeries, windowFeatures } from "./library.js";
import { candidatePool, ENGINE_DEFAULTS, forecastFromPool, placeboForecast } from "./engine.js";

export const CF3_PREREG = Object.freeze({
  version: "cycles/CF3-prereg-2026-10-10",
  W: 30, M: 10, stride: 2, minValue: 5e9, step: 5, isFraction: 0.7, embargoDates: 12, minLibrary: 3000, minPerDate: 20,
  horizon: 20, primaryH: 1, // chỉ số của 20 trong HORIZONS
  grid: { lambda: [0, 0.25, 1], hMult: [0.5, 1, 2] },
  cost: 0.003, coverageBand: [0.75, 0.85], interval: [0.1, 0.9],
  minOosDates: 40, minOosTickers: 100, bootstrapIters: 2000, block: 4, nullPairs: 20000, seed: 20261010,
  secondaryW: [20, 60],
});
const P = CF3_PREREG;
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const r4 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 1e4) / 1e4);

/** Chuẩn bị chung: lịch, chuỗi, thư viện, danh sách ngày truy vấn và tách IS/OOS. */
export function setup(seriesOf, sectorOf, { W = P.W } = {}) {
  const bench = seriesOf.get("VNINDEX");
  if (!bench) throw new Error("Thiếu VNINDEX.");
  const cal = buildCalendar(bench);
  const rest = new Map([...seriesOf].filter(([k]) => k !== "VNINDEX"));
  const prep = prepareSeries({ seriesOf: rest, sectorOf, cal });
  const lib = buildLibrary(prep, cal, { W, M: P.M, stride: P.stride, minValue: P.minValue });
  const last = cal.dates.length - 1 - (1 + P.horizon);
  let start = 0; while (start < cal.dates.length && eligiblePrefix(lib, start) < P.minLibrary) start++;
  const dates = []; for (let c = start; c <= last; c += P.step) dates.push(c);
  const nIS = Math.round(dates.length * P.isFraction);
  const is = dates.slice(0, Math.max(nIS - P.embargoDates, 0)), oos = dates.slice(nIS);
  const posOf = prep.prepared.map((s) => new Map(Array.from(s.cal, (c, e) => [c, e])));
  return { cal, prep, lib, dates, is, oos, posOf };
}

/** Hiệu chỉnh trong mẫu: σ bối cảnh, phân vị khoảng cách cặp ngẫu nhiên theo λ, ngưỡng tam phân nhóm biến động. */
export function calibrate(ctx, isEndCal) {
  const { lib } = ctx; const { C, W } = lib;
  const L = eligiblePrefix(lib, isEndCal);
  const mu = new Array(C).fill(0), sd = new Array(C).fill(0);
  for (let i = 0; i < L; i++) for (let c = 0; c < C; c++) mu[c] += lib.ctx[i * C + c];
  for (let c = 0; c < C; c++) mu[c] /= Math.max(L, 1);
  for (let i = 0; i < L; i++) for (let c = 0; c < C; c++) sd[c] += (lib.ctx[i * C + c] - mu[c]) ** 2;
  const ctxSd = sd.map((v) => Math.sqrt(v / Math.max(L - 1, 1)) || 1);
  const vol = []; for (let i = 0; i < L; i++) vol.push(lib.ctx[i * C]);
  vol.sort((a, b) => a - b);
  const volCuts = [vol[Math.floor(vol.length / 3)], vol[Math.floor((2 * vol.length) / 3)]];
  // cặp ngẫu nhiên -> d_shape, d_ctx
  const rand = rng(P.seed), r = Math.max(1, Math.ceil(ENGINE_DEFAULTS.band * W));
  const a = new Float64Array(W), b = new Float64Array(W), buf = { prev: new Float64Array(W + 1), cur: new Float64Array(W + 1) };
  const pairs = [];
  for (let k = 0; k < P.nullPairs && L > 1; k++) {
    const i = Math.floor(rand() * L), j = Math.floor(rand() * L);
    if (i === j) continue;
    for (let t = 0; t < W; t++) { a[t] = lib.z[i * W + t]; b[t] = lib.z[j * W + t]; }
    const ds = dtwBand(a, b, r, Infinity, buf);
    let s = 0; for (let c = 0; c < C; c++) { const d = (lib.ctx[i * C + c] - lib.ctx[j * C + c]) / ctxSd[c]; s += d * d; }
    pairs.push([ds, Math.sqrt(s / C)]);
  }
  const nullByLambda = {};
  for (const lam of P.grid.lambda) {
    const ds = pairs.map(([x, y]) => Math.sqrt(x * x + lam * y * y)).sort((p, q) => p - q);
    const q = (p) => ds[Math.min(ds.length - 1, Math.floor(p * ds.length))];
    nullByLambda[lam] = { q05: q(0.05), q50: q(0.5), quantiles: Array.from({ length: 201 }, (_, k) => r4(q(k / 200))) };
  }
  return { libraryN: L, ctxMean: mu.map(r4), ctxSd: ctxSd.map(r4), volCuts: volCuts.map(r4), nullByLambda };
}

const volBucket = (v, cuts) => (v <= cuts[0] ? 0 : v <= cuts[1] ? 1 : 2);

/**
 * Chạy truy vấn cho các ngày `dates` với danh sách cấu hình `configs` [{lambda,hMult}] — trả một dòng / (mã, ngày).
 * Mỗi dòng: thực tế (y theo HORIZONS), momentum, nhóm biến động, dự báo từng cấu hình (+ placebo, + chỉ cùng ngành cho cấu hình 0).
 */
export function runQueries(ctx, cal0, dates, configs, { onProgress } = {}) {
  const { lib, prep, cal, posOf } = ctx;
  const rows = [];
  const scratch = { pd: new Float64Array(lib.N) };
  dates.forEach((c, di) => {
    const L = eligiblePrefix(lib, c);
    prep.prepared.forEach((s, tid) => {
      const e = posOf[tid].get(c);
      if (e == null || e < 251 || e + 1 + P.horizon >= s.closes.length) return;
      let v = 0; for (let i = e - 59; i <= e; i++) v += s.values[i] > 0 ? s.values[i] : 0;
      if (v / 60 < P.minValue) return;
      const f = windowFeatures(s, e, { W: lib.W, M: lib.M, cal, sectorMedian: prep.sectorMedian });
      if (!f) return;
      const sid = s.sector == null ? -1 : lib.sectors.indexOf(s.sector);
      const q = { ...f, sid };
      const pool = candidatePool(lib, q, L, { ctxSd: cal0.ctxSd, scratch });
      const act = HORIZONS.map((h) => excessLog(s, e, h, cal));
      const preds = configs.map(({ lambda, hMult }) => {
        const fc = forecastFromPool(lib, L, pool, { lambda, hMult, h0: cal0.nullByLambda[lambda].q05 });
        return { pred: fc.pred, pUp: fc.pUp, nEff: fc.nEff, ws: fc.ws, avgD: mean(fc.dist) };
      });
      const p0 = preds[0];
      const plc = placeboForecast(lib, L, p0.ws, (P.seed ^ (tid * 7919) ^ (c * 104729)) >>> 0);
      // chỉ cùng ngành (mô tả): pool lọc same=1
      let sector = null;
      if (sid >= 0) {
        const keep = []; pool.same.forEach((x, k) => { if (x) keep.push(k); });
        if (keep.length >= 10) {
          const sub = { idx: keep.map((k) => pool.idx[k]), dShape: Float64Array.from(keep, (k) => pool.dShape[k]), dCtx: Float64Array.from(keep, (k) => pool.dCtx[k]), same: new Uint8Array(keep.length) };
          sector = forecastFromPool(lib, L, sub, { lambda: configs[0].lambda, hMult: configs[0].hMult, h0: cal0.nullByLambda[configs[0].lambda].q05 }).pred;
        }
      }
      rows.push({
        c, date: cal.dates[c], ticker: s.ticker, act, market: cal.market[c],
        ret5: Math.log(s.closes[e] / s.closes[e - 5]), ret20: Math.log(s.closes[e] / s.closes[e - 20]), ret60: Math.log(s.closes[e] / s.closes[e - 60]),
        vb: volBucket(f.ctx[0], cal0.volCuts),
        preds: preds.map(({ pred, pUp, nEff, avgD }) => ({ pred, pUp, nEff, avgD })), placebo: plc.pred, placeboUp: plc.pUp, sector,
      });
    });
    onProgress?.(di + 1, dates.length);
  });
  return rows;
}

/** Nhóm dòng theo ngày lịch. */
function byDate(rows) { const m = new Map(); for (const r of rows) { if (!m.has(r.c)) m.set(r.c, []); m.get(r.c).push(r); } return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v); }

/** Chuỗi IC theo ngày cho hàm điểm `score(row)` và thực tế h. */
export function icSeries(rows, score, h = P.primaryH) {
  const out = [];
  for (const g of byDate(rows)) {
    const ok = g.filter((r) => r.act[h] != null && Number.isFinite(score(r)));
    if (ok.length < P.minPerDate) continue;
    const ic = spearman(ok.map(score), ok.map((r) => r.act[h]));
    if (ic != null) out.push(ic);
  }
  return out;
}

/** Bootstrap khối liên tiếp (block = 4 ngày truy vấn ≈ 20 phiên, khớp chồng lấn kỳ hạn) — KTC 95% & p một phía (H0: TB ≤ 0). */
export function blockBootstrap(xs, { iters = P.bootstrapIters, block = P.block, seed = P.seed } = {}) {
  const n = xs.length; if (!n) return { n: 0 };
  const rand = rng(seed), ms = [];
  for (let b = 0; b < iters; b++) {
    let s = 0, k = 0;
    while (k < n) { const st = Math.floor(rand() * n); for (let j = 0; j < block && k < n; j++, k++) s += xs[(st + j) % n]; }
    ms.push(s / n);
  }
  ms.sort((a, b) => a - b);
  return { n, mean: r4(mean(xs)), lo: r4(ms[Math.floor(0.025 * iters)]), hi: r4(ms[Math.floor(0.975 * iters)]), pOneSided: r4(ms.filter((m) => m <= 0).length / iters) };
}

/** Phần dư conformal (thực tế − dự báo, h chính) theo nhóm biến động -> phân vị [10%, 90%]. */
export function conformalQuantiles(rows, cfgIdx = 0) {
  const by = [[], [], []];
  for (const r of rows) if (r.act[P.primaryH] != null) by[r.vb].push(r.act[P.primaryH] - r.preds[cfgIdx].pred[P.primaryH]);
  return by.map((xs) => { xs.sort((a, b) => a - b); const q = (p) => xs[Math.min(xs.length - 1, Math.max(0, Math.ceil(p * (xs.length + 1)) - 1))]; return { n: xs.length, lo: r4(q(P.interval[0])), hi: r4(q(P.interval[1])) }; });
}

/** IC từng phần: phần dư hạng dự báo sau khi hồi quy (OLS) lên hạng momentum 20/60 & đảo chiều 5 phiên, theo từng ngày. */
function partialIcSeries(rows, cfgIdx) {
  const out = [];
  const rank = (v) => { const idx = v.map((_, i) => i).sort((a, b) => v[a] - v[b]); const r = new Array(v.length); idx.forEach((i, k) => (r[i] = k / Math.max(v.length - 1, 1) - 0.5)); return r; };
  for (const g of byDate(rows)) {
    const ok = g.filter((r) => r.act[P.primaryH] != null);
    if (ok.length < P.minPerDate) continue;
    const y = rank(ok.map((r) => r.preds[cfgIdx].pred[P.primaryH]));
    const X = [rank(ok.map((r) => r.ret20)), rank(ok.map((r) => r.ret60)), rank(ok.map((r) => r.ret5))];
    // OLS 3 biến (đã tâm hoá) bằng phương trình chuẩn
    const A = X.map((a) => X.map((b) => a.reduce((s, v, i) => s + v * b[i], 0)));
    const bv = X.map((a) => a.reduce((s, v, i) => s + v * y[i], 0));
    const beta = solve3(A, bv);
    const res = y.map((v, i) => v - beta[0] * X[0][i] - beta[1] * X[1][i] - beta[2] * X[2][i]);
    const ic = spearman(res, ok.map((r) => r.act[P.primaryH]));
    if (ic != null) out.push(ic);
  }
  return out;
}
function solve3(A, b) {
  const M = A.map((r, i) => [...r, b[i]]);
  for (let i = 0; i < 3; i++) {
    let p = i; for (let k = i + 1; k < 3; k++) if (Math.abs(M[k][i]) > Math.abs(M[p][i])) p = k;
    [M[i], M[p]] = [M[p], M[i]];
    if (Math.abs(M[i][i]) < 1e-12) return [0, 0, 0];
    for (let k = 0; k < 3; k++) if (k !== i) { const f = M[k][i] / M[i][i]; for (let j = i; j < 4; j++) M[k][j] -= f * M[i][j]; }
  }
  return M.map((r, i) => r[3] / r[i]);
}

/** Holm–Bonferroni trên danh sách {name, p}. */
export function holm(tests, alpha = 0.05) {
  const sorted = [...tests].filter((t) => t.p != null).sort((a, b) => a.p - b.p);
  let stop = false;
  return sorted.map((t, k) => { const thr = alpha / (sorted.length - k); const pass = !stop && t.p <= thr; if (!pass) stop = true; return { ...t, threshold: r4(thr), reject: pass }; });
}

/** Thước đo đầy đủ cho một tập dòng với cấu hình cfgIdx. */
export function metrics(rows, cfgIdx, { p0, conformal }) {
  const H = P.primaryH;
  const icE = icSeries(rows, (r) => r.preds[cfgIdx].pred[H]);
  const icP = icSeries(rows, (r) => r.placebo[H]);
  // chênh IC engine − placebo theo cùng ngày
  const diff = [];
  for (const g of byDate(rows)) {
    const ok = g.filter((r) => r.act[H] != null); if (ok.length < P.minPerDate) continue;
    const a = spearman(ok.map((r) => r.preds[cfgIdx].pred[H]), ok.map((r) => r.act[H])), b = spearman(ok.map((r) => r.placebo[H]), ok.map((r) => r.act[H]));
    if (a != null && b != null) diff.push(a - b);
  }
  const valid = rows.filter((r) => r.act[H] != null);
  const brier = mean(valid.map((r) => (r.preds[cfgIdx].pUp[H] - (r.act[H] > 0 ? 1 : 0)) ** 2));
  const brierBase = mean(valid.map((r) => (p0 - (r.act[H] > 0 ? 1 : 0)) ** 2));
  const spread = [];
  for (const g of byDate(rows)) {
    const ok = g.filter((r) => r.act[H] != null); if (ok.length < P.minPerDate) continue;
    ok.sort((a, b) => a.preds[cfgIdx].pred[H] - b.preds[cfgIdx].pred[H]);
    const k = Math.max(1, Math.floor(ok.length * 0.2));
    spread.push(mean(ok.slice(-k).map((r) => r.act[H])) - mean(ok.slice(0, k).map((r) => r.act[H])) - P.cost);
  }
  const cover = conformal ? mean(valid.map((r) => { const q = conformal[r.vb]; const p = r.preds[cfgIdx].pred[H]; return r.act[H] >= p + q.lo && r.act[H] <= p + q.hi ? 1 : 0; })) : null;
  return {
    rows: valid.length, dates: icE.length, tickers: new Set(valid.map((r) => r.ticker)).size,
    ic: blockBootstrap(icE), placeboIc: blockBootstrap(icP), icMinusPlacebo: blockBootstrap(diff),
    brier: r4(brier), brierBase: r4(brierBase), brierSkill: r4(brierBase > 0 ? 1 - brier / brierBase : null),
    quintileSpreadNet: blockBootstrap(spread), coverage80: r4(cover),
    avgNEff: r4(mean(valid.map((r) => r.preds[cfgIdx].nEff))),
  };
}

/** Pha IS: chọn cấu hình theo IC trong mẫu, hiệu chỉnh conformal, trả cấu hình chốt (kèm hash) + báo cáo IS. */
export function runInSample(ctx, { onProgress } = {}) {
  const isEndCal = ctx.is.at(-1) + 1;
  const cal0 = calibrate(ctx, isEndCal);
  const configs = []; for (const lambda of P.grid.lambda) for (const hMult of P.grid.hMult) configs.push({ lambda, hMult });
  const rows = runQueries(ctx, cal0, ctx.is, configs, { onProgress });
  const grid = configs.map((cf, k) => ({ ...cf, ic: blockBootstrap(icSeries(rows, (r) => r.preds[k].pred[P.primaryH])) }));
  // tốt nhất theo TB IC trong mẫu; hoà -> λ nhỏ hơn, hMult gần 1 hơn (đơn giản hơn)
  const best = grid.map((g, k) => ({ ...g, k })).sort((a, b) => (b.ic.mean ?? -9) - (a.ic.mean ?? -9) || a.lambda - b.lambda || Math.abs(a.hMult - 1) - Math.abs(b.hMult - 1))[0];
  const p0 = mean(rows.filter((r) => r.act[P.primaryH] != null).map((r) => (r.act[P.primaryH] > 0 ? 1 : 0)));
  const conformal = conformalQuantiles(rows, best.k);
  const frozen = {
    prereg: P.version, engine: ENGINE_DEFAULTS, W: ctx.lib.W, lambda: best.lambda, hMult: best.hMult,
    h0: cal0.nullByLambda[best.lambda].q05, nullQuantiles: cal0.nullByLambda[best.lambda].quantiles,
    ctxMean: cal0.ctxMean, ctxSd: cal0.ctxSd, volCuts: cal0.volCuts, conformal, p0: r4(p0),
    isDates: [ctx.cal.dates[ctx.is[0]], ctx.cal.dates[ctx.is.at(-1)]], oosDates: [ctx.cal.dates[ctx.oos[0]], ctx.cal.dates[ctx.oos.at(-1)]],
  };
  frozen.sha256 = hashConfig(frozen);
  const isMetrics = metrics(rows.map((r) => ({ ...r, preds: [r.preds[best.k]] })), 0, { p0, conformal });
  return { frozen, grid, inSample: isMetrics, calibration: { libraryN: cal0.libraryN, nullByLambda: Object.fromEntries(Object.entries(cal0.nullByLambda).map(([k, v]) => [k, { q05: v.q05, q50: v.q50 }])) } };
}

export function hashConfig(cfg) {
  const { sha256: _ignore, ...rest } = cfg;
  return createHash("sha256").update(JSON.stringify(rest)).digest("hex");
}

/** Pha OOS — chạy MỘT lần với cấu hình chốt; trả kết luận + mô tả thêm (không đổi kết luận). */
export function runOutOfSample(ctx, frozen, { isReport, onProgress, secondaryCtx = [] } = {}) {
  if (hashConfig(frozen) !== frozen.sha256) throw new Error("Cấu hình chốt bị sửa (hash không khớp).");
  const cal0 = { ctxSd: frozen.ctxSd, volCuts: frozen.volCuts, nullByLambda: { [frozen.lambda]: { q05: frozen.h0 } } };
  const rows = runQueries(ctx, cal0, ctx.oos, [{ lambda: frozen.lambda, hMult: frozen.hMult }], { onProgress });
  const m = metrics(rows, 0, { p0: frozen.p0, conformal: frozen.conformal });
  const isIc = isReport?.inSample?.ic?.mean ?? null;
  const checks = [
    { id: 1, name: "IC hạng TB > 0, cận dưới KTC > 0", pass: m.ic.mean > 0 && m.ic.lo > 0, value: m.ic },
    { id: 2, name: "IC engine − IC placebo > 0, cận dưới KTC > 0", pass: m.icMinusPlacebo.mean > 0 && m.icMinusPlacebo.lo > 0, value: m.icMinusPlacebo },
    { id: 3, name: "IC trong mẫu > 0", pass: isIc != null && isIc > 0, value: isIc },
    { id: 4, name: "Brier skill của P(vượt VN-Index) > 0", pass: m.brierSkill != null && m.brierSkill > 0, value: m.brierSkill },
    { id: 5, name: "Chênh lệch nhóm 20% cao − 20% thấp sau phí 0,3% > 0", pass: m.quintileSpreadNet.mean > 0, value: m.quintileSpreadNet },
    { id: 6, name: `Cỡ mẫu ≥ ${P.minOosDates} ngày và ≥ ${P.minOosTickers} mã`, pass: m.dates >= P.minOosDates && m.tickers >= P.minOosTickers, value: { dates: m.dates, tickers: m.tickers } },
  ];
  const passed = checks.every((c) => c.pass);
  const coverageOk = m.coverage80 != null && m.coverage80 >= P.coverageBand[0] && m.coverage80 <= P.coverageBand[1];

  // ----- mô tả thêm (Holm) -----
  const sec = [];
  for (const [k, h] of HORIZONS.entries()) if (k !== P.primaryH) sec.push({ name: `IC kỳ hạn ${h} phiên`, ...blockBootstrap(icSeries(rows, (r) => r.preds[0].pred[k], k)) });
  sec.push({ name: "IC chỉ thư viện cùng ngành", ...blockBootstrap(icSeries(rows.filter((r) => r.sector), (r) => r.sector[P.primaryH])) });
  sec.push({ name: "IC khi VN-Index trên MA200", ...blockBootstrap(icSeries(rows.filter((r) => r.market > 0), (r) => r.preds[0].pred[P.primaryH])) });
  sec.push({ name: "IC khi VN-Index dưới MA200", ...blockBootstrap(icSeries(rows.filter((r) => r.market <= 0), (r) => r.preds[0].pred[P.primaryH])) });
  sec.push({ name: "IC từng phần (sau momentum 20/60 & đảo chiều 5)", ...blockBootstrap(partialIcSeries(rows, 0)) });
  for (const s of secondaryCtx) sec.push({ name: `IC cửa sổ ${s.W} phiên`, ...s.ic });
  const momentum = {
    ret20: blockBootstrap(icSeries(rows, (r) => r.ret20)), ret60: blockBootstrap(icSeries(rows, (r) => r.ret60)), reversal5: blockBootstrap(icSeries(rows, (r) => -r.ret5)),
  };
  return {
    prereg: P.version, configSha256: frozen.sha256, config: { lambda: frozen.lambda, hMult: frozen.hMult, W: frozen.W },
    verdict: passed ? "PASS" : "FAIL", label: passed ? "ĐÃ KIỂM ĐỊNH" : "EXPERIMENTAL",
    checks, coverage: { value: m.coverage80, band: P.coverageBand, ok: coverageOk },
    outOfSample: m, inSample: isReport?.inSample ?? null, placeboBaselines: { randomNeighbours: m.placeboIc, momentum },
    secondary: holm(sec.map((s) => ({ name: s.name, mean: s.mean, lo: s.lo, hi: s.hi, n: s.n, p: s.pOneSided }))),
    limitations: ["Universe hiện tại (280 mã) — có thiên lệch sống sót: mã đã huỷ niêm yết không có trong dữ liệu."],
    rowsSample: rows.slice(0, 3).map((r) => ({ date: r.date, ticker: r.ticker, pred20: r4(r.preds[0].pred[P.primaryH]), act20: r4(r.act[P.primaryH]) })),
  };
}

/** Mô tả thêm: IC ngoài mẫu của cửa sổ W khác (hiệu chỉnh riêng trong mẫu, cùng λ/hMult đã chốt). */
export function secondaryWindowIc(seriesOf, sectorOf, W, frozen, { onProgress } = {}) {
  const ctx = setup(seriesOf, sectorOf, { W });
  const cal0 = calibrate(ctx, ctx.is.at(-1) + 1);
  const rows = runQueries(ctx, cal0, ctx.oos, [{ lambda: frozen.lambda, hMult: frozen.hMult }], { onProgress });
  return { W, ic: blockBootstrap(icSeries(rows, (r) => r.preds[0].pred[P.primaryH])) };
}
