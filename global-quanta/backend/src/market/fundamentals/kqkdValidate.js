// KQ-r1 (06/11/2026) — kiểm định đặt trước SUE LN cốt lõi & ước tính LNST cả năm. Xem KQ-prereg.md. Hàm thuần.
// Tín hiệu tính bằng ĐÚNG hàm của giao diện (kqkdEngine.js) trên dữ liệu point-in-time của từng sự kiện.
import { createHash } from "node:crypto";
import { prepareQuarters, seasonality } from "./kqkdEngine.js";
import { standardizedSurprise } from "./earningsQuality.js";
import { blockBootstrap, holm, spearman } from "../alpha/validate.js";

export const KQ_PREREG = Object.freeze({
  version: "KQ-r1 (2026-11-06)", horizon: 60, horizonAlt: 20, cost: 0.01, minLiquidity: 1e9, liqWindow: 20, minCohort: 30,
  availLagMaxDays: 120, deadlineDays: 45, is: ["2013-1", "2019-4"], oos: ["2020-1", "2026-1"], bootstrap: { iters: 2000, block: 4, seed: 20261106 }, alpha: 0.05,
  coverage: [0.7, 0.9],
});
const P = KQ_PREREG;
const DAY = 864e5;
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const fin = (x) => typeof x === "number" && Number.isFinite(x);
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const median = (a) => { const s = a.filter(fin).sort((x, y) => x - y); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const r4 = (x) => (fin(x) ? Math.round(x * 1e4) / 1e4 : null);
const qIdx = (f) => Math.ceil(Number(f.slice(5, 7)) / 3);
const keyOf = (f) => `${f.slice(0, 4)}-${qIdx(f)}`;
const inRange = (k, [a, b]) => { const n = (s) => Number(s.slice(0, 4)) * 4 + Number(s.slice(5)); return n(k) >= n(a) && n(k) <= n(b); };

/** Ngày thông tin có sẵn theo quy tắc chốt. */
export function availDate(q) {
  const end = Date.parse(`${q.fiscal}T00:00:00Z`);
  const c = q.created ? Date.parse(`${q.created}T00:00:00Z`) : null;
  if (c != null && c >= end && c - end <= P.availLagMaxDays * DAY) return q.created;
  return iso(end + P.deadlineDays * DAY);
}
export const entryDateOf = (q) => { const dl = iso(Date.parse(`${q.fiscal}T00:00:00Z`) + P.deadlineDays * DAY); const a = availDate(q); return a > dl ? a : dl; };

/** Chuỗi giá: [[date, adClose, nmValue]] -> tra cứu theo chỉ số phiên. */
export function priceIndex(rows) {
  const dates = rows.map((r) => r[0]), close = rows.map((r) => r[1]), val = rows.map((r) => r[2]);
  const after = (d) => { let lo = 0, hi = dates.length; while (lo < hi) { const m = (lo + hi) >> 1; if (dates[m] <= d) lo = m + 1; else hi = m; } return lo; }; // phiên đầu tiên > d
  return { dates, close, val, after };
}

/** Sự kiện của một mã: tín hiệu tại ngày vào (point-in-time) + lợi suất thô 20/60 phiên + thanh khoản. */
export function tickerEvents(rec, px) {
  if (!rec?.quarters?.length || !px) return [];
  const qs = rec.quarters.filter((q) => /-(03|06|09|12)-/.test(q.fiscal)).map((q) => ({ ...q, created: availDate(q) }));
  const out = [];
  for (const q of qs) {
    const k = keyOf(q.fiscal);
    if (!inRange(k, [P.is[0], P.oos[1]])) continue;
    const entry = entryDateOf(rec.quarters.find((x) => x.fiscal === q.fiscal));
    const by = prepareQuarters(rec.tpl, qs, entry);
    const n = Number(q.fiscal.slice(0, 4)) * 4 + qIdx(q.fiscal) - 1;
    if (!by.has(n)) continue;
    const mk = (key) => new Map([...by.values()].map((x) => [`${Math.floor(x.n / 4)}-${(x.n % 4) + 1}`, x.d[key]]));
    const sueCore = standardizedSurprise(mk("core"), q.fiscal), sueNpat = standardizedSurprise(mk("npatParent"), q.fiscal);
    const s = qIdx(q.fiscal) < 4 ? seasonality(by, "npatParent", n) : null;
    const nc = s?.nowcast ?? null;
    const i0 = px.after(entry);
    if (i0 >= px.dates.length) continue;
    const liq = median(px.val.slice(Math.max(0, i0 - P.liqWindow), i0));
    const ret = (h) => (i0 + h < px.close.length ? px.close[i0 + h] / px.close[i0] - 1 : null);
    out.push({ t: rec.ticker, tpl: rec.tpl, k, fiscal: q.fiscal, entry, d0: px.dates[i0], i0, liq, sueCore, sueNpat,
      nowcastGrowth: nc?.growth ?? null, nowcast: nc ? { est: nc.est, lo: nc.lo, hi: nc.hi, lastFy: nc.lastFy, ytd: nc.ytd, through: nc.through } : null,
      r20: ret(P.horizonAlt), r60: ret(P.horizon), d20: px.dates[i0 + P.horizonAlt] ?? null, d60: px.dates[i0 + P.horizon] ?? null });
  }
  return out;
}

/** Lợi suất vượt = lợi suất mã − bình quân đều mọi mã có giá ở cả hai mốc (mốc theo ngày vào d0 của sự kiện). */
export function attachExcess(events, pxOf) {
  const benchMemo = new Map();
  const bench = (d0, h) => {
    const key = `${d0}|${h}`; if (benchMemo.has(key)) return benchMemo.get(key);
    const rs = [];
    for (const px of pxOf.values()) {
      const i = px.after(iso(Date.parse(`${d0}T00:00:00Z`) - DAY)); // phiên = d0
      if (i < px.dates.length && px.dates[i] === d0 && i + h < px.close.length) rs.push(px.close[i + h] / px.close[i] - 1);
    }
    const m = rs.length >= 30 ? mean(rs) : null; benchMemo.set(key, m); return m;
  };
  for (const e of events) {
    const b60 = bench(e.d0, P.horizon), b20 = bench(e.d0, P.horizonAlt);
    e.x60 = fin(e.r60) && fin(b60) ? e.r60 - b60 : null; e.x20 = fin(e.r20) && fin(b20) ? e.r20 - b20 : null;
  }
  return events;
}

/** IC và chênh lệch ngũ phân vị theo lứa. */
export function cohortStats(events, signal, { ret = "x60", range }) {
  const byK = new Map();
  for (const e of events) {
    if (!inRange(e.k, range) || !fin(e[signal]) || !fin(e[ret]) || !(e.liq >= P.minLiquidity)) continue;
    (byK.get(e.k) ?? byK.set(e.k, []).get(e.k)).push(e);
  }
  const rows = [];
  for (const [k, es] of [...byK].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))) {
    if (es.length < P.minCohort) continue;
    const ic = spearman(es.map((e) => e[signal]), es.map((e) => e[ret]));
    const s = [...es].sort((a, b) => a[signal] - b[signal]), q = Math.floor(s.length / 5);
    const spread = mean(s.slice(-q).map((e) => e[ret])) - mean(s.slice(0, q).map((e) => e[ret])) - P.cost;
    rows.push({ k, n: es.length, ic: r4(ic), spread: r4(spread) });
  }
  return rows;
}
const boot = (xs) => blockBootstrap(xs, { iters: P.bootstrap.iters, block: P.bootstrap.block, seed: P.bootstrap.seed });

/** H4 — độ chính xác ước tính cả năm so với cách ngây thơ; độ phủ dải P10–P90. */
export function nowcastAccuracy(events, recs, range) {
  const fyOf = new Map();
  for (const rec of recs) {
    const by = new Map(rec.quarters.filter((q) => /-(03|06|09|12)-/.test(q.fiscal)).map((q) => [keyOf(q.fiscal), q.v?.npatParent ?? q.v?.npat]));
    fyOf.set(rec.ticker, (y) => { const v = [1, 2, 3, 4].map((k) => by.get(`${y}-${k}`)); return v.every(fin) ? v.reduce((a, b) => a + b, 0) : null; });
  }
  const recOf = new Map(recs.map((r) => [r.ticker, r]));
  const byYear = new Map(); const rows = [];
  for (const e of events) {
    if (!e.nowcast || !inRange(e.k, range)) continue;
    const y = Number(e.fiscal.slice(0, 4)), actual = fyOf.get(e.t)?.(y);
    if (!fin(actual) || actual <= 0) continue;
    const rec = recOf.get(e.t);
    const ytdPrev = [1, 2, 3].slice(0, e.nowcast.through).map((k) => rec.quarters.find((q) => keyOf(q.fiscal) === `${y - 1}-${k}`)?.v?.npatParent);
    const yp = ytdPrev.every(fin) ? ytdPrev.reduce((a, b) => a + b, 0) : null;
    const naive = fin(yp) && yp > 0 && fin(e.nowcast.lastFy) ? e.nowcast.lastFy * (e.nowcast.ytd / yp) : null;
    if (!fin(naive)) continue;
    const ape = Math.abs(e.nowcast.est / actual - 1), apeN = Math.abs(naive / actual - 1);
    rows.push({ k: e.k, ape, apeN, inBand: actual >= e.nowcast.lo && actual <= e.nowcast.hi });
    (byYear.get(e.k) ?? byYear.set(e.k, []).get(e.k)).push(apeN - ape); // > 0: ước tính tốt hơn
  }
  const diffs = [...byYear].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true })).map(([, d]) => median(d));
  return { n: rows.length, medianApe: r4(median(rows.map((r) => r.ape))), medianApeNaive: r4(median(rows.map((r) => r.apeN))),
    coverage: r4(rows.length ? rows.filter((r) => r.inBand).length / rows.length : null), cohortDiff: boot(diffs) };
}

export function evaluate(events, recs) {
  const part = (range) => ({
    sueCore: cohortStats(events, "sueCore", { range }), sueNpat: cohortStats(events, "sueNpat", { range }), nowcast: cohortStats(events, "nowcastGrowth", { range }),
    sueCore20: cohortStats(events, "sueCore", { range, ret: "x20" }), nowcast20: cohortStats(events, "nowcastGrowth", { range, ret: "x20" }),
  });
  const is = part(P.is), oos = part(P.oos);
  const sum = (rows) => ({ cohorts: rows.length, ic: boot(rows.map((r) => r.ic)), spread: boot(rows.map((r) => r.spread)) });
  const paired = (a, b) => { const mb = new Map(b.map((r) => [r.k, r.ic])); return boot(a.filter((r) => mb.has(r.k)).map((r) => r.ic - mb.get(r.k))); };
  const S = { is: { sueCore: sum(is.sueCore), sueNpat: sum(is.sueNpat), nowcast: sum(is.nowcast) }, oos: { sueCore: sum(oos.sueCore), sueNpat: sum(oos.sueNpat), nowcast: sum(oos.nowcast), sueCore20: sum(oos.sueCore20), nowcast20: sum(oos.nowcast20) } };
  const h2 = paired(oos.sueCore, oos.sueNpat);
  const tests = holm([{ id: "H1", p: S.oos.sueCore.ic.pOneSided }, { id: "H2", p: h2.pOneSided }, { id: "H3", p: S.oos.nowcast.ic.pOneSided }], P.alpha);
  const rej = (id) => tests.find((t) => t.id === id)?.reject ?? false;
  const acc = { is: nowcastAccuracy(events, recs, P.is), oos: nowcastAccuracy(events, recs, P.oos) };
  const verdict = {
    H1: rej("H1") && S.oos.sueCore.spread.mean > 0 && S.is.sueCore.ic.mean > 0,
    H2: rej("H2"),
    H3: rej("H3") && S.oos.nowcast.spread.mean > 0 && S.is.nowcast.ic.mean > 0,
    H4: (acc.oos.cohortDiff.pOneSided ?? 1) <= P.alpha && acc.oos.medianApe < acc.oos.medianApeNaive && acc.oos.coverage >= P.coverage[0] && acc.oos.coverage <= P.coverage[1],
  };
  const byTpl = Object.fromEntries(["corp", "bank", "sec", "ins"].map((t) => [t, sum(cohortStats(events.filter((e) => e.tpl === t), "sueCore", { range: P.oos }))]));
  const eras = { "2020-2022": sum(cohortStats(events, "sueCore", { range: ["2020-1", "2022-4"] })), "2023-2026": sum(cohortStats(events, "sueCore", { range: ["2023-1", "2026-1"] })) };
  return { prereg: P.version, summary: S, h2, holm: tests, accuracy: acc, verdict, secondary: { sueCoreByTemplate: byTpl, sueCoreByEra: eras }, cohorts: { is, oos } };
}

export function hashConfig(obj) { return createHash("sha256").update(JSON.stringify(obj)).digest("hex"); }
