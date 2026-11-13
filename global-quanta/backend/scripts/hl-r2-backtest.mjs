// HL-r2 (prereg: backend/src/market/elite/HL-r2-prereg.md) — mô phỏng danh mục Elite HL trên bảng tín hiệu dựng lại, gọi ĐÚNG
// buildHlPortfolio của production. Phương án: B (G2r), C2 (chỉ ngành Dẫn dắt khi vào), C6 (không vào khi thị trường yếu), C7 (RRG tuần đã đóng).
//   node backend/scripts/hl-r2-backtest.mjs --panels <dir> --px <dir OHLC> --index <VNINDEX.json> --tax <taxonomy.json> --out <tệp json>
// Tín hiệu ở đóng cửa D, khớp ở đóng cửa D+1; phí mua 0,20% / bán 0,25%; tăng sát trần không mua được; giảm sát sàn không bán được.
import fs from "node:fs"; import path from "node:path"; import zlib from "node:zlib"; import { pathToFileURL } from "node:url";
const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const M_ = (p) => import(pathToFileURL(path.join(HERE, "../src/market", p)).href);
const { buildHlPortfolio, isoWeek, HL_PF } = await M_("elite/eliteHl.js");
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
const Mx = L.buildMatrix(new Map([...barsOf].map(([t, b]) => [t, b.map((x) => [x.date, x.close, x.value])])), idxRows.map((r) => [r[0], r[4]]));
const QV = { LEADING: 2, IMPROVING: 1, WEAKENING: -1, LAGGING: -2 };

const sigma20 = (t, d) => { const b = barsOf.get(t); if (!b) return null; let i = b.length - 1; while (i >= 0 && b[i].date > d) i--; if (i < 20) return null; const r = []; for (let k = i - 19; k <= i; k++) r.push(b[k].close / b[k - 1].close - 1); const m = r.reduce((a, x) => a + x, 0) / 20; return Math.sqrt(r.reduce((a, x) => a + (x - m) ** 2, 0) / 19); };
const limitUp = (t, d) => { const x = px.get(t)?.get(d); return Boolean(x && x.ceil > 0 && x.raw >= x.ceil * 0.999); };
const limitDown = (t, d) => { const x = px.get(t)?.get(d); return Boolean(x && x.floor > 0 && x.raw <= x.floor * 1.001); };

// C7: góc RRG của TUẦN ĐÃ ĐÓNG — tính một lần mỗi tuần trên vũ trụ của phiên đầu tuần (đệm ra tệp vì tốn ~1–2 s / tuần).
const closedCacheFile = path.join(PANELS, "_rrg_closed.json"); let closedCache = {}; try { closedCache = JSON.parse(fs.readFileSync(closedCacheFile, "utf8")); } catch { /* chưa có */ }
function closedQuadrants(d, tickers) {
  const wk = isoWeek(d); if (closedCache[wk]) return closedCache[wk];
  const iD = dayPos.get(d); const seriesOf = new Map();
  for (const t of tickers) { const b = barsOf.get(t); if (!b) continue; let i = b.length - 1; while (i >= 0 && b[i].date > d) i--; if (i >= 30) seriesOf.set(t, b.slice(Math.max(0, i - 900), i + 1)); }
  const benchBars = idxRows.slice(Math.max(0, iD - 900), iD + 1).map((r) => ({ date: r[0], open: r[1], high: r[2], low: r[3], close: r[4], volume: r[5] ?? 0, value: r[6] ?? 0 }));
  let out = {};
  try { const s = buildSectorRotation({ universe: tickers.map((t) => ({ ticker: t })), icb, seriesOf, benchBars, now: () => Date.parse(`${d}T10:00:00Z`) }).summary; out = Object.fromEntries(s.sectors.map((x) => [x.code, QV[x.quadrant] ?? null])); } catch { out = {}; }
  closedCache[wk] = out; return out;
}
const sectorCodeOf = (t, codes) => { const m = icb.symbols[t]; if (!m) return null; for (const k of ["l3", "l2", "l1"]) if (m[k] && codes.has(m[k])) return m[k]; return null; };

/** Mô phỏng một phương án trên [from, to]. Trả chuỗi lợi suất ngày + thống kê. */
function simulate(variant, from, to) {
  const dates = panelDates.filter((d) => d >= from && d <= to);
  let held = []; // [{ ticker, weight (lúc vào — engine thấy), since, ref, miss }]
  const pos = new Map(); let cash = 1; // giá trị thật theo đơn vị NAV ban đầu = 1
  const daily = []; let lastRebalWeek = null, turn = 0, nNames = 0, nDays = 0, cashSum = 0, frozenDays = 0, blockedBuys = 0, blockedSells = 0;
  for (const d of dates) {
    const i = dayPos.get(d); if (i == null || i + 1 >= days.length) continue; const d1 = days[i + 1];
    const panel = readPanel(d);
    let rows = panel.rows.map((r) => ({ ticker: r.ticker, values: { ...r.values } }));
    if (variant === "C7") { const codes = closedQuadrants(d, panel.rows.map((r) => r.ticker)); const set = new Set(Object.keys(codes)); for (const r of rows) { const c = sectorCodeOf(r.ticker, set); r.values.rrg_quadrant = c ? codes[c] ?? null : null; } }
    if (variant === "C2") { const h = new Set(held.map((x) => x.ticker)); for (const r of rows) if (!h.has(r.ticker) && r.values.rrg_quadrant === 1) r.values.rrg_quadrant = 0; /* 0 = trung tính: không được vào, không đụng tới chốt dữ liệu */ }
    const scores = panel.rows.map((r) => ({ ticker: r.ticker, close: r.close, advBn: r.adv / 1e9, sigma20: sigma20(r.ticker, d), sectorKey: r.l2 ?? null, Z: 0, rank: 0, alpha5Pct: null, pOutperform: null }));
    const wk = isoWeek(d); let rebalance = wk !== lastRebalWeek;
    if (variant === "C6" && rebalance) { const reg = L.regimeAt(Mx, Mx.pos.get(d)); if (reg?.group === "WEAK") rebalance = false; }
    const H = buildHlPortfolio({ panelRows: rows, scores, prev: held, rebalance, date: d });
    if (H.hl.dataGuard.frozen) frozenDays++;
    if (H.hl.rebalance) lastRebalWeek = wk;
    // Lợi suất phiên D+1 của vị thế đang giữ (trước khi giao dịch ở đóng cửa D+1).
    let nav0 = cash; for (const v of pos.values()) nav0 += v;
    for (const [t, v] of pos) { const a = px.get(t)?.get(d)?.c, b = px.get(t)?.get(d1)?.c; if (a > 0 && b > 0) pos.set(t, v * (b / a)); }
    let nav1 = cash; for (const v of pos.values()) nav1 += v;
    // Giao dịch ở đóng cửa D+1.
    const target = new Map(H.portfolio.map((p) => [p.ticker, p])); let cost = 0; const next = [];
    for (const h of held) {
      if (target.has(h.ticker)) { const p = target.get(h.ticker); next.push({ ticker: h.ticker, weight: h.weight, since: h.since, ref: h.ref, miss: p.hl.miss ?? 0 }); continue; }
      if (limitDown(h.ticker, d1) && px.get(h.ticker)?.get(d1)) { blockedSells++; next.push(h); continue; } // không bán được -> giữ, phiên sau thử lại
      const v = pos.get(h.ticker) ?? 0; cash += v * (1 - COST_SELL); cost += v * COST_SELL; turn += v / nav1; pos.delete(h.ticker);
    }
    for (const p of H.portfolio) {
      if (p.hl.status !== "NEW") continue;
      if (limitUp(p.ticker, d1) || !(px.get(p.ticker)?.get(d1)?.c > 0)) { blockedBuys++; continue; }
      const want = Math.min(p.weight * nav1, cash / (1 + COST_BUY)); if (!(want > nav1 * 0.01)) continue;
      cash -= want * (1 + COST_BUY); cost += want * COST_BUY; turn += want / nav1; pos.set(p.ticker, want);
      next.push({ ticker: p.ticker, weight: p.weight, since: d, ref: p.hl.ref ?? null, miss: 0 });
    }
    held = next;
    let nav2 = cash; for (const v of pos.values()) nav2 += v;
    daily.push({ d: d1, r: nav2 / nav0 - 1, n: pos.size });
    nNames += pos.size; cashSum += cash / nav2; nDays++;
  }
  return { daily, names: nNames / nDays, cash: cashSum / nDays, turnoverYr: turn / 2 / (nDays / 250), frozenDays, blockedBuys, blockedSells };
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

// --smoke from,to: chỉ để thử cơ chế trên một đoạn ĐÃ XEM (giai đoạn báo cáo) — không ghi tệp kết quả.
if (arg("smoke")) { const [f0, t0] = arg("smoke").split(","); for (const v of ["B", "C2", "C6", "C7"]) { const x = simulate(v, f0, t0), rs = x.daily.map((y) => y.r); console.log(v, "phiên", rs.length, "tổng", (stats(rs).total * 100).toFixed(1) + "%", "mã", x.names.toFixed(1), "tiền mặt", (x.cash * 100).toFixed(0) + "%", "xoay/năm", x.turnoverYr.toFixed(1), "chốt", x.frozenDays, "không mua", x.blockedBuys, "không bán", x.blockedSells); } const bm = benchmarks(f0, t0); console.log("EW", (stats(bm.ew.map((y) => y.r)).total * 100).toFixed(1) + "%", "VN", (stats(bm.vn.map((y) => y.r)).total * 100).toFixed(1) + "%"); process.exit(0); }
const VARIANTS = ["B", "C2", "C6", "C7"], result = { prereg: "backend/src/market/elite/HL-r2-prereg.md", ranAt: new Date().toISOString(), panels: panelDates.length, periods: {} };
for (const [name, [from, to]] of [["decision", DECISION], ["report", REPORT]]) {
  if (!panelDates.some((d) => d >= from && d <= to)) continue;
  console.error(`— ${name}: ${from} → ${to}`);
  const bm = benchmarks(from, to), sims = {};
  for (const v of VARIANTS) { const t0 = Date.now(); sims[v] = simulate(v, from, to); console.error(`  ${v}: ${sims[v].daily.length} phiên, ${((Date.now() - t0) / 1000).toFixed(0)} s`); if (v === "C7") fs.writeFileSync(closedCacheFile, JSON.stringify(closedCache)); }
  const r = (x) => x.map((y) => y.r), base = r(sims.B.daily), out = { from, to, sessions: base.length, benchmarks: { equalWeight: stats(r(bm.ew)), vnIndex: stats(r(bm.vn)) }, variants: {} };
  const trialSharpes = VARIANTS.map((v) => sharpe(r(sims[v].daily)));
  for (const v of VARIANTS) {
    const rs = r(sims[v].daily);
    out.variants[v] = {
      ...stats(rs), names: sims[v].names, cash: sims[v].cash, turnoverYr: sims[v].turnoverYr, frozenDays: sims[v].frozenDays, blockedBuys: sims[v].blockedBuys, blockedSells: sims[v].blockedSells,
      vsEqualWeight: blockDiff(rs, r(bm.ew)), vsVnIndex: blockDiff(rs, r(bm.vn)), vsBaseline: v === "B" ? null : blockDiff(rs, base),
      deflatedSharpe: deflatedSharpe(rs, trialSharpes, VARIANTS.length), years: byYear(sims[v].daily, bm.ew), yearsVsBaseline: v === "B" ? null : byYear(sims[v].daily, sims.B.daily),
    };
  }
  result.periods[name] = out;
}
fs.writeFileSync(OUT, JSON.stringify(result, null, 1));
const pc = (x, d = 1) => (x == null || !fin(x) ? "—" : (x * 100).toFixed(d) + "%");
for (const [name, p] of Object.entries(result.periods)) {
  console.log(`\n=== ${name.toUpperCase()} ${p.from} → ${p.to} (${p.sessions} phiên) ===`);
  console.log(`VN-Index (giá): ${pc(p.benchmarks.vnIndex.cagr)}/năm, sụt giảm ${pc(p.benchmarks.vnIndex.maxDd)} · Bình quân đều vũ trụ: ${pc(p.benchmarks.equalWeight.cagr)}/năm, sụt giảm ${pc(p.benchmarks.equalWeight.maxDd)}`);
  for (const [v, s] of Object.entries(p.variants)) console.log(`${v.padEnd(3)} ${pc(s.cagr).padStart(7)}/năm · biến động ${pc(s.vol)} · Sharpe ${s.sharpe.toFixed(2)} · sụt giảm ${pc(s.maxDd)} · mã ${s.names.toFixed(1)} · tiền mặt ${pc(s.cash, 0)} · xoay ${s.turnoverYr.toFixed(1)}x · vs bình quân đều ${pc(s.vsEqualWeight.mean20, 2)}/20p (t ${s.vsEqualWeight.t.toFixed(2)}) · vs VN-Index ${pc(s.vsVnIndex.mean20, 2)} (t ${s.vsVnIndex.t.toFixed(2)})${s.vsBaseline ? ` · vs B ${pc(s.vsBaseline.mean20, 2)} (t ${s.vsBaseline.t.toFixed(2)}, p ${s.vsBaseline.p.toFixed(3)})` : ""} · DSR ${typeof s.deflatedSharpe === "number" ? s.deflatedSharpe.toFixed(2) : JSON.stringify(s.deflatedSharpe).slice(0, 60)} · chốt ${s.frozenDays} · không mua được ${s.blockedBuys} · không bán được ${s.blockedSells}`);
  console.log("theo năm (B − bình quân đều):", Object.entries(p.variants.B.years).map(([y, x]) => `${y} ${pc(x.port)} / ${pc(x.bench)}`).join(" · "));
}
