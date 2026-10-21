// T2 — tải dữ liệu kiểm định Cấu trúc đa khung từ SSI (KHÔNG ghi DB, không dùng Supabase/Neon).
//   node scripts/structure-fetch.mjs <outDir> [--env path/.env] [--daily VN100] [--h1 VN30] [--conc 2]
// Ra: <outDir>/d/<SYM>.json (nến ngày điều chỉnh cộng dồn, cách của /ta-series) và <outDir>/h1/<SYM>.json (nến 1 giờ đã điều chỉnh).
// Chạy lại được: mã đã có file sẽ bỏ qua.
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const outDir = args[0];
const opt = (k, d) => { const i = args.indexOf(k); return i > 0 ? args[i + 1] : d; };
if (!outDir) { console.error("Cách dùng: node scripts/structure-fetch.mjs <outDir> [--env .env] [--daily VN100] [--h1 VN30] [--conc 2]"); process.exit(1); }
const envFile = opt("--env", null);
if (envFile) {
  for (const l of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(l);
    if (m && /^SSI|^MARKET_SSI/.test(m[1])) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
}
const { createSsiFcV2Provider } = await import("../src/market/providers/ssiFcV2Provider.js");
const { nominalizeBars } = await import("../src/market/adjusted/taSeries.js");
const { createCorporateActions, adjustOhlcSeries, repairUnexplainedGaps } = await import("../src/market/adjusted/corporateActions.js");
const q = await import("../src/market/vendor/quantCore.mjs");

const FROM_D = "2021-10-01", FROM_H1 = "2023-01-03";
const TO = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const p = createSsiFcV2Provider();
if (!p.isConfigured()) { console.error("Thiếu SSI_CONSUMER_ID / SSI_CONSUMER_SECRET"); process.exit(1); }
const ca = createCorporateActions({ base: (process.env.LEGACY_MARKET_API_BASE || "https://tuan-quant-scanner-psi.vercel.app").replace(/\/+$/, "") });
for (const sub of ["d", "h1"]) fs.mkdirSync(path.join(outDir, sub), { recursive: true });

async function dailyAdjusted(sym) {
  if (sym === "VNINDEX") return { priceBasis: "INDEX_POINTS", bars: await p.getIndexDaily(sym, FROM_D, TO) };
  const [ohlc, nominal] = await Promise.all([p.getDailyOhlcv(sym, FROM_D, TO), p.getDailyStockPriceNominal(sym, FROM_D, TO)]);
  const nom = nominalizeBars(ohlc, new Map(nominal.map((b) => [b.date, b.close])));
  const nominalClose = Object.fromEntries(nominal.map((b) => [b.date, b.close]));
  let priceBasis = "NOMINAL_UNADJUSTED", bars = nom.bars, events = 0;
  try {
    const c = await ca.get(sym);
    const adj = adjustOhlcSeries(nom.bars, c.events);
    bars = adj.bars; events = adj.applied.length; priceBasis = "ADJUSTED_CUMULATIVE";
  } catch (e) { console.error(`${sym}: chưa có sự kiện quyền (${e.message})`); }
  const fix = repairUnexplainedGaps(bars);
  return { priceBasis, events, gapRepairs: fix.repaired.length, matched: nom.matched, bars: fix.bars, nominalClose };
}

/** Nến phút -> 1 giờ, điều chỉnh từng phiên theo nến ngày điều chỉnh. */
async function h1Adjusted(sym, daily) {
  const adjClose = new Map(daily.bars.map((b) => [b.date, b.close]));
  const out = [];
  let nominalDays = 0, lastDays = 0;
  // Theo tháng (mã khớp lệnh nhiều dễ quá thời gian chờ), thử lại tối đa 3 lần mỗi tháng.
  for (let d = new Date(`${FROM_H1}T00:00:00Z`); d.toISOString().slice(0, 10) <= TO; d.setUTCMonth(d.getUTCMonth() + 1)) {
    const from = d.toISOString().slice(0, 10);
    const e = new Date(d); e.setUTCMonth(e.getUTCMonth() + 1); e.setUTCDate(e.getUTCDate() - 1);
    const to = e.toISOString().slice(0, 10) < TO ? e.toISOString().slice(0, 10) : TO;
    let raw = null;
    for (let k = 0; k < 3 && !raw; k++) { try { raw = await p.getIntradayRange(sym, from, to); } catch (err) { if (k === 2) throw err; await new Promise((r) => setTimeout(r, 3000 * (k + 1))); } }
    const mins = raw.filter((b) => b.close > 0).sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const lastMin = new Map();
    for (const b of mins) lastMin.set(String(b.date).slice(0, 10), b.close);
    const factor = new Map();
    for (const [day, lm] of lastMin) {
      const ac = adjClose.get(day), nc = daily.nominalClose?.[day];
      if (!(ac > 0)) continue;
      // Nến phút có thể đã được SSI điều chỉnh sẵn (VD cổ tức tiền ~1%) -> chỉ coi là danh nghĩa khi khớp gần như tuyệt đối.
      if (nc > 0 && Math.abs(lm / nc - 1) <= 0.001) { factor.set(day, ac / nc); nominalDays++; }
      else { factor.set(day, ac / lm); lastDays++; }
    }
    const adj = [];
    for (const b of mins) {
      const k = factor.get(String(b.date).slice(0, 10));
      if (!k) continue;
      adj.push({ date: String(b.date).replace("T", " ").slice(0, 16), open: b.open * k, high: b.high * k, low: b.low * k, close: b.close * k, volume: b.volume });
    }
    out.push(...q.minutesToH1(adj));
  }
  return { bars: out, factorBasis: { nominalDays, lastDays } };
}

async function mapLimit(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } }));
}

const dailyList = [...new Set(["VNINDEX", ...(await p.getIndexComponents(opt("--daily", "VN100")))])];
const h1Set = new Set(await p.getIndexComponents(opt("--h1", "VN30")));
fs.writeFileSync(path.join(outDir, "universe.json"), JSON.stringify({ fetchedAt: new Date().toISOString(), daily: dailyList, h1: [...h1Set], from: { d: FROM_D, h1: FROM_H1 }, to: TO }, null, 1));
console.error(`D: ${dailyList.length} mã, H1: ${h1Set.size} mã, tới ${TO}`);
const t0 = Date.now();
await mapLimit(dailyList, Number(opt("--conc", 2)), async (sym, k) => {
  const fd = path.join(outDir, "d", `${sym}.json`), fh = path.join(outDir, "h1", `${sym}.json`);
  try {
    let daily = fs.existsSync(fd) ? JSON.parse(fs.readFileSync(fd, "utf8")) : null;
    if (!daily) { daily = await dailyAdjusted(sym); fs.writeFileSync(fd, JSON.stringify(daily)); }
    if (h1Set.has(sym) && !fs.existsSync(fh)) fs.writeFileSync(fh, JSON.stringify(await h1Adjusted(sym, daily)));
    console.error(`[${k + 1}/${dailyList.length}] ${sym} D=${daily.bars.length} ${daily.priceBasis}${h1Set.has(sym) ? " +H1" : ""} · ${((Date.now() - t0) / 60000).toFixed(1)} phút`);
  } catch (e) { console.error(`[${k + 1}] ${sym} LỖI ${e.message}`); }
});
console.error("xong");
