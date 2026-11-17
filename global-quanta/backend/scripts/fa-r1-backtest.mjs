// FA-r1 (prereg: backend/research/FA-r1-prereg.md) — cổng loại theo chất lượng doanh nghiệp cho lệnh MUA MỚI của Elite HL (G2r).
// Sao chép đúng khung mô phỏng của hl-r2-backtest.mjs; chỉ khác: phương án B, V1–V6 và chỉ số BCTC tính bằng buildSummaryRow của production
// trên các quý đã công bố tại phiên tín hiệu.
//   node backend/scripts/fa-r1-backtest.mjs --panels <dir> --px <dir OHLC> --index <VNINDEX.json> --tax <taxonomy.json> --st <dir BCTC> --out <tệp json>
import fs from "node:fs"; import path from "node:path"; import zlib from "node:zlib"; import { pathToFileURL } from "node:url";
const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const M_ = (p) => import(pathToFileURL(path.join(HERE, "../src/market", p)).href);
const { buildHlPortfolio, isoWeek, HL_PF } = await M_("elite/eliteHl.js");
const L = await M_("elite/leadership.js");
const { buildSectorRotation } = await M_("sectors/sectorRotation.js");
const { deflatedSharpe, sharpe } = await M_("elite/overfit.js");
const { buildSummaryRow } = await M_("fundamentals/kqkdEngine.js");
const arg = (k, d = null) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const PANELS = arg("panels"), PX = arg("px"), IDX = arg("index"), TAX = arg("tax"), OUT = arg("out"), ST = arg("st");
const DECISION = ["2014-03-03", "2019-12-31"], REPORT = ["2020-01-02", "2025-07-25"];
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
// ── FA-r1: BCTC quý theo ngày công bố ──
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const dayDiff = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
/** Ngày công bố dùng cho một quý (FA-r1 mục 2): created thật từ 12/2019 trong (cuối quý, +120 ngày]; còn lại +45 (Q1–Q3) / +90 (Q4). */
export function availableAt(fiscal, created) {
  if (created && created >= "2019-12-01") { const g = dayDiff(fiscal, created.slice(0, 10)); if (g > 0 && g <= 120) return addDays(created.slice(0, 10), 1); }
  return addDays(fiscal, fiscal.slice(5, 7) === "12" ? 90 : 45);
}
const FIN_TPL = new Set(["bank", "sec", "ins"]);
const stmt = new Map(); // mã -> { tpl, qs: [quý đã gán availableAt, sắp theo availableAt], annual: [{ year, v, avail }] }
for (const f of fs.readdirSync(ST)) {
  if (!f.endsWith(".json.gz")) continue;
  let rec; try { rec = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(ST, f)))); } catch { continue; }
  const qs = (rec.quarters ?? []).filter((q) => /^\d{4}-(03|06|09|12)-\d{2}$/.test(q.fiscal)).map((q) => ({ ...q, created: availableAt(q.fiscal, q.created) })).sort((a, b) => a.created.localeCompare(b.created));
  const annual = (rec.annual ?? []).map((a) => ({ ...a, avail: `${a.year + 1}-03-31` }));
  stmt.set(rec.ticker ?? f.replace(/\.json\.gz$/, ""), { tpl: rec.tpl ?? "corp", qs, annual });
}
const faCache = new Map();
/** Dòng tóm tắt KQKD của mã tại phiên d — đúng hàm production, chỉ trên các quý đã công bố. */
function faRow(t, d) {
  const s0 = stmt.get(t); if (!s0) return null;
  let k = 0; while (k < s0.qs.length && s0.qs[k].created <= d) k++;
  const ka = s0.annual.filter((a) => a.avail <= d).length;
  if (!k) return null;
  const key = `${t}|${k}|${ka}`; if (faCache.has(key)) return faCache.get(key);
  let row = null; try { row = buildSummaryRow({ ticker: t, tpl: s0.tpl, quarters: s0.qs.slice(0, k), annual: s0.annual.filter((a) => a.avail <= d) }, { today: d }); } catch { row = null; }
  faCache.set(key, row); return row;
}
/** Cờ cổng loại của mã tại phiên d (FA-r1 mục 4). null = không có dữ liệu -> không chặn. */
function gates(t, d) {
  const r = faRow(t, d); if (!r) return null;
  const corp = !FIN_TPL.has(r.tpl), n = Number.isFinite;
  const g = {
    V1: n(r.ttm?.npat) && r.ttm.npat < 0,
    V2: corp && n(r.f) && r.f <= 3,
    V3: corp && r.mFlag === true,
    V4: corp && n(r.accrual) && r.accrual > 0.1,
    V5: n(r.nowcast?.growth) && r.nowcast.growth < 0,
  };
  g.V6 = g.V1 || g.V2 || g.V3 || g.V4;
  return g;
}
console.error(`BCTC: ${stmt.size} mã`);
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
  const daily = [], entries = []; let vetoed = 0, noData = 0; let lastRebalWeek = null, turn = 0, nNames = 0, nDays = 0, cashSum = 0, frozenDays = 0, blockedBuys = 0, blockedSells = 0;
  for (const d of dates) {
    const i = dayPos.get(d); if (i == null || i + 1 >= days.length) continue; const d1 = days[i + 1];
    const panel = readPanel(d);
    let rows = panel.rows.map((r) => ({ ticker: r.ticker, values: { ...r.values } }));
    const scores = panel.rows.map((r) => ({ ticker: r.ticker, close: r.close, advBn: r.adv / 1e9, sigma20: sigma20(r.ticker, d), sectorKey: r.l2 ?? null, Z: 0, rank: 0, alpha5Pct: null, pOutperform: null }));
    // FA-r1: cổng loại chỉ chặn MUA MỚI — mã chưa giữ mà dính cổng bị coi là không giao dịch được ở phiên này.
    if (variant !== "B") { const h = new Set(held.map((x) => x.ticker)); for (const sc of scores) { if (h.has(sc.ticker)) continue; const g = gates(sc.ticker, d); if (g === null) noData++; else if (g[variant]) { sc.advBn = 0; vetoed++; } } }
    const wk = isoWeek(d); let rebalance = wk !== lastRebalWeek;
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
      entries.push({ t: p.ticker, d, d1 });
    }
    held = next;
    let nav2 = cash; for (const v of pos.values()) nav2 += v;
    daily.push({ d: d1, r: nav2 / nav0 - 1, n: pos.size });
    nNames += pos.size; cashSum += cash / nav2; nDays++;
  }
  return { daily, entries, vetoed, noData, names: nNames / nDays, cash: cashSum / nDays, turnoverYr: turn / 2 / (nDays / 250), frozenDays, blockedBuys, blockedSells };
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

/** Chẩn đoán (mô tả): lệnh mua của B bị một cổng chặn so với không bị chặn — vượt bình quân đều 20 phiên kể từ phiên khớp. */
function diagnose(entries, variant) {
  const fwd = (t, d, d1) => { const i = dayPos.get(d1); if (i == null || i + 20 >= days.length) return null; const d2 = days[i + 20];
    const a = px.get(t)?.get(d1)?.c, b = px.get(t)?.get(d2)?.c; if (!(a > 0 && b > 0)) return null;
    const p = readPanel(d); let s0 = 0, n0 = 0; for (const r of p.rows) { const x = px.get(r.ticker)?.get(d1)?.c, y = px.get(r.ticker)?.get(d2)?.c; if (x > 0 && y > 0) { s0 += y / x - 1; n0++; } }
    return n0 ? b / a - 1 - s0 / n0 : null; };
  const hit = [], miss = []; let nd = 0;
  for (const e of entries) { const g = gates(e.t, e.d); if (g === null) { nd++; continue; } const x = fwd(e.t, e.d, e.d1); if (x == null) continue; (g[variant] ? hit : miss).push(x); }
  const v = (a) => { const m = mean(a); return a.reduce((q, z) => q + (z - m) ** 2, 0) / (a.length - 1); };
  const t = hit.length > 1 && miss.length > 1 ? (mean(hit) - mean(miss)) / Math.sqrt(v(hit) / hit.length + v(miss) / miss.length) : null;
  return { blocked: hit.length, kept: miss.length, noData: nd, blockedEx20: hit.length ? mean(hit) : null, keptEx20: miss.length ? mean(miss) : null, welchT: t };
}
// --smoke from,to: chỉ để thử cơ chế trên một đoạn ĐÃ XEM (giai đoạn báo cáo) — không ghi tệp kết quả.
const VARIANTS = ["B", "V1", "V2", "V3", "V4", "V5", "V6"];
if (arg("smoke")) { const [f0, t0] = arg("smoke").split(","); for (const v of VARIANTS) { const x = simulate(v, f0, t0), rs = x.daily.map((y) => y.r); console.log(v, "phiên", rs.length, "tổng", (stats(rs).total * 100).toFixed(1) + "%", "mã", x.names.toFixed(1), "chặn", x.vetoed, "không có BCTC", x.noData, "lệnh mua", x.entries.length); } process.exit(0); }
const result = { prereg: "backend/research/FA-r1-prereg.md", ranAt: new Date().toISOString(), panels: panelDates.length, statements: stmt.size, periods: {} };
for (const [name, [from, to]] of [["decision", DECISION], ["report", REPORT]]) {
  if (!panelDates.some((d) => d >= from && d <= to)) continue;
  console.error(`— ${name}: ${from} → ${to}`);
  const bm = benchmarks(from, to), sims = {};
  for (const v of VARIANTS) { const t0 = Date.now(); sims[v] = simulate(v, from, to); console.error(`  ${v}: ${sims[v].daily.length} phiên, chặn ${sims[v].vetoed}, ${((Date.now() - t0) / 1000).toFixed(0)} s`); }
  const r = (x) => x.map((y) => y.r), base = r(sims.B.daily), out = { from, to, sessions: base.length, benchmarks: { equalWeight: stats(r(bm.ew)), vnIndex: stats(r(bm.vn)) }, variants: {} };
  const trialSharpes = VARIANTS.map((v) => sharpe(r(sims[v].daily)));
  for (const v of VARIANTS) {
    const rs = r(sims[v].daily);
    out.variants[v] = {
      ...stats(rs), names: sims[v].names, cash: sims[v].cash, turnoverYr: sims[v].turnoverYr, frozenDays: sims[v].frozenDays, blockedBuys: sims[v].blockedBuys, blockedSells: sims[v].blockedSells,
      vetoed: sims[v].vetoed, noData: sims[v].noData, entries: sims[v].entries.length,
      vsEqualWeight: blockDiff(rs, r(bm.ew)), vsVnIndex: blockDiff(rs, r(bm.vn)), vsBaseline: v === "B" ? null : blockDiff(rs, base),
      deflatedSharpe: deflatedSharpe(rs, trialSharpes, VARIANTS.length).dsr, years: byYear(sims[v].daily, bm.ew), yearsVsBaseline: v === "B" ? null : byYear(sims[v].daily, sims.B.daily),
      diagnostic: v === "B" ? null : diagnose(sims.B.entries, v),
    };
  }
  // Holm cho 6 phép thử (FA-r1 mục 5) — chỉ có ý nghĩa ở giai đoạn quyết định.
  const tests = VARIANTS.filter((v) => v !== "B").map((v) => ({ v, p: out.variants[v].vsBaseline.mean20 > 0 ? out.variants[v].vsBaseline.p : 1 })).sort((a, b) => a.p - b.p);
  let stop = false; tests.forEach((x, i) => { const thr = 0.05 / (tests.length - i); const rej = !stop && x.p < thr; if (!rej) stop = true; out.variants[x.v].holm = { p: x.p, threshold: thr, reject: rej }; });
  for (const v of VARIANTS.filter((x) => x !== "B")) {
    const s = out.variants[v], yrs = Object.entries(s.yearsVsBaseline).filter(([y]) => name !== "decision" || (y >= "2014" && y <= "2019"));
    const c = { c1: s.vsBaseline.mean20 > 0 && s.vsBaseline.t >= 2, c2: s.holm.reject, c3: s.deflatedSharpe >= 0.95, c4: s.maxDd >= out.variants.B.maxDd - 0.05, c5: yrs.filter(([, x]) => x.diff > 0).length >= 5 };
    s.criteria = c; s.pass = name === "decision" && Object.values(c).every(Boolean);
  }
  result.periods[name] = out;
}
fs.writeFileSync(OUT, JSON.stringify(result, null, 1));
const pc = (x, d = 1) => (x == null || !fin(x) ? "—" : (x * 100).toFixed(d) + "%");
for (const [name, p] of Object.entries(result.periods)) {
  console.log(`\n=== ${name.toUpperCase()} ${p.from} → ${p.to} (${p.sessions} phiên) ===`);
  console.log(`VN-Index (giá): ${pc(p.benchmarks.vnIndex.cagr)}/năm, sụt giảm ${pc(p.benchmarks.vnIndex.maxDd)} · Bình quân đều vũ trụ: ${pc(p.benchmarks.equalWeight.cagr)}/năm, sụt giảm ${pc(p.benchmarks.equalWeight.maxDd)}`);
  for (const [v, s] of Object.entries(p.variants)) {
    console.log(`${v.padEnd(3)} ${pc(s.cagr).padStart(7)}/năm · Sharpe ${s.sharpe.toFixed(2)} · sụt giảm ${pc(s.maxDd)} · mã ${s.names.toFixed(1)} · tiền mặt ${pc(s.cash, 0)} · xoay ${s.turnoverYr.toFixed(1)}x · vs bình quân đều ${pc(s.vsEqualWeight.mean20, 2)} (t ${s.vsEqualWeight.t.toFixed(2)})${s.vsBaseline ? ` · vs B ${pc(s.vsBaseline.mean20, 2)} (t ${s.vsBaseline.t.toFixed(2)}, p ${s.vsBaseline.p.toFixed(3)}) · Holm ${s.holm.reject ? "bác H0" : "không"} · DSR ${s.deflatedSharpe.toFixed(2)} · tiêu chí ${Object.entries(s.criteria).map(([k, x]) => k + (x ? "✓" : "✗")).join(" ")}${s.pass ? " → ĐẠT" : ""} · chặn ${s.vetoed} lượt` : ` · DSR ${s.deflatedSharpe.toFixed(2)} · lệnh mua ${s.entries}`}`);
    if (s.diagnostic) console.log(`     chẩn đoán lệnh mua của B: bị chặn ${s.diagnostic.blocked} (vượt 20p ${pc(s.diagnostic.blockedEx20, 2)}) · không chặn ${s.diagnostic.kept} (${pc(s.diagnostic.keptEx20, 2)}) · t Welch ${s.diagnostic.welchT?.toFixed(2) ?? "—"} · không có BCTC ${s.diagnostic.noData}`);
  }
  console.log("theo năm, phương án − B:", Object.entries(p.variants).filter(([v]) => v !== "B").map(([v, s]) => `${v} [${Object.entries(s.yearsVsBaseline).map(([y, x]) => y.slice(2) + " " + pc(x.diff, 0)).join(", ")}]`).join(" · "));
}
