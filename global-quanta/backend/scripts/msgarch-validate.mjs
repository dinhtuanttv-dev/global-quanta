// Kiểm định MSG-prereg.md trên dữ liệu cục bộ. Không gọi SSI, không ghi DB.
//   node scripts/msgarch-validate.mjs <dataDir> <out.json>    (dataDir: kết quả scripts/structure-fetch.mjs, d/<SYM>.json)
import fs from "node:fs";
import path from "node:path";
import { analyze, seedOf } from "../src/market/volatility/msGarch.js";

const [dir, output] = process.argv.slice(2);
if (!dir || !output) { console.error("Cách dùng: node scripts/msgarch-validate.mjs <dataDir> <out.json>"); process.exit(1); }
const WINDOW = 500, H = 20, STEP = 20, MIN = WINDOW + H + 1, R = 2000;
const pin = (y, q, t) => Math.max(t * (y - q), (t - 1) * (y - q));
const score = (y, b) => (pin(y, b.p10, 0.1) + pin(y, b.p50, 0.5) + pin(y, b.p90, 0.9)) * 100;
const rows = [];
let converged = 0, warned = 0;
const files = fs.readdirSync(path.join(dir, "d")).filter((f) => f.endsWith(".json")).sort();
for (const f of files) {
  const symbol = f.slice(0, -5);
  const bars = JSON.parse(fs.readFileSync(path.join(dir, "d", f), "utf8")).bars;
  if (bars.length < MIN) continue;
  for (let end = WINDOW; end + H < bars.length; end += STEP) {
    const closes = bars.slice(end - WINDOW, end + 1).map((b) => b.close);
    const a = analyze(closes, { horizon: H, nSims: 2000, seed: seedOf(`${symbol}|${bars[end].date}`) });
    if (!a) continue;
    if (a.converged) converged++;
    if (a.warnings.length) warned++;
    const y = bars[end + H].close / bars[end].close, m = a.bands[H - 1], b = a.baseline[H - 1];
    rows.push({ symbol, date: bars[end].date, y, msIn: y >= m.p10 && y <= m.p90, hsIn: y >= b.p10 && y <= b.p90, msBelow: y < m.p10, msAbove: y > m.p90, msPin: score(y, m), hsPin: score(y, b), hsWidth: b.p90 - b.p10, msWidth: m.p90 - m.p10, regime: a.regime.label });
  }
  console.error(symbol, rows.length);
}
const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
const share = (xs, f) => xs.filter(f).length / xs.length;
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const byDate = new Map();
for (const r of rows) byDate.set(r.date, [...(byDate.get(r.date) ?? []), r.msPin - r.hsPin]);
const days = [...byDate.keys()].sort(), rand = rng(20261101), boots = [];
for (let b = 0; b < R; b++) { let s = 0, n = 0; for (let i = 0; i < days.length; i++) { const d = byDate.get(days[Math.floor(rand() * days.length)]); for (const x of d) { s += x; n++; } } boots.push(s / n); }
boots.sort((a, b) => a - b);
const widths = rows.map((r) => r.hsWidth).sort((a, b) => a - b), cut = widths[Math.floor(widths.length * 0.8)];
const stress = rows.filter((r) => r.hsWidth >= cut);
const cov = share(rows, (r) => r.msIn), covHs = share(rows, (r) => r.hsIn), sCov = share(stress, (r) => r.msIn), sHs = share(stress, (r) => r.hsIn);
const diff = mean(rows.map((r) => r.msPin - r.hsPin)), lo = boots[Math.floor(R * 0.025)], hi = boots[Math.floor(R * 0.975)];
const pass = { H1: cov >= 0.75 && cov <= 0.85, H2: hi < 0, H3: Math.abs(sCov - 0.8) < Math.abs(sHs - 0.8) };
const report = {
  rule: "MSG-r1", data: { symbols: new Set(rows.map((r) => r.symbol)).size, forecasts: rows.length, dates: days.length, from: days[0], to: days.at(-1) },
  convergedPct: converged / rows.length, warnedPct: warned / rows.length,
  msgarch: { coverage: cov, below: share(rows, (r) => r.msBelow), above: share(rows, (r) => r.msAbove), width: mean(rows.map((r) => r.msWidth)), pinball: mean(rows.map((r) => r.msPin)) },
  historical: { coverage: covHs, width: mean(rows.map((r) => r.hsWidth)), pinball: mean(rows.map((r) => r.hsPin)) },
  pinballDiff: { mean: diff, lo, hi }, stress: { n: stress.length, msgarch: sCov, historical: sHs },
  verdicts: { ...pass, final: pass.H1 && pass.H2 && pass.H3 ? "PASS" : "FAIL" },
};
fs.writeFileSync(output, JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));
