// MV2 — tải dữ liệu cho kiểm định SEAS-prereg-v1 (CHỈ ĐỌC endpoint công khai của Gateway production; không gọi SSI trực tiếp, không ghi DB).
//   node scripts/seasonality-fetch.mjs <out.json> [--conc 4]
// Mỗi mã universe scanner: giá danh nghĩa (kho Gateway /ohlcv/nominal-history, 10 năm = toàn bộ lịch sử có) -> điều chỉnh cộng dồn theo sự
// kiện quyền (CHÍNH hàm adjustOhlcSeries + repairUnexplainedGaps của Gateway, nguồn sự kiện Project A /api/cotuc/events = cách tạo
// ADJUSTED_CUMULATIVE). VN-Index: điểm chỉ số. Ngành: ICB cấp 2 (Gateway /sectors/taxonomy).
import fs from "node:fs";
import { createHash } from "node:crypto";
import { adjustOhlcSeries, createCorporateActions, repairUnexplainedGaps } from "../src/market/adjusted/corporateActions.js";

const out = process.argv[2];
const conc = Number(process.argv[process.argv.indexOf("--conc") + 1]) || 4;
if (!out) { console.error("Cách dùng: node scripts/seasonality-fetch.mjs <out.json>"); process.exit(1); }
const GW = (process.env.MARKET_GATEWAY_URL || "https://gateway-production-1da0.up.railway.app").replace(/\/+$/, "");
const PA = (process.env.LEGACY_MARKET_API_BASE || "https://tuan-quant-scanner-psi.vercel.app").replace(/\/+$/, "");
const get = async (path) => {
  for (let k = 0; k < 3; k++) {
    try { const r = await fetch(`${GW}${path}`, { signal: AbortSignal.timeout(120_000) }); if (r.ok) return r.json(); if (r.status < 500) throw new Error(`HTTP ${r.status}`); } catch (e) { if (k === 2) throw e; }
    await new Promise((res) => setTimeout(res, 3000 * (k + 1)));
  }
  throw new Error("lỗi tải");
};

const universe = (await get("/api/market/scanner/universe")).tickers.map((t) => t.ticker);
const tax = await get("/api/market/sectors/taxonomy");
const ca = createCorporateActions({ base: PA });
const benchRaw = await get("/api/market/ohlcv/nominal-history?ticker=VNINDEX&years=10");
const bench = benchRaw.bars.map((b) => ({ date: b.date, close: b.close }));
const tickers = [], failed = [];
let i = 0;
await Promise.all(Array.from({ length: conc }, async () => {
  while (i < universe.length) {
    const t = universe[i++];
    try {
      const h = await get(`/api/market/ohlcv/nominal-history?ticker=${t}&years=10`);
      const nominal = h.bars.filter((b) => b.close > 0).map((b) => ({ date: b.date, open: b.close, high: b.close, low: b.close, close: b.close, volume: b.volume ?? 0 }));
      let events = [], basis = "NOMINAL_UNADJUSTED";
      try { events = (await ca.get(t)).events; basis = "ADJUSTED_CUMULATIVE"; } catch (e) { failed.push(`${t}: sự kiện quyền (${e.message})`); }
      const adj = adjustOhlcSeries(nominal, events);
      const fix = repairUnexplainedGaps(adj.bars);
      // GTGD (trọng số chỉ số ngành) = giá DANH NGHĨA × khối lượng danh nghĩa.
      const nomValue = new Map(nominal.map((b) => [b.date, b.close * b.volume]));
      tickers.push({ ticker: t, sector: tax.symbols?.[t]?.l2 ?? null, basis, events: adj.applied.length, gapRepairs: fix.repaired.length,
        bars: fix.bars.map((b) => ({ date: b.date, close: Math.round(b.close * 1e4) / 1e4, value: Math.round(nomValue.get(b.date) ?? 0) })) });
    } catch (e) { failed.push(`${t}: ${e.message}`); }
    if (tickers.length % 25 === 0) console.error(`${tickers.length}/${universe.length}`);
  }
}));
tickers.sort((a, b) => a.ticker.localeCompare(b.ticker));
const doc = { fetchedAt: new Date().toISOString(), source: { gateway: GW, events: `${PA}/api/cotuc/events`, taxonomy: tax.updatedAt ?? null }, bench, tickers, failed };
const text = JSON.stringify(doc);
fs.writeFileSync(out, text);
console.log(JSON.stringify({ tickers: tickers.length, failed: failed.length, adjusted: tickers.filter((t) => t.basis === "ADJUSTED_CUMULATIVE").length,
  firstDates: [...new Set(tickers.map((t) => t.bars[0]?.date))].sort().slice(0, 3), sha256: createHash("sha256").update(text).digest("hex") }));
