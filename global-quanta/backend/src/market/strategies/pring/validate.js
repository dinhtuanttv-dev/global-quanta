// Pattern Scanner v2 (Pring) — P3: kiểm định ĐẶT TRƯỚC (người dùng duyệt 2026-10-10, xem PRING_PREREG bên dưới).
// Hàm thuần: trích sự kiện point-in-time từ scanPatterns(S, t) trên từng mã, đo lợi suất vượt trội T+1 mở cửa -> T+h đóng cửa
// so với TB cùng ngày của tập mã đủ điều kiện TẠI ngày đó, rồi chấm H1–H3 và mô tả C1–C9 + phép kiểm tra độ vững R1–R4.
// Không gọi SSI, không ghi DB — chạy bằng backend/scripts/pring-validate.mjs trên chuỗi giá cục bộ.

import { PRING } from "./config.js";
import { preparePattern, scanPatterns } from "./index.js";
import { bootstrapCi, simulateVnTrade, summarizeTrades } from "../vnBacktest.js";
import { weeklyBars } from "../patternScan.js";

export const PRING_PREREG = Object.freeze({
  version: "pring/P3-prereg-2026-10-10",
  minBars: 260, minPrice: 5_000, minAvgValue20: 5_000_000_000,
  oosFrom: "2026-03-07", horizon: 20, endBuffer: 21, feePct: 0.6, dedupBars: 20, minOosN: 30,
  groups: { G1: ["double", "hs", "island"], G2: ["triangle", "rect"], G3: ["wedge", "broadening"], G4: ["flag", "rounding"] },
  groupLabel: { G1: "Đảo chiều cổ điển (đôi/ba, vai-đầu-vai, đảo)", G2: "Tam giác + chữ nhật", G3: "Nêm + mở rộng", G4: "Cờ, đáy/đỉnh tròn, cốc tay cầm" },
  extraHorizons: [5, 10, 40], placeboReps: 200, targetBars: 60,
});
const P = PRING_PREREG;
export const groupOf = (family) => Object.entries(P.groups).find(([, fams]) => fams.includes(family))?.[0] ?? null;

// ------------------------------------------------------------------ điều kiện tập mã & lợi suất

/** Mảng boolean: mã đủ điều kiện tại t (≥ 260 nến tới t, giá ≥ 5.000đ, GTGD TB20 ≥ 5 tỷ tại t). */
export function eligibility(bars) {
  const n = bars.length, out = new Array(n).fill(false);
  const val = bars.map((b) => (Number(b.value) > 0 ? Number(b.value) : b.close * b.volume));
  let s = 0;
  for (let t = 0; t < n; t++) {
    s += val[t]; if (t >= 20) s -= val[t - 20];
    out[t] = t >= P.minBars - 1 && bars[t].close >= P.minPrice && t >= 19 && s / 20 >= P.minAvgValue20;
  }
  return out;
}

/** fwd[t] = đóng cửa t+h / mở cửa t+1 − 1 (NaN nếu không đủ nến). */
export function forward(bars, h) {
  const n = bars.length, out = new Float64Array(n).fill(NaN);
  for (let t = 0; t + h < n; t++) if (bars[t + 1].open > 0) out[t] = bars[t + h].close / bars[t + 1].open - 1;
  return out;
}

/** TB cùng ngày của tập mã đủ điều kiện: Map(date -> mean fwd). */
export function benchmark(universe, h) {
  const acc = new Map();
  for (const u of universe) {
    const f = u.fwd[h];
    for (let t = 0; t < u.bars.length; t++) {
      if (!u.elig[t] || !Number.isFinite(f[t])) continue;
      const d = u.bars[t].date, a = acc.get(d) ?? [0, 0];
      a[0] += f[t]; a[1]++; acc.set(d, a);
    }
  }
  return new Map([...acc].map(([d, [s, c]]) => [d, s / c]));
}

// ------------------------------------------------------------------ trích sự kiện

/**
 * Quét mọi phiên đủ điều kiện của một mã: sự kiện CONFIRMED (lần đầu / mô hình), BREAKOUT (C4), PULLBACK (C5).
 * Khóa mô hình = type|start|end|dir. Chỉ nhận sự kiện xảy ra ĐÚNG phiên t (ngày xác nhận / phá vỡ / pullback = ngày t).
 */
export function extractEvents(symbol, bars, elig, { lastT = bars.length - 1 - P.endBuffer } = {}) {
  const S = preparePattern(bars);
  const seen = { c: new Set(), b: new Set(), p: new Set() }, out = [];
  for (let t = P.minBars - 1; t <= lastT; t++) {
    if (!elig[t]) continue;
    const d = S.date[t];
    for (const p of scanPatterns(S, t)) {
      const key = `${p.type}|${p.startDate}|${p.endDate}|${p.dir}`;
      const kinds = [];
      if (p.breakout?.confirmDate === d && !seen.c.has(key)) { seen.c.add(key); kinds.push("CONFIRMED"); }
      if (p.breakout?.date === d && !seen.b.has(key)) { seen.b.add(key); kinds.push("BREAKOUT"); }
      if (p.pullbackDate === d && !seen.p.has(key)) { seen.p.add(key); kinds.push("PULLBACK"); }
      for (const kind of kinds) {
        out.push({
          symbol, t, date: d, kind, key, type: p.type, family: p.family, group: groupOf(p.family), dir: p.dir, score: p.score,
          boVol: p.breakout?.volRatio ?? null, withTrend: p.context?.withTrend ?? null, counterTrend: p.context?.counterTrend ?? null,
          triPos: p.context?.trianglePosition ?? null, barWarn: (p.barSignals?.warn ?? []).length, failLevel: p.failLevel, targets: p.targets,
          level: p.levelAtBreakout,
        });
      }
    }
  }
  return out;
}

/** Tối đa 1 sự kiện / mã / hướng / loại trong `dedupBars` phiên (giữ sự kiện đầu). */
export function dedup(events, bars = P.dedupBars) {
  const last = new Map(), out = [];
  for (const e of [...events].sort((a, b) => a.symbol.localeCompare(b.symbol) || a.t - b.t)) {
    const k = `${e.symbol}|${e.dir}|${e.kind}`;
    if (last.has(k) && e.t - last.get(k) < bars) continue;
    last.set(k, e.t); out.push(e);
  }
  return out;
}

// ------------------------------------------------------------------ thống kê

/** Lợi suất vượt trội (%) của một sự kiện ở kỳ hạn h; mua trừ phí 0,6%. */
export function excessOf(e, u, bench, h) {
  const f = u.fwd[h][e.t], b = bench.get(e.date);
  if (!Number.isFinite(f) || !Number.isFinite(b)) return null;
  return (f - b) * 100 - (e.dir === "bull" ? P.feePct : 0);
}

const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const r2 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100) / 100);

/** Thống kê một tập (đã có `x` = lợi suất vượt trội %): n, TB, median, tỷ lệ > 0, KTC 95% (bootstrap cụm ngày của Gateway), p một phía. */
export function stat(rows, { side = 1 } = {}) {
  const xs = rows.map((r) => r.x).filter((v) => v != null);
  if (!xs.length) return { n: 0 };
  const sorted = [...xs].sort((a, b) => a - b);
  const ci = bootstrapCi(rows.filter((r) => r.x != null).map((r) => ({ entryDate: r.date, netPct: r.x })));
  return {
    n: xs.length, mean: r2(mean(xs)), median: r2(sorted[Math.floor(sorted.length / 2)]),
    hit: r2((xs.filter((v) => side * v > 0).length / xs.length) * 100), ci: ci?.mean ?? null, days: ci?.clusters ?? null,
    p: clusterP(rows.filter((r) => r.x != null), side),
  };
}

/** p một phía (bootstrap cụm ngày, 2000 lần): tỷ lệ TB lấy mẫu lại ≤ 0 (side = +1) hoặc ≥ 0 (side = −1). */
export function clusterP(rows, side = 1, iters = 2000, seed = 11) {
  if (rows.length < 10) return null;
  const by = new Map(); for (const r of rows) { if (!by.has(r.date)) by.set(r.date, []); by.get(r.date).push(r.x); }
  const cl = [...by.values()]; let a = seed >>> 0;
  const rnd = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  let bad = 0;
  for (let k = 0; k < iters; k++) { let s = 0, n = 0; for (let c = 0; c < cl.length; c++) for (const v of cl[Math.floor(rnd() * cl.length)]) { s += v; n++; } if (side * (s / n) <= 0) bad++; }
  return r2(bad / iters * 1000) / 1000;
}

/** Benjamini–Hochberg: q-value cho từng p (null giữ null). */
export function bhQ(ps) {
  const idx = ps.map((p, i) => [p, i]).filter(([p]) => p != null).sort((a, b) => a[0] - b[0]);
  const m = idx.length, q = new Array(ps.length).fill(null); let prev = 1;
  for (let k = m - 1; k >= 0; k--) { const [p, i] = idx[k]; prev = Math.min(prev, (p * m) / (k + 1)); q[i] = Math.round(prev * 1000) / 1000; }
  return q;
}

const split = (rows) => ({ is: rows.filter((r) => r.date < P.oosFrom), oos: rows.filter((r) => r.date >= P.oosFrom) });

/** ĐẠT H1 (mua) / H2 (cảnh báo giảm) theo tiêu chí đặt trước. */
export function verdict(isS, oosS, side) {
  if (!oosS.n || oosS.n < P.minOosN) return { verdict: "INSUFFICIENT", reason: `OOS n = ${oosS.n ?? 0} < ${P.minOosN}` };
  const ok = side > 0
    ? oosS.mean > 0 && oosS.ci && oosS.ci[0] > 0 && isS.mean > 0
    : oosS.mean < 0 && oosS.ci && oosS.ci[1] < 0 && isS.mean < 0;
  return { verdict: ok ? "PASS" : "FAIL" };
}

function hypo(rows, side) {
  const { is, oos } = split(rows);
  const isS = stat(is, { side }), oosS = stat(oos, { side });
  return { is: isS, oos: oosS, all: stat(rows, { side }), ...verdict(isS, oosS, side) };
}

/** Placebo R1: cùng mã, ngày ngẫu nhiên trong CÙNG tháng (phiên đủ điều kiện), cùng hướng/phí; p = tỷ lệ TB giả ≥ TB thật (mua). */
export function placebo(rows, uni, bench, h, side, reps = P.placeboReps, seed = 23) {
  if (rows.length < 10) return null;
  let a = seed >>> 0;
  const rnd = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pools = new Map();
  const poolOf = (sym, month) => {
    const k = `${sym}|${month}`; if (pools.has(k)) return pools.get(k);
    const u = uni.get(sym), arr = [];
    for (let t = 0; t < u.bars.length; t++) if (u.elig[t] && u.bars[t].date.startsWith(month) && Number.isFinite(u.fwd[h][t]) && bench.has(u.bars[t].date)) arr.push(t);
    pools.set(k, arr); return arr;
  };
  const obs = mean(rows.map((r) => r.x)); let ge = 0; const means = [];
  for (let k = 0; k < reps; k++) {
    const xs = [];
    for (const r of rows) {
      const u = uni.get(r.symbol), pool = poolOf(r.symbol, r.date.slice(0, 7)); if (!pool.length) continue;
      const t = pool[Math.floor(rnd() * pool.length)];
      xs.push((u.fwd[h][t] - bench.get(u.bars[t].date)) * 100 - (side > 0 ? P.feePct : 0));
    }
    const m = mean(xs); means.push(m); if (side * m >= side * obs) ge++;
  }
  means.sort((x, y) => x - y);
  return { observed: r2(obs), placeboMean: r2(mean(means)), placebo95: [r2(means[Math.floor(0.025 * reps)]), r2(means[Math.floor(0.975 * reps)])], p: Math.round((ge / reps) * 1000) / 1000 };
}

/** Theo dõi mục tiêu / thất bại trong 60 phiên sau xác nhận (C7): đạt T1/T2/T3 trước khi đóng cửa vượt mức thất bại. */
export function outcome(e, bars) {
  const dir = e.dir === "bull" ? 1 : -1, end = Math.min(bars.length - 1, e.t + P.targetBars);
  const hit = [false, false, false]; let failed = false;
  for (let j = e.t + 1; j <= end; j++) {
    const b = bars[j];
    for (let k = 0; k < 3; k++) if (!hit[k] && e.targets?.[k] != null && (dir > 0 ? b.high >= e.targets[k] : b.low <= e.targets[k])) hit[k] = true;
    if (!hit[0] && e.failLevel != null && (dir > 0 ? b.close < e.failLevel : b.close > e.failLevel)) { failed = true; break; }
  }
  return { hit, failed, complete: e.t + P.targetBars < bars.length };
}

// ------------------------------------------------------------------ toàn bộ

/**
 * @param series  { [symbol]: bars[] } — nến ngày điều chỉnh
 * @param onProgress (done, total) tuỳ chọn
 */
export function runValidation(series, { onProgress } = {}) {
  const t0 = Date.now();
  const H = [P.horizon, ...P.extraHorizons];
  const uni = new Map();
  for (const [sym, bars] of Object.entries(series)) {
    if (!Array.isArray(bars) || bars.length < P.minBars || /INDEX/.test(sym)) continue;
    uni.set(sym, { bars, elig: eligibility(bars), fwd: Object.fromEntries(H.map((h) => [h, forward(bars, h)])) });
  }
  const bench = Object.fromEntries(H.map((h) => [h, benchmark([...uni.values()], h)]));
  let events = [], done = 0;
  for (const [sym, u] of uni) { events.push(...extractEvents(sym, u.bars, u.elig)); onProgress?.(++done, uni.size); }
  events = dedup(events);
  const withX = (rows, h = P.horizon) => rows.map((e) => ({ ...e, x: excessOf(e, uni.get(e.symbol), bench[h], h) })).filter((r) => r.x != null);
  const conf = events.filter((e) => e.kind === "CONFIRMED" && e.group);
  const bull = withX(conf.filter((e) => e.dir === "bull")), bear = withX(conf.filter((e) => e.dir === "bear"));

  // H1 theo nhóm, H2 gộp (+ từng nhóm mô tả), H3 điểm số
  const H1 = Object.fromEntries(Object.keys(P.groups).map((g) => [g, { label: P.groupLabel[g], ...hypo(bull.filter((r) => r.group === g), 1) }]));
  const q = bhQ(Object.values(H1).map((x) => x.oos.p ?? null));
  Object.values(H1).forEach((x, i) => { x.oos.q = q[i]; });
  const H2 = { ...hypo(bear, -1), byGroup: Object.fromEntries(Object.keys(P.groups).map((g) => [g, hypo(bear.filter((r) => r.group === g), -1)])) };
  const cut = (() => { const s = bull.map((r) => r.score).sort((a, b) => a - b); return [s[Math.floor(s.length / 3)], s[Math.floor((2 * s.length) / 3)]]; })();
  const tier = (r) => (r.score >= cut[1] ? "high" : r.score < cut[0] ? "low" : "mid");
  const H3 = (() => {
    const out = { cut };
    for (const k of ["low", "mid", "high"]) { const rows = bull.filter((r) => tier(r) === k); const s = split(rows); out[k] = { is: stat(s.is), oos: stat(s.oos) }; }
    const ok = out.high.is.mean > out.low.is.mean && out.high.oos.mean > out.low.oos.mean && out.high.oos.ci && out.high.oos.ci[0] > 0;
    return { ...out, verdict: (out.high.oos.n ?? 0) < 10 ? "INSUFFICIENT" : ok ? "PASS" : "FAIL" };
  })();

  // C1–C6: so sánh hai nhánh (mua, T+20)
  const pair = (rows, f, a, b) => { const A = rows.filter(f), B = rows.filter((r) => !f(r)); const sa = split(A), sb = split(B); return { [a]: { is: stat(sa.is), oos: stat(sa.oos) }, [b]: { is: stat(sb.is), oos: stat(sb.oos) } }; };
  const C = {
    C1_volume: pair(bull.filter((r) => r.boVol != null), (r) => r.boVol >= PRING.breakoutVolRatio, "volHigh", "volLow"),
    C2_trend: pair(bull.filter((r) => r.withTrend || r.counterTrend), (r) => r.withTrend, "withTrend", "counterTrend"),
    C3_apex: pair(bull.filter((r) => r.triPos != null), (r) => r.triPos >= PRING.triangleSweet[0] && r.triPos <= PRING.triangleSweet[1], "sweetSpot", "outside"),
    C6_barWarn: pair(bull, (r) => r.barWarn > 0, "withWarning", "noWarning"),
  };
  // C4: vào tại phá vỡ vs chờ xác nhận; tỷ lệ phá vỡ giả = phá vỡ không bao giờ thành CONFIRMED
  const bo = events.filter((e) => e.kind === "BREAKOUT" && e.dir === "bull" && e.group);
  const confirmedKeys = new Set(events.filter((e) => e.kind === "CONFIRMED").map((e) => `${e.symbol}|${e.key}`));
  const boX = withX(bo);
  C.C4_hold2 = {
    breakoutEntry: { is: stat(split(boX).is), oos: stat(split(boX).oos) }, confirmEntry: { is: stat(split(bull).is), oos: stat(split(bull).oos) },
    falseBreakoutPct: r2((bo.filter((e) => !confirmedKeys.has(`${e.symbol}|${e.key}`)).length / Math.max(1, bo.length)) * 100), breakouts: bo.length,
  };
  const pb = withX(events.filter((e) => e.kind === "PULLBACK" && e.dir === "bull" && e.group));
  C.C5_pullback = { pullbackEntry: { is: stat(split(pb).is), oos: stat(split(pb).oos) }, confirmEntry: { is: stat(split(bull).is), oos: stat(split(bull).oos) } };
  // C7: mục tiêu / thất bại theo nhóm (mua + bán)
  C.C7_targets = {};
  for (const g of Object.keys(P.groups)) for (const dir of ["bull", "bear"]) {
    const rows = conf.filter((e) => e.group === g && e.dir === dir).map((e) => outcome(e, uni.get(e.symbol).bars)).filter((o) => o.complete);
    if (!rows.length) continue;
    C.C7_targets[`${g}_${dir}`] = { n: rows.length, t1: r2((rows.filter((o) => o.hit[0]).length / rows.length) * 100), t2: r2((rows.filter((o) => o.hit[1]).length / rows.length) * 100), t3: r2((rows.filter((o) => o.hit[2]).length / rows.length) * 100), failed: r2((rows.filter((o) => o.failed).length / rows.length) * 100) };
  }
  // C8: mô phỏng lệnh mua theo luật VN
  const sim = { is: [], oos: [] }, skips = {};
  for (const e of conf.filter((x) => x.dir === "bull")) {
    const S = preparePattern(uni.get(e.symbol).bars);
    if (!(e.failLevel > 0) || !(e.targets?.[0] > 0)) { skips.NO_PLAN = (skips.NO_PLAN ?? 0) + 1; continue; }
    const r = simulateVnTrade(S, e.t, { stop: e.failLevel, target: e.targets[0], maxHold: P.targetBars });
    if (r.skip) { skips[r.skip] = (skips[r.skip] ?? 0) + 1; continue; }
    (e.date < P.oosFrom ? sim.is : sim.oos).push(r.trade);
  }
  C.C8_trades = { is: summarizeTrades(sim.is), oos: summarizeTrades(sim.oos), skips, ciOos: bootstrapCi(sim.oos)?.mean ?? null };
  // C9: khung tuần (CONFIRMED trên nến tuần, T+4 tuần, so TB cùng tuần của tập mã đủ điều kiện tại phiên cuối tuần)
  C.C9_weekly = weekly(uni);

  // R1 placebo, R2 kỳ hạn khác, R4 nửa năm — mô tả
  const R = {
    R1_placebo: Object.fromEntries(Object.keys(P.groups).map((g) => [g, { all: placebo(bull.filter((r) => r.group === g), uni, bench[P.horizon], P.horizon, 1), oos: placebo(split(bull.filter((r) => r.group === g)).oos, uni, bench[P.horizon], P.horizon, 1) }])),
    R1_placeboBear: { all: placebo(bear, uni, bench[P.horizon], P.horizon, -1), oos: placebo(split(bear).oos, uni, bench[P.horizon], P.horizon, -1) },
    R2_horizons: Object.fromEntries(P.extraHorizons.map((h) => [h, {
      bull: Object.fromEntries(Object.keys(P.groups).map((g) => { const rows = withX(conf.filter((e) => e.dir === "bull" && e.group === g), h); const s = split(rows); return [g, { is: stat(s.is), oos: stat(s.oos) }]; })),
      bear: (() => { const rows = withX(conf.filter((e) => e.dir === "bear"), h); const s = split(rows); return { is: stat(s.is, { side: -1 }), oos: stat(s.oos, { side: -1 }) }; })(),
    }])),
    R4_halfYear: Object.fromEntries(Object.keys(P.groups).map((g) => [g, halfYears(bull.filter((r) => r.group === g))])),
  };
  const dates = [...bench[P.horizon].keys()].sort();
  return {
    prereg: P, engine: "pring/P2", ranAt: new Date().toISOString(), ms: Date.now() - t0,
    period: { from: dates[0], to: dates.at(-1), oosFrom: P.oosFrom, sessions: dates.length, symbols: uni.size },
    counts: { events: events.length, confirmedBull: bull.length, confirmedBear: bear.length, byType: countBy(conf, (e) => `${e.type}_${e.dir}`) },
    H1, H2, H3, C, R,
  };
}

function halfYears(rows) {
  const g = new Map();
  for (const r of rows) { const k = `${Number(r.date.slice(5, 7)) <= 6 ? "H1" : "H2"}/${r.date.slice(0, 4)}`; if (!g.has(k)) g.set(k, []); g.get(k).push(r); }
  return Object.fromEntries([...g].sort((a, b) => (a[0].slice(3) + a[0].slice(0, 2)).localeCompare(b[0].slice(3) + b[0].slice(0, 2))).map(([k, v]) => [k, { n: v.length, mean: r2(mean(v.map((x) => x.x))) }]));
}
const countBy = (a, f) => a.reduce((m, x) => ({ ...m, [f(x)]: (m[f(x)] ?? 0) + 1 }), {});

/** C9: sự kiện xác nhận trên nến TUẦN; lợi suất mở cửa tuần sau -> đóng cửa sau 4 tuần, trừ TB cùng tuần của tập mã đủ điều kiện. */
function weekly(uni) {
  const W = new Map();
  for (const [sym, u] of uni) {
    const wk = weeklyBars(u.bars), endIdx = new Map(u.bars.map((b, i) => [b.date, i]));
    const elig = wk.map((w) => u.elig[endIdx.get(w.date)] ?? false);
    W.set(sym, { wk, elig, fwd: forward(wk, 4) });
  }
  const bench = new Map();
  for (const w of W.values()) for (let i = 0; i < w.wk.length; i++) if (w.elig[i] && Number.isFinite(w.fwd[i])) { const k = w.wk[i].date.slice(0, 10), a = bench.get(k) ?? [0, 0]; a[0] += w.fwd[i]; a[1]++; bench.set(k, a); }
  const rows = [];
  for (const [sym, w] of W) {
    const S = preparePattern(w.wk), seen = new Set();
    for (let i = 60; i < w.wk.length - 5; i++) {
      if (!w.elig[i]) continue;
      for (const p of scanPatterns(S, i)) {
        const key = `${p.type}|${p.startDate}|${p.dir}`;
        if (p.breakout?.confirmDate !== S.date[i] || seen.has(key)) continue;
        seen.add(key);
        const b = bench.get(S.date[i]);
        if (!b || !Number.isFinite(w.fwd[i])) continue;
        rows.push({ symbol: sym, date: S.date[i], dir: p.dir, group: groupOf(p.family), x: (w.fwd[i] - b[0] / b[1]) * 100 - (p.dir === "bull" ? P.feePct : 0) });
      }
    }
  }
  const out = {};
  for (const dir of ["bull", "bear"]) { const r = rows.filter((x) => x.dir === dir); const s = split(r); out[dir] = { is: stat(s.is, { side: dir === "bull" ? 1 : -1 }), oos: stat(s.oos, { side: dir === "bull" ? 1 : -1 }) }; }
  return out;
}
