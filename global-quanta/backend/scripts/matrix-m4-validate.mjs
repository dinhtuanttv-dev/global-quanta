// M4 — bằng chứng phụ theo M4-prereg.md, trên dữ liệu cục bộ VN100. Không gọi SSI, không ghi DB.
//   node scripts/matrix-m4-validate.mjs <dataDir> <out.json>    (dataDir: kết quả scripts/structure-fetch.mjs, d/<SYM>.json)
import fs from "node:fs";
import path from "node:path";
import { buildStateSeries as buildMarketState, panelByDate } from "../src/market/tradingMatrix/marketState.js";
import { buildStateSeries as buildM3State } from "../src/market/tradingMatrix/scenarioEngine.js";
import { M4_SCENARIOS, runM4Lifecycle } from "../src/market/tradingMatrix/scenarioM4.js";

const IS_TO = "2024-12-31", H = 10, MIN_N = 12, Q = 0.1, R = 5000, SEED = 20261031;
const WANT = { SC1: 1, SC2: -1, SC3: 0, SC4: 0 };
const [dir, output] = process.argv.slice(2);
if (!dir || !output) { console.error("Cách dùng: node scripts/matrix-m4-validate.mjs <dataDir> <out.json>"); process.exit(1); }
const daily = Object.fromEntries(fs.readdirSync(path.join(dir, "d")).filter((f) => f.endsWith(".json")).map((f) => [f.slice(0, -5), JSON.parse(fs.readFileSync(path.join(dir, "d", f), "utf8")).bars]));
const indexBars = daily.VNINDEX;
if (!indexBars?.length) { console.error("Thiếu d/VNINDEX.json"); process.exit(1); }

const bySymbol = new Map(Object.entries(daily).filter(([s, b]) => s !== "VNINDEX" && b.length >= 300));
const dates = indexBars.map((b) => b.date);
const regime = new Map(buildM3State({ bySymbol, indexBars }).map((s) => [s.date, s.regime]));
const series = buildMarketState({ panel: panelByDate(bySymbol, dates), indexBars });
const { episodes } = runM4Lifecycle(series.map((s) => ({ ...s, regime: regime.get(s.date) ?? null })));

const close = indexBars.map((b) => b.close), at = new Map(dates.map((d, i) => [d, i]));
const fwd = (i) => (i + H < close.length ? (close[i + H] / close[i] - 1) * 100 : null);
const seg = (d) => (d <= IS_TO ? "IS" : "OOS");
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const base = {};
for (const g of ["IS", "OOS"]) base[g] = mean(dates.map((d, i) => (seg(d) === g ? fwd(i) : null)).filter((x) => x != null));

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function boot(xs) {
  if (!xs.length) return { lo: null, hi: null, p: null };
  const r = rng(SEED), ms = [];
  for (let b = 0; b < R; b++) { let s = 0; for (let i = 0; i < xs.length; i++) s += xs[Math.floor(r() * xs.length)]; ms.push(s / xs.length); }
  ms.sort((a, b) => a - b);
  const below = ms.filter((m) => m <= 0).length / R;
  return { lo: ms[Math.floor(R * 0.025)], hi: ms[Math.floor(R * 0.975)], p: Math.min(1, 2 * Math.min(below, 1 - below)) };
}
function bhQ(ps) {
  const idx = ps.map((p, i) => [p, i]).filter(([p]) => p != null).sort((a, b) => a[0] - b[0]);
  const q = ps.map(() => null); let m = 1;
  for (let k = idx.length - 1; k >= 0; k--) { m = Math.min(m, (idx[k][0] * idx.length) / (k + 1)); q[idx[k][1]] = m; }
  return q;
}
const round = (v, d = 2) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);
const stats = {};
for (const id of Object.keys(M4_SCENARIOS)) {
  const ex = { IS: [], OOS: [] };
  for (const e of episodes.filter((x) => x.scenario === id)) { const v = fwd(at.get(e.start)); if (v != null) ex[seg(e.start)].push(v - base[seg(e.start)]); }
  const b = boot(ex.OOS);
  stats[id] = { title: M4_SCENARIOS[id].title, IS: { n: ex.IS.length, mean: mean(ex.IS) }, OOS: { n: ex.OOS.length, mean: mean(ex.OOS), ...b } };
}
const ids = Object.keys(stats), qs = bhQ(ids.map((k) => stats[k].OOS.p));
const verdicts = Object.fromEntries(ids.map((k, i) => {
  const { IS, OOS } = stats[k], w = WANT[k];
  if (OOS.n < MIN_N) return [k, "NOT_ENOUGH"];
  const sign = w || Math.sign(IS.mean ?? 0);
  const ok = sign !== 0 && Math.sign(OOS.mean) === sign && Math.sign(IS.mean ?? 0) === sign && (sign > 0 ? OOS.lo > 0 : OOS.hi < 0);
  return [k, !ok ? "FAIL" : qs[i] != null && qs[i] <= Q ? "PASS" : "FAIL_FDR"];
}));
const report = {
  rule: "M4-r1", evidence: "secondary", prereg: { isTo: IS_TO, horizon: H, minEpisodes: MIN_N, fdrQ: Q, resamples: R, seed: SEED },
  data: { symbols: bySymbol.size, from: dates[0], to: dates.at(-1), sessions: dates.length }, baseline: { IS: round(base.IS), OOS: round(base.OOS) },
  stats: Object.fromEntries(ids.map((k, i) => [k, { title: stats[k].title, IS: { n: stats[k].IS.n, mean: round(stats[k].IS.mean) }, OOS: { n: stats[k].OOS.n, mean: round(stats[k].OOS.mean), lo: round(stats[k].OOS.lo), hi: round(stats[k].OOS.hi), p: round(stats[k].OOS.p, 3), q: round(qs[i], 3) } }])),
  verdicts, episodes,
};
fs.writeFileSync(output, JSON.stringify(report, null, 1));
console.log(JSON.stringify({ data: report.data, baseline: report.baseline, stats: report.stats, verdicts }, null, 1));
