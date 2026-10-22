// M3 — kiểm định đặt trước kịch bản Trading Matrix (M3-prereg.md) trên dữ liệu cục bộ. Không gọi SSI, không ghi DB.
//   node scripts/matrix-validate.mjs <dataDir> <out.json>    (dataDir: kết quả scripts/structure-fetch.mjs, d/<SYM>.json)
import fs from "node:fs";
import path from "node:path";
import { runScenarioValidation } from "../src/market/tradingMatrix/scenarioValidate.js";

const [dir, output] = process.argv.slice(2);
if (!dir || !output) { console.error("Cách dùng: node scripts/matrix-validate.mjs <dataDir> <out.json>"); process.exit(1); }
const daily = Object.fromEntries(fs.readdirSync(path.join(dir, "d")).filter((f) => f.endsWith(".json")).map((f) => [f.slice(0, -5), JSON.parse(fs.readFileSync(path.join(dir, "d", f), "utf8")).bars]));
const indexBars = daily.VNINDEX;
if (!indexBars?.length) { console.error("Thiếu d/VNINDEX.json"); process.exit(1); }
const report = runScenarioValidation({ daily, indexBars });
fs.writeFileSync(output, JSON.stringify(report, null, 1));
console.error(JSON.stringify(report.verdicts));
