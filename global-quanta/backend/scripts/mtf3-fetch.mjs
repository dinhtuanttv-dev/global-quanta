// MTF v3 · S7 — tải dữ liệu kiểm định đặt trước (MTF-v3-prereg.md) từ VNDirect, KHÔNG ghi DB, không tính thống kê nào ở đây.
//   node scripts/mtf3-fetch.mjs <outDir> [--conc 4]
// - Danh sách: mọi mã có ngành ICB (Gateway /sectors/taxonomy) + MỌI mã cổ phiếu HOSE / HNX ĐÃ HUỶ NIÊM YẾT của VNDirect (không thiên lệch sống sót).
// - Giá: /v4/stock_prices 2013-01-01 → nay: adOpen/adHigh/adLow/adClose (giá điều chỉnh, nghìn đồng), close danh nghĩa, nmVolume, nmValue.
// - Lọc cố định: chỉ giữ mã TỪNG đủ điều kiện của kiểm định (GTGD TB 20 phiên ≥ 10 tỷ tại ít nhất một phiên) — mã chưa bao giờ đủ không
//   thể vào tập sự kiện / tập so sánh.
// Đầu ra: <outDir>/d/<MÃ>.json = { ticker, status, bars: [[date, o, h, l, c, closeNominal, volume, value]] } + <outDir>/manifest.json.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const outDir = process.argv[2];
const conc = Number(process.argv[process.argv.indexOf("--conc") + 1]) || 4;
if (!outDir) { console.error("Cách dùng: node scripts/mtf3-fetch.mjs <outDir>"); process.exit(1); }
const V = "https://api-finfo.vndirect.com.vn/v4";
const GW = (process.env.MARKET_GATEWAY_URL || "https://gateway-production-1da0.up.railway.app").replace(/\/+$/, "");
const FROM = "2012-06-01"; // đủ ~140 phiên trước 2013 cho EMA100 khung ngày; kiểm định chỉ tính sự kiện từ 2013-01-01
const MIN_ADV = 10e9, ADV_WIN = 20;
fs.mkdirSync(path.join(outDir, "d"), { recursive: true });

async function getJson(url, tries = 5) {
  for (let k = 0; k < tries; k++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(60_000), headers: { accept: "application/json", "user-agent": "Mozilla/5.0" } });
      if (r.ok) return r.json();
      if (r.status < 500 && r.status !== 429) throw new Error(`HTTP ${r.status}`);
    } catch (e) { if (k === tries - 1) throw e; }
    await new Promise((res) => setTimeout(res, 2500 * (k + 1)));
  }
  throw new Error("lỗi tải");
}

const tax = await getJson(`${GW}/api/market/sectors/taxonomy`);
const status = new Map();
for (const code of Object.keys(tax.symbols ?? {})) if (/^[A-Z0-9]{3}$/.test(code)) status.set(code, "listed");
let delistedN = 0;
for (let page = 1; ; page++) {
  const b = await getJson(`${V}/stocks?q=type:STOCK~status:delisted&size=500&page=${page}`);
  for (const d of b.data ?? []) if (/^[A-Z0-9]{3}$/.test(d.code ?? "") && (d.floor === "HOSE" || d.floor === "HNX")) { status.set(d.code, "delisted"); delistedN++; }
  if (page >= (b.totalPages ?? 1)) break;
}
const codes = [...status.keys()].sort();
console.error(`${codes.length} mã (${delistedN} huỷ niêm yết HOSE/HNX)`);

function everEligible(values) {
  let s = 0;
  for (let i = 0; i < values.length; i++) { s += values[i]; if (i >= ADV_WIN) s -= values[i - ADV_WIN]; if (i + 1 >= ADV_WIN && s / ADV_WIN >= MIN_ADV) return true; }
  return false;
}

const kept = [], failed = [];
let i = 0, dropped = 0, done = 0;
const hash = createHash("sha256");
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
      const bars = rows.filter((r) => r.adClose > 0 && r.adHigh > 0 && r.adLow > 0 && r.date)
        .map((r) => [r.date, r.adOpen > 0 ? r.adOpen : r.adClose, r.adHigh, r.adLow, r.adClose, r.close ?? null, Math.round(r.nmVolume ?? 0), Math.round(r.nmValue ?? 0)]);
      if (!bars.length || !everEligible(bars.map((b) => b[7]))) dropped++;
      else {
        const text = JSON.stringify({ ticker: code, status: status.get(code), bars });
        fs.writeFileSync(path.join(outDir, "d", `${code}.json`), text);
        kept.push({ ticker: code, status: status.get(code), n: bars.length, first: bars[0][0], last: bars[bars.length - 1][0], sha256: createHash("sha256").update(text).digest("hex") });
      }
    } catch (e) { failed.push(`${code}: ${e.message}`); }
    if (++done % 100 === 0) console.error(`${done}/${codes.length} · giữ ${kept.length}`);
  }
}));
kept.sort((a, b) => a.ticker.localeCompare(b.ticker));
for (const k of kept) hash.update(k.sha256);
const manifest = { fetchedAt: new Date().toISOString(), prereg: "structure/MTF-v3-prereg.md", source: `${V}/stock_prices (adOpen/adHigh/adLow/adClose, close, nmVolume, nmValue)`, from: FROM, minAdv: MIN_ADV, kept, failed, dropped, sha256: hash.digest("hex") };
fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 1));
console.log(JSON.stringify({ kept: kept.length, delistedKept: kept.filter((k) => k.status === "delisted").length, dropped, failed: failed.length, sha256: manifest.sha256 }));
