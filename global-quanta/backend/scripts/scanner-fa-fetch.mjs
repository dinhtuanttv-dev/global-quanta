// Q4 — nạp BCTC quý (VCI, cùng hàm production) + phân ngành (TradingView, cùng hàm classify) cho các mã trong <dataDir>/d/.
//   node scripts/scanner-fa-fetch.mjs <dataDir>      (dataDir: kết quả scripts/structure-fetch.mjs)
// Ra: <dataDir>/fa/<SYM>.json, <dataDir>/taxonomy.json. Không ghi DB.
import fs from "node:fs";
import path from "node:path";
import { fetchQuarterlyBalance, fetchQuarterlyIncome } from "../src/market/scanner/vciFinancials.js";
import { fetchTradingViewSectors } from "../src/market/scanner/universe.js";
import { classify } from "../src/market/scanner/taxonomy.js";

const [dir] = process.argv.slice(2);
if (!dir) { console.error("Cách dùng: node scripts/scanner-fa-fetch.mjs <dataDir>"); process.exit(1); }
const symbols = fs.readdirSync(path.join(dir, "d")).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)).filter((s) => s !== "VNINDEX");
fs.mkdirSync(path.join(dir, "fa"), { recursive: true });

const tv = await fetchTradingViewSectors();
const taxonomy = Object.fromEntries(symbols.map((s) => {
  const c = classify({ tvIndustry: tv.industries.get(s) ?? null, tvSector: tv.sectors.get(s) ?? null, symbol: s });
  return [s, { industry: c.industry, sectorGroup: c.group }];
}));
fs.writeFileSync(path.join(dir, "taxonomy.json"), JSON.stringify(taxonomy, null, 1));

let ok = 0, failed = [];
for (const s of symbols) {
  const f = path.join(dir, "fa", `${s}.json`);
  if (fs.existsSync(f)) { ok++; continue; }
  const [income, balance] = await Promise.all([fetchQuarterlyIncome(s), fetchQuarterlyBalance(s)]);
  if (!income.available && !balance.available) { failed.push(`${s}: ${income.error ?? balance.error}`); continue; }
  fs.writeFileSync(f, JSON.stringify({ ticker: s, income, balance }));
  ok++;
  await new Promise((r) => setTimeout(r, 300));
}
console.error(JSON.stringify({ symbols: symbols.length, ok, failed }));
