// Lọc ngành (L3) — chạy kiểm định đặt trước trên dữ liệu Gateway (chỉ đọc HTTP). Không gọi SSI, không ghi DB.
//   node scripts/sector-validate.mjs <out.json> [gatewayBase]
import fs from "node:fs";
import { runSectorValidation } from "../src/market/sectors/validate.js";

const [out, base = "https://gateway-production-1da0.up.railway.app"] = process.argv.slice(2);
if (!out) { console.error("Cách dùng: node scripts/sector-validate.mjs <out.json> [gatewayBase]"); process.exit(1); }
const get = async (p) => { const r = await fetch(base + p, { signal: AbortSignal.timeout(120_000) }); if (!r.ok) throw new Error(`${p} HTTP ${r.status}`); return r.json(); };
const summary = await get("/api/market/sectors/rrg?level=2");
const sectors = [];
for (const s of summary.sectors) sectors.push(await get(`/api/market/sectors/${s.code}/history`));
const bench = (await get("/api/market/ohlcv?symbol=VNINDEX&range=5y")).bars.filter((b) => !b.partial && b.close > 0).map((b) => ({ date: b.date, close: b.close }));
const report = runSectorValidation(sectors, bench, summary.closedThrough);
report.source = { engine: summary.engine, dataAsOf: summary.dataAsOf, closedThrough: summary.closedThrough };
fs.writeFileSync(out, JSON.stringify(report, null, 1));
console.error(`${report.label} — ${report.main?.verdict} -> ${out}`);
