// PZ-r1 (prereg: backend/src/market/elite/PZ-r1-prereg.md) — có nên chặn mua mã đã tăng nóng trong danh mục Elite HL không.
// Cùng khung, dữ liệu và thống kê với HL-r2 (hl-r2-backtest.mjs); engine = buildHlPortfolio của production với zoneBy + gate, vị trí giá = pzStep.
//   node backend/scripts/pz-r1-backtest.mjs --panels <dir> --px <dir OHLC> --index <VNINDEX.json> --tax <taxonomy.json> --out <tệp json>
// Phương án: P0 (G2r), P1 (không mua mã nóng theo X2–X4), P2 (chỉ mua mã ở Vùng mua, nền = hộp giá HG-v1). Lớp 1 chẩn đoán lệnh mua của P0.
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


// ── Lớp 1: chẩn đoán lệnh mua của P0 ──
function diagnose(buys, ewByDate) {
  const H = 20, rows = [];
  for (const b of buys) {
    if (b.hot == null) continue;
    const i1 = dayPos.get(b.d1); if (i1 == null || i1 + H >= days.length) continue;
    const c0 = px.get(b.ticker)?.get(b.d1)?.c; if (!(c0 > 0)) continue;
    let worst = 0, ew = 1, cEnd = null, ok = true;
    for (let k = 1; k <= H; k++) {
      const dk = days[i1 + k], c = px.get(b.ticker)?.get(dk)?.c;
      if (c > 0) { worst = Math.min(worst, c / c0 - 1); cEnd = c; }
      const r = ewByDate.get(dk); if (r == null) { ok = false; break; } ew *= 1 + r;
    }
    if (!ok || !(cEnd > 0)) continue;
    const soldEarly = b.exitAt != null && dayPos.get(b.exitAt) - i1 <= H;
    rows.push({ hot: b.hot, excess: cEnd / c0 - 1 - (ew - 1), worst, soldEarly });
  }
  const grp = (h) => rows.filter((r) => r.hot === h);
  const summ = (g) => ({ n: g.length, meanExcess: g.length ? mean(g.map((r) => r.excess)) : null, sdExcess: g.length > 1 ? sd(g.map((r) => r.excess)) : null,
    meanWorst: g.length ? mean(g.map((r) => r.worst)) : null, soldEarlyRate: g.length ? g.filter((r) => r.soldEarly).length / g.length : null });
  const hot = summ(grp(true)), cold = summ(grp(false));
  const welchT = hot.n > 1 && cold.n > 1 ? (hot.meanExcess - cold.meanExcess) / Math.sqrt(hot.sdExcess ** 2 / hot.n + cold.sdExcess ** 2 / cold.n) : null;
  return { horizon: H, hot, cold, welchT, pass: welchT != null && welchT <= -2 };
}

/** Tiêu chí mục 5 của PZ-r1-prereg.md. */
function criteria(out, VARS) {
  const base = out.variants.P0, res = {};
  const pv = VARS.filter((v) => v !== "P0").map((v) => ({ v, p: out.variants[v].vsBaseline.p })).sort((a, b) => a.p - b.p);
  const holm = new Map(); let k = pv.length; pv.forEach((x, idx) => holm.set(x.v, Math.min(1, x.p * (k - idx))));
  for (const v of VARS.filter((x) => x !== "P0")) {
    const s = out.variants[v], vb = s.vsBaseline;
    const a = vb.mean20 > 0 && vb.t >= 2, b = s.maxDd - base.maxDd >= 0.05 && s.cagr >= base.cagr - 0.01;
    const yrs = Object.entries(s.yearsVsBaseline).filter(([y]) => y >= "2014" && y <= "2019"), better = yrs.filter(([, x]) => x.port - x.bench > 0).length;
    res[v] = { c1a: a, c1b: b, c1: a || b, c2: a ? holm.get(v) < 0.05 : b ? true : false, holmP: holm.get(v), c3: better >= 4, yearsBetter: `${better}/${yrs.length}`, c4: s.cash <= 0.5 };
    res[v].pass = res[v].c1 && res[v].c2 && res[v].c3 && res[v].c4;
  }
  return res;
}

if (arg("smoke")) { const [f0, t0] = arg("smoke").split(","); for (const v of ["P0", "P1", "P2"]) { const x = simulate(v, f0, t0), rs = x.daily.map((y) => y.r); console.log(v, "phiên", rs.length, "tổng", (stats(rs).total * 100).toFixed(1) + "%", "mã", x.names.toFixed(1), "tiền mặt", (x.cash * 100).toFixed(0) + "%", "chặn", x.gateBlocked); } process.exit(0); }
const VARS = ["P0", "P1", "P2"], result = { prereg: "backend/src/market/elite/PZ-r1-prereg.md", ranAt: new Date().toISOString(), panels: panelDates.length, periods: {} };
for (const [name, [from, to]] of [["decision", DECISION], ["report", REPORT]]) {
  if (!panelDates.some((d) => d >= from && d <= to)) continue;
  console.error(`— ${name}: ${from} → ${to}`);
  const bm = benchmarks(from, to), sims = {}, buys = [];
  for (const v of VARS) { const t0 = Date.now(); sims[v] = simulate(v, from, to, v === "P0" ? buys : null); console.error(`  ${v}: ${sims[v].daily.length} phiên, ${((Date.now() - t0) / 1000).toFixed(0)} s`); }
  const r = (x) => x.map((y) => y.r), base = r(sims.P0.daily);
  const out = { from, to, sessions: base.length, benchmarks: { equalWeight: stats(r(bm.ew)), vnIndex: stats(r(bm.vn)) }, variants: {} };
  const trialSharpes = VARS.map((v) => sharpe(r(sims[v].daily)));
  for (const v of VARS) {
    const rs = r(sims[v].daily), s = sims[v];
    out.variants[v] = { ...stats(rs), names: s.names, cash: s.cash, turnoverYr: s.turnoverYr, frozenDays: s.frozenDays, blockedBuys: s.blockedBuys, gateBlocked: s.gateBlocked, noZoneWeeks: s.noZoneWeeks, rebalanceWeeks: s.rebalanceWeeks,
      vsEqualWeight: blockDiff(rs, r(bm.ew)), vsBaseline: v === "P0" ? null : blockDiff(rs, base), deflatedSharpe: deflatedSharpe(rs, trialSharpes, VARS.length),
      years: byYear(s.daily, bm.ew), yearsVsBaseline: v === "P0" ? null : byYear(s.daily, sims.P0.daily) };
  }
  out.diagnosis = diagnose(buys, new Map(bm.ew.map((x) => [x.d, x.r])));
  if (name === "decision") out.criteria = criteria(out, VARS);
  result.periods[name] = out;
}
fs.writeFileSync(OUT, JSON.stringify(result, null, 1));
const pc = (x, d = 1) => (x == null || !fin(x) ? "—" : (x * 100).toFixed(d) + "%");
for (const [name, p] of Object.entries(result.periods)) {
  console.log(`\n=== ${name.toUpperCase()} ${p.from} → ${p.to} (${p.sessions} phiên) ===`);
  console.log(`VN-Index: ${pc(p.benchmarks.vnIndex.cagr)}/năm · Bình quân đều: ${pc(p.benchmarks.equalWeight.cagr)}/năm, sụt giảm ${pc(p.benchmarks.equalWeight.maxDd)}`);
  for (const [v, s] of Object.entries(p.variants)) console.log(`${v} ${pc(s.cagr).padStart(7)}/năm · Sharpe ${s.sharpe.toFixed(2)} · sụt giảm ${pc(s.maxDd)} · mã ${s.names.toFixed(1)} · tiền mặt ${pc(s.cash, 0)} · xoay vòng ${s.turnoverYr.toFixed(1)} · chặn ${s.gateBlocked} · tuần không có vùng mua ${s.noZoneWeeks}/${s.rebalanceWeeks}${s.vsBaseline ? ` · so P0 ${pc(s.vsBaseline.mean20, 2)}/20 phiên, t ${s.vsBaseline.t.toFixed(2)}, p ${s.vsBaseline.p.toFixed(3)}` : ""}`);
  const dg = p.diagnosis; console.log(`Lớp 1: NÓNG n=${dg.hot.n} vượt ${pc(dg.hot.meanExcess, 2)} lỗ sâu TB ${pc(dg.hot.meanWorst)} bán sớm ${pc(dg.hot.soldEarlyRate, 0)} · THƯỜNG n=${dg.cold.n} vượt ${pc(dg.cold.meanExcess, 2)} lỗ sâu TB ${pc(dg.cold.meanWorst)} bán sớm ${pc(dg.cold.soldEarlyRate, 0)} · t Welch ${dg.welchT?.toFixed(2)} -> ${dg.pass ? "ĐẠT" : "KHÔNG ĐẠT"}`);
  if (p.criteria) for (const [v, c] of Object.entries(p.criteria)) console.log(`Tiêu chí ${v}: 1 ${c.c1 ? "✓" : "✗"} (a ${c.c1a ? "✓" : "✗"} / b ${c.c1b ? "✓" : "✗"}) · 2 ${c.c2 ? "✓" : "✗"} (Holm p ${c.holmP?.toFixed(3)}) · 3 ${c.c3 ? "✓" : "✗"} (${c.yearsBetter}) · 4 ${c.c4 ? "✓" : "✗"} -> ${c.pass ? "ĐẠT" : "KHÔNG ĐẠT"}`);
}
