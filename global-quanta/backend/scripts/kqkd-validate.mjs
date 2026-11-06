// KQ-r1 — kiểm định đặt trước SUE LN cốt lõi & ước tính LNST cả năm (xem src/market/fundamentals/KQ-prereg.md). Không ghi DB, không gọi mạng.
//   node scripts/kqkd-validate.mjs is  <statementsDir> <prices.json> <outDir>   -> kq-r1-config.json (chốt + SHA-256), kq-r1-is-report.json
//   node scripts/kqkd-validate.mjs oos <statementsDir> <prices.json> <outDir>   -> kq-r1-oos-report.json (CHỈ MỘT LẦN)
// statementsDir: các file <MÃ>.json.gz của kho K0; prices.json: { MÃ: [[date, adClose, nmValue], …] } (VNDirect stock_prices).
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { KQ_PREREG, attachExcess, evaluate, hashConfig, priceIndex, tickerEvents } from "../src/market/fundamentals/kqkdValidate.js";
import { KQ_VERSION } from "../src/market/fundamentals/kqkdEngine.js";

const [phase, stDir, pricesFile, outDir] = process.argv.slice(2);
if (!["is", "oos"].includes(phase) || !stDir || !pricesFile || !outDir) { console.error("Cách dùng: node scripts/kqkd-validate.mjs <is|oos> <statementsDir> <prices.json> <outDir>"); process.exit(1); }
fs.mkdirSync(outDir, { recursive: true });
const cfgPath = path.join(outDir, "kq-r1-config.json"), isPath = path.join(outDir, "kq-r1-is-report.json"), oosPath = path.join(outDir, "kq-r1-oos-report.json");
if (fs.existsSync(oosPath)) { console.error("OOS đã chạy một lần — không chạy lại / không hiệu chỉnh lại."); process.exit(2); }

const t0 = Date.now();
const recs = fs.readdirSync(stDir).filter((f) => f.endsWith(".json.gz") && f !== "summary.json.gz").map((f) => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(stDir, f))).toString("utf8")));
const prices = JSON.parse(fs.readFileSync(pricesFile, "utf8"));
const pxOf = new Map(Object.entries(prices).map(([t, rows]) => [t, priceIndex(rows)]));
const frozen = { prereg: KQ_PREREG, engine: KQ_VERSION, tickers: recs.length, priceTickers: pxOf.size };
frozen.sha256 = hashConfig({ prereg: frozen.prereg, engine: frozen.engine });
let events = [];
for (const rec of recs) events.push(...tickerEvents(rec, pxOf.get(rec.ticker)));
events = attachExcess(events, pxOf);
console.error(`${recs.length} mã · ${events.length} sự kiện · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
const r = evaluate(events, recs);

if (phase === "is") {
  fs.writeFileSync(cfgPath, JSON.stringify(frozen, null, 1));
  const out = { prereg: r.prereg, frozenSha256: frozen.sha256, events: events.length, summary: r.summary.is, accuracy: r.accuracy.is, cohorts: r.cohorts.is, ms: Date.now() - t0 };
  fs.writeFileSync(isPath, JSON.stringify(out, null, 1));
  const s = r.summary.is;
  console.error(`IS · SUE cốt lõi IC ${s.sueCore.ic.mean} (${s.sueCore.cohorts} lứa) · SUE LNST IC ${s.sueNpat.ic.mean} · ước tính IC ${s.nowcast.ic.mean} · APE ${r.accuracy.is.medianApe} vs ngây thơ ${r.accuracy.is.medianApeNaive} · phủ ${r.accuracy.is.coverage}`);
} else {
  const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  if (hashConfig({ prereg: cfg.prereg, engine: cfg.engine }) !== cfg.sha256 || cfg.sha256 !== frozen.sha256) { console.error("Cấu hình đã chốt không khớp với mã hiện tại."); process.exit(3); }
  fs.writeFileSync(oosPath, JSON.stringify({ ...r, frozenSha256: cfg.sha256, events: events.length, ms: Date.now() - t0 }, null, 1));
  const s = r.summary.oos;
  console.error(`OOS · H1 ${r.verdict.H1 ? "ĐẠT" : "KHÔNG ĐẠT"} (IC ${s.sueCore.ic.mean} [${s.sueCore.ic.lo}, ${s.sueCore.ic.hi}] p ${s.sueCore.ic.pOneSided}, Q5−Q1 ròng ${s.sueCore.spread.mean})`);
  console.error(`     H2 ${r.verdict.H2 ? "ĐẠT" : "KHÔNG ĐẠT"} (IC cốt lõi − LNST ${r.h2.mean} p ${r.h2.pOneSided}) · SUE LNST IC ${s.sueNpat.ic.mean}`);
  console.error(`     H3 ${r.verdict.H3 ? "ĐẠT" : "KHÔNG ĐẠT"} (IC ${s.nowcast.ic.mean} [${s.nowcast.ic.lo}, ${s.nowcast.ic.hi}] p ${s.nowcast.ic.pOneSided}, Q5−Q1 ròng ${s.nowcast.spread.mean})`);
  const a = r.accuracy.oos;
  console.error(`     H4 ${r.verdict.H4 ? "ĐẠT" : "KHÔNG ĐẠT"} (APE ${a.medianApe} vs ngây thơ ${a.medianApeNaive}, p ${a.cohortDiff.pOneSided}, phủ P10–P90 ${a.coverage}, n ${a.n})`);
}
