// PA-SMC-r1 — chạy đúng bản đăng ký trước (docs/price-action-volume/PA-SMC-r1-PREREG.md, commit 9b49149e). Khung = PA-VOL-r1.
// node --max-old-space-size=6144 scripts/run.mjs raw out
import fs from "node:fs"; import path from "node:path";
import { loadBars } from "./bars.mjs";
import { analyzePriceAction, PRICE_ACTION_ENGINE_VERSION } from "../../../src/lib/price-action/index.ts";
import { analyze3, MTF3_VERSION } from "./mtf3.mjs" /* esbuild src/lib/quant-core/mtf3/index.ts --bundle --format=esm */;
const UPS = new Set(["UP", "UP_WEAK"]);
const structEvents = [];

const [rawDir, outDir] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const COST = 0.002 + 0.0025, H = [5, 10, 20], MIN_HIST = 250, MED_MIN = 5e9;
const IS = ["2014-01-01", "2020-12-31"], OOS = ["2021-01-01", "2026-10-31"], HALF = "2024-01-01";
const LIMIT = { HOSE: 0.07, HNX: 0.1, UPCOM: 0.15 };
const tickOf = (floor) => (p) => (floor === "HOSE" ? (p < 10000 ? 10 : p < 50000 ? 50 : 100) : 100);

// ---------- 1) Nạp, dựng chỉ số đủ điều kiện, chạy engine ----------
const files = fs.readdirSync(rawDir).filter((f) => /^[A-Z0-9]{3}\.json$/.test(f));
const T = new Map(); // ticker -> { dates, open, close, high, low, idx: Map(date->i), elig: Uint8Array }
const events = [];
const calSet = new Set();
let n = 0;
for (const f of files) {
  const tk = f.slice(0, 3);
  const L = loadBars(path.join(rawDir, f));
  if (!L || L.bars.length < MIN_HIST + 30) continue;
  const { bars, meta } = L;
  const N = bars.length;
  const elig = new Uint8Array(N);
  for (let i = MIN_HIST; i < N; i++) {
    const w = meta.slice(i - 20, i).map((m) => m.value ?? 0).sort((a, b) => a - b);
    if ((w[9] + w[10]) / 2 >= MED_MIN) elig[i] = 1;
  }
  const idx = new Map(bars.map((b, i) => [b.date, i]));
  bars.forEach((b) => calSet.add(b.date));
  T.set(tk, { dates: bars.map((b) => b.date), open: Float64Array.from(bars, (b) => b.open), close: Float64Array.from(bars, (b) => b.close),
    high: Float64Array.from(bars, (b) => b.high), low: Float64Array.from(bars, (b) => b.low), ceil: Float64Array.from(meta, (m) => m.ceil || Infinity), idx, elig });
  if (!elig.some((x) => x)) continue;
  const floor = meta.at(-1).floor ?? "HOSE";
  const r = analyzePriceAction(bars, { symbol: tk, timeframe: "D", priceBasis: "ADJ_FROM_BASIC", source: "VNDirect finfo", asOf: bars.at(-1).date,
    isIndex: false, limitPct: LIMIT[floor] ?? 0.07, tickSize: tickOf(floor) });
  if (r.status !== "ready") continue;
  const a3 = analyze3(bars), dEv = a3.D.dow.event, dSt = a3.D.dow.state, wIdx = a3.ribbon.wIdx, wSt = a3.W.dow.state;
  for (let j = 0; j < bars.length; j++) if (elig[j] && (dEv[j] === "BOS_UP" || dEv[j] === "CHOCH_UP")) structEvents.push({ tk, date: bars[j].date, type: dEv[j] });
  for (const s of r.setups) {
    if (s.direction !== "bullish" || s.state !== "triggered" || s.kind === "REVERSAL_AT_RESISTANCE") continue;
    const i = s.stateIndex;
    if (!elig[i]) continue;
    let recent = false;
    for (let j = Math.max(0, i - 20); j < i; j++) if (dEv[j] === "BOS_UP" || dEv[j] === "CHOCH_UP") { recent = true; break; }
    const wi = wIdx[i] ?? -1;
    events.push({ k1: recent && UPS.has(dSt[i]), wUp: wi >= 0 && UPS.has(wSt[wi]), tk, i, date: bars[i].date, kind: s.kind, pattern: s.patternId, trend: s.trendAtTrigger, vol: s.volume.confirmed === true,
      rvol: s.volume.triggerRvol, udr: s.volume.upDownRatio, stop: s.invalidationLevel, target: s.targetReferences[0]?.price ?? null, rr: s.rewardRisk, entryRef: s.entryReference, tickF: floor });
  }
  if (++n % 200 === 0) console.log("đã chạy", n, "mã, sự kiện", events.length);
}
const CAL = [...calSet].sort();
const calIdx = new Map(CAL.map((d, i) => [d, i]));
console.log("mã", T.size, "lịch", CAL.length, "sự kiện mua đã kích hoạt", events.length);

// ---------- 2) Lợi suất cửa sổ (mở cửa phiên sau → đóng cửa phiên thứ h) và rổ đều trọng số ----------
function windowRet(t, trigDate, h) {
  const c = calIdx.get(trigDate); if (c == null || c + h >= CAL.length) return null;
  const dIn = CAL[c + 1], dOut = CAL[c + h];
  const a = t.idx.get(dIn), b = t.idx.get(dOut);
  if (a == null || b == null || !(t.open[a] > 0)) return null;
  return { a, b, ret: t.close[b] / t.open[a] - 1 };
}
const benchCache = new Map();
function bench(trigDate, h) {
  const k = trigDate + "|" + h;
  if (benchCache.has(k)) return benchCache.get(k);
  let s = 0, m = 0;
  for (const t of T.values()) {
    const i = t.idx.get(trigDate); if (i == null || !t.elig[i]) continue;
    const w = windowRet(t, trigDate, h); if (!w) continue;
    s += w.ret; m++;
  }
  const v = m >= 20 ? s / m : null; benchCache.set(k, v); return v;
}
/** Mở cửa sát giá trần (≥ trần − 0,1%): lệnh mua không khớp được. */
const atCeil = (t, a) => Number.isFinite(t.ceil[a]) && t.open[a] >= t.ceil[a] * 0.999;
function excessOf(tk, trigDate, h) {
  const t = T.get(tk), w = windowRet(t, trigDate, h); if (!w) return { status: "censored", why: "thiếu phiên" };
  if (atCeil(t, w.a)) return { status: "censored", why: "mở cửa giá trần" };
  const bm = bench(trigDate, h); if (bm == null) return { status: "censored", why: "rổ < 20 mã" };
  return { status: "ok", net: w.ret - COST, excess: w.ret - COST - bm, a: w.a };
}

// ---------- 3) Giao dịch theo sách: cắt lỗ đóng cửa dưới mức vô hiệu (thoát mở cửa phiên sau), chốt tại mục tiêu, tối đa 20 phiên ----------
function bookTrade(e) {
  const t = T.get(e.tk), c = calIdx.get(e.date); if (c == null || c + 1 >= CAL.length) return null;
  const a = t.idx.get(CAL[c + 1]); if (a == null) return null;
  if (atCeil(t, a)) return null;
  const entry = t.open[a], risk = entry - e.stop; if (!(risk > 0)) return null;
  let exit = null;
  for (let j = a; j < Math.min(a + 20, t.dates.length); j++) {
    if (e.target && j > a && t.open[j] >= e.target) { exit = t.open[j]; break; }
    if (e.target && t.high[j] >= e.target) { exit = e.target; break; }
    if (t.close[j] < e.stop) { exit = j + 1 < t.dates.length ? t.open[j + 1] : t.close[j]; break; }
    if (j === a + 19 || j === t.dates.length - 1) exit = t.close[j];
  }
  if (exit == null) return null;
  return { R: (exit - entry) / risk - COST * entry / risk, pct: exit / entry - 1 - COST };
}

// ---------- 4) Thống kê ----------
const week = (d) => { const x = new Date(d + "T00:00:00Z"); const day = (x.getUTCDay() + 6) % 7; x.setUTCDate(x.getUTCDate() - day); return x.toISOString().slice(0, 10); };
function clusteredT(rows) {
  const v = rows.map((r) => r.x); const N = v.length; if (N < 3) return { n: N, mean: N ? v.reduce((a, b) => a + b, 0) / N : null, t: null };
  const mean = v.reduce((a, b) => a + b, 0) / N;
  const g = new Map(); for (const r of rows) g.set(r.c, (g.get(r.c) ?? 0) + (r.x - mean));
  const G = g.size; let s = 0; for (const u of g.values()) s += u * u;
  const se = Math.sqrt((G / Math.max(G - 1, 1)) * s) / N;
  return { n: N, clusters: G, mean, t: se > 0 ? mean / se : null };
}
const inRange = (d, [a, b]) => d >= a && d <= b;
const variants = {
  K1: (e) => e.trend !== "bearish" && e.k1,
  K2: (e) => e.trend !== "bearish" && e.k1 && e.vol,
  K3: (e) => e.trend !== "bearish" && e.k1 && e.vol && e.wUp,
  "S2¬K2": (e) => e.trend !== "bearish" && e.vol && !e.k1,
};
// Một sự kiện mỗi (mã, phiên kích hoạt) cho mỗi biến thể — nhiều setup trùng phiên không đếm lặp.
function sample(pred, range, h) {
  const seen = new Set(), rows = [];
  for (const e of events) {
    if (!pred(e) || !inRange(e.date, range)) continue;
    const k = e.tk + e.date; if (seen.has(k)) continue; seen.add(k);
    const x = excessOf(e.tk, e.date, h); if (x.status !== "ok") continue;
    rows.push({ x: x.excess, net: x.net, c: week(e.date), m: e.date.slice(0, 7), e });
  }
  return rows;
}
// Bootstrap khối theo tháng cho chênh lệch trung bình A − B.
function blockBoot(A, B, reps = 2000, seed = 1) {
  let s = seed; const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  const months = [...new Set([...A, ...B].map((r) => r.m))];
  const byM = (rows) => { const m = new Map(); for (const r of rows) { const l = m.get(r.m) ?? []; l.push(r.x); m.set(r.m, l); } return m; };
  const mA = byM(A), mB = byM(B); const diffs = [];
  for (let k = 0; k < reps; k++) {
    let sa = 0, na = 0, sb = 0, nb = 0;
    for (let j = 0; j < months.length; j++) {
      const mo = months[Math.floor(rnd() * months.length)];
      for (const x of mA.get(mo) ?? []) { sa += x; na++; } for (const x of mB.get(mo) ?? []) { sb += x; nb++; }
    }
    if (na && nb) diffs.push(sa / na - sb / nb);
  }
  return { pOneSided: diffs.filter((d) => d <= 0).length / diffs.length, reps: diffs.length };
}
// Giả dược: cùng mã, ngày vào ngẫu nhiên trong cùng quý mà mã đủ điều kiện.
function placebo(rows, h, draws = 1000, seed = 3) {
  let s = seed; const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  const pools = new Map();
  const pool = (tk, q) => {
    const k = tk + q; if (pools.has(k)) return pools.get(k);
    const t = T.get(tk); const l = [];
    for (let i = 0; i < t.dates.length; i++) if (t.elig[i] && t.dates[i].slice(0, 4) + "Q" + Math.ceil(Number(t.dates[i].slice(5, 7)) / 3) === q) l.push(t.dates[i]);
    pools.set(k, l); return l;
  };
  const means = [];
  for (let d = 0; d < draws; d++) {
    let sum = 0, m = 0;
    for (const r of rows) {
      const q = r.e.date.slice(0, 4) + "Q" + Math.ceil(Number(r.e.date.slice(5, 7)) / 3);
      const p = pool(r.e.tk, q); if (!p.length) continue;
      const x = excessOf(r.e.tk, p[Math.floor(rnd() * p.length)], h); if (x.status !== "ok") continue;
      sum += x.excess; m++;
    }
    if (m) means.push(sum / m);
  }
  means.sort((a, b) => a - b);
  return { p95: means[Math.floor(0.95 * (means.length - 1))], mean: means.reduce((a, b) => a + b, 0) / means.length, draws: means.length };
}
const pFromT = (t) => (t == null ? null : 0.5 * erfc(Math.abs(t) / Math.SQRT2) * 2); // hai phía
function erfc(x) { const z = Math.abs(x), t = 1 / (1 + 0.5 * z); const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))))); return x >= 0 ? r : 2 - r; }

const report = { test: "PA-SMC-r1", engine: PRICE_ACTION_ENGINE_VERSION + " · mtf3 " + MTF3_VERSION, structEvents: structEvents.length, ranAt: new Date().toISOString(), tickers: T.size, eventsTriggered: events.length, cost: COST, descriptive: {}, book: {}, byPattern: {} };
const tbl = [];
for (const [name, pred] of Object.entries(variants)) for (const h of H) for (const [lab, rg] of [["IS", IS], ["OOS", OOS]]) {
  const st = clusteredT(sample(pred, rg, h));
  report.descriptive[`${name}|${h}|${lab}`] = st;
  if (lab === "OOS") tbl.push({ key: `${name}|${h}`, p: pFromT(st.t) });
}
// BH trên 9 ô mô tả ngoài mẫu.
tbl.sort((a, b) => (a.p ?? 1) - (b.p ?? 1)); tbl.forEach((r, i) => (r.q = Math.min(1, ((r.p ?? 1) * tbl.length) / (i + 1))));
report.bh = tbl;

// Chỉ tiêu chính.
const s2o = sample(variants.K2, OOS, 10), s1nv = sample(variants["S2¬K2"], OOS, 10), s2i = sample(variants.K2, IS, 10);
// Mô tả: mua sau chính phiên BOS↑ / CHoCH↑.
for (const type of ["BOS_UP", "CHOCH_UP"]) for (const h of H) for (const [lab, rg] of [["IS", IS], ["OOS", OOS]]) {
  const seen = new Set(), rows = [];
  for (const e of structEvents) { if (e.type !== type || !inRange(e.date, rg) || seen.has(e.tk + e.date)) continue; seen.add(e.tk + e.date);
    const x = excessOf(e.tk, e.date, h); if (x.status === "ok") rows.push({ x: x.excess, c: week(e.date) }); }
  report.descriptive["E-" + type + "|" + h + "|" + lab] = clusteredT(rows);
}
const h2 = clusteredT(s2o), h2a = clusteredT(s2o.filter((r) => r.e.date < HALF)), h2b = clusteredT(s2o.filter((r) => r.e.date >= HALF)), h2is = clusteredT(s2i);
const h1 = blockBoot(s2o, s1nv);
const pl = placebo(s2o, 10);
report.primary = {
  nK2_OOS: s2o.length,
  H1: { diffMean: (h2.mean ?? 0) - (clusteredT(s1nv).mean ?? 0), ...h1, pass: h1.pOneSided < 0.05 },
  H2: { oos: h2, half1: h2a, half2: h2b, is: h2is, pass: s2o.length >= 150 && h2.mean > 0 && h2.t >= 2 && h2a.mean > 0 && h2b.mean > 0 && h2is.mean > 0 },
  H3: { ...pl, s2Mean: h2.mean, pass: h2.mean > pl.p95 },
};
report.verdict = s2o.length < 150 ? "THIẾU MẪU" : report.primary.H2.pass && report.primary.H3.pass ? "ĐẠT" : "KHÔNG ĐẠT";
// Mô tả: giao dịch theo sách và theo mẫu hình (ngoài mẫu, 10 phiên).
for (const [name, pred] of Object.entries(variants)) {
  const tr = events.filter((e) => pred(e) && inRange(e.date, OOS)).map(bookTrade).filter(Boolean);
  const R = tr.map((x) => x.R), pc = tr.map((x) => x.pct);
  report.book[name] = { n: tr.length, meanR: R.reduce((a, b) => a + b, 0) / (R.length || 1), meanPct: pc.reduce((a, b) => a + b, 0) / (pc.length || 1), winRate: pc.filter((x) => x > 0).length / (pc.length || 1) };
  const rrOk = events.filter((e) => pred(e) && inRange(e.date, OOS) && e.rr != null && e.rr >= 1.5).map(bookTrade).filter(Boolean);
  report.book[name + "|RR≥1.5"] = { n: rrOk.length, meanR: rrOk.reduce((a, b) => a + b.R, 0) / (rrOk.length || 1), meanPct: rrOk.reduce((a, b) => a + b.pct, 0) / (rrOk.length || 1) };
}
for (const pat of [...new Set(events.map((e) => e.pattern))]) for (const v of ["K1", "K2"]) {
  report.byPattern[`${pat}|${v}`] = clusteredT(sample((e) => variants[v](e) && e.pattern === pat, OOS, 10));
}
fs.writeFileSync(path.join(outDir, "PA-SMC-r1-report.json"), JSON.stringify(report, null, 1));
console.log(JSON.stringify({ verdict: report.verdict, primary: report.primary, book: report.book }, null, 1));
