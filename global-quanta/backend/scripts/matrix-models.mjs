// M5 — chọn mô hình champion / challenger theo cổng đặt trước (M5-prereg.md) trên dữ liệu cục bộ; ghi sổ đăng ký mô hình.
//   node scripts/matrix-models.mjs <dataDir> <out.json> [--write-registry]
import fs from "node:fs";
import path from "node:path";
import { buildStateSeries } from "../src/market/tradingMatrix/scenarioEngine.js";
import { runModelSelection } from "../src/market/tradingMatrix/models.js";

const [dir, output, flag] = process.argv.slice(2);
if (!dir || !output) { console.error("Cách dùng: node scripts/matrix-models.mjs <dataDir> <out.json> [--write-registry]"); process.exit(1); }
const daily = Object.fromEntries(fs.readdirSync(path.join(dir, "d")).filter((f) => f.endsWith(".json")).map((f) => [f.slice(0, -5), JSON.parse(fs.readFileSync(path.join(dir, "d", f), "utf8")).bars]));
const indexBars = daily.VNINDEX;
const bySymbol = new Map(Object.entries(daily).filter(([s, b]) => s !== "VNINDEX" && b.length >= 300));
const res = runModelSelection(buildStateSeries({ bySymbol, indexBars }), indexBars);
const report = { prereg: "matrix/M5-prereg-2026-10-22 (c5edd78)", ranAt: new Date().toISOString(), data: { symbols: bySymbol.size, from: indexBars[0].date, to: indexBars.at(-1).date }, ...res };
fs.writeFileSync(output, JSON.stringify(report, null, 1));
if (flag === "--write-registry") {
  const reg = { prereg: report.prereg, ranAt: report.ranAt.slice(0, 10), data: report.data, trainN: res.trainN, holdoutN: res.holdoutN, gate: res.gate, active: res.active,
    models: Object.values(res.models).map((m) => ({ ...m, status: m.id === res.active ? "champion" : m.kind === "C1" ? "challenger" : "baseline" })) };
  fs.writeFileSync("src/market/tradingMatrix/matrixModels.js", `// Trading Matrix M5 — sổ đăng ký mô hình (sinh bởi scripts/matrix-models.mjs theo M5-prereg.md). Không sửa tay.\nexport const MATRIX_MODELS = Object.freeze(${JSON.stringify(reg)});\n`);
}
console.error(JSON.stringify({ active: res.active, gate: res.gate }, null, 1));
