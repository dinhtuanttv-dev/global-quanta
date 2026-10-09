// P3 — chạy kiểm định đặt trước của Pattern Scanner v2 (Pring) trên chuỗi giá cục bộ. Không gọi SSI, không ghi DB.
//   node scripts/pring-validate.mjs <series.json> <out.json>
// series.json: { [symbol]: [{ date, open, high, low, close, volume, value }] } (chuỗi giá điều chỉnh cộng dồn).
import fs from "node:fs";
import { runValidation } from "../src/market/strategies/pring/validate.js";

const [input, output] = process.argv.slice(2);
if (!input || !output) { console.error("Cách dùng: node scripts/pring-validate.mjs <series.json> <out.json>"); process.exit(1); }
const series = JSON.parse(fs.readFileSync(input, "utf8"));
const report = runValidation(series, { onProgress: (d, n) => { if (d % 25 === 0 || d === n) console.error(`quét ${d}/${n} mã`); } });
fs.writeFileSync(output, JSON.stringify(report, null, 1));
console.error(`xong sau ${(report.ms / 1000).toFixed(0)} giây -> ${output}`);
