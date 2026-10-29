// MV2 — kiểm định ĐĂNG KÝ TRƯỚC SEAS-prereg-v1 (đặc tả: src/market/seasonality/SEAS-prereg.md).
//   node scripts/seasonality-validate.mjs lock <data.json>   -> ghi src/market/seasonality/seas-prereg-config.json (cấu hình chốt + SHA-256
//                                                              của cấu hình VÀ của tệp dữ liệu). Từ chối nếu đã có báo cáo.
//   node scripts/seasonality-validate.mjs run  <data.json>   -> chạy MỘT LẦN với cấu hình chốt, ghi seas-prereg-report.json. Từ chối nếu
//                                                              đã có báo cáo, hash cấu hình sai, hoặc dữ liệu khác bản đã khoá.
// Không gọi SSI, không ghi DB.
import fs from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { SEAS } from "../src/market/seasonality/config.js";
import { hashConfig, runSeasonalityValidation } from "../src/market/seasonality/validate.js";
import { buildSectorIndex } from "../src/market/sectors/rrg.js";

const [phase, dataPath] = process.argv.slice(2);
if (!["lock", "run"].includes(phase) || !dataPath) { console.error("Cách dùng: node scripts/seasonality-validate.mjs <lock|run> <data.json>"); process.exit(1); }
const dir = fileURLToPath(new URL("../src/market/seasonality/", import.meta.url));
const cfgPath = `${dir}seas-prereg-config.json`, reportPath = `${dir}seas-prereg-report.json`;
if (fs.existsSync(reportPath)) { console.error("Đã có báo cáo — kiểm định chỉ chạy MỘT lần, không chạy / chốt lại."); process.exit(2); }
const text = fs.readFileSync(dataPath, "utf8");
const dataSha = createHash("sha256").update(text).digest("hex");

if (phase === "lock") {
  if (fs.existsSync(cfgPath)) { console.error("Cấu hình đã chốt — không chốt lại."); process.exit(2); }
  const data = JSON.parse(text);
  const cfg = {
    prereg: "SEAS-prereg-v1", lockedAt: new Date().toISOString(),
    engine: { ...SEAS },
    trainStartYear: 2021, minTrainYears: 3, maxTrainYears: 5, testYears: [2024, 2025, 2026], testEnd: "2026-09",
    minCrossSection: 30, sectorMinCrossSection: 15, quantiles: 5,
    bootstrap: { iters: 10000, seed: 20261029, level: 0.9 },
    thresholds: { tMin: 2, yearsPositiveMin: 2 },
    data: { sha256: dataSha, fetchedAt: data.fetchedAt, tickers: data.tickers.length, source: data.source },
  };
  cfg.sha256 = hashConfig(cfg);
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 1));
  console.log(`chốt ${cfg.prereg} · sha256 cấu hình ${cfg.sha256} · dữ liệu ${dataSha}`);
  process.exit(0);
}

const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
if (hashConfig(cfg) !== cfg.sha256) { console.error("Hash cấu hình không khớp — cấu hình đã bị sửa."); process.exit(3); }
if (cfg.data.sha256 !== dataSha) { console.error("Dữ liệu khác bản đã khoá."); process.exit(3); }
const data = JSON.parse(text);
const t0 = Date.now();
// H1 — MÃ
const seriesOf = new Map(data.tickers.map((t) => [t.ticker, t.bars]));
const sectorOf = new Map(data.tickers.map((t) => [t.ticker, t.sector]));
const tickers = runSeasonalityValidation({ seriesOf, sectorOf, benchBars: data.bench, cfg });
// H2 — NGÀNH ICB cấp 2: chỉ số ngành = buildSectorIndex (cùng định nghĩa RRG / L2), prior toàn bộ ngành.
const dates = data.bench.map((b) => b.date);
const bySector = new Map();
for (const t of data.tickers) if (t.sector) { if (!bySector.has(t.sector)) bySector.set(t.sector, []); bySector.get(t.sector).push({ ticker: t.ticker, bars: t.bars }); }
const sectorSeries = new Map();
for (const [code, members] of bySector) {
  const idx = buildSectorIndex(members, dates);
  if (idx.series.length) sectorSeries.set(code, idx.series.map((p) => ({ date: p.date, close: p.close })));
}
const sectors = runSeasonalityValidation({ seriesOf: sectorSeries, sectorOf: null, benchBars: data.bench, cfg: { ...cfg, minCrossSection: cfg.sectorMinCrossSection } });
const report = {
  prereg: cfg.prereg, configSha256: cfg.sha256, dataSha256: dataSha, ranAt: new Date().toISOString(), ms: Date.now() - t0,
  tickers, sectors: { ...sectors, sectorCount: sectorSeries.size },
  verdict: { tickers: tickers.verdict, sectors: sectors.verdict },
};
fs.writeFileSync(reportPath, JSON.stringify(report, null, 1));
const brief = (r) => Object.entries(r.criteria).map(([k, v]) => `${k}=${v.pass ? "ĐẠT" : "KHÔNG"}`).join(" ");
console.log(`MÃ: ${tickers.verdict} (${brief(tickers)}) · IC ${tickers.criteria.C1_ic.icMean?.toFixed(4)} t ${tickers.criteria.C1_ic.t?.toFixed(2)}`);
console.log(`NGÀNH: ${sectors.verdict} (${brief(sectors)}) · IC ${sectors.criteria.C1_ic.icMean?.toFixed(4)} t ${sectors.criteria.C1_ic.t?.toFixed(2)} · ${sectorSeries.size} ngành`);
