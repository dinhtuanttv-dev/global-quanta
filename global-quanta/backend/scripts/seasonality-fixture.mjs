// MV1 — sinh đầu vào tất định cho oracle mùa vụ (Python): 14 mã / 3 ngành + VN-Index, có tháng thiếu, mã niêm yết muộn, dừng giao dịch
// giữa tháng, ngày nghỉ. Chạy: node scripts/seasonality-fixture.mjs <out.json>   rồi   python scripts/seasonality-oracle.py <in> <out>
import fs from "node:fs";
import { mulberry32 } from "../src/market/seasonality/strength.js";

/** Đầu vào tất định (cùng seed -> cùng dữ liệu) — test/seasonality.test.js dựng lại để so với kết quả oracle đã lưu. */
export function buildSeasonalityFixture() {
const rng = mulberry32(20261029);
const gauss = () => { const u = Math.max(1e-12, rng()), v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
function series({ from, to, monthEffect = () => 0, vol = 0.018, skip = () => false }) {
  const bars = [];
  let px = 20 + rng() * 80;
  for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    const w = d.getUTCDay(); if (w === 0 || w === 6) continue;
    const iso = d.toISOString().slice(0, 10);
    if (skip(iso)) continue;
    px *= Math.exp(monthEffect(Number(iso.slice(5, 7)) - 1) / 21 + vol * gauss());
    bars.push({ date: iso, close: Math.round(px * 100) / 100 });
  }
  return bars;
}
const tet = (iso) => ["2021-02-10", "2021-02-11", "2021-02-12", "2021-02-15", "2021-02-16", "2022-01-31", "2022-02-01", "2022-02-02", "2022-02-03", "2022-02-04",
  "2023-01-20", "2023-01-23", "2023-01-24", "2023-01-25", "2023-01-26", "2024-02-08", "2024-02-09", "2024-02-12", "2024-02-13", "2024-02-14", "2025-01-27", "2025-01-28",
  "2025-01-29", "2025-01-30", "2025-01-31"].includes(iso);
const asOf = "2026-10-29";
const bench = series({ from: "2020-02-26", to: "2026-10-28", vol: 0.011, skip: tet });
const tickers = [];
const add = (ticker, sector, opts) => tickers.push({ ticker, sector, bars: series({ from: "2020-02-26", to: "2026-10-28", skip: tet, ...opts }) });
for (let i = 0; i < 6; i++) add(`BK${i}`, "8300", { monthEffect: (m) => (m === 3 ? 0.05 : m === 7 ? -0.03 : 0) });
for (let i = 0; i < 5; i++) add(`RE${i}`, "8600", { monthEffect: (m) => (m === 11 ? 0.04 : 0), vol: 0.025 });
add("NEW", "8600", { from: "2023-05-15" });
add("HALT", "2700", { skip: (iso) => tet(iso) || (iso >= "2022-06-10" && iso <= "2022-09-05") });
add("LONE", "2700", {});
return { asOf, bench, tickers };
}

if (process.argv[1] && import.meta.url.endsWith("/seasonality-fixture.mjs") && process.argv[1].endsWith("seasonality-fixture.mjs")) {
  const f = buildSeasonalityFixture();
  fs.writeFileSync(process.argv[2], JSON.stringify(f));
  console.log("ok", f.tickers.length, "mã");
}
