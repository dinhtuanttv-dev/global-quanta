// SEAS-prereg-v2 — kiểm định mùa vụ tháng trên dữ liệu VNDirect 2013–2019 (đặc tả: src/market/seasonality/SEAS-prereg-v2.md).
//   node scripts/seasonality-validate-v2.mjs lock <vnd.json>   -> seas-prereg-v2-config.json (cấu hình + SHA-256 cấu hình & dữ liệu)
//   node scripts/seasonality-validate-v2.mjs run  <vnd.json>   -> chạy MỘT lần, ghi seas-prereg-v2-report.json
// Dữ liệu cắt cứng tại 31/12/2019 trước mọi phép tính (2020–2026 đã nhìn ở v1 — không được dùng). Không gọi mạng, không ghi DB.
import fs from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { SEAS } from "../src/market/seasonality/config.js";
import { hashConfig } from "../src/market/seasonality/validate.js";
import { runValidationV2 } from "../src/market/seasonality/validateV2.js";
import { buildSectorIndex } from "../src/market/sectors/rrg.js";

const [phase, dataPath] = process.argv.slice(2);
if (!["lock", "run"].includes(phase) || !dataPath) { console.error("Cách dùng: node scripts/seasonality-validate-v2.mjs <lock|run> <vnd.json>"); process.exit(1); }
const dir = fileURLToPath(new URL("../src/market/seasonality/", import.meta.url));
const cfgPath = `${dir}seas-prereg-v2-config.json`, reportPath = `${dir}seas-prereg-v2-report.json`;
if (fs.existsSync(reportPath)) { console.error("Đã có báo cáo — chỉ chạy MỘT lần."); process.exit(2); }
const text = fs.readFileSync(dataPath, "utf8");
const dataSha = createHash("sha256").update(text).digest("hex");
const CUTOFF = "2019-12-31";

if (phase === "lock") {
  if (fs.existsSync(cfgPath)) { console.error("Cấu hình đã chốt — không chốt lại."); process.exit(2); }
  const data = JSON.parse(text);
  const cfg = {
    prereg: "SEAS-prereg-v2", lockedAt: new Date().toISOString(), sign: 1, dataCutoff: CUTOFF,
    engine: { ...SEAS },
    trainStartYear: 2013, minTrainYears: 3, maxTrainYears: 5, testYears: [2016, 2017, 2018, 2019], testEnd: "2019-12",
    minCrossSection: 30, sectorMinCrossSection: 12, quantiles: 5,
    bootstrap: { iters: 10000, seed: 20261030, level: 0.9 },
    thresholds: { tMin: 2, yearsPositiveMin: 3 },
    reconciliation: { corr: 0.99104, medianAbsDiff: 0.0000118, shareOver1pct: 0.0328, pairs: 20622, tickers: 281 },
    data: { sha256: dataSha, fetchedAt: data.fetchedAt, tickers: data.tickers.length, delistedKept: data.tickers.filter((t) => t.status === "delisted").length, source: data.source },
  };
  cfg.sha256 = hashConfig(cfg);
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 1));
  console.log(`chốt ${cfg.prereg} · sha256 cấu hình ${cfg.sha256} · dữ liệu ${dataSha}`);
  process.exit(0);
}

const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
if (hashConfig(cfg) !== cfg.sha256) { console.error("Hash cấu hình không khớp."); process.exit(3); }
if (cfg.data.sha256 !== dataSha) { console.error("Dữ liệu khác bản đã khoá."); process.exit(3); }
const data = JSON.parse(text);
const t0 = Date.now();
const clip = (bars) => bars.filter(([d]) => d <= cfg.dataCutoff).map(([date, close, value]) => ({ date, close, value }));
const tickers = data.tickers.map((t) => ({ ...t, bars: clip(t.bars) })).filter((t) => t.bars.length);
// H1 — MÃ
const h1 = runValidationV2({ seriesOf: new Map(tickers.map((t) => [t.ticker, t.bars])), sectorOf: new Map(tickers.map((t) => [t.ticker, t.sector])), cfg });
// H2 — NGÀNH
const dates = [...new Set(tickers.flatMap((t) => t.bars.map((b) => b.date)))].sort();
const bySector = new Map();
for (const t of tickers) if (t.sector) { if (!bySector.has(t.sector)) bySector.set(t.sector, []); bySector.get(t.sector).push({ ticker: t.ticker, bars: t.bars }); }
const sectorSeries = new Map();
for (const [code, members] of bySector) { const idx = buildSectorIndex(members, dates); if (idx.series.length) sectorSeries.set(code, idx.series.map((p) => ({ date: p.date, close: p.close }))); }
const h2 = runValidationV2({ seriesOf: sectorSeries, sectorOf: null, cfg: { ...cfg, minCrossSection: cfg.sectorMinCrossSection } });
const report = { prereg: cfg.prereg, configSha256: cfg.sha256, dataSha256: dataSha, ranAt: new Date().toISOString(), ms: Date.now() - t0,
  tickers: { ...h1, seriesUsed: tickers.length }, sectors: { ...h2, sectorCount: sectorSeries.size }, verdict: { tickers: h1.verdict, sectors: h2.verdict } };
fs.writeFileSync(reportPath, JSON.stringify(report, null, 1));
const brief = (r) => Object.entries(r.criteria).map(([k, v]) => `${k}=${v.pass ? "ĐẠT" : "KHÔNG"}`).join(" ");
console.log(`MÃ: ${h1.verdict} (${brief(h1)})`);
console.log(`NGÀNH: ${h2.verdict} (${brief(h2)}) · ${sectorSeries.size} ngành`);
