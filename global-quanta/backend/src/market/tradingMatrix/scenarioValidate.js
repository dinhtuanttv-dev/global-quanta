// Trading Matrix M3 — kiểm định ĐẶT TRƯỚC (M3-prereg.md, commit 341e569). Hàm thuần trên chuỗi cục bộ; không gọi mạng, không ghi DB.
import { bhQ } from "../strategies/pring/validate.js";
import { buildStateSeries, RULE_VERSION, RULES, runLifecycle, SCENARIOS } from "./scenarioEngine.js";

export const M3_PREREG = Object.freeze({
  version: "matrix/M3-prereg-2026-10-22 (341e569)", isTo: "2024-12-31", oosFrom: "2025-01-02",
  horizon: 10, extraHorizons: [1, 3, 5], minOosEpisodes: 12, fdrQ: 0.1, boot: 1000, seed: 7, blockLen: 10,
});
const P = M3_PREREG;
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const r3 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 1000) / 1000);
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const seg = (d) => (d <= P.isTo ? "IS" : d >= P.oosFrom ? "OOS" : null);

/** KTC bootstrap 95 % + p (một phía theo `side`, hai phía khi side = 0) cho TB của mẫu. */
function bootMean(xs, side, seed = P.seed) {
  if (xs.length < 3) return { n: xs.length, mean: r3(mean(xs)), ci: null, p: null };
  const r = rng(seed), ms = [];
  for (let k = 0; k < P.boot; k++) { let s = 0; for (let i = 0; i < xs.length; i++) s += xs[Math.floor(r() * xs.length)]; ms.push(s / xs.length); }
  ms.sort((a, b) => a - b);
  const below = ms.filter((v) => v <= 0).length / P.boot, above = ms.filter((v) => v >= 0).length / P.boot;
  const p = side > 0 ? below : side < 0 ? above : Math.min(1, 2 * Math.min(below, above));
  return { n: xs.length, mean: r3(mean(xs)), ci: [r3(ms[Math.floor(0.025 * P.boot)]), r3(ms[Math.floor(0.975 * P.boot)])], p: r3(p) };
}
/** Block bootstrap (khối 10 phiên) cho chuỗi theo ngày (tự tương quan do cửa sổ chồng lấn). */
function blockMean(xs, seed = P.seed) {
  if (xs.length < 2 * P.blockLen) return { n: xs.length, mean: r3(mean(xs)), ci: null };
  const r = rng(seed), blocks = [];
  for (let i = 0; i < xs.length; i += P.blockLen) blocks.push(xs.slice(i, i + P.blockLen));
  const ms = [];
  for (let k = 0; k < P.boot; k++) { const v = []; for (let b = 0; b < blocks.length; b++) v.push(...blocks[Math.floor(r() * blocks.length)]); ms.push(mean(v)); }
  ms.sort((a, b) => a - b);
  return { n: xs.length, mean: r3(mean(xs)), ci: [r3(ms[Math.floor(0.025 * P.boot)]), r3(ms[Math.floor(0.975 * P.boot)])] };
}

export function scenarioStats(states, indexBars, R = RULES) {
  const c = indexBars.map((b) => b.close), idxOf = new Map(indexBars.map((b, i) => [b.date, i]));
  const fwd = (i, h) => (i + h < c.length ? (c[i + h] / c[i] - 1) * 100 : null);
  const base = {};
  for (const h of [P.horizon, ...P.extraHorizons]) for (const g of ["IS", "OOS"]) {
    const xs = indexBars.map((b, i) => (seg(b.date) === g ? fwd(i, h) : null)).filter((x) => x != null);
    base[`${g}:${h}`] = mean(xs);
  }
  const ex = (date, h) => { const i = idxOf.get(date), g = seg(date), f = i == null ? null : fwd(i, h); return f == null || !g ? null : f - base[`${g}:${h}`]; };
  const { timeline, episodes } = runLifecycle(states, R);
  const out = {};
  for (const [k, sc] of Object.entries(SCENARIOS)) {
    const eps = episodes.filter((e) => e.scenario === k);
    const by = (g, h) => eps.filter((e) => seg(e.start) === g).map((e) => ex(e.start, h)).filter((x) => x != null);
    const side = sc.expect;
    const res = { IS: bootMean(by("IS", P.horizon), side), OOS: bootMean(by("OOS", P.horizon), side) };
    const horizons = Object.fromEntries(P.extraHorizons.map((h) => [h, { IS: bootMean(by("IS", h), side), OOS: bootMean(by("OOS", h), side) }]));
    const dayRows = (g) => timeline.filter((d) => d[k].state === "CONFIRMED" && seg(d.date) === g).map((d) => ex(d.date, P.horizon)).filter((x) => x != null);
    const falseAlarm = side ? (() => { const xs = by("OOS", P.horizon); return xs.length ? r3(xs.filter((x) => Math.sign(x) === -side).length / xs.length) : null; })() : null;
    out[k] = { title: sc.title, expect: side, episodes: { IS: by("IS", P.horizon).length, OOS: by("OOS", P.horizon).length }, ...res, horizons, days: { IS: blockMean(dayRows("IS")), OOS: blockMean(dayRows("OOS")) }, falseAlarmOOS: falseAlarm };
  }
  return { stats: out, baseline: Object.fromEntries(Object.entries(base).map(([k, v]) => [k, r3(v)])), episodes };
}

function verdictOf(st) {
  const o = st.OOS, i = st.IS;
  if (!o.n || o.n < P.minOosEpisodes || !o.ci) return "INSUFFICIENT";
  if (st.expect > 0) return o.mean > 0 && o.ci[0] > 0 && (i.mean ?? 0) > 0 ? "PASS" : "FAIL";
  if (st.expect < 0) return o.mean < 0 && o.ci[1] < 0 && (i.mean ?? 0) < 0 ? "PASS" : "FAIL";
  return (o.ci[0] > 0 || o.ci[1] < 0) && Math.sign(o.mean) === Math.sign(i.mean ?? 0) ? "PASS" : "FAIL";
}

/** Chạy toàn bộ: { daily: { [mã]: bars }, indexBars } -> báo cáo. */
export function runScenarioValidation({ daily, indexBars }) {
  const bySymbol = new Map(Object.entries(daily).filter(([s, b]) => s !== "VNINDEX" && b.length >= 300));
  const states = buildStateSeries({ bySymbol, indexBars });
  const main = scenarioStats(states, indexBars);
  const raw = Object.fromEntries(Object.entries(main.stats).map(([k, s]) => [k, verdictOf(s)]));
  const ids = Object.keys(raw);
  const qs = bhQ(ids.map((k) => main.stats[k].OOS.p ?? null));
  const final = Object.fromEntries(ids.map((k, i) => [k, raw[k] === "PASS" && qs[i] != null && qs[i] <= P.fdrQ ? "PASS" : raw[k] === "PASS" ? "FAIL_FDR" : raw[k]]));
  // Độ nhạy ±20 % từng ngưỡng (chỉ báo cáo, không chọn lại).
  const sensitivity = [];
  for (const [grp, obj] of Object.entries(RULES)) {
    if (typeof obj !== "object") continue;
    for (const key of Object.keys(obj)) for (const m of [0.8, 1.2]) {
      const R = structuredClone(RULES); R[grp][key] = obj[key] * m;
      const st = scenarioStats(states, indexBars, R).stats;
      sensitivity.push({ param: `${grp}.${key}`, mult: m, ...Object.fromEntries(ids.map((k) => [k, { n: st[k].OOS.n, mean: st[k].OOS.mean }])) });
    }
  }
  // Baseline breadth-only: ngày b ≥ 50 (so với ngày SC1 CONFIRMED).
  const idxOf = new Map(indexBars.map((b, i) => [b.date, i]));
  const c = indexBars.map((b) => b.close);
  const bo = (g) => states.filter((s) => s.b != null && s.b >= 50 && seg(s.date) === g).map((s) => { const i = idxOf.get(s.date); return i + P.horizon < c.length ? (c[i + P.horizon] / c[i] - 1) * 100 - main.baseline[`${g}:${P.horizon}`] : null; }).filter((x) => x != null);
  return {
    prereg: P, ruleVersion: RULE_VERSION, generatedAt: new Date().toISOString(),
    data: { symbols: bySymbol.size, from: indexBars[0]?.date, to: indexBars.at(-1)?.date, sessions: indexBars.length },
    verdicts: { raw, pValues: ids.map((k) => main.stats[k].OOS.p ?? null), qValues: qs, final },
    stats: main.stats, baseline: main.baseline, breadthOnly: { IS: blockMean(bo("IS")), OOS: blockMean(bo("OOS")) },
    sensitivity, episodes: main.episodes.map((e) => ({ scenario: e.scenario, start: e.start, end: e.end })),
  };
}
