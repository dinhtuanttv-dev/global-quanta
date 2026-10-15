// Top 20 v2 — kiểm định đặt trước T3 trên dữ liệu cục bộ (Gateway /ta-series OHLC ADJUSTED_CUMULATIVE + VNDirect finfo). Không gọi SSI, không ghi DB.
//   node scripts/alpha-validate.mjs is  <dataDir> <outDir>   -> t3-config.json (chốt + SHA-256), t3-is-report.json
//   node scripts/alpha-validate.mjs oos <dataDir> <outDir>   -> t3-oos-report.json (CHỈ MỘT LẦN)
// dataDir: t20-ohlc.json, t20-ohlc-meta.json, taxonomy.json, vnd-fund.json, vnd-foreign.json, vnd-mcap.json, sector-hist.json
import fs from "node:fs";
import path from "node:path";
import { T3_PREREG, hashConfig, runInSample, runOutOfSample, setup } from "../src/market/alpha/validate.js";

const [phase, dataDir, outDir] = process.argv.slice(2);
if (!["is", "oos"].includes(phase) || !dataDir || !outDir) { console.error("Cách dùng: node scripts/alpha-validate.mjs <is|oos> <dataDir> <outDir>"); process.exit(1); }
const read = (f) => JSON.parse(fs.readFileSync(path.join(dataDir, f), "utf8"));
const cfgPath = path.join(outDir, "t3-config.json"), isPath = path.join(outDir, "t3-is-report.json"), oosPath = path.join(outDir, "t3-oos-report.json");
if (fs.existsSync(oosPath)) { console.error("OOS đã chạy một lần — không chạy lại / không hiệu chỉnh lại."); process.exit(2); }

const t0 = Date.now();
const ohlc = read("t20-ohlc.json"), meta = read("t20-ohlc-meta.json"), tax = read("taxonomy.json");
// quy tắc dữ liệu (chốt trước, giống CF3): chỉ chuỗi ADJUSTED_CUMULATIVE
const benchBars = ohlc.VNINDEX;
const seriesOf = new Map(Object.entries(ohlc).filter(([t]) => t !== "VNINDEX" && meta[t]?.priceBasis === "ADJUSTED_CUMULATIVE"));
const sectorOf = new Map(Object.entries(tax.symbols ?? {}).map(([t, v]) => [t, v?.l2 ?? null]));
const ITEM = { 21001: "revenue", 23000: "npat", 13000: "liabilities", 14000: "equity" };
const fundOf = new Map(Object.entries(read("vnd-fund.json")).map(([t, rows]) => {
  const byQ = new Map();
  for (const [item, fiscal, v, created] of rows) {
    if (!ITEM[item] || !fiscal) continue;
    const q = byQ.get(fiscal) ?? { fiscal, created: null };
    q[ITEM[item]] = v; if (created && (!q.created || created < q.created)) q.created = created; // ngày công bố sớm nhất của quý
    byQ.set(fiscal, q);
  }
  return [t, [...byQ.values()]];
}));
const foreignOf = new Map(Object.entries(read("vnd-foreign.json")).map(([t, rows]) => [t, new Map(rows.map(([d, net]) => [d, net]))]));
const mcapOf = new Map(Object.entries(read("vnd-mcap.json")).map(([t, rows]) => [t, rows.filter((r) => r[1] > 0).sort((a, b) => a[0].localeCompare(b[0]))]));
const hist = read("sector-hist.json");
const qByS = new Map(Object.entries(hist).map(([c, h]) => [c, (h.rrg ?? []).map((r) => [r.week, r.quadrant]).sort((a, b) => a[0].localeCompare(b[0]))]));
const quadrantOf = (sector, date) => { const rows = qByS.get(sector); if (!rows) return null; let q = null; for (const [w, qd] of rows) { if (w < date) q = qd; else break; } return q; };

const ctx = setup({ seriesOf, benchBars, sectorOf, fundOf, foreignOf, mcapOf }, { quadrantOf });
console.error(`${ctx.data.items.length} mã · ${ctx.dates.length} ngày đánh giá (IS ${ctx.isDates.length}, OOS ${ctx.oosDates.length}) · ${((Date.now() - t0) / 1000).toFixed(0)} s chuẩn bị`);
const progress = (label) => (d, n) => { if (d % 20 === 0 || d === n) console.error(`${label}: ${d}/${n}`); };

if (phase === "is") {
  const r = runInSample(ctx, { onProgress: progress("IS") });
  fs.writeFileSync(cfgPath, JSON.stringify(r.frozen, null, 1));
  fs.writeFileSync(isPath, JSON.stringify({ prereg: T3_PREREG.version, ...r, ms: Date.now() - t0 }, null, 1));
  console.error(`chọn ${r.frozen.chosen} · IC IS M1 ${r.frozen.isIc.M1} · M2 ${r.frozen.isIc.M2} · sha256 ${r.frozen.sha256}`);
} else {
  const frozen = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  if (hashConfig(frozen) !== frozen.sha256) { console.error("Hash cấu hình không khớp."); process.exit(3); }
  const r = runOutOfSample(ctx, frozen, { onProgress: progress("OOS") });
  fs.writeFileSync(oosPath, JSON.stringify({ ...r, ms: Date.now() - t0 }, null, 1));
  console.error(`${r.verdict} (${r.label}) · ${r.chosen} IC OOS ${r.outOfSample.ic.mean} [${r.outOfSample.ic.lo}, ${r.outOfSample.ic.hi}]`);
}
