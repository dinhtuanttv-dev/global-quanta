// DF-r1 (07/11/2026) — kiểm định walk-forward đúng DF-prereg.md. Dùng: node scripts/div-forecast-validate.mjs <vndirect-events.json> <ra.json>
// <vndirect-events.json> = mảng bản ghi thô VNDirect /v4/events của danh mục (mọi loại; script chỉ lấy DIVIDEND).
import fs from "node:fs";
import { normalize } from "../src/market/events/corpEvents.js";
import { DF, DF_VERSION, forecastTicker, naiveForecast, payClusters, universePrior } from "../src/market/events/divForecast.js";

const [IN, OUT] = process.argv.slice(2);
const raw = JSON.parse(fs.readFileSync(IN, "utf8"));
const byT = new Map();
for (const r of raw) { const e = normalize(r); if (!e || e.cat !== "CASH" || !e.ex) continue; (byT.get(e.t) ?? byT.set(e.t, []).get(e.t)).push({ ex: e.ex, disclosed: e.disclosed ?? e.ex }); }
const tickers = [...byT.keys()].sort();
const addD = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const dd = (a, b) => (Date.parse(a) - Date.parse(b)) / 864e5;

const points = []; for (let y = 2019; y <= 2026; y++) for (let m = 1; m <= 12; m++) { const t = `${y}-${String(m).padStart(2, "0")}-01`; if (t <= "2026-06-01") points.push(t); }
const rows = []; // mỗi chân lý
const probs = []; // mỗi (mã, t)
for (const t of points) {
  const sets = tickers.map((tk) => payClusters(byT.get(tk), t));
  const prior = universePrior(sets);
  for (const tk of tickers) {
    const ev = byT.get(tk);
    const truth = ev.filter((e) => e.ex > t && e.ex <= addD(t, DF.horizon) && e.disclosed >= t).map((e) => e.ex);
    const f = forecastTicker(ev, t, prior);
    const nv = naiveForecast(ev, t);
    const inH = f.filter((x) => x.date > t && x.date <= addD(t, DF.horizon));
    const P = 1 - inH.reduce((s, x) => s * (1 - x.p), 1);
    probs.push({ t, tk, P, y: truth.length > 0 ? 1 : 0 });
    for (const a of truth) {
      const m = f.map((x) => ({ x, d: Math.abs(dd(x.date, a)) })).sort((u, v) => u.d - v.d)[0];
      const n = nv.map((d) => Math.abs(dd(d, a))).sort((u, v) => u - v)[0];
      rows.push({ t, tk, actual: a, df: m && m.d <= 60 ? m.d : null, inBand: m && m.d <= 60 ? (a >= m.x.lo && a <= m.x.hi) : null, naive: n != null && n <= 60 ? n : null });
    }
  }
}
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
function h1(rs) {
  const both = rs.filter((r) => r.df != null && r.naive != null);
  const ratio = (xs) => mean(xs.map((r) => r.df)) / mean(xs.map((r) => r.naive));
  // bootstrap theo cụm mã
  const byTk = new Map(); for (const r of both) (byTk.get(r.tk) ?? byTk.set(r.tk, []).get(r.tk)).push(r);
  const ks = [...byTk.keys()]; let seed = 20261107; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const bs = []; for (let b = 0; b < 1000; b++) { const s = []; for (let i = 0; i < ks.length; i++) s.push(...byTk.get(ks[Math.floor(rnd() * ks.length)])); bs.push(ratio(s)); }
  bs.sort((a, b) => a - b);
  const r = ratio(both);
  return { n: both.length, maeDf: +mean(both.map((x) => x.df)).toFixed(2), maeNaive: +mean(both.map((x) => x.naive)).toFixed(2), ratio: +r.toFixed(3), ci: [+bs[25].toFixed(3), +bs[974].toFixed(3)], pass: r <= 0.85 && bs[974] < 1 };
}
const H1 = h1(rows);
const dfM = rows.filter((r) => r.df != null);
const H2 = { n: dfM.length, coverage: +(dfM.filter((r) => r.inBand).length / dfM.length).toFixed(3) }; H2.pass = H2.coverage >= 0.7 && H2.coverage <= 0.9;
const base = mean(probs.map((p) => p.y));
const bsM = mean(probs.map((p) => (p.P - p.y) ** 2)), bsC = mean(probs.map((p) => (base - p.y) ** 2));
const H3 = { n: probs.length, baseRate: +base.toFixed(3), brier: +bsM.toFixed(4), brierClim: +bsC.toFixed(4), skill: +(1 - bsM / bsC).toFixed(3) }; H3.pass = H3.skill >= 0.1;
const H4 = { first: h1(rows.filter((r) => r.t < "2023-01-01")), second: h1(rows.filter((r) => r.t >= "2023-01-01")) }; H4.pass = H4.first.pass && H4.second.pass;
const rep = { version: DF_VERSION, test: "DF-r1", ranAt: new Date().toISOString(), tickers: tickers.length, points: points.length, truths: rows.length, matchedDf: dfM.length, matchedNaive: rows.filter((r) => r.naive != null).length, H1, H2, H3, H4, pass: H1.pass && H2.pass && H3.pass && H4.pass };
fs.writeFileSync(OUT, JSON.stringify(rep, null, 1));
console.log(JSON.stringify(rep, null, 1));
