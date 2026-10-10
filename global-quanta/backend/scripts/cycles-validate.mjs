// Cycle Fingerprint v2 — kiểm định đặt trước CF3 trên chuỗi cục bộ (tải từ Gateway /ta-series, ADJUSTED_CUMULATIVE). Không gọi SSI, không ghi DB.
//   node scripts/cycles-validate.mjs is  <series.json> <taxonomy.json> <outDir>   -> cf3-config.json (chốt + SHA-256), cf3-is-report.json
//   node scripts/cycles-validate.mjs oos <series.json> <taxonomy.json> <outDir>   -> cf3-oos-report.json (CHỈ MỘT LẦN: từ chối nếu đã có)
// series.json: { [symbol]: [{ date, close, volume, value }] } (gồm VNINDEX). taxonomy.json: Gateway /api/market/sectors/taxonomy.
import fs from "node:fs";
import path from "node:path";
import { CF3_PREREG, hashConfig, runInSample, runOutOfSample, secondaryWindowIc, setup } from "../src/market/cycles/validate.js";

const [phase, seriesPath, taxPath, outDir] = process.argv.slice(2);
if (!["is", "oos"].includes(phase) || !seriesPath || !taxPath || !outDir) {
  console.error("Cách dùng: node scripts/cycles-validate.mjs <is|oos> <series.json> <taxonomy.json> <outDir>");
  process.exit(1);
}
const raw = JSON.parse(fs.readFileSync(seriesPath, "utf8"));
const seriesOf = new Map(Object.entries(raw));
const tax = JSON.parse(fs.readFileSync(taxPath, "utf8"));
const sectorOf = new Map(Object.entries(tax.symbols ?? {}).map(([t, v]) => [t, v?.l2 ?? null]));
const progress = (label) => (d, n) => { if (d % 10 === 0 || d === n) console.error(`${label}: ${d}/${n} ngày`); };
const cfgPath = path.join(outDir, "cf3-config.json"), isPath = path.join(outDir, "cf3-is-report.json"), oosPath = path.join(outDir, "cf3-oos-report.json");
const t0 = Date.now();

const ctx = setup(seriesOf, sectorOf);
console.error(`thư viện ${ctx.lib.N} cửa sổ · ${ctx.lib.tickers.length} mã · ngày truy vấn ${ctx.dates.length} (IS ${ctx.is.length}, OOS ${ctx.oos.length})`);

if (phase === "is") {
  if (fs.existsSync(oosPath)) { console.error("Đã có kết quả OOS — không được hiệu chỉnh lại."); process.exit(2); }
  const r = runInSample(ctx, { onProgress: progress("IS") });
  fs.writeFileSync(cfgPath, JSON.stringify(r.frozen, null, 1));
  fs.writeFileSync(isPath, JSON.stringify({ prereg: CF3_PREREG.version, ...r, ms: Date.now() - t0 }, null, 1));
  console.error(`chốt λ=${r.frozen.lambda} hMult=${r.frozen.hMult} · IC IS ${r.inSample.ic.mean} · sha256 ${r.frozen.sha256}`);
} else {
  if (fs.existsSync(oosPath)) { console.error("OOS đã chạy một lần — không chạy lại."); process.exit(2); }
  const frozen = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  if (hashConfig(frozen) !== frozen.sha256) { console.error("Hash cấu hình không khớp."); process.exit(3); }
  const isReport = JSON.parse(fs.readFileSync(isPath, "utf8"));
  const secondaryCtx = CF3_PREREG.secondaryW.map((W) => secondaryWindowIc(seriesOf, sectorOf, W, frozen, { onProgress: progress(`W${W}`) }));
  const r = runOutOfSample(ctx, frozen, { isReport, secondaryCtx, onProgress: progress("OOS") });
  fs.writeFileSync(oosPath, JSON.stringify({ ...r, ms: Date.now() - t0 }, null, 1));
  console.error(`${r.verdict} (${r.label}) · IC OOS ${r.outOfSample.ic.mean} [${r.outOfSample.ic.lo}, ${r.outOfSample.ic.hi}]`);
}
