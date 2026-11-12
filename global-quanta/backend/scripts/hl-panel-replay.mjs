// N1 (HL 2.0) — DỰNG LẠI BẢNG TÍN HIỆU LỊCH SỬ cho quy tắc Hợp lưu HL-v1, đúng thời điểm (point-in-time).
// Chạy ĐÚNG các engine của Gateway (không viết lại): SEPA, Base Breakout, Hợp lưu v2, Pring (runTechnicalFilters), cấu trúc xu hướng
// MTF v3 (summary3), LS-v1 (leadership.js), RRG ngành (sectors/sectorRotation.js), mã hoá qua buildSignalRows của signalRegistry.
// Mỗi phiên D chỉ dùng thanh giá ≤ D; vũ trụ = `top` mã có GTGD TB20 cao nhất TẠI D (gồm mã đã huỷ niêm yết).
//
// KHÔNG dựng lại được (không có lịch sử) -> để null, KHÔNG dùng trong kiểm định: Stealth 20/5, ý đồ dòng tiền, khối ngoại, điểm cơ bản
// Siêu quét, α ngành thế giới, Alpha M1, chất xúc tác, cổ tức. BCTC cho SEPA: chưa nạp (faMap rỗng) — ghi trong tệp meta.
//
//   node backend/scripts/hl-panel-replay.mjs --px <thư mục OHLC> --index <VNINDEX.json> --tax <taxonomy.json> --out <thư mục>
//        [--from 2014-03-03] [--to 2026-11-12] [--step 1] [--top 300] [--dates d1,d2] [--limit n]
// Dòng OHLC: [date, adOpen, adHigh, adLow, adClose, close, nmValue, nmVolume, ceiling, floor, basic] (giá nghìn đồng, VNDirect).
import fs from "node:fs"; import path from "node:path"; import zlib from "node:zlib"; import { pathToFileURL } from "node:url";
const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const M_ = (p) => import(pathToFileURL(path.join(HERE, "../src/market", p)).href);
const { runTechnicalFilters } = await M_("strategies/technicalFilters.js");
const { summary3 } = await M_("structure/structureService.js");
const L = await M_("elite/leadership.js");
const { buildSectorRotation } = await M_("sectors/sectorRotation.js");
const { buildSignalRows } = await M_("elite/signalRegistry.js");

const arg = (k, d = null) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const PX = arg("px"), IDX = arg("index"), TAX = arg("tax"), OUT = arg("out");
const FROM = arg("from", "2014-03-03"), TO = arg("to", "9999-12-31"), STEP = Number(arg("step", "1")), TOP = Number(arg("top", "300")), LIMIT = Number(arg("limit", "0"));
// --tickers <tệp JSON mảng mã>: cố định vũ trụ (chỉ để SO KHỚP với production, vốn dùng vũ trụ Siêu quét cố định) — không dùng cho kiểm định.
const FIXED = arg("tickers") ? new Set(JSON.parse(fs.readFileSync(arg("tickers"), "utf8"))) : null;
const ONLY = arg("dates") ? new Set(arg("dates").split(",")) : null;
if (!PX || !IDX || !TAX || !OUT) { console.error("thiếu --px / --index / --tax / --out"); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });
const HL_KEYS = ["ls_v1", "sepa_state", "base_breakout", "convergence", "pattern_state", "structure_score", "structure_stage", "structure_verdict", "rrg_quadrant", "sepa_s2"];
const STRATS = ["sepa", "patterns", "convergence", "base-breakout"];

// ── Nạp dữ liệu ──
const icb = JSON.parse(fs.readFileSync(TAX, "utf8")), tax = icb.symbols;
const idxRows = JSON.parse(fs.readFileSync(IDX, "utf8")).filter((r) => r[4] > 0);
const indexBars = idxRows.map((r) => ({ date: r[0], open: r[1], high: r[2], low: r[3], close: r[4], volume: r[5] ?? 0, value: r[6] ?? 0 }));
const days = indexBars.map((b) => b.date);
const bars = new Map(), posOf = new Map();
for (const f of fs.readdirSync(PX)) {
  const t = f.replace(/\.json$/, ""); let rows; try { rows = JSON.parse(fs.readFileSync(path.join(PX, f), "utf8")); } catch { continue; }
  const b = rows.filter((r) => r[4] > 0 && r[1] > 0 && r[2] > 0 && r[3] > 0).map((r) => ({ date: r[0], open: r[1] * 1000, high: r[2] * 1000, low: r[3] * 1000, close: r[4] * 1000, volume: r[7] ?? 0, value: r[6] ?? 0, raw: r[5], ceil: r[8], floor: r[9] }));
  if (b.length < 30) continue;
  bars.set(t, b); posOf.set(t, new Map(b.map((x, i) => [x.date, i])));
}
console.error(`mã có giá: ${bars.size} · phiên VN-Index: ${days.length} (${days[0]} → ${days.at(-1)})`);
// LS-v1: ma trận giá toàn giai đoạn (lsDay chỉ đọc ≤ i).
const series = new Map([...bars].map(([t, b]) => [t, b.map((x) => [x.date, x.close, x.value])]));
const Mx = L.buildMatrix(series, idxRows.map((r) => [r[0], r[4]]));
// RRG ngành: dùng ĐÚNG buildSectorRotation của production cho từng phiên — rổ = mã của vũ trụ phiên đó, ICB cấp 2 + cấp 3,
// góc phần tư `liveQuadrant ?? quadrant` (gồm tuần đang chạy) như bảng E1 đang ghi.
const adv20 = (t, d) => { const i = posOf.get(t)?.get(d); if (i == null || i < 19) return null; const b = bars.get(t); let s = 0; for (let k = i - 19; k <= i; k++) s += b[k].value ?? 0; return s / 20; };
const upTo = (t, d) => { const i = posOf.get(t)?.get(d); return i == null ? null : bars.get(t).slice(0, i + 1); };

async function replay(d) {
  const iD = days.indexOf(d);
  const cand = [...bars.keys()].map((t) => [t, adv20(t, d)]).filter((x) => (FIXED ? FIXED.has(x[0]) && x[1] != null : x[1] >= 1e9)).sort((a, b) => b[1] - a[1]).slice(0, FIXED ? 9999 : TOP);
  const tickers = cand.map(([t]) => ({ ticker: t, name: null, sector: tax[t]?.l2 ?? null }));
  const cache = new Map(cand.map(([t]) => [t, upTo(t, d)]));
  const loadSeries = async (t) => ({ bars: cache.get(t) ?? [], priceBasis: "ADJUSTED_VND" });
  loadSeries.index = async () => indexBars.slice(0, iD + 1);
  const service = { store: { getKv: async (k) => (k === "scanner:universe" ? { value: { tickers } } : null), getFundamentals: async () => new Map() }, fundWarehouse: null };
  const strategies = await runTechnicalFilters(service, { loadSeries, strategies: STRATS, withEvidence: false, now: () => Date.parse(`${d}T10:00:00Z`) });
  const structure = { rows: [] };
  for (const [t] of cand) { const b = cache.get(t); if (b.length < 260) continue; try { structure.rows.push({ t, s3: summary3(b.map((x) => ({ date: x.date, open: x.open, high: x.high, low: x.low, close: x.close, volume: x.volume }))) }); } catch { /* mã thiếu dữ liệu */ } }
  const lsDay = L.lsDay(Mx, Mx.pos.get(d), { only: new Set(cand.map(([t]) => t)) });
  const leadership = { rows: Object.fromEntries([...lsDay].filter(([, r]) => r.ls != null).map(([t, r]) => [t, { ls: r.ls }])) };
  const src = {
    scanner: { items: tickers.map((u) => ({ ticker: u.ticker })) }, strategies, taxonomy: { symbols: tax }, structure, leadership,
    rrg: { sectors: buildSectorRotation({ universe: tickers, icb, seriesOf: new Map(cand.map(([t]) => [t, cache.get(t)])), benchBars: indexBars.slice(0, iD + 1), now: () => Date.parse(`${d}T10:00:00Z`) }).summary.sectors.map((x) => ({ code: x.code, quadrant: x.quadrant, liveQuadrant: x.liveQuadrant })) },
  };
  const { rows } = buildSignalRows(src);
  const advOf = new Map(cand);
  return {
    date: d, universe: rows.length, asOf: Object.fromEntries(STRATS.map((s) => [s, strategies[s]?.dataAsOf ?? null])),
    rows: rows.map((r) => { const b = cache.get(r.ticker).at(-1); return { ticker: r.ticker, l2: tax[r.ticker]?.l2 ?? null, adv: Math.round(advOf.get(r.ticker)), close: b.close, values: Object.fromEntries(HL_KEYS.map((k) => [k, r.values[k] ?? null])) }; }),
  };
}

const todo = days.filter((d, i) => (ONLY ? ONLY.has(d) : d >= FROM && d <= TO && i % STEP === 0)); let n = 0, t0 = Date.now();
for (const d of todo) {
  const f = path.join(OUT, `${d}.json.gz`); if (fs.existsSync(f)) continue;
  try { const doc = await replay(d); fs.writeFileSync(f, zlib.gzipSync(JSON.stringify(doc))); n++; }
  catch (e) { console.error(d, "LỖI", e.message); }
  if (n && n % 10 === 0) console.error(`${d} · ${n} phiên · ${((Date.now() - t0) / n / 1000).toFixed(1)} s/phiên`);
  if (LIMIT && n >= LIMIT) break;
}
fs.writeFileSync(path.join(OUT, "_meta.json"), JSON.stringify({ builtAt: new Date().toISOString(), px: PX, top: TOP, keys: HL_KEYS, engines: STRATS, fundamentals: "KHÔNG nạp (faMap rỗng)", priceSource: "VNDirect stock_prices (giá điều chỉnh, nghìn đồng × 1000)", notAvailable: ["stealth20", "stealth5", "net_intent", "foreign_net_buy", "fa_score", "ws_sector_alpha", "top20_alpha", "catalyst_impact", "cotuc_decision"] }, null, 1));
console.error(`xong ${n} phiên mới (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
