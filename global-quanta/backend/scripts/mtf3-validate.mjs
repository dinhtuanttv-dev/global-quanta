// MTF v3 · S7 — chạy kiểm định đặt trước MTF-v3-prereg.md MỘT lần trên dữ liệu của scripts/mtf3-fetch.mjs. Không gọi mạng, không ghi DB.
//   node scripts/mtf3-validate.mjs <dataDir> <report.json>
import fs from "node:fs";
import path from "node:path";
import { runValidationV3 } from "../src/market/structure/validateV3.js";

const [dir, output] = process.argv.slice(2);
if (!dir || !output) { console.error("Cách dùng: node scripts/mtf3-validate.mjs <dataDir> <report.json>"); process.exit(1); }
const manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
const docs = manifest.kept.map((k) => JSON.parse(fs.readFileSync(path.join(dir, "d", `${k.ticker}.json`), "utf8")));
const report = runValidationV3(docs, { log: (m) => console.error(m) });
report.data = { sha256: manifest.sha256, fetchedAt: manifest.fetchedAt, symbols: manifest.kept.length, source: manifest.source };
fs.writeFileSync(output, JSON.stringify(report, null, 1));
console.log(JSON.stringify({ verdicts: report.verdicts, counts: report.counts, ms: report.ms }));
