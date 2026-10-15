// X6 — chạy nghiên cứu sự kiện đặt trước (backend/src/market/catalystValidation/X6-prereg.md).
//   node backend/scripts/catalyst-event-study.mjs --ledger <HGETALL catalyst:signal-ledger .json> --out <result.json> [--from YYYY-MM-DD]
// Chỉ đọc: sổ tín hiệu (file xuất sẵn) + giá điều chỉnh từ Gateway /api/market/ta-series.
import { readFileSync, writeFileSync } from "node:fs";
import { runEventStudy } from "../src/market/catalystValidation/eventStudy.js";

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const GATEWAY = (process.env.MARKET_GATEWAY_URL || "https://gateway-production-1da0.up.railway.app").replace(/\/+$/, "");

function loadLedger(path) {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  const r = raw.result ?? raw;
  if (Array.isArray(r)) {
    const out = [];
    for (let i = 0; i < r.length; i += 2) out.push(typeof r[i + 1] === "string" ? JSON.parse(r[i + 1]) : r[i + 1]);
    return out;
  }
  return Object.values(r).map((x) => (typeof x === "string" ? JSON.parse(x) : x));
}

async function series(symbol) {
  for (let a = 0; a < 3; a++) {
    try {
      const res = await fetch(`${GATEWAY}/api/market/ta-series?symbol=${encodeURIComponent(symbol)}&range=2y&limit=600`, { signal: AbortSignal.timeout(90_000) });
      if (res.ok) return (await res.json()).bars ?? [];
      if (res.status === 404 || res.status === 400) return [];
    } catch { /* thử lại */ }
    await new Promise((r) => setTimeout(r, 2000 * (a + 1)));
  }
  return [];
}

const from = arg("from", null);
const records = loadLedger(arg("ledger")).filter((r) => !from || r.scannedAt >= from);
const tickers = [...new Set(records.map((r) => r.ticker))].sort();
const bars = {};
const todo = [...tickers];
await Promise.all(Array.from({ length: 3 }, async () => {
  while (todo.length) {
    const t = todo.shift();
    bars[t] = await series(t);
  }
}));
const index = await series("VNINDEX");
const result = runEventStudy(records.map(({ id, ticker, direction, category, propagationDistance, sourceId, scannedAt }) => ({ id, ticker, direction, category, propagationDistance, sourceId, scannedAt })), bars, index);
result.ranAt = new Date().toISOString();
result.priceSource = `${GATEWAY}/api/market/ta-series (ADJUSTED_CUMULATIVE)`;
result.indexLastDate = index.at(-1)?.date ?? null;
result.filterFrom = from;
writeFileSync(arg("out"), JSON.stringify(result, null, 1));
const p = result.primary;
const pct = (x) => (x == null ? "—" : `${(x * 100).toFixed(2)}%`);
console.log(`verdict=${result.verdict} evidence=${result.evidence} n20=${p.n} clusters=${p.clusters} meanSAR20=${pct(p.mean)} CI95=[${pct(p.lo)}, ${pct(p.hi)}] hit=${pct(p.hitRate)} binomP=${p.binomP?.toFixed(3)}`);
console.log(`sample`, JSON.stringify(result.sample), `sar5 mean=${pct(result.secondary.sar5.mean)} CI=[${pct(result.secondary.sar5.lo)}, ${pct(result.secondary.sar5.hi)}] n=${result.secondary.sar5.n}`);
