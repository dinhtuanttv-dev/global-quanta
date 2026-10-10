// Radar Top 20 (T0) — thành phần đầu vào trên chuỗi điều chỉnh cộng dồn: RS căn ngày, GTGD 20/250, PVT/A-D, thanh khoản, stale.
import test from "node:test";
import assert from "node:assert/strict";
import { adTrend, buildTop20Inputs, pvtTrend, tickerInputs } from "../src/market/top20/top20Inputs.js";

const DATES = (() => { const out = []; const d = new Date(Date.UTC(2025, 0, 2)); while (out.length < 300) { const w = d.getUTCDay(); if (w >= 1 && w <= 5) out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); } return out; })();
const mk = (fn, vfn = () => 1e10, n = 300) => DATES.slice(0, n).map((date, i) => { const c = fn(i); return { date, open: c, high: c * 1.01, low: c * 0.99, close: c, volume: vfn(i) / c, value: vfn(i) }; });

test("RS 3 tháng căn theo ngày với VN-Index: mã tăng 21% khi chỉ số tăng 10% -> rs3m ≈ +11", () => {
  const bench = mk((i) => 1000 * (i >= 236 ? 1 + 0.1 * Math.min(1, (i - 236) / 63) : 1));
  const stock = mk((i) => 50 * (i >= 236 ? 1 + 0.21 * Math.min(1, (i - 236) / 63) : 1));
  const x = tickerInputs("AAA", stock, new Map(bench.map((b) => [b.date, b.close])));
  assert.ok(Math.abs(x.rs3m - 11) < 0.6, String(x.rs3m));
  assert.equal(x.liquid, true);
});

test("GTGD 20/250: dòng tiền tăng gấp 3 trong 20 phiên gần nhất -> tỷ lệ ≈ 2,5–3; thanh khoản < 5 tỷ -> liquid=false", () => {
  const bench = mk(() => 1000);
  const hot = mk(() => 20, (i) => (i >= 280 ? 3e9 : 1e9));
  const x = tickerInputs("HOT", hot, new Map(bench.map((b) => [b.date, b.close])));
  assert.ok(x.volumeSpikeRatio > 2.4 && x.volumeSpikeRatio < 3.1, String(x.volumeSpikeRatio));
  assert.equal(x.liquid, false);
});

test("PVT / A-D: tăng đều, đóng cửa sát đỉnh -> dương; giảm đều -> âm", () => {
  const up = mk((i) => 10 + i * 0.1).map((b) => ({ ...b, close: b.high * 0.999 }));
  const down = mk((i) => 100 - i * 0.1).map((b) => ({ ...b, close: b.low * 1.001 }));
  assert.ok(pvtTrend(up) > 50 && adTrend(up) > 50);
  assert.ok(pvtTrend(down) < -50 && adTrend(down) < -50);
});

test("buildTop20Inputs: dataAsOf = phiên cuối VN-Index; mã dừng giao dịch > 5 ngày -> stale; < 64 phiên -> bỏ", () => {
  const bench = mk(() => 1000);
  const seriesOf = new Map([["OKK", mk(() => 30)], ["OLD", mk(() => 30, () => 1e10, 280)], ["NEW", mk(() => 30, () => 1e10, 40)]]);
  const doc = buildTop20Inputs({ seriesOf, benchBars: bench });
  assert.equal(doc.dataAsOf, DATES[299]);
  assert.deepEqual(doc.tickers.map((t) => [t.ticker, t.stale]), [["OKK", false], ["OLD", true]]);
  assert.equal(doc.liquid, 1);
  assert.equal(doc.priceBasis, "ADJUSTED_CUMULATIVE");
});
