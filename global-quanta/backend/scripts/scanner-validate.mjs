// Q4 — kiểm định đặt trước Smart Score v2 (src/market/scanner/SQ-prereg.md) trên dữ liệu cục bộ. Không gọi mạng, không ghi DB.
//   node scripts/scanner-validate.mjs <dataDir> <out.json> [--write-constant]
// dataDir: d/<SYM>.json (structure-fetch.mjs) + fa/<SYM>.json, taxonomy.json (scanner-fa-fetch.mjs).
// --write-constant: ghi kết quả vào src/market/scanner/scannerValidation.js (hằng số kiểm định cho API / giao diện).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runScannerValidation, SQ_PREREG } from "../src/market/scanner/scannerValidate.js";

const [dir, output, flag] = process.argv.slice(2);
if (!dir || !output) { console.error("Cách dùng: node scripts/scanner-validate.mjs <dataDir> <out.json> [--write-constant]"); process.exit(1); }
const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const daily = Object.fromEntries(fs.readdirSync(path.join(dir, "d")).filter((f) => f.endsWith(".json")).map((f) => [f.slice(0, -5), read(path.join(dir, "d", f)).bars]));
const fundamentals = new Map(fs.readdirSync(path.join(dir, "fa")).filter((f) => f.endsWith(".json")).map((f) => [f.slice(0, -5), read(path.join(dir, "fa", f))]));
const taxonomy = read(path.join(dir, "taxonomy.json"));
const report = runScannerValidation({ daily, indexBars: daily.VNINDEX, fundamentals, taxonomy });
fs.writeFileSync(output, JSON.stringify(report, null, 1));
console.error(JSON.stringify({ sample: report.sample, verdicts: report.verdicts }));

if (flag === "--write-constant") {
  const target = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src/market/scanner/scannerValidation.js");
  const body = {
    prereg: SQ_PREREG.id, status: "DONE", ranAt: report.generatedAt.slice(0, 10), sample: report.sample,
    primaryHorizon: SQ_PREREG.primaryHorizon, isEnd: SQ_PREREG.isEnd, verdicts: report.verdicts,
    ic: Object.fromEntries(Object.entries(report.results).map(([k, v]) => [k, v])), spreadTopBottomQuintile: report.spreadTopBottomQuintile,
  };
  fs.writeFileSync(target, `// SINH TỰ ĐỘNG bởi scripts/scanner-validate.mjs --write-constant (prereg SQ-prereg.md, ${SQ_PREREG.id}). KHÔNG sửa tay.\nexport const SCANNER_VALIDATION = Object.freeze(${JSON.stringify(body, null, 1)});\n`);
  console.error(`Đã ghi ${target}`);
}
