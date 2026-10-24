// R6 — chạy kiểm định đặt trước tín hiệu chart (backend/src/market/chartSignals/CHART-SIGNALS-prereg.md) trên dữ liệu cục bộ.
//   node scripts/chart-signals-validate.mjs <dataDir> <out.json>
// dataDir: kết quả của scripts/structure-fetch.mjs (d/<SYM>.json). Đóng gói ĐÚNG mã nguồn chart (src/lib/ta-command-center/validation/
// signalsEntry.ts) bằng esbuild rồi đo; ghi báo cáo đầy đủ ra <out.json> và bản gọn cho giao diện vào chartSignalsReport.json.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { runChartSignalValidation } from "../src/market/chartSignals/validate.js";

const [dir, output] = process.argv.slice(2);
if (!dir || !output) { console.error("Cách dùng: node scripts/chart-signals-validate.mjs <dataDir> <out.json>"); process.exit(1); }
const root = fileURLToPath(new URL("../../", import.meta.url));
const { build } = createRequire(path.join(root, "package.json"))("esbuild");
const tmp = path.join(os.tmpdir(), `chart-signals-${process.pid}.mjs`);
await build({ entryPoints: [path.join(root, "src/lib/ta-command-center/validation/signalsEntry.ts")], bundle: true, format: "esm", platform: "node", outfile: tmp, logLevel: "silent" });
const lib = await import(pathToFileURL(tmp).href);
fs.rmSync(tmp, { force: true });

const daily = Object.fromEntries(fs.readdirSync(path.join(dir, "d")).filter((f) => f.endsWith(".json"))
  .map((f) => [f.slice(0, -5), JSON.parse(fs.readFileSync(path.join(dir, "d", f), "utf8")).bars]));
let last = 0;
const report = runChartSignalValidation({ daily, lib, onProgress: (m) => { if (Date.now() - last > 5000) { last = Date.now(); console.error(m); } } });
fs.writeFileSync(output, JSON.stringify(report, null, 1));
const ui = {
  prereg: report.prereg, generatedAt: report.generatedAt, universe: report.universe, data: report.data, tfConsistency: report.tfConsistency,
  results: Object.fromEntries(Object.entries(report.results).map(([id, r]) => [id, {
    label: r.label, side: r.side, h: r.h, tf: r.tf, verdict: r.verdict, reason: r.reason, q: r.q, placeboP: r.placeboP, stability: r.stability,
    IS: { n: r.IS.n, mean: r.IS.mean }, OOS: { n: r.OOS.n, mean: r.OOS.mean, ci: r.OOS.ci, hit: r.OOS.hit }, byYear: r.byYear,
  }])),
};
fs.writeFileSync(path.join(root, "src/lib/ta-command-center/validation/chartSignalsReport.json"), JSON.stringify(ui, null, 1) + "\n");
console.error(`xong sau ${(report.ms / 1000).toFixed(0)} giây -> ${output}`);
console.error(JSON.stringify(report.verdicts));
