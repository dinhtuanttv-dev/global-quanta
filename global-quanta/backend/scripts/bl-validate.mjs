// BL-r1 (07/11/2026) — kiểm định walk-forward ĐÚNG BL-prereg.md. Dùng: node scripts/bl-validate.mjs <dataDir> <ra.json>
// <dataDir>: universe.json (scanner:universe), st/<MÃ>.json.gz (BCTC quý + năm, có cổ tức đã trả), px/<MÃ>.json ([ngày, adClose, close]), px/VNINDEX.json.
import fs from "node:fs";
import zlib from "node:zlib";
import { FM_VERSION, pitFeatures, scoreCrossSection } from "../src/market/events/factorModel.js";

const [DIR, OUT] = process.argv.slice(2);
const uni = JSON.parse(fs.readFileSync(`${DIR}/universe.json`, "utf8")).tickers;
const sector = new Map(uni.map((u) => [u.ticker, u.sectorGroup ?? u.industry ?? "?"]));
const recs = new Map(), pxs = new Map();
for (const u of uni) {
  try { recs.set(u.ticker, JSON.parse(zlib.gunzipSync(fs.readFileSync(`${DIR}/st/${u.ticker}.json.gz`)).toString())); } catch { /* thiếu BCTC */ }
  try { pxs.set(u.ticker, JSON.parse(fs.readFileSync(`${DIR}/px/${u.ticker}.json`, "utf8")).filter((r) => r[1] > 0)); } catch { /* thiếu giá */ }
}
const vnDates = JSON.parse(fs.readFileSync(`${DIR}/px/VNINDEX.json`, "utf8")).map((r) => r[0]).sort();
const points = []; for (const d of vnDates) { const ym = d.slice(0, 7); if (ym >= "2021-06" && ym <= "2025-10" && (!points.length || points.at(-1).slice(0, 7) !== ym)) points.push(d); }
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const priceAt = (px, d, after = false) => { let lo = 0, hi = px.length; while (lo < hi) { const m = (lo + hi) >> 1; if (px[m][0] < d) lo = m + 1; else hi = m; } const i = after ? lo : (px[lo]?.[0] === d ? lo : lo - 1); return px[i] ?? null; };
const rankArr = (a) => { const idx = a.map((x, i) => [x, i]).sort((p, q) => p[0] - q[0]); const r = new Array(a.length); for (let i = 0; i < idx.length;) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2; i = j + 1; } return r; };
const spearman = (x, y) => { const rx = rankArr(x), ry = rankArr(y), n = x.length, mx = (n - 1) / 2; let num = 0, dx = 0, dy = 0; for (let i = 0; i < n; i++) { num += (rx[i] - mx) * (ry[i] - mx); dx += (rx[i] - mx) ** 2; dy += (ry[i] - mx) ** 2; } return num / Math.sqrt(dx * dy); };
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
function nwT(series, lag = 12) { const n = series.length, m = mean(series), e = series.map((x) => x - m); let s = e.reduce((t, x) => t + x * x, 0) / n; for (let L = 1; L <= lag; L++) { let c = 0; for (let i = L; i < n; i++) c += e[i] * e[i - L]; s += 2 * (1 - L / (lag + 1)) * c / n; } return m / Math.sqrt(s / n); }
function blockBoot(series, block = 12, iters = 2000, seed = 20261107) { let st = seed; const rnd = () => ((st = (st * 1664525 + 1013904223) >>> 0) / 2 ** 32); const n = series.length, out = []; for (let b = 0; b < iters; b++) { const s = []; while (s.length < n) { const k = Math.floor(rnd() * (n - block + 1)); for (let j = 0; j < block && s.length < n; j++) s.push(series[k + j]); } out.push(mean(s)); } out.sort((a, b) => a - b); return [out[Math.floor(iters * 0.025)], out[Math.floor(iters * 0.975)]]; }

const monthly = []; const cutObs = new Map(); // `${t}|${fy}` -> { score, cut }
const groupIc = { Y: [], D: [], G: [], Q: [], V: [], R: [] };
for (const t of points) {
  const items = [];
  for (const [tk, rec] of recs) { const px = pxs.get(tk); if (!px) continue; const f = pitFeatures(rec, px, t); if (f) items.push({ t: tk, sector: sector.get(tk), f }); }
  const sc = scoreCrossSection(items);
  const rows = [];
  for (const it of items) {
    const s = sc.get(it.t); if (!s || s.score == null) continue;
    const px = pxs.get(it.t), p0 = priceAt(px, t), p1 = priceAt(px, addDays(t, 365), true);
    const fwd = p0 && p1 && p1[0] <= addDays(t, 380) ? p1[1] / p0[1] - 1 : null;
    rows.push({ tk: it.t, score: s.score, groups: s.groups, fwd });
    // Cắt cổ tức năm tài chính kế tiếp (mỗi cặp mã–năm lấy lần chấm đầu tiên sau khi BCTC năm có)
    const fy = it.f._lastFy, D = it.f._lastD;
    if (fy && D > 0 && !cutObs.has(`${it.t}|${fy}`)) { const next = recs.get(it.t).annual?.find((a) => a.year === fy + 1); const Dn = next && typeof next.v?.divPaid === "number" ? Math.abs(next.v.divPaid) : null; if (Dn != null && `${fy + 2}-04-01` <= "2026-11-07") cutObs.set(`${it.t}|${fy}`, { score: s.score, cut: Dn < 0.9 * D }); }
  }
  const withRet = rows.filter((r) => r.fwd != null);
  if (withRet.length < 30) continue;
  const ic = spearman(withRet.map((r) => r.score), withRet.map((r) => r.fwd));
  const sorted = [...withRet].sort((a, b) => a.score - b.score), k = Math.floor(sorted.length / 5);
  const spread = mean(sorted.slice(-k).map((r) => r.fwd)) - mean(sorted.slice(0, k).map((r) => r.fwd));
  for (const g of Object.keys(groupIc)) { const gg = withRet.filter((r) => r.groups[g] != null); if (gg.length >= 30) groupIc[g].push(spearman(gg.map((r) => r.groups[g]), gg.map((r) => r.fwd))); }
  monthly.push({ t, n: withRet.length, ic, spread });
}
// AUC (−điểm dự đoán cắt)
const obs = [...cutObs.values()], pos = obs.filter((o) => o.cut), neg = obs.filter((o) => !o.cut);
let auc = null; if (pos.length && neg.length) { let w = 0; for (const p of pos) for (const q of neg) w += -p.score > -q.score ? 1 : -p.score === -q.score ? 0.5 : 0; auc = w / (pos.length * neg.length); }
const ics = monthly.map((m) => m.ic), spreads = monthly.map((m) => m.spread);
const half = (arr, a) => (arr.length ? mean(a ? arr.slice(0, arr.length >> 1) : arr.slice(arr.length >> 1)) : null);
const H1 = { months: monthly.length, meanIc: +mean(ics).toFixed(4), nwT: +nwT(ics).toFixed(2), pass: mean(ics) >= 0.03 && nwT(ics) >= 2 };
const ci = blockBoot(spreads);
const H2 = { meanSpread: +mean(spreads).toFixed(4), ci: ci.map((x) => +x.toFixed(4)), pass: mean(spreads) > 0 && ci[0] > 0 };
const H3 = { cuts: pos.length, nonCuts: neg.length, auc: auc == null ? null : +auc.toFixed(3), pass: auc != null && auc >= 0.6 && pos.length >= 100 };
const H4 = { groupIc: Object.fromEntries(Object.entries(groupIc).map(([g, a]) => [g, a.length ? +mean(a).toFixed(4) : null])), icFirstHalf: +half(ics, true).toFixed(4), icSecondHalf: +half(ics, false).toFixed(4), avgN: Math.round(mean(monthly.map((m) => m.n))) };
const rep = { version: FM_VERSION, test: "BL-r1", ranAt: new Date().toISOString(), tickers: recs.size, H1, H2, H3, H4, pass: H1.pass && H2.pass && H3.pass, monthly: monthly.map((m) => ({ ...m, ic: +m.ic.toFixed(4), spread: +m.spread.toFixed(4) })) };
fs.writeFileSync(OUT, JSON.stringify(rep, null, 1));
console.log(JSON.stringify({ ...rep, monthly: undefined }, null, 1));
