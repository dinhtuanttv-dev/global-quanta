// BL-r2 (07/11/2026) — kiểm định ĐÚNG BL-r2-prereg.md (commit 6db4ebe). Dùng: node scripts/bl-r2-validate.mjs <dataDir> <ra.json>
// <dataDir>: như bl-validate.mjs + ev/<MÃ>.json (sự kiện /api/corp-events/ticker/:t).
import fs from "node:fs";
import zlib from "node:zlib";
import { FM_VERSION, pitFeatures, scoreCrossSection } from "../src/market/events/factorModel.js";

const [DIR, OUT] = process.argv.slice(2);
const AS_OF = "2026-11-07";
const uni = JSON.parse(fs.readFileSync(`${DIR}/universe.json`, "utf8")).tickers;
const sector = new Map(uni.map((u) => [u.ticker, u.sectorGroup ?? u.industry ?? "?"]));
const recs = new Map(), pxs = new Map(), evs = new Map();
for (const u of uni) {
  try { recs.set(u.ticker, JSON.parse(zlib.gunzipSync(fs.readFileSync(`${DIR}/st/${u.ticker}.json.gz`)).toString())); } catch { /* thiếu BCTC */ }
  try { pxs.set(u.ticker, JSON.parse(fs.readFileSync(`${DIR}/px/${u.ticker}.json`, "utf8")).filter((r) => r[1] > 0)); } catch { /* thiếu giá */ }
  try { evs.set(u.ticker, JSON.parse(fs.readFileSync(`${DIR}/ev/${u.ticker}.json`, "utf8"))); } catch { /* thiếu sự kiện */ }
}
const vnDates = JSON.parse(fs.readFileSync(`${DIR}/px/VNINDEX.json`, "utf8")).map((r) => r[0]).sort();

/** Mục tiêu theo prereg: DPS(X), DPS điều chỉnh(X+1), cắt, có trả cổ phiếu năm X+1. */
export function cutTarget(events, X, asOf = AS_OF) {
  const cash = events.filter((e) => e.cat === "CASH" && typeof e.cash === "number" && e.cash > 0 && e.ex);
  const fy = (e) => (Number.isInteger(e.year) ? e.year : Number(e.ex.slice(0, 4)));
  const a = cash.filter((e) => fy(e) === X), b = cash.filter((e) => fy(e) === X + 1);
  const dps0 = a.reduce((s, e) => s + e.cash, 0);
  if (!(dps0 > 0)) return null;
  const lo = a.map((e) => e.ex).sort().at(-1);
  const hi = b.length ? b.map((e) => e.ex).sort().at(-1) : asOf;
  const stock = events.filter((e) => (e.cat === "STOCK" || e.cat === "BONUS") && e.ex && e.ex > lo && e.ex <= hi && typeof e.ratio === "number" && e.ratio > 0);
  const F = stock.reduce((f, e) => f * (1 + e.ratio / 100), 1);
  const dps1 = b.reduce((s, e) => s + e.cash, 0) * F;
  return { dps0, dps1, F, cut: dps1 < 0.9 * dps0, stockYear: stock.length > 0 };
}

function auc(obs) { // obs: [{ s: điểm dự đoán cắt (cao = dễ cắt), y: bool }] — Mann–Whitney có hạng trung bình
  const pos = obs.filter((o) => o.y).length, neg = obs.length - pos;
  if (!pos || !neg) return null;
  const sorted = [...obs].sort((p, q) => p.s - q.s); let rankSum = 0;
  for (let i = 0; i < sorted.length;) { let j = i; while (j + 1 < sorted.length && sorted[j + 1].s === sorted[i].s) j++; const r = (i + j) / 2 + 1; for (let k = i; k <= j; k++) if (sorted[k].y) rankSum += r; i = j + 1; }
  return (rankSum - pos * (pos + 1) / 2) / (pos * neg);
}

const obs = [];
for (const X of [2022, 2023, 2024]) {
  if (`${X + 2}-10-01` > AS_OF) continue;
  const t = vnDates.find((d) => d >= `${X + 1}-04-01`);
  const items = [];
  for (const [tk, rec] of recs) { const px = pxs.get(tk); if (!px) continue; const f = pitFeatures(rec, px, t); if (f) items.push({ t: tk, sector: sector.get(tk), f }); }
  const sc = scoreCrossSection(items);
  for (const it of items) {
    const s = sc.get(it.t); if (!s || s.score == null) continue;
    const tg = cutTarget(evs.get(it.t) ?? [], X); if (!tg) continue;
    obs.push({ tk: it.t, X, at: t, score: s.score, D: s.groups.D, ...tg });
  }
}
const toObs = (arr, key = "score") => arr.filter((o) => o[key] != null).map((o) => ({ s: -o[key], y: o.cut }));
const main = auc(toObs(obs));
// Bootstrap theo mã (seed cố định)
let st = 20261107; const rnd = () => ((st = (st * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const byTk = new Map(); for (const o of obs) { if (!byTk.has(o.tk)) byTk.set(o.tk, []); byTk.get(o.tk).push(o); }
const tks = [...byTk.keys()], boots = [];
for (let b = 0; b < 2000; b++) { const s = []; for (let i = 0; i < tks.length; i++) s.push(...byTk.get(tks[Math.floor(rnd() * tks.length)])); const a = auc(toObs(s)); if (a != null) boots.push(a); }
boots.sort((a, b) => a - b);
const ci = [boots[Math.floor(boots.length * 0.025)], boots[Math.floor(boots.length * 0.975)]];
const cuts = obs.filter((o) => o.cut).length;
const r3 = (x) => (x == null ? null : +x.toFixed(3));
const H3a = { auc: r3(main), pass: main != null && main >= 0.6 };
const H3b = { cuts, nonCuts: obs.length - cuts, pass: cuts >= 100 };
const H3c = { ci: ci.map(r3), pass: ci[0] > 0.5 };
const report = {
  byPair: Object.fromEntries([2022, 2023, 2024].map((X) => { const o = obs.filter((x) => x.X === X); return [`${X}->${X + 1}`, { n: o.length, cuts: o.filter((x) => x.cut).length, auc: r3(auc(toObs(o))), scoredAt: o[0]?.at ?? null }]; })),
  excludingStockYears: (() => { const o = obs.filter((x) => !x.stockYear); return { n: o.length, cuts: o.filter((x) => x.cut).length, auc: r3(auc(toObs(o))) }; })(),
  groupD: { auc: r3(auc(toObs(obs, "D"))) },
  cutRate: r3(cuts / obs.length),
};
const rep = { version: FM_VERSION, test: "BL-r2", ranAt: new Date().toISOString(), asOf: AS_OF, tickers: byTk.size, obs: obs.length, H3a, H3b, H3c, report, pass: H3a.pass && H3b.pass && H3c.pass };
fs.writeFileSync(OUT, JSON.stringify({ ...rep, rows: obs.map((o) => ({ t: o.tk, X: o.X, score: +o.score.toFixed(4), dps0: o.dps0, dps1: Math.round(o.dps1), F: +o.F.toFixed(4), cut: o.cut })) }, null, 1));
console.log(JSON.stringify(rep, null, 1));
