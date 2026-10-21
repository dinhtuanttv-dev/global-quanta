// T2/T3 — chạy kiểm định đặt trước Cấu trúc đa khung (MTF-prereg.md) trên dữ liệu cục bộ. Không gọi SSI, không ghi DB.
//   node scripts/structure-validate.mjs <dataDir> <out.json>
// dataDir: kết quả của scripts/structure-fetch.mjs (d/<SYM>.json, h1/<SYM>.json).
import fs from "node:fs";
import path from "node:path";
import { runStructureValidation } from "../src/market/structure/validate.js";

const [dir, output] = process.argv.slice(2);
if (!dir || !output) { console.error("Cách dùng: node scripts/structure-validate.mjs <dataDir> <out.json>"); process.exit(1); }
const read = (sub) => Object.fromEntries(fs.readdirSync(path.join(dir, sub)).filter((f) => f.endsWith(".json"))
  .map((f) => [f.slice(0, -5), JSON.parse(fs.readFileSync(path.join(dir, sub, f), "utf8")).bars]));
const daily = read("d"), h1 = fs.existsSync(path.join(dir, "h1")) ? read("h1") : {};
console.error(`D: ${Object.keys(daily).length} mã · H1: ${Object.keys(h1).length} mã`);
let last = 0;
const report = runStructureValidation({ daily, h1, onProgress: (m) => { if (Date.now() - last > 5000) { last = Date.now(); console.error(m); } } });
fs.writeFileSync(output, JSON.stringify(report, null, 1));
console.error(`xong sau ${(report.ms / 1000).toFixed(0)} giây -> ${output}`);
console.error(JSON.stringify(report.verdicts));
