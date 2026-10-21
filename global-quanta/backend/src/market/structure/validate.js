// Cấu trúc thị trường đa khung — T2/T3: kiểm định ĐẶT TRƯỚC (MTF-prereg.md, commit df4cc9b, trước khi tải dữ liệu).
// Hàm thuần trên chuỗi giá cục bộ (SSI, điều chỉnh cộng dồn). Không gọi SSI, không ghi DB.
//   H1 vào giai đoạn tăng · H2 đồng thuận đa khung (H1 trong D) · H3 bảng kiểm xếp hạng · H4 mẫu đáy phá cổ · H5 cảnh báo giảm
//   M meta-labeling (logistic + purged k-fold + isotonic) · Q nón dự báo CQR · T3 xác suất giai đoạn (HMM + thời lượng thực nghiệm)
import * as Q from "../vendor/quantCore.mjs";
import { benchmark, bhQ, clusterP, eligibility, forward, stat } from "../strategies/pring/validate.js";
import { bootstrapCi, simulateVnTrade, summarizeTrades } from "../strategies/vnBacktest.js";
import { spearman } from "../alpha/validate.js";
import { auc, aucCi, brier, cqrOffset, ece, fitHmm, fitIsotonic, fitLogistic, fitQuantile, hmmFilter, purgedFolds, rng, standardizer } from "./ml.js";

export const MTF_PREREG = Object.freeze({
  version: "structure/T2-prereg-2026-10-21 (df4cc9b)",
  isTo: "2024-12-31", oosFrom: "2025-01-02", h1IsFrom: "2023-03-01",
  horizon: 20, endBuffer: 21, feePct: 0.6, dedupBars: 20, dedupH2: 5, minOosN: 30, h2Hold: 10,
  placeboReps: 200, extraHorizons: [5, 10, 40], fdrQ: 0.1,
  meta: { stopAtr: 2, targetAtr: 3, maxHold: 20, lambdas: [0.1, 1, 10, 100], folds: 5, embargo: 10, minAuc: 0.55, maxEce: 0.05 },
  cqr: { horizons: [5, 10, 20], step: 5, alpha: 0.2, covLo: 0.77, covHi: 0.83, minWidthGain: 0.05 },
  hmm: { K: 4, ahead: 10, maxEce: 0.05 },
});
const P = MTF_PREREG;
const STAGES = ["A", "UP", "B", "C", "D", "DOWN", "Bp", "RANGE"];
const BUY = new Set(["M1", "M2", "M3", "G3"]);
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const r3 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 1000) / 1000);
const seg = (date) => (date <= P.isTo ? "IS" : date >= P.oosFrom ? "OOS" : null);
const oneHot = (s) => STAGES.map((x) => (x === s ? 1 : 0));

// ------------------------------------------------------------------ chuẩn bị từng mã

export function prepareSymbol(symbol, bars, vni) {
  const elig = eligibility(bars);
  const fwd = Object.fromEntries([5, 10, 20, 40].map((h) => [h, forward(bars, h)]));
  const series = Q.analyzeStructureTfSeries(bars, "D");
  const wBars = Q.toWeekly(bars);
  const w = Q.analyzeStructureTf(wBars, "W");
  const wmap = Q.closedHtfIndex(bars, wBars, true);
  const S = { n: bars.length, date: bars.map((b) => b.date), O: bars.map((b) => b.open), H: bars.map((b) => b.high), L: bars.map((b) => b.low), C: bars.map((b) => b.close) };
  const weekStage = wmap.map((j) => (j >= 0 ? w.stage[j] : null));
  const weekDow = wmap.map((j) => (j >= 0 ? w.dow[j] : 0));
  // Ảnh chụp tại t: chỉ giữ ô gần nhất (H3 duyệt tuần tự; giữ toàn bộ sẽ tốn hàng trăm MB).
  let lastT = -1, lastSnap = null;
  const snap = (t) => { if (t !== lastT) { lastSnap = series.at(t); lastT = t; } return lastSnap; };
  const vniAbove = bars.map((b) => vni.above.get(b.date) ?? null);
  const vniStage = bars.map((b) => vni.stage.get(b.date) ?? null);
  return { symbol, bars, elig, fwd, a: series.a, snap, weekStage, weekDow, S, vniAbove, vniStage, dayIdx: new Map(bars.map((b, i) => [b.date, i])) };
}

export function prepareIndex(bars) {
  const a = Q.analyzeStructureTf(bars, "D");
  const above = new Map(), stage = new Map();
  let s = 0;
  for (let i = 0; i < bars.length; i++) {
    s += bars[i].close; if (i >= 20) s -= bars[i - 20].close;
    if (i >= 19) above.set(bars[i].date, bars[i].close > s / 20 ? 1 : 0);
    stage.set(bars[i].date, a.stage[i]);
  }
  return { above, stage };
}

/** Điểm bảng kiểm 8 mục tại t: mục khung lớn = giai đoạn tuần đã đóng ∈ {UP, A}. */
export function buyScore(u, t) {
  const ck = u.snap(t).checklistBuy;
  const ws = u.weekStage[t];
  return ck.filter((x) => x.ok).length + (ws === "UP" || ws === "A" ? 1 : 0);
}

/** Vectơ đặc trưng tại t (dùng cho M, Q). */
export function features(u, t) {
  const a = u.a, sn = u.snap(t), atr = Math.max(a.atr[t], 1e-9), c = u.bars[t].close;
  const sup = sn.zones.filter((z) => z.role === "support").sort((x, y) => y.mid - x.mid)[0];
  const res = sn.zones.filter((z) => z.role === "resistance").sort((x, y) => x.mid - y.mid)[0];
  const cap = (x) => Math.max(-10, Math.min(10, Number.isFinite(x) ? x : 0));
  return [
    ...oneHot(a.stage[t]), ...oneHot(u.weekStage[t]), Math.log(1 + a.stageAge[t]),
    cap(a.dev[t]), cap(a.slope[t] * 10), cap(a.spread[t]), a.dow[t], u.weekDow[t],
    ...sn.checklistBuy.map((x) => (x.ok ? 1 : 0)),
    sn.base?.bbwPct != null ? sn.base.bbwPct / 100 : 0.5, sn.base?.contractions ?? 0,
    sup ? cap((c - sup.mid) / atr) : 10, res ? cap((res.mid - c) / atr) : 10,
    u.vniAbove[t] ?? 0.5, ...oneHot(u.vniStage[t]),
  ];
}

// ------------------------------------------------------------------ sự kiện khung D

function dedupBy(events, gap) {
  const last = new Map(), out = [];
  for (const e of [...events].sort((a, b) => a.symbol.localeCompare(b.symbol) || a.t - b.t)) {
    const k = `${e.symbol}|${e.kind}`;
    if (last.has(k) && e.t - last.get(k) < gap) continue;
    last.set(k, e.t); out.push(e);
  }
  return out;
}

export function dailyEvents(u) {
  const { a, elig, bars } = u, out = [];
  const lastT = bars.length - 1 - P.endBuffer;
  for (let t = 1; t <= lastT; t++) {
    if (!elig[t]) continue;
    const s = a.stage[t], p = a.stage[t - 1];
    if (s === "UP" && p !== "UP") out.push({ symbol: u.symbol, t, date: bars[t].date, kind: "H1" });
    if ((s === "D" || s === "DOWN") && (p === "UP" || p === "B" || p === "C")) out.push({ symbol: u.symbol, t, date: bars[t].date, kind: "H5" });
  }
  for (const pt of a.patterns) {
    if (pt.dir !== 1 || pt.breakIndex == null) continue;
    const t = pt.breakIndex;
    if (t > lastT || !elig[t]) continue;
    out.push({ symbol: u.symbol, t, date: bars[t].date, kind: "H4", stop: Math.min(...pt.points.map((x) => x.price)), target: pt.target, type: pt.type });
  }
  for (const sg of a.signals) {
    if (sg.code !== "G3" || sg.index > lastT || !elig[sg.index]) continue;
    out.push({ symbol: u.symbol, t: sg.index, date: bars[sg.index].date, kind: "G3" });
  }
  return out;
}

const excess = (u, bench, t, h, fee) => {
  const f = u.fwd[h][t], b = bench[h].get(u.bars[t].date);
  return Number.isFinite(f) && Number.isFinite(b) ? (f - b) * 100 - fee : null;
};

function splitStats(rows, side) {
  const by = (g) => rows.filter((r) => r.seg === g && r.x != null);
  return { IS: stat(by("IS"), { side }), OOS: stat(by("OOS"), { side }) };
}

/** Placebo: cùng mã, phiên ngẫu nhiên đủ điều kiện trong cùng tháng. p = tỷ lệ lần placebo có TB ≥ TB thật (theo chiều). */
function placebo(events, uniBy, bench, h, fee, side, reps = P.placeboReps, seed = 23) {
  const r = rng(seed);
  const real = mean(events.map((e) => e.x).filter((x) => x != null));
  if (real == null) return null;
  const pools = new Map();
  for (const e of events) {
    const u = uniBy.get(e.symbol), m = e.date.slice(0, 7), k = `${e.symbol}|${m}`;
    if (!pools.has(k)) pools.set(k, u.bars.map((b, t) => (b.date.slice(0, 7) === m && u.elig[t] && Number.isFinite(u.fwd[h][t]) ? t : -1)).filter((t) => t >= 0));
  }
  let hit = 0;
  for (let k = 0; k < reps; k++) {
    const xs = [];
    for (const e of events) {
      const pool = pools.get(`${e.symbol}|${e.date.slice(0, 7)}`);
      if (!pool?.length) continue;
      const x = excess(uniBy.get(e.symbol), bench, pool[Math.floor(r() * pool.length)], h, fee);
      if (x != null) xs.push(x);
    }
    if (side * (mean(xs) ?? 0) >= side * real) hit++;
  }
  return { realMean: r3(real), p: r3(hit / reps) };
}

function verdictMean(st, side, extra = true) {
  const o = st.OOS, i = st.IS;
  if (!o?.n || o.n < P.minOosN) return "INSUFFICIENT";
  const ok = side * o.mean > 0 && o.ci && (side > 0 ? o.ci[0] > 0 : o.ci[1] < 0) && side * (i?.mean ?? 0) > 0 && extra;
  return ok ? "PASS" : "FAIL";
}

// ------------------------------------------------------------------ H2 (khung 1 giờ trong khung ngày)

export function h1Events(u, h1Bars) {
  const h = Q.analyzeStructureTf(h1Bars, "H1");
  const dmap = Q.closedHtfIndex(h1Bars, u.bars, false);
  const out = [];
  for (let t = 1; t + 1 < h1Bars.length; t++) {
    const j = dmap[t];
    if (j < 0) continue;
    const day = h1Bars[t].date.slice(0, 10), di = u.dayIdx.get(day);
    if (di == null || di + P.h2Hold >= u.bars.length || !u.elig[di] || day < P.h1IsFrom) continue;
    const dStage = u.a.stage[j], hStage = h.stage[t];
    const buyNow = h.signals.some((s) => BUY.has(s.code) && s.confirmedIndex === t);
    const recent = Q.recentBuy(h.signals, t);
    const base = { symbol: u.symbol, t: di, h1t: t, date: day, entry: h1Bars[t + 1].open, di };
    if (Q.alignMatrix(dStage, hStage, null, recent).verdict === "MUA") out.push({ ...base, kind: "ALIGNED" });
    if (buyNow && dStage !== "UP" && dStage !== "A") out.push({ ...base, kind: "COUNTER" });
    if (dStage === "UP" && hStage === "UP") out.push({ ...base, kind: "AB_NO_SIGNAL" });
    if (dStage === "UP" && buyNow) out.push({ ...base, kind: "AB_NO_H1UP" });
    const vAbove = u.vniAbove[j];
    if (vAbove === 1 && hStage === "UP" && recent) out.push({ ...base, kind: "AB_VNI" });
  }
  return { events: out, h1Pool: h1Bars.map((b, t) => ({ t, day: b.date.slice(0, 10), entry: h1Bars[t + 1]?.open })).filter((x) => x.entry > 0) };
}

/** Hai mẫu độc lập: KTC + p một phía cho chênh lệch TB (bootstrap cụm ngày trong từng nhóm). */
function diffCi(a, b, iters = 1000, seed = 31) {
  if (a.length < 10 || b.length < 10) return null;
  const cl = (rows) => { const m = new Map(); for (const r of rows) { if (!m.has(r.date)) m.set(r.date, []); m.get(r.date).push(r.x); } return [...m.values()]; };
  const A = cl(a), B = cl(b), r = rng(seed), d = [];
  const draw = (C) => { let s = 0, n = 0; for (let i = 0; i < C.length; i++) for (const v of C[Math.floor(r() * C.length)]) { s += v; n++; } return s / n; };
  for (let k = 0; k < iters; k++) d.push(draw(A) - draw(B));
  d.sort((x, y) => x - y);
  return { diff: r3(mean(a.map((x) => x.x)) - mean(b.map((x) => x.x))), ci: [r3(d[Math.floor(0.025 * iters)]), r3(d[Math.floor(0.975 * iters)])], p: r3(d.filter((v) => v <= 0).length / iters) };
}

// ------------------------------------------------------------------ chạy toàn bộ

export function runStructureValidation({ daily, h1 = {}, onProgress = () => {} }) {
  const t0 = Date.now();
  const vni = prepareIndex(daily.VNINDEX);
  const syms = Object.keys(daily).filter((s) => s !== "VNINDEX" && daily[s].length >= 300);
  const uni = [];
  for (const s of syms) { uni.push(prepareSymbol(s, daily[s], vni)); onProgress(`chuẩn bị ${uni.length}/${syms.length}`); }
  const uniBy = new Map(uni.map((u) => [u.symbol, u]));
  const bench = Object.fromEntries([5, 10, 20, 40].map((h) => [h, benchmark(uni, h)]));

  // ---- H1 / H4 / H5 / G3
  let evs = [];
  for (const u of uni) evs.push(...dailyEvents(u));
  evs = dedupBy(evs, P.dedupBars);
  const withX = (kind, h, fee) => evs.filter((e) => e.kind === kind).map((e) => ({ ...e, seg: seg(e.date), x: excess(uniBy.get(e.symbol), bench, e.t, h, fee), vni: uniBy.get(e.symbol).vniAbove[e.t] }));
  const H1 = withX("H1", P.horizon, P.feePct), H5 = withX("H5", P.horizon, 0);
  const h1s = splitStats(H1, 1), h5s = splitStats(H5, -1);

  const H4trades = [];
  for (const e of evs.filter((x) => x.kind === "H4")) {
    const u = uniBy.get(e.symbol);
    const r = simulateVnTrade(u.S, e.t, { stop: e.stop, target: e.target, maxHold: 60 });
    if (r.trade) H4trades.push({ ...r.trade, seg: seg(e.date), date: e.date, type: e.type, vni: u.vniAbove[e.t] });
  }
  const tradeStats = (g) => {
    const tr = H4trades.filter((x) => x.seg === g);
    const s = summarizeTrades(tr);
    const rRows = tr.map((x) => ({ date: x.entryDate, x: x.R * 100 }));
    const ci = bootstrapCi(tr.map((x) => ({ entryDate: x.entryDate, netPct: x.R * 100 })));
    return { ...s, expRci: ci ? ci.mean.map((v) => v / 100) : null, pfCi: bootstrapCi(tr)?.pf ?? null, p: clusterP(rRows, 1) };
  };
  const h4s = { IS: tradeStats("IS"), OOS: tradeStats("OOS") };

  // ---- H3: IC theo ngày
  onProgress("H3: bảng kiểm mọi mã-ngày");
  const byDate = new Map();
  for (const u of uni) {
    const lastT = u.bars.length - 1 - P.endBuffer;
    for (let t = 259; t <= lastT; t++) {
      if (!u.elig[t]) continue;
      const x = excess(u, bench, t, P.horizon, 0);
      if (x == null) continue;
      const d = u.bars[t].date;
      if (!byDate.has(d)) byDate.set(d, { s: [], x: [] });
      const g = byDate.get(d); g.s.push(buyScore(u, t)); g.x.push(x);
    }
  }
  const icRows = [...byDate].filter(([, g]) => g.s.length >= 10).map(([d, g]) => ({ date: d, ic: spearman(g.s, g.x) })).filter((r) => r.ic != null).sort((a, b) => a.date.localeCompare(b.date));
  const icStat = (g) => {
    const rows = icRows.filter((r) => seg(r.date) === g);
    if (rows.length < 20) return { days: rows.length };
    const r = rng(13), blocks = [];
    for (let i = 0; i < rows.length; i += 20) blocks.push(rows.slice(i, i + 20).map((x) => x.ic));
    const ms = [];
    for (let k = 0; k < 1000; k++) { const xs = []; for (let b = 0; b < blocks.length; b++) xs.push(...blocks[Math.floor(r() * blocks.length)]); ms.push(mean(xs)); }
    ms.sort((a, b) => a - b);
    return { days: rows.length, ic: r3(mean(rows.map((x) => x.ic))), ci: [r3(ms[25]), r3(ms[974])], p: r3(ms.filter((v) => v <= 0).length / 1000) };
  };
  const h3s = { IS: icStat("IS"), OOS: icStat("OOS") };

  // ---- H2
  onProgress("H2: khung 1 giờ");
  let h2ev = [];
  const h1Pools = new Map();
  const vn30 = Object.keys(h1).filter((s) => uniBy.has(s));
  const b10 = new Map(); // TB VN30 đóng cửa d -> d+10
  {
    const acc = new Map();
    for (const s of vn30) {
      const u = uniBy.get(s);
      for (let t = 0; t + P.h2Hold < u.bars.length; t++) {
        if (!u.elig[t]) continue;
        const v = u.bars[t + P.h2Hold].close / u.bars[t].close - 1, d = u.bars[t].date, a = acc.get(d) ?? [0, 0];
        a[0] += v; a[1]++; acc.set(d, a);
      }
    }
    for (const [d, [s, n]] of acc) b10.set(d, s / n);
  }
  const h2x = (u, di, entry, fee = P.feePct) => {
    const b = b10.get(u.bars[di].date);
    return Number.isFinite(b) && entry > 0 ? (u.bars[di + P.h2Hold].close / entry - 1 - b) * 100 - fee : null;
  };
  for (const s of vn30) {
    const u = uniBy.get(s);
    const { events, h1Pool } = h1Events(u, h1[s]);
    h1Pools.set(s, h1Pool);
    h2ev.push(...events);
    onProgress(`H2 ${s}`);
  }
  h2ev = dedupBy(h2ev, P.dedupH2).map((e) => ({ ...e, seg: seg(e.date), x: h2x(uniBy.get(e.symbol), e.di, e.entry) }));
  const h2Of = (kind, g) => h2ev.filter((e) => e.kind === kind && e.seg === g && e.x != null);
  const h2s = {
    aligned: { IS: stat(h2Of("ALIGNED", "IS")), OOS: stat(h2Of("ALIGNED", "OOS")) },
    counter: { IS: stat(h2Of("COUNTER", "IS")), OOS: stat(h2Of("COUNTER", "OOS")) },
    diff: { IS: diffCi(h2Of("ALIGNED", "IS"), h2Of("COUNTER", "IS")), OOS: diffCi(h2Of("ALIGNED", "OOS"), h2Of("COUNTER", "OOS")) },
    ablation: Object.fromEntries(["AB_NO_SIGNAL", "AB_NO_H1UP", "AB_VNI"].map((k) => [k, { IS: stat(h2Of(k, "IS")), OOS: stat(h2Of(k, "OOS")) }])),
  };
  // placebo H2: nến H1 ngẫu nhiên cùng mã cùng tháng
  {
    const r = rng(29), real = h2s.aligned.OOS.mean, al = h2Of("ALIGNED", "OOS");
    const byMonth = new Map();
    for (const [sym, pool] of h1Pools) for (const x of pool) { const k = `${sym}|${x.day.slice(0, 7)}`; if (!byMonth.has(k)) byMonth.set(k, []); byMonth.get(k).push(x); }
    let hit = 0;
    if (real != null && al.length) {
      for (let k = 0; k < P.placeboReps; k++) {
        const xs = [];
        for (const e of al) {
          const pool = byMonth.get(`${e.symbol}|${e.date.slice(0, 7)}`) ?? [];
          if (!pool.length) continue;
          const pk = pool[Math.floor(r() * pool.length)], u = uniBy.get(e.symbol), di = u.dayIdx.get(pk.day);
          if (di == null || di + P.h2Hold >= u.bars.length) continue;
          const x = h2x(u, di, pk.entry); if (x != null) xs.push(x);
        }
        if ((mean(xs) ?? 0) >= real) hit++;
      }
    }
    h2s.placebo = real == null ? null : { realMean: real, p: r3(hit / P.placeboReps) };
  }

  // ---- kết luận + BH-FDR
  const H4pass = (() => { const o = h4s.OOS, i = h4s.IS; if (!o.n || o.n < P.minOosN) return "INSUFFICIENT"; return o.profitFactor >= 1.2 && o.expRci && o.expRci[0] > 0 && (i.profitFactor ?? 0) > 1 ? "PASS" : "FAIL"; })();
  const H2pass = (() => { const o = h2s.aligned.OOS; if (!o?.n || o.n < P.minOosN) return "INSUFFICIENT"; const d = h2s.diff.OOS; return o.mean > 0 && o.ci?.[0] > 0 && d && d.ci[0] > 0 && (h2s.aligned.IS.mean ?? 0) > 0 ? "PASS" : "FAIL"; })();
  const H3pass = h3s.OOS.days >= 20 && h3s.OOS.ic > 0 && h3s.OOS.ci?.[0] > 0 && (h3s.IS.ic ?? 0) > 0 ? "PASS" : "FAIL";
  const raw = { H1: verdictMean(h1s, 1), H2: H2pass, H3: H3pass, H4: H4pass, H5: verdictMean(h5s, -1) };
  const ps = [h1s.OOS.p, h2s.diff.OOS?.p ?? null, h3s.OOS.p ?? null, h4s.OOS.p, h5s.OOS.p];
  const qs = bhQ(ps);
  const final = Object.fromEntries(Object.entries(raw).map(([k, v], i) => [k, v === "PASS" && qs[i] != null && qs[i] <= P.fdrQ ? "PASS" : v === "PASS" ? "FAIL_FDR" : v]));

  // ---- mô tả
  const extra = Object.fromEntries(P.extraHorizons.map((h) => [h, { H1: splitStats(withX("H1", h, P.feePct), 1), H5: splitStats(withX("H5", h, 0), -1) }]));
  const byVni = (rows, side) => ({ above: splitStats(rows.filter((r) => r.vni === 1), side), below: splitStats(rows.filter((r) => r.vni === 0), side) });
  const halfYear = (rows) => {
    const g = new Map();
    for (const r of rows) { if (r.x == null) continue; const k = `${r.date.slice(0, 4)}-${Number(r.date.slice(5, 7)) <= 6 ? "H1" : "H2"}`; if (!g.has(k)) g.set(k, []); g.get(k).push(r.x); }
    return [...g].sort().map(([k, xs]) => ({ period: k, n: xs.length, mean: r3(mean(xs)) }));
  };
  const stageTable = {};
  for (const st of STAGES) {
    const rows = [];
    for (const u of uni) { const lastT = u.bars.length - 1 - P.endBuffer; for (let t = 259; t <= lastT; t++) if (u.elig[t] && u.a.stage[t] === st) rows.push({ date: u.bars[t].date, seg: seg(u.bars[t].date), x: excess(u, bench, t, P.horizon, 0) }); }
    stageTable[st] = { IS: { n: rows.filter((r) => r.seg === "IS").length, mean: r3(mean(rows.filter((r) => r.seg === "IS" && r.x != null).map((r) => r.x))) }, OOS: { n: rows.filter((r) => r.seg === "OOS").length, mean: r3(mean(rows.filter((r) => r.seg === "OOS" && r.x != null).map((r) => r.x))) } };
  }
  const placebos = {
    H1: placebo(H1.filter((r) => r.seg === "OOS"), uniBy, bench, P.horizon, P.feePct, 1),
    H5: placebo(H5.filter((r) => r.seg === "OOS"), uniBy, bench, P.horizon, 0, -1),
  };

  onProgress("M: meta-labeling");
  const meta = runMeta(evs.filter((e) => e.kind === "H1" || e.kind === "H4" || e.kind === "G3"), uniBy);
  onProgress("Q: nón CQR");
  const cqr = runCqr(uni);
  onProgress("T3: HMM");
  const hmm = runHmm(uni);

  return {
    prereg: P, engine: Q.MTF_STRUCTURE_VERSION, generatedAt: new Date().toISOString(), ms: Date.now() - t0,
    universe: { daily: uni.length, h1: vn30.length, from: uni[0]?.bars[0]?.date, to: uni[0]?.bars.at(-1)?.date },
    verdicts: { raw, pValues: ps, qValues: qs, final },
    H1: { ...h1s, byVni: byVni(H1, 1), halfYear: halfYear(H1.filter((r) => r.seg)), placebo: placebos.H1 },
    H2: h2s,
    H3: h3s,
    H4: { ...h4s, byType: Object.fromEntries(["W", "IHS"].map((ty) => [ty, { IS: summarizeTrades(H4trades.filter((x) => x.type === ty && x.seg === "IS")), OOS: summarizeTrades(H4trades.filter((x) => x.type === ty && x.seg === "OOS")) }])) },
    H5: { ...h5s, byVni: byVni(H5, -1), halfYear: halfYear(H5.filter((r) => r.seg)), placebo: placebos.H5 },
    extraHorizons: extra, stageTable, meta, cqr, hmm,
  };
}

// ------------------------------------------------------------------ M: meta-labeling

function runMeta(events, uniBy) {
  const M = P.meta, rows = [];
  const seen = new Set();
  for (const e of events) {
    const k = `${e.symbol}|${e.t}`; if (seen.has(k)) continue; seen.add(k);
    const u = uniBy.get(e.symbol), atr = u.a.atr[e.t], c = u.bars[e.t].close;
    const r = simulateVnTrade(u.S, e.t, { stop: c - M.stopAtr * atr, target: c + M.targetAtr * atr, maxHold: M.maxHold });
    if (!r.trade) continue;
    rows.push({ date: e.date, seg: seg(e.date), ti: e.t, te: r.trade.exitIdx, x: features(u, e.t), y: r.trade.netPct > 0 ? 1 : 0 });
  }
  const IS = rows.filter((r) => r.seg === "IS").sort((a, b) => a.date.localeCompare(b.date));
  const OOS = rows.filter((r) => r.seg === "OOS");
  if (IS.length < 200 || OOS.length < 50) return { n: { IS: IS.length, OOS: OOS.length }, verdict: "INSUFFICIENT" };
  // chỉ số thời gian chung = thứ tự ngày (các mã cùng lịch giao dịch)
  const days = [...new Set(rows.map((r) => r.date))].sort(), di = new Map(days.map((d, i) => [d, i]));
  const ti = IS.map((r) => di.get(r.date)), te = IS.map((r) => di.get(r.date) + (r.te - r.ti));
  const st = standardizer(IS.map((r) => r.x)), Z = (r) => st.apply(r.x);
  const folds = purgedFolds(ti, te, M.folds, { embargo: M.embargo });
  const logloss = (p, y) => -mean(p.map((v, i) => (y[i] ? Math.log(Math.max(v, 1e-9)) : Math.log(Math.max(1 - v, 1e-9)))));
  const cv = M.lambdas.map((lambda) => {
    const ls = folds.map(({ train, test }) => { const m = fitLogistic(train.map((i) => Z(IS[i])), train.map((i) => IS[i].y), { lambda }); return logloss(test.map((i) => m.predict(Z(IS[i]))), test.map((i) => IS[i].y)); });
    return { lambda, logloss: r3(mean(ls)) };
  });
  const best = cv.reduce((a, b) => (b.logloss < a.logloss ? b : a));
  const last = folds[folds.length - 1];
  const model = fitLogistic(last.train.map((i) => Z(IS[i])), last.train.map((i) => IS[i].y), { lambda: best.lambda });
  const iso = fitIsotonic(last.test.map((i) => model.predict(Z(IS[i]))), last.test.map((i) => IS[i].y));
  const base = mean(IS.map((r) => r.y));
  const p = OOS.map((r) => iso(model.predict(Z(r)))), y = OOS.map((r) => r.y);
  const bs = brier(p, y), bsBase = brier(p.map(() => base), y);
  const A = auc(p, y), Aci = aucCi(p, y, OOS.map((r) => r.date));
  const E = ece(p, y);
  const pass = bs < bsBase && A > M.minAuc && Aci && Aci[0] > 0.5 && E <= M.maxEce;
  // lọc theo xác suất: lợi nhuận lệnh khi p > tỷ lệ nền
  return {
    n: { IS: IS.length, OOS: OOS.length }, baseRateIS: r3(base), baseRateOOS: r3(mean(y)), cv, lambda: best.lambda,
    oos: { brier: r3(bs), brierBase: r3(bsBase), brierSkill: r3(1 - bs / bsBase), auc: r3(A), aucCi: Aci?.map(r3) ?? null, ece: r3(E) },
    takeRate: r3(mean(p.map((v) => (v > base ? 1 : 0)))), hitTaken: r3(mean(y.filter((_, i) => p[i] > base))), hitSkipped: r3(mean(y.filter((_, i) => p[i] <= base))),
    verdict: pass ? "PASS" : "FAIL",
    model: pass ? { w: model.w, mu: st.mu, sd: st.sd, iso: iso.steps } : null,
  };
}

// ------------------------------------------------------------------ Q: CQR

function runCqr(uni) {
  const C = P.cqr, out = {};
  const samples = [];
  for (const u of uni) {
    for (let t = 259; t < u.bars.length; t += C.step) {
      if (!u.elig[t]) continue;
      const ys = Object.fromEntries(C.horizons.map((h) => [h, t + h < u.bars.length ? Math.log(u.bars[t + h].close / u.bars[t].close) : null]));
      samples.push({ symbol: u.symbol, date: u.bars[t].date, seg: seg(u.bars[t].date), x: features(u, t), ys });
    }
  }
  for (const h of C.horizons) {
    const S = samples.filter((s) => s.ys[h] != null);
    const IS = S.filter((s) => s.seg === "IS").sort((a, b) => a.date.localeCompare(b.date)), OOS = S.filter((s) => s.seg === "OOS");
    if (IS.length < 500 || OOS.length < 200) { out[h] = { verdict: "INSUFFICIENT", n: { IS: IS.length, OOS: OOS.length } }; continue; }
    // ngày cuối của phần huấn luyện + đệm h phiên (nhãn không chồng sang tập hiệu chỉnh)
    const cut = Math.floor(IS.length * 0.75), cutDate = IS[cut].date;
    const tr = IS.filter((s) => s.date < cutDate), cal = IS.filter((s) => s.date >= cutDate);
    const trDates = [...new Set(tr.map((s) => s.date))].sort(), lastTrainDate = trDates[Math.max(0, trDates.length - 1 - Math.ceil(h / C.step))];
    const trP = tr.filter((s) => s.date <= lastTrainDate);
    const st = standardizer(trP.map((s) => s.x)), Z = (s) => st.apply(s.x);
    const lo = fitQuantile(trP.map(Z), trP.map((s) => s.ys[h]), C.alpha / 2), hi = fitQuantile(trP.map(Z), trP.map((s) => s.ys[h]), 1 - C.alpha / 2);
    const mid = fitQuantile(trP.map(Z), trP.map((s) => s.ys[h]), 0.5); // trung vị: chỉ mô tả, không thuộc tiêu chí ĐẠT
    const off = cqrOffset(cal.map((s) => lo.predict(Z(s))), cal.map((s) => hi.predict(Z(s))), cal.map((s) => s.ys[h]), C.alpha);
    const cov = (rows, f) => { let c = 0, w = 0; for (const s of rows) { const [a, b] = f(s); w += b - a; if (s.ys[h] >= a && s.ys[h] <= b) c++; } return { coverage: r3(c / rows.length), width: r3(w / rows.length) }; };
    const model = cov(OOS, (s) => { const z = Z(s); return [lo.predict(z) - off, hi.predict(z) + off]; });
    // nón đối chứng: phân vị thực nghiệm theo mã (phần huấn luyện) + hiệu chỉnh conformal cùng cách
    const qBy = new Map();
    for (const sym of new Set(trP.map((s) => s.symbol))) {
      const v = trP.filter((s) => s.symbol === sym).map((s) => s.ys[h]).sort((a, b) => a - b);
      if (v.length >= 20) qBy.set(sym, [v[Math.floor((C.alpha / 2) * (v.length - 1))], v[Math.floor((1 - C.alpha / 2) * (v.length - 1))], v[Math.floor(0.5 * (v.length - 1))]]);
    }
    const all = trP.map((s) => s.ys[h]).sort((a, b) => a - b), glob = [all[Math.floor((C.alpha / 2) * (all.length - 1))], all[Math.floor((1 - C.alpha / 2) * (all.length - 1))], all[Math.floor(0.5 * (all.length - 1))]];
    const qOf = (s) => qBy.get(s.symbol) ?? glob;
    const offB = cqrOffset(cal.map((s) => qOf(s)[0]), cal.map((s) => qOf(s)[1]), cal.map((s) => s.ys[h]), C.alpha);
    const baseline = cov(OOS, (s) => [qOf(s)[0] - offB, qOf(s)[1] + offB]);
    const covOk = model.coverage >= C.covLo && model.coverage <= C.covHi;
    const baseCovOk = baseline.coverage >= C.covLo && baseline.coverage <= C.covHi;
    const gain = baseline.width > 0 ? 1 - model.width / baseline.width : 0;
    out[h] = {
      n: { train: trP.length, cal: cal.length, OOS: OOS.length }, model, baseline, widthGain: r3(gain),
      verdict: covOk && gain >= C.minWidthGain ? "PASS" : baseCovOk ? "BASELINE" : "FAIL",
      medianAbsErr: { model: r3(mean(OOS.map((s) => Math.abs(s.ys[h] - mid.predict(Z(s)))))), baseline: r3(mean(OOS.map((s) => Math.abs(s.ys[h] - qOf(s)[2])))) },
      params: covOk && gain >= C.minWidthGain ? { kind: "cqr", lo: lo.w, hi: hi.w, mid: mid.w, off, mu: st.mu, sd: st.sd } : { kind: "empirical", baseline: Object.fromEntries(qBy), global: glob, off: offB },
    };
  }
  return out;
}

// ------------------------------------------------------------------ T3: HMM + thời lượng giai đoạn

function runHmm(uni) {
  const H = P.hmm;
  const featOf = (u, t) => {
    const c = u.bars[t].close, pc = u.bars[t - 1].close, atr = Math.max(u.a.atr[t], 1e-9);
    const cap = (x) => Math.max(-8, Math.min(8, Number.isFinite(x) ? x : 0));
    return [cap((c - pc) / atr), cap(u.a.dev[t]), cap(u.a.slope[t] * 10), cap(u.a.spread[t])];
  };
  // thời lượng giai đoạn (IS)
  const durs = Object.fromEntries(STAGES.map((s) => [s, []]));
  for (const u of uni) {
    let start = 0;
    for (let t = 1; t <= u.bars.length; t++) {
      if (t === u.bars.length || u.a.stage[t] !== u.a.stage[start]) {
        if (start > 0 && t < u.bars.length && u.bars[t - 1].date <= P.isTo) durs[u.a.stage[start]].push(t - start);
        start = t;
      }
    }
  }
  const typical = Object.fromEntries(STAGES.map((s) => { const v = [...durs[s]].sort((a, b) => a - b); return [s, v.length ? { n: v.length, median: v[Math.floor(v.length / 2)], p75: v[Math.floor(v.length * 0.75)] } : null]; }));
  // HMM trên IS (chuẩn hoá theo IS)
  const isSeqRaw = [];
  for (const u of uni) {
    const xs = [];
    for (let t = 120; t < u.bars.length && u.bars[t].date <= P.isTo; t++) xs.push(featOf(u, t));
    if (xs.length >= 200) isSeqRaw.push(xs);
  }
  if (isSeqRaw.length < 10) return { verdict: "INSUFFICIENT", typical };
  const st = standardizer(isSeqRaw.flat());
  const model = fitHmm(isSeqRaw.map((x) => x.map(st.apply)), H.K, { iters: 25 });
  const rows = [];
  for (const u of uni) {
    const xs = [];
    for (let t = 120; t < u.bars.length; t++) xs.push(st.apply(featOf(u, t)));
    const post = hmmFilter(model, xs);
    for (let t = 259; t + H.ahead < u.bars.length; t++) {
      if (!u.elig[t]) continue;
      const s = u.a.stage[t];
      let up = 0, dn = 0;
      for (let k = 1; k <= H.ahead; k++) {
        const a = u.a.stage[t + k], b = u.a.stage[t + k - 1];
        if (a === "UP" && b !== "UP") up = 1;
        if ((a === "D" || a === "DOWN") && b !== "D" && b !== "DOWN") dn = 1;
      }
      const ty = typical[s]?.median ?? 20;
      rows.push({ date: u.bars[t].date, seg: seg(u.bars[t].date), stage: s, x: [...post[t - 120], ...oneHot(s), Math.log(1 + u.a.stageAge[t]), u.a.stageAge[t] / ty], up, dn });
    }
  }
  const evalTarget = (key) => {
    const IS = rows.filter((r) => r.seg === "IS").sort((a, b) => a.date.localeCompare(b.date)), OOS = rows.filter((r) => r.seg === "OOS");
    const cut = Math.floor(IS.length * 0.75), tr = IS.slice(0, cut), cal = IS.slice(cut);
    const m = fitLogistic(tr.map((r) => r.x), tr.map((r) => r[key]), { lambda: 1 });
    const iso = fitIsotonic(cal.map((r) => m.predict(r.x)), cal.map((r) => r[key]));
    const freq = Object.fromEntries(STAGES.map((s) => { const g = IS.filter((r) => r.stage === s); return [s, g.length ? mean(g.map((r) => r[key])) : mean(IS.map((r) => r[key]))]; }));
    const p = OOS.map((r) => iso(m.predict(r.x))), pb = OOS.map((r) => freq[r.stage]), y = OOS.map((r) => r[key]);
    const bs = brier(p, y), bb = brier(pb, y), E = ece(p, y);
    return { n: { IS: IS.length, OOS: OOS.length }, rateOOS: r3(mean(y)), brier: r3(bs), brierStageFreq: r3(bb), brierSkill: r3(1 - bs / bb), ece: r3(E), auc: r3(auc(p, y)), verdict: bs < bb && E <= H.maxEce ? "PASS" : "FAIL", w: m.w, iso: iso.steps, freq };
  };
  const up = evalTarget("up"), dn = evalTarget("dn");
  const pass = up.verdict === "PASS" && dn.verdict === "PASS";
  const strip = ({ w, iso, freq, ...rest }) => rest;
  return {
    typical, hmm: { K: model.K, A: model.A.map((r) => r.map(r3)), mu: model.mu.map((r) => r.map(r3)), ll: r3(model.ll) }, up: strip(up), down: strip(dn), verdict: pass ? "PASS" : "FAIL",
    model: pass ? { hmm: { K: model.K, pi: model.pi, A: model.A, mu: model.mu, va: model.va }, st: { mu: st.mu, sd: st.sd }, up: { w: up.w, iso: up.iso }, down: { w: dn.w, iso: dn.iso } } : null,
  };
}
