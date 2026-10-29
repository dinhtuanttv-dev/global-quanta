// SEAS-REV (R0) — ĐỐI SOÁT NGUỒN: lợi suất tháng VNDirect adClose vs ADJUSTED_CUMULATIVE của Gateway (bản đã khoá SEAS-prereg-v1) trên
// giai đoạn chồng 03/2020–09/2026. CHỈ so giá — không tính thống kê mùa vụ / IC nào.
//   node scripts/seasonality-rev-reconcile.mjs <vnd.json> <gateway-data.json>
// Ngưỡng (chốt trong đề xuất §8.5): tương quan gộp ≥ 0,99 và sai lệch tuyệt đối trung vị nhỏ (≤ 0,5 điểm %).
import fs from "node:fs";
import { monthlyReturns } from "../src/market/seasonality/monthly.js";

const [vndPath, gwPath] = process.argv.slice(2);
const vnd = JSON.parse(fs.readFileSync(vndPath, "utf8")), gw = JSON.parse(fs.readFileSync(gwPath, "utf8"));
const vBy = new Map(vnd.tickers.map((t) => [t.ticker, t.bars.map(([date, close]) => ({ date, close }))]));
const xs = [], ys = [], diffs = [], perTicker = [];
for (const g of gw.tickers) {
  const v = vBy.get(g.ticker);
  if (!v) continue;
  const a = monthlyReturns(g.bars, { asOf: "2026-10-01" }).returns, b = monthlyReturns(v, { asOf: "2026-10-01" }).returns;
  const d = [];
  for (const [ym, r] of a) if (ym >= "2020-04" && b.has(ym)) { xs.push(r); ys.push(b.get(ym)); d.push(Math.abs(r - b.get(ym))); diffs.push(Math.abs(r - b.get(ym))); }
  if (d.length) perTicker.push({ ticker: g.ticker, months: d.length, maxAbsDiff: Math.max(...d), over1pct: d.filter((x) => x > 0.01).length });
}
const n = xs.length, mx = xs.reduce((s, x) => s + x, 0) / n, my = ys.reduce((s, y) => s + y, 0) / n;
let sxy = 0, sx = 0, sy = 0;
for (let k = 0; k < n; k++) { sxy += (xs[k] - mx) * (ys[k] - my); sx += (xs[k] - mx) ** 2; sy += (ys[k] - my) ** 2; }
const corr = sxy / Math.sqrt(sx * sy);
const sorted = [...diffs].sort((p, q) => p - q), q = (p) => sorted[Math.floor(p * (sorted.length - 1))];
const worst = perTicker.sort((p, q2) => q2.maxAbsDiff - p.maxAbsDiff).slice(0, 10);
const pass = corr >= 0.99 && q(0.5) <= 0.005;
console.log(JSON.stringify({ pairs: n, tickers: perTicker.length, corr: Math.round(corr * 1e5) / 1e5, medianAbsDiff: q(0.5), p90AbsDiff: q(0.9), p99AbsDiff: q(0.99),
  share_over1pct: diffs.filter((d) => d > 0.01).length / n, pass, worst }, null, 1));
process.exit(pass ? 0 : 4);
