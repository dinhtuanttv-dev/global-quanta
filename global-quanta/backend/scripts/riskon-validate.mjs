// Kiểm định đặt trước Risk-On (backend/src/market/riskOnValidation/RON-prereg.md). Chỉ đọc nguồn công khai.
//   node backend/scripts/riskon-validate.mjs --out <result.json>
import { writeFileSync } from "node:fs";
import { buildSamples, runRiskOnValidation } from "../src/market/riskOnValidation/riskOnValidate.js";
const out = process.argv[process.argv.indexOf("--out") + 1];
const GATEWAY = (process.env.MARKET_GATEWAY_URL || "https://gateway-production-1da0.up.railway.app").replace(/\/+$/, "");
async function yahoo(symbol) {
  const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=12y&interval=1d`, { headers: { "user-agent": "Mozilla/5.0" } });
  const j = (await r.json()).chart.result[0];
  return j.timestamp.map((t, i) => ({ date: new Date(t * 1000).toISOString().slice(0, 10), close: j.indicators.quote[0].close[i] })).filter((b) => b.close > 0);
}
const vn = (await (await fetch(`${GATEWAY}/api/market/ohlcv/nominal-history?ticker=VNINDEX&years=10`)).json()).bars.filter((b) => !b.partial);
const [dxy, vix, tnx] = await Promise.all([yahoo("DX-Y.NYB"), yahoo("^VIX"), yahoo("^TNX")]);
const res = runRiskOnValidation(buildSamples(vn, dxy, vix, tnx));
res.ranAt = new Date().toISOString();
res.sources = { vn: `${GATEWAY} VNINDEX`, dxy: "Yahoo DX-Y.NYB", vix: "Yahoo ^VIX", tnx: "Yahoo ^TNX" };
writeFileSync(out, JSON.stringify(res, null, 1));
const f = (x, d = 3) => (x == null ? "—" : x.toFixed(d));
console.log(`verdict=${res.verdict} n=${res.n} ${res.from}..${res.to} IC=${f(res.h1.ic)} CI95=[${f(res.h1.ci95[0])}, ${f(res.h1.ci95[1])}]`);
console.log("groups", JSON.stringify(res.groups), "H2", JSON.stringify(res.h2), "H3", JSON.stringify(res.h3));
