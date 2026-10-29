// SEAS-REV (R0, 29/10/2026) — tải dữ liệu VNDirect 2013→nay cho kiểm định nhân bản độc lập (KHÔNG tính thống kê mùa vụ nào ở đây).
//   node scripts/seasonality-rev-fetch.mjs <out.json> [--conc 4]
// - Danh sách: mọi mã có ngành ICB cấp 2 (Gateway /sectors/taxonomy, nguồn VNDirect) + mã ĐÃ HUỶ NIÊM YẾT của VNDirect (/v4/stocks status:delisted).
// - Giá: VNDirect /v4/stock_prices — `adClose` (giá điều chỉnh của VNDirect), `nmValue` (GTGD khớp lệnh).
// - Lọc cố định (không phụ thuộc kết quả): chỉ giữ mã TỪNG đủ điều kiện vào chỉ số ngành — GTGD TB 60 phiên ≥ 300 triệu tại ít nhất một
//   phiên (đúng INDEX_PARAMS.minAvgValue của buildSectorIndex); mã chưa bao giờ đủ không thể vào rổ nên không ảnh hưởng chỉ số.
import fs from "node:fs";
import { createHash } from "node:crypto";
import { INDEX_PARAMS } from "../src/market/sectors/rrg.js";

const out = process.argv[2];
const conc = Number(process.argv[process.argv.indexOf("--conc") + 1]) || 4;
if (!out) { console.error("Cách dùng: node scripts/seasonality-rev-fetch.mjs <out.json>"); process.exit(1); }
const V = "https://api-finfo.vndirect.com.vn/v4";
const GW = (process.env.MARKET_GATEWAY_URL || "https://gateway-production-1da0.up.railway.app").replace(/\/+$/, "");
const FROM = "2012-12-01";
async function getJson(url, tries = 4) {
  for (let k = 0; k < tries; k++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(60_000), headers: { accept: "application/json", "user-agent": "Mozilla/5.0" } });
      if (r.ok) return r.json();
      if (r.status < 500 && r.status !== 429) throw new Error(`HTTP ${r.status}`);
    } catch (e) { if (k === tries - 1) throw e; }
    await new Promise((res) => setTimeout(res, 2000 * (k + 1)));
  }
  throw new Error("lỗi tải");
}

const tax = await getJson(`${GW}/api/market/sectors/taxonomy`);
const delisted = [];
for (let page = 1; ; page++) {
  const b = await getJson(`${V}/stocks?q=type:STOCK~status:delisted&size=500&page=${page}`);
  delisted.push(...(b.data ?? []));
  if (page >= (b.totalPages ?? 1)) break;
}
const meta = new Map();
for (const [code, v] of Object.entries(tax.symbols ?? {})) if (v?.l2 && /^[A-Z0-9]{3}$/.test(code)) meta.set(code, { sector: v.l2, status: "listed" });
let delistedWithSector = 0;
for (const d of delisted) {
  if (!d.code || !/^[A-Z0-9]{3}$/.test(d.code)) continue;
  const m = meta.get(d.code);
  if (m) { m.status = "delisted"; m.delistedDate = d.delistedDate ?? null; delistedWithSector++; }
}
const codes = [...meta.keys()].sort();
console.error(`${codes.length} mã có ICB cấp 2 · ${delisted.length} mã huỷ niêm yết (${delistedWithSector} có ngành)`);

function everEligible(values) {
  const w = INDEX_PARAMS.valueWindow;
  let s = 0;
  for (let i = 0; i < values.length; i++) {
    s += values[i]; if (i >= w) s -= values[i - w];
    if (i + 1 >= w && s / w >= INDEX_PARAMS.minAvgValue) return true;
  }
  return false;
}

const tickers = [], failed = [];
let i = 0, dropped = 0;
await Promise.all(Array.from({ length: conc }, async () => {
  while (i < codes.length) {
    const code = codes[i++];
    try {
      const rows = [];
      for (let page = 1; ; page++) {
        const b = await getJson(`${V}/stock_prices?sort=date:asc&size=5000&page=${page}&q=code:${code}~date:gte:${FROM}`);
        rows.push(...(b.data ?? []));
        if (page >= (b.totalPages ?? 1)) break;
      }
      const bars = rows.filter((r) => r.adClose > 0 && r.date).map((r) => [r.date, r.adClose, Math.round(r.nmValue ?? 0)]);
      if (!bars.length || !everEligible(bars.map((b) => b[2]))) { dropped++; continue; }
      tickers.push({ ticker: code, ...meta.get(code), bars });
    } catch (e) { failed.push(`${code}: ${e.message}`); }
    if ((tickers.length + dropped) % 200 === 0) console.error(`${tickers.length + dropped}/${codes.length}`);
  }
}));
tickers.sort((a, b) => a.ticker.localeCompare(b.ticker));
const doc = { fetchedAt: new Date().toISOString(), source: { prices: `${V}/stock_prices (adClose, nmValue)`, taxonomy: tax.updatedAt ?? null, delisted: delisted.length, delistedWithSector }, barsFormat: ["date", "adClose", "nmValue"], tickers, failed, dropped };
const text = JSON.stringify(doc);
fs.writeFileSync(out, text);
console.log(JSON.stringify({ tickers: tickers.length, dropped, failed: failed.length, delistedKept: tickers.filter((t) => t.status === "delisted").length, firstDate: tickers.map((t) => t.bars[0][0]).sort()[0], mb: Math.round(text.length / 1e6), sha256: createHash("sha256").update(text).digest("hex") }));
