// PZ-r2 (prereg: backend/src/market/elite/PZ-r2-prereg.md) — "chỉ mua ở Vùng mua" (P2) so với G2r (P0) trên giai đoạn kiểm định 19/05/2023 → 12/11/2026.
// Cùng dữ liệu, khung và hàm mô phỏng với PZ-r1 (pz-r1-backtest.mjs); tiêu chí mục 5 của PZ-r2-prereg.md (mục tiêu: giảm sụt giảm).
//   node backend/scripts/pz-r2-backtest.mjs --panels <dir> --px <dir OHLC> --index <VNINDEX.json> --tax <taxonomy.json> --out <tệp json>
import fs from "node:fs"; import path from "node:path"; import zlib from "node:zlib"; import { pathToFileURL } from "node:url";
const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const M_ = (p) => import(pathToFileURL(path.join(HERE, "../src/market", p)).href);
const { buildHlPortfolio, isoWeek, HL_PF } = await M_("elite/eliteHl.js");
const { detectBox, hotReasons, pzMeasures, pzStep, PZ_RULES, PZ_WATCH } = await M_("elite/pricePosition.js");
const { hlScores } = await M_("elite/confluence.js");
const L = await M_("elite/leadership.js");
const { buildSectorRotation } = await M_("sectors/sectorRotation.js");
const { deflatedSharpe, sharpe } = await M_("elite/overfit.js");
const arg = (k, d = null) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const PANELS = arg("panels"), PX = arg("px"), IDX = arg("index"), TAX = arg("tax"), OUT = arg("out");
const DECISION = ["2014-03-03", "2019-12-31"], REPORT = ["2020-01-02", "2026-11-12"];
const fin = Number.isFinite, COST_BUY = HL_PF.costBuy, COST_SELL = HL_PF.costSell;

// ── Dữ liệu ──
const icb = JSON.parse(fs.readFileSync(TAX, "utf8"));
const idxRows = JSON.parse(fs.readFileSync(IDX, "utf8")).filter((r) => r[4] > 0);
const days = idxRows.map((r) => r[0]), dayPos = new Map(days.map((d, i) => [d, i])), vnClose = idxRows.map((r) => r[4]);
const px = new Map(); // mã -> Map(ngày -> { c: đóng cửa điều chỉnh (đồng), raw, ceil, floor, v })
const barsOf = new Map();
for (const f of fs.readdirSync(PX)) {
  const t = f.replace(/\.json$/, ""); let rows; try { rows = JSON.parse(fs.readFileSync(path.join(PX, f), "utf8")); } catch { continue; }
  const m = new Map(); const b = [];
  for (const r of rows) if (r[4] > 0) { m.set(r[0], { c: r[4] * 1000, raw: r[5], ceil: r[8], floor: r[9], v: r[6] ?? 0 }); if (r[1] > 0 && r[2] > 0 && r[3] > 0) b.push({ date: r[0], open: r[1] * 1000, high: r[2] * 1000, low: r[3] * 1000, close: r[4] * 1000, volume: r[7] ?? 0, value: r[6] ?? 0 }); }
  if (m.size) { px.set(t, m); barsOf.set(t, b); }
}
const panelDates = fs.readdirSync(PANELS).filter((f) => /^\d{4}-\d{2}-\d{2}\.json\.gz$/.test(f)).map((f) => f.slice(0, 10)).sort();
const readPanel = (d) => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(PANELS, `${d}.json.gz`))));
console.error(`bảng: ${panelDates.length} phiên (${panelDates[0]} → ${panelDates.at(-1)}) · mã có giá: ${px.size}`);
// Trạng thái thị trường LS-v1 (C6): ma trận giá toàn giai đoạn, regimeAt chỉ đọc ≤ i.
const QV = { LEADING: 2, IMPROVING: 1, WEAKENING: -1, LAGGING: -2 };

const sigma20 = (t, d) => { const b = barsOf.get(t); if (!b) return null; let i = b.length - 1; while (i >= 0 && b[i].date > d) i--; if (i < 20) return null; const r = []; for (let k = i - 19; k <= i; k++) r.push(b[k].close / b[k - 1].close - 1); const m = r.reduce((a, x) => a + x, 0) / 20; return Math.sqrt(r.reduce((a, x) => a + (x - m) ** 2, 0) / 19); };
const limitUp = (t, d) => { const x = px.get(t)?.get(d); return Boolean(x && x.ceil > 0 && x.raw >= x.ceil * 0.999); };
const limitDown = (t, d) => { const x = px.get(t)?.get(d); return Boolean(x && x.floor > 0 && x.raw <= x.floor * 1.001); };


// ── PZ-r1: vị trí giá theo từng phiên (chỉ thanh ≤ D) ──
const BARS_KEEP = 330;
function barsUpTo(t, d) {
  const b = barsOf.get(t); if (!b) return null;
  let lo = 0, hi = b.length; while (lo < hi) { const m = (lo + hi) >> 1; if (b[m].date <= d) lo = m + 1; else hi = m; }
  return lo ? b.slice(Math.max(0, lo - BARS_KEEP), lo) : null;
}
/** Nhóm NÓNG của lớp 1 / cổng P1: ≥ 2/3 độ đo chỉ dùng giá (X2, X3, X4). */
function hotPriceOnly(bars) { if (!bars || bars.length < PZ_RULES.minBars) return null; return hotReasons(pzMeasures(bars, null), null).length >= 2; }
const rsOf = (bars) => bars.filter((x) => dayPos.has(x.date)).map((x) => [x.date, x.close / vnClose[dayPos.get(x.date)]]);

/** Mô phỏng một phương án PZ-r1 trên [from, to]. `diag` (mảng) nhận các lệnh mua MỚI đã khớp để chẩn đoán lớp 1. */
function simulate(variant, from, to, diag = null) {
  const dates = panelDates.filter((d) => d >= from && d <= to);
  let held = [];
  const pos = new Map(); let cash = 1;
  const zstate = new Map();
  const daily = []; let lastRebalWeek = null, turn = 0, nNames = 0, nDays = 0, cashSum = 0, frozenDays = 0, blockedBuys = 0, blockedSells = 0, gateBlocked = 0, noZoneWeeks = new Set(), weeksSeen = new Set();
  const openBuys = new Map();
  for (const d of dates) {
    const i = dayPos.get(d); if (i == null || i + 1 >= days.length) continue; const d1 = days[i + 1];
    const panel = readPanel(d);
    const rows = panel.rows.map((r) => ({ ticker: r.ticker, values: { ...r.values } }));
    const scores = panel.rows.map((r) => ({ ticker: r.ticker, close: r.close, advBn: r.adv / 1e9, sigma20: sigma20(r.ticker, d), sectorKey: r.l2 ?? null, Z: 0, rank: 0, alpha5Pct: null, pOutperform: null }));
    const wk = isoWeek(d); const rebalance = wk !== lastRebalWeek;
    let zoneBy = null;
    if (variant !== "P0") {
      const hl = hlScores(rows), heldSet = new Set(held.map((x) => x.ticker));
      const cand = hl.filter((x) => x.cls === "STRONG" || x.cls === "CONFLUENCE").map((x) => x.ticker);
      const tier1 = new Set(hl.filter((x) => x.pass1).map((x) => x.ticker));
      zoneBy = new Map();
      if (variant === "P1") {
        for (const t of cand) { const b = barsUpTo(t, d); zoneBy.set(t, b && b.at(-1).date === d && hotPriceOnly(b) ? "EXTENDED" : "BUY_ZONE"); }
      } else {
        const track = new Set([...tier1, ...heldSet, ...[...zstate.entries()].filter(([, r]) => PZ_WATCH.has(r.state)).map(([t]) => t)]);
        for (const t of track) {
          const b = barsUpTo(t, d);
          if (!b || b.at(-1).date !== d) { zoneBy.set(t, "UNKNOWN"); continue; }
          const rec = pzStep({ bars: b, base: detectBox(b), prev: zstate.get(t) ?? null, ctx: { date: d, held: heldSet.has(t), tier1: tier1.has(t), exchange: "HOSE", rs: rsOf(b) } });
          zstate.set(t, rec); zoneBy.set(t, rec.state);
        }
      }
      if (rebalance) { weeksSeen.add(wk); if (!cand.some((t) => zoneBy.get(t) === "BUY_ZONE")) noZoneWeeks.add(wk); }
    }
    const H = buildHlPortfolio({ panelRows: rows, scores, prev: held, rebalance, date: d, zoneBy, gate: variant !== "P0" });
    if (H.hl.dataGuard.frozen) frozenDays++;
    if (H.hl.rebalance) lastRebalWeek = wk;
    gateBlocked += H.hl.queue.filter((q) => q.code === "extended" || q.code === "in_base" || q.code === "no_setup").length && H.hl.rebalance ? H.hl.queue.filter((q) => q.code === "extended" || q.code === "in_base" || q.code === "no_setup").length : 0;
    let nav0 = cash; for (const v of pos.values()) nav0 += v;
    for (const [t, v] of pos) { const a = px.get(t)?.get(d)?.c, b = px.get(t)?.get(d1)?.c; if (a > 0 && b > 0) pos.set(t, v * (b / a)); }
    let nav1 = cash; for (const v of pos.values()) nav1 += v;
    const target = new Map(H.portfolio.map((p) => [p.ticker, p])); const next = [];
    for (const h of held) {
      if (target.has(h.ticker)) { const p = target.get(h.ticker); next.push({ ticker: h.ticker, weight: h.weight, since: h.since, ref: h.ref, miss: p.hl.miss ?? 0 }); continue; }
      if (limitDown(h.ticker, d1) && px.get(h.ticker)?.get(d1)) { blockedSells++; next.push(h); continue; }
      const v = pos.get(h.ticker) ?? 0; cash += v * (1 - COST_SELL); turn += v / nav1; pos.delete(h.ticker);
      const ob = openBuys.get(h.ticker); if (ob) { ob.exitAt = d1; openBuys.delete(h.ticker); }
    }
    for (const p of H.portfolio) {
      if (p.hl.status !== "NEW") continue;
      if (limitUp(p.ticker, d1) || !(px.get(p.ticker)?.get(d1)?.c > 0)) { blockedBuys++; continue; }
      const want = Math.min(p.weight * nav1, cash / (1 + COST_BUY)); if (!(want > nav1 * 0.01)) continue;
      cash -= want * (1 + COST_BUY); turn += want / nav1; pos.set(p.ticker, want);
      next.push({ ticker: p.ticker, weight: p.weight, since: d, ref: p.hl.ref ?? null, miss: 0 });
      if (diag) { const rec = { ticker: p.ticker, d, d1, hot: hotPriceOnly(barsUpTo(p.ticker, d)), exitAt: null }; diag.push(rec); openBuys.set(p.ticker, rec); }
    }
    held = next;
    let nav2 = cash; for (const v of pos.values()) nav2 += v;
    daily.push({ d: d1, r: nav2 / nav0 - 1, n: pos.size });
    nNames += pos.size; cashSum += cash / nav2; nDays++;
  }
  return { daily, names: nNames / nDays, cash: cashSum / nDays, turnoverYr: turn / 2 / (nDays / 250), frozenDays, blockedBuys, blockedSells, gateBlocked, noZoneWeeks: noZoneWeeks.size, rebalanceWeeks: weeksSeen.size };
}
/** Mốc: bình quân đều vũ trụ của phiên D (lợi suất D → D+1, không phí) và VN-Index. */
function benchmarks(from, to) {
  const ew = [], vn = [];
  for (const d of panelDates.filter((x) => x >= from && x <= to)) {
    const i = dayPos.get(d); if (i == null || i + 1 >= days.length) continue; const d1 = days[i + 1];
    const p = readPanel(d); let s = 0, n = 0;
    for (const r of p.rows) { const a = px.get(r.ticker)?.get(d)?.c, b = px.get(r.ticker)?.get(d1)?.c; if (a > 0 && b > 0) { s += b / a - 1; n++; } else if (a > 0) { n++; } }
    ew.push({ d: d1, r: n ? s / n : 0 }); vn.push({ d: d1, r: vnClose[i + 1] / vnClose[i] - 1 });
  }
  return { ew, vn };
}
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const sd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)); };
const stats = (rs) => { let nav = 1, pk = 1, dd = 0; for (const r of rs) { nav *= 1 + r; pk = Math.max(pk, nav); dd = Math.min(dd, nav / pk - 1); } const y = rs.length / 250; return { cagr: nav ** (1 / y) - 1, vol: sd(rs) * Math.sqrt(250), maxDd: dd, sharpe: (mean(rs) * 250) / (sd(rs) * Math.sqrt(250)), total: nav - 1 }; };
/** Chênh lệch 20 phiên không chồng lấn, 20 pha: trung vị của trung bình và của t; p hai phía từ t trung vị (xấp xỉ chuẩn). */
function blockDiff(a, b) {
  const ms = [], ts = [];
  for (let ph = 0; ph < 20; ph++) { const x = []; for (let k = ph; k + 20 <= a.length; k += 20) { let pa = 1, pb = 1; for (let m = k; m < k + 20; m++) { pa *= 1 + a[m]; pb *= 1 + b[m]; } x.push(pa - pb); } if (x.length >= 5) { ms.push(mean(x)); ts.push(mean(x) / (sd(x) / Math.sqrt(x.length))); } }
  const med = (v) => { const s = [...v].sort((p, q) => p - q); return s.length % 2 ? s[s.length >> 1] : (s[(s.length >> 1) - 1] + s[s.length >> 1]) / 2; };
  const t = med(ts), erf = (z) => { const s = Math.sign(z); z = Math.abs(z); const tt = 1 / (1 + 0.3275911 * z); return s * (1 - (((((1.061405429 * tt - 1.453152027) * tt) + 1.421413741) * tt - 0.284496736) * tt + 0.254829592) * tt * Math.exp(-z * z)); };
  return { mean20: med(ms), t, p: 2 * (1 - 0.5 * (1 + erf(Math.abs(t) / Math.SQRT2))), blocks: Math.floor(a.length / 20) };
}
const byYear = (a, b) => { const y = {}; a.forEach((x, k) => { const yr = x.d.slice(0, 4); (y[yr] ??= [1, 1]); y[yr][0] *= 1 + x.r; y[yr][1] *= 1 + b[k].r; }); return Object.fromEntries(Object.entries(y).map(([k, [p, q]]) => [k, { port: p - 1, bench: q - 1, diff: p - q }])); };



// ── PZ-r2: tiêu chí mục 5 của PZ-r2-prereg.md ──
function criteriaR2(out, sims, r) {
  const a = out.variants.P0, b = out.variants.P2;
  const half = (x) => { const n = x.length >> 1; return [x.slice(0, n), x.slice(n)]; };
  const [a1, a2] = half(r(sims.P0.daily)), [b1, b2] = half(r(sims.P2.daily));
  const halves = [[stats(a1).maxDd, stats(b1).maxDd], [stats(a2).maxDd, stats(b2).maxDd]];
  const c = {
    c1: b.maxDd - a.maxDd >= 0.05, ddImprove: b.maxDd - a.maxDd,
    c2: b.cagr >= a.cagr - 0.03, cagrGap: b.cagr - a.cagr,
    c3: b.sharpe >= a.sharpe,
    c4: b.vsBaseline.t > -2, t: b.vsBaseline.t,
    c5: halves.every(([p0, p2]) => p2 >= p0), halves: halves.map(([p0, p2]) => ({ p0, p2 })),
    cash: b.cash <= 0.6,
  };
  c.pass = c.c1 && c.c2 && c.c3 && c.c4 && c.c5 && c.cash;
  return c;
}

const TEST = ["2023-05-19", "2026-11-12"];
const VARS = ["P0", "P2"], result = { prereg: "backend/src/market/elite/PZ-r2-prereg.md", ranAt: new Date().toISOString(), panels: panelDates.length, periods: {} };
{
  const [from, to] = TEST;
  console.error(`— test: ${from} → ${to}`);
  const bm = benchmarks(from, to), sims = {};
  for (const v of VARS) { const t0 = Date.now(); sims[v] = simulate(v, from, to); console.error(`  ${v}: ${sims[v].daily.length} phiên, ${((Date.now() - t0) / 1000).toFixed(0)} s`); }
  const r = (x) => x.map((y) => y.r), base = r(sims.P0.daily);
  const out = { from, to, sessions: base.length, lastDay: sims.P0.daily.at(-1)?.d ?? null, benchmarks: { equalWeight: stats(r(bm.ew)), vnIndex: stats(r(bm.vn)) }, variants: {} };
  for (const v of VARS) {
    const rs = r(sims[v].daily), s = sims[v];
    out.variants[v] = { ...stats(rs), names: s.names, cash: s.cash, turnoverYr: s.turnoverYr, frozenDays: s.frozenDays, blockedBuys: s.blockedBuys, gateBlocked: s.gateBlocked, noZoneWeeks: s.noZoneWeeks, rebalanceWeeks: s.rebalanceWeeks,
      vsEqualWeight: blockDiff(rs, r(bm.ew)), vsBaseline: v === "P0" ? null : blockDiff(rs, base), years: byYear(s.daily, bm.ew), yearsVsBaseline: v === "P0" ? null : byYear(s.daily, sims.P0.daily) };
  }
  out.criteria = criteriaR2(out, sims, r);
  result.periods.test = out;
}
fs.writeFileSync(OUT, JSON.stringify(result, null, 1));
const pc = (x, d = 1) => (x == null || !fin(x) ? "—" : (x * 100).toFixed(d) + "%");
const p = result.periods.test, c = p.criteria;
console.log(`=== KIỂM ĐỊNH ${p.from} → ${p.lastDay} (${p.sessions} phiên) ===`);
console.log(`VN-Index: ${pc(p.benchmarks.vnIndex.cagr)}/năm, sụt giảm ${pc(p.benchmarks.vnIndex.maxDd)} · Bình quân đều: ${pc(p.benchmarks.equalWeight.cagr)}/năm, sụt giảm ${pc(p.benchmarks.equalWeight.maxDd)}`);
for (const [v, s] of Object.entries(p.variants)) console.log(`${v} ${pc(s.cagr).padStart(7)}/năm · Sharpe ${s.sharpe.toFixed(2)} · sụt giảm ${pc(s.maxDd)} · mã ${s.names.toFixed(1)} · tiền mặt ${pc(s.cash, 0)} · xoay vòng ${s.turnoverYr.toFixed(1)} · chặn ${s.gateBlocked} · tuần không có vùng mua ${s.noZoneWeeks}/${s.rebalanceWeeks}${s.vsBaseline ? ` · so P0 ${pc(s.vsBaseline.mean20, 2)}/20 phiên, t ${s.vsBaseline.t.toFixed(2)}` : ""}`);
console.log(`Tiêu chí: 1 sụt giảm ${c.c1 ? "✓" : "✗"} (${pc(c.ddImprove)}) · 2 lợi suất ${c.c2 ? "✓" : "✗"} (${pc(c.cagrGap)}) · 3 Sharpe ${c.c3 ? "✓" : "✗"} · 4 t ${c.c4 ? "✓" : "✗"} (${c.t.toFixed(2)}) · 5 hai nửa ${c.c5 ? "✓" : "✗"} (${c.halves.map((h) => `${pc(h.p0)} / ${pc(h.p2)}`).join(" · ")}) · tiền mặt ${c.cash ? "✓" : "✗"} -> ${c.pass ? "ĐẠT" : "KHÔNG ĐẠT"}`);
console.log("theo năm (P2 − P0):", Object.entries(p.variants.P2.yearsVsBaseline).map(([y, x]) => `${y} ${pc(x.port - x.bench)}`).join(" · "));
