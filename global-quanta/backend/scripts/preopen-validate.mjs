// Kiểm định PO-prereg.md. Chỉ đọc Yahoo + Gateway, không ghi DB.
//   node scripts/preopen-validate.mjs <out.json> [gatewayBase]
import fs from "node:fs";
import { alignRows, BUCKETS, baselineOpen, brier, bucketOf, classOf, fitBuckets, fitOpen, pinball, TRAIN_DAYS } from "../src/market/preopen/preopenModel.js";

const [output, base = "https://gateway-production-1da0.up.railway.app"] = process.argv.slice(2);
if (!output) { console.error("Cách dùng: node scripts/preopen-validate.mjs <out.json> [gatewayBase]"); process.exit(1); }
const MIN_TRAIN = 120, R = 2000, BLOCK = 5;
const yr = await (await fetch("https://query1.finance.yahoo.com/v8/finance/chart/ES%3DF?range=2y&interval=60m", { headers: { "user-agent": "Mozilla/5.0" } })).json();
const x = yr.chart.result[0], q = x.indicators.quote[0];
const es = x.timestamp.map((t, i) => ({ t, close: q.close[i] })).filter((b) => b.close != null);
const vn = (await (await fetch(`${base}/api/market/ohlcv?ticker=VNINDEX&limit=1300`)).json()).bars.filter((b) => b.close > 0 && !b.partial);
const rows = alignRows(vn, es);
const mean = (v) => v.reduce((a, b) => a + b, 0) / v.length;
const recs = [];
for (let i = MIN_TRAIN; i < rows.length; i++) {
  const train = rows.slice(Math.max(0, i - TRAIN_DAYS), i), r = rows[i];
  const m = fitOpen(train), o = m.predict(r.es), b0 = baselineOpen(train), f = fitBuckets(train), b = f.buckets[bucketOf(r.es)];
  const u = f.unconditional, day = { lo: b.dayLo, mid: b.dayMid, hi: b.dayHi }, day0 = { lo: u.dayLo, mid: u.dayMid, hi: u.dayHi };
  recs.push({ date: r.date, es: r.es, bucket: bucketOf(r.es), gap: r.gap, oc: r.oc, cc: r.cc, openIn: r.gap >= o.lo && r.gap <= o.hi, dayIn: r.cc >= day.lo && r.cc <= day.hi,
    openPin: pinball(r.gap, o), openPin0: pinball(r.gap, b0), dayPin: pinball(r.cc, day), dayPin0: pinball(r.cc, day0), brier: brier(b.probs, classOf(r.cc)), brier0: brier(f.base, classOf(r.cc)), hit: bucketOf(r.es) === classOf(r.cc) });
}
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function ci(vals, stat = mean) {
  const r = rng(20261101), n = vals.length, out = [];
  for (let k = 0; k < R; k++) { const s = []; while (s.length < n) { const st = Math.floor(r() * n); for (let j = 0; j < BLOCK && s.length < n; j++) s.push(vals[(st + j) % n]); } out.push(stat(s)); }
  out.sort((a, b) => a - b);
  return { mean: stat(vals), lo: out[Math.floor(R * 0.025)], hi: out[Math.floor(R * 0.975)] };
}
const share = (f) => recs.filter(f).length / recs.length;
const openCov = share((r) => r.openIn), dayCov = share((r) => r.dayIn);
const openDiff = ci(recs.map((r) => r.openPin - r.openPin0));
const dayMean = mean(recs.map((r) => r.dayPin)), dayMean0 = mean(recs.map((r) => r.dayPin0));
const pairs = recs.map((r) => [r.brier, r.brier0]);
const skill = ci(pairs, (s) => 1 - mean(s.map((p) => p[0])) / mean(s.map((p) => p[1])));
const byBucket = Object.fromEntries(BUCKETS.map((k) => { const s = recs.filter((r) => r.bucket === k); return [k, { n: s.length, gap: s.length ? mean(s.map((r) => r.gap)) : null, cc: s.length ? mean(s.map((r) => r.cc)) : null, oc: s.length > 1 ? ci(s.map((r) => r.oc)) : null, hit: s.length ? s.filter((r) => r.hit).length / s.length : null }]; }));
const gates = {
  openBand: openCov >= 0.75 && openCov <= 0.85 && openDiff.hi < 0,
  dayBand: dayCov >= 0.75 && dayCov <= 0.85 && dayMean <= dayMean0 * 1.02,
  probabilities: skill.mean > 0 && skill.lo > 0,
  noPanicSell: byBucket.neg.n >= 30 && byBucket.neg.oc.mean > 0 && byBucket.neg.oc.lo > 0,
  noChase: byBucket.pos.n >= 30 && byBucket.pos.oc.mean < 0 && byBucket.pos.oc.hi < 0,
};
const report = { rule: "PO-r1", data: { aligned: rows.length, tested: recs.length, from: recs[0]?.date, to: recs.at(-1)?.date }, open: { coverage: openCov, pinball: mean(recs.map((r) => r.openPin)), pinball0: mean(recs.map((r) => r.openPin0)), diff: openDiff }, day: { coverage: dayCov, pinball: dayMean, pinball0: dayMean0 }, brierSkill: skill, byBucket, gates };
fs.writeFileSync(output, JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));
