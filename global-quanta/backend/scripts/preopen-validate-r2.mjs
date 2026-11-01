// Kiểm định PO-r2-prereg.md. Chỉ đọc Yahoo + Gateway + dữ liệu VN100 cục bộ, không ghi DB.
//   node scripts/preopen-validate-r2.mjs <out.json> <dataDir> [gatewayBase]
import fs from "node:fs";
import path from "node:path";
import { alignRows, brier, classOf, pinball } from "../src/market/preopen/preopenModel.js";
import { enrich, fitScaled, STATES, stateProbs, unconditional, zBucket } from "../src/market/preopen/preopenR2.js";

const [output, dir, base = "https://gateway-production-1da0.up.railway.app"] = process.argv.slice(2);
if (!output || !dir) { console.error("Cách dùng: node scripts/preopen-validate-r2.mjs <out.json> <dataDir> [gatewayBase]"); process.exit(1); }
const MIN = 120, MAXT = 250, R = 2000, BLOCK = 5;
const yr = await (await fetch("https://query1.finance.yahoo.com/v8/finance/chart/ES%3DF?range=2y&interval=60m", { headers: { "user-agent": "Mozilla/5.0" } })).json();
const x = yr.chart.result[0], q = x.indicators.quote[0];
const es = x.timestamp.map((t, i) => ({ t, close: q.close[i] })).filter((b) => b.close != null);
const vn = (await (await fetch(`${base}/api/market/ohlcv?ticker=VNINDEX&limit=1300`)).json()).bars.filter((b) => b.close > 0 && !b.partial);
const items = (await (await fetch(`${base}/api/market/trading-matrix/index-impact`)).json()).items ?? [];
const groupOf = new Map(items.map((i) => [i.symbol, i.group ?? i.industry]));
const rows = enrich(alignRows(vn, es), vn);
const mean = (v) => v.reduce((a, b) => a + b, 0) / v.length;
const sd = (v) => { const m = mean(v); return Math.sqrt(v.reduce((a, x2) => a + (x2 - m) ** 2, 0) / (v.length - 1)); };
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function ci(vals, stat = mean) {
  const r = rng(20261102), n = vals.length, out = [];
  for (let k = 0; k < R; k++) { const s = []; while (s.length < n) { const st = Math.floor(r() * n); for (let j = 0; j < BLOCK && s.length < n; j++) s.push(vals[(st + j) % n]); } out.push(stat(s)); }
  out.sort((a, b) => a - b);
  return { mean: stat(vals), lo: out[Math.floor(R * 0.005)], hi: out[Math.floor(R * 0.995)] };
}
// Lợi suất từng nhóm theo ngày, từ giá điều chỉnh VN100.
const groupRet = new Map();
for (const f of fs.readdirSync(path.join(dir, "d"))) {
  const sym = f.slice(0, -5), g = groupOf.get(sym);
  if (sym === "VNINDEX" || !g) continue;
  const bars = JSON.parse(fs.readFileSync(path.join(dir, "d", f), "utf8")).bars;
  for (let i = 1; i < bars.length; i++) { if (!(bars[i - 1].close > 0)) continue; const d = String(bars[i].date).slice(0, 10), m = groupRet.get(d) ?? new Map(); m.set(g, [...(m.get(g) ?? []), (bars[i].close / bars[i - 1].close - 1) * 100]); groupRet.set(d, m); }
}
const groupDay = (d) => { const m = groupRet.get(d); if (!m) return new Map(); return new Map([...m].filter(([, v]) => v.length >= 3).map(([k, v]) => [k, mean(v)])); };
const recs = [], defensive = [];
for (let i = MIN; i < rows.length; i++) {
  const train = rows.slice(Math.max(0, i - MAXT), i), r = rows[i], s = sd(train.map((t) => t.es)), bucket = zBucket(r.es, s);
  const fo = fitScaled(train, "gap", "ew"), fm = fitScaled(train, "cc", "ms"), fe = fitScaled(train, "cc", "ew");
  const o = fo.predict(r.es, r.ew), g0 = unconditional(train, "gap"), u = unconditional(train, "cc");
  const m = fm && r.ms > 0 ? fm.predict(r.es, r.ms) : null, e = fe.predict(r.es, r.ew);
  const st = stateProbs(train, s), p = st.probs(r.es, r.above), cls = classOf(r.cc);
  const rec = { date: r.date, bucket, oc: r.oc, gap: r.gap, cc: r.cc, openIn: r.gap >= o.lo && r.gap <= o.hi, openPin: pinball(r.gap, o), openPin0: pinball(r.gap, g0), uIn: r.cc >= u.lo && r.cc <= u.hi, uPin: pinball(r.cc, u), eIn: r.cc >= e.lo && r.cc <= e.hi, ePin: pinball(r.cc, e), brier: brier(p, cls), brier0: brier(st.base, cls), hit: bucket === cls };
  if (m) { rec.mIn = r.cc >= m.lo && r.cc <= m.hi; rec.mPin = pinball(r.cc, m); }
  recs.push(rec);
  if (bucket === "neg") {
    const negDays = train.filter((t) => zBucket(t.es, s) === "neg").map((t) => t.date);
    if (negDays.length >= 8) {
      const sum = new Map();
      for (const d of negDays) for (const [g, v] of groupDay(d)) { const c = sum.get(g) ?? []; c.push(v); sum.set(g, c); }
      const ranked = [...sum].filter(([, v]) => v.length >= 5).map(([g, v]) => [g, mean(v)]).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([g]) => g);
      const today = groupDay(r.date), got = ranked.map((g) => today.get(g)).filter((v) => v != null);
      if (got.length) defensive.push(mean(got) - r.cc);
    }
  }
}
const share = (rs, f) => rs.filter(f).length / rs.length;
const inRange = (c) => c >= 0.75 && c <= 0.85;
const openCov = share(recs, (r) => r.openIn), openDiff = ci(recs.map((r) => r.openPin - r.openPin0));
const uPin = mean(recs.map((r) => r.uPin)), uCov = share(recs, (r) => r.uIn);
const withM = recs.filter((r) => r.mPin != null), mCov = share(withM, (r) => r.mIn), mPin = mean(withM.map((r) => r.mPin)), mU = mean(withM.map((r) => r.uPin));
const eCov = share(recs, (r) => r.eIn), ePin = mean(recs.map((r) => r.ePin));
const passM = inRange(mCov) && mPin <= mU * 1.02, passE = inRange(eCov) && ePin <= uPin * 1.02;
const skill = ci(recs.map((r) => [r.brier, r.brier0]), (s) => 1 - mean(s.map((p) => p[0])) / mean(s.map((p) => p[1])));
const byBucket = Object.fromEntries(STATES.map((k) => { const s = recs.filter((r) => r.bucket === k); return [k, { n: s.length, gap: mean(s.map((r) => r.gap)), oc: ci(s.map((r) => r.oc)), cc: mean(s.map((r) => r.cc)), hit: share(s, (r) => r.hit) }]; }));
const def = defensive.length > 1 ? ci(defensive) : null;
const gates = {
  openBand: inRange(openCov) && openDiff.hi < 0, dayModel: passM ? "ms" : passE ? "ew" : "uncond", dayBand: passM || passE || inRange(uCov), probabilities: skill.mean > 0 && skill.lo > 0,
  noPanicSell: byBucket.neg.n >= 30 && byBucket.neg.oc.mean > 0 && byBucket.neg.oc.lo > 0, noChase: byBucket.pos.n >= 30 && byBucket.pos.oc.mean < 0 && byBucket.pos.oc.hi < 0, defensive: !!def && defensive.length >= 30 && def.mean > 0 && def.lo > 0,
};
const report = { rule: "PO-r2", data: { tested: recs.length, from: recs[0].date, to: recs.at(-1).date, msTested: withM.length, groups: groupOf.size }, open: { coverage: openCov, pinball: mean(recs.map((r) => r.openPin)), pinball0: mean(recs.map((r) => r.openPin0)), diff: openDiff }, day: { ms: { coverage: mCov, pinball: mPin, pinballU: mU }, ew: { coverage: eCov, pinball: ePin }, uncond: { coverage: uCov, pinball: uPin } }, brierSkill: skill, hitRate: share(recs, (r) => r.hit), alwaysMid: share(recs, (r) => classOf(r.cc) === "mid"), byBucket, defensive: def && { n: defensive.length, ...def }, gates };
fs.writeFileSync(output, JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));
