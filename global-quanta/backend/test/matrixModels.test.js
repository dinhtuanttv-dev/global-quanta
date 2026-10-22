// Trading Matrix M5 — champion / challenger: đặc trưng không nhìn trước, purged k-fold, cổng thăng hạng đúng quy tắc.
import test from "node:test";
import assert from "node:assert/strict";
import { featureRows, predict, promotionGate, runModelSelection, trainB0 } from "../src/market/tradingMatrix/models.js";
import { buildStateSeries } from "../src/market/tradingMatrix/scenarioEngine.js";
import { tradingDatesBack } from "../src/market/scanner/scannerJobs.js";

function synth(n, seed, signal = 0) {
  let a = seed; const r = () => ((a = (a * 16807) % 2147483647) / 2147483647);
  const dates = tradingDatesBack("2026-10-21", n);
  const idx = []; let p = 1000;
  const daily = {};
  const stocks = Array.from({ length: 30 }, (_, k) => ({ k, q: 20 + k }));
  for (const s of stocks) daily[`S${s.k}`] = [];
  for (let i = 0; i < n; i++) {
    // Độ rộng (cổ phiếu chung xu hướng) dẫn trước chỉ số 10 phiên khi signal > 0.
    const lead = Math.sin(i / 25);
    p *= 1 + signal * 0.003 * Math.sin((i - 10) / 25) + (r() - 0.5) * 0.015;
    idx.push({ date: dates[i], open: p, high: p, low: p, close: p, volume: 1 });
    for (const s of stocks) { s.q *= 1 + 0.004 * lead + (r() - 0.5) * 0.02; daily[`S${s.k}`].push({ date: dates[i], open: s.q, high: s.q, low: s.q, close: s.q, closeAdj: s.q, volume: 1, value: 1 }); }
  }
  daily.VNINDEX = idx;
  return daily;
}
const states = (d) => buildStateSeries({ bySymbol: new Map(Object.entries(d).filter(([k]) => k !== "VNINDEX")), indexBars: d.VNINDEX });

test("đặc trưng: chỉ dữ liệu ≤ t; nhãn y = VN-Index sau 10 phiên tăng; phiên cuối chưa có nhãn", () => {
  const d = synth(500, 3);
  const rows = featureRows(states(d), d.VNINDEX);
  assert.ok(rows.length > 300);
  assert.equal(rows.at(-1).y, null);
  const i = rows[100].ti, c = d.VNINDEX.map((b) => b.close);
  assert.equal(rows[100].y, c[i + 10] > c[i] ? 1 : 0);
  assert.equal(rows[0].x.length, 11);
});

test("cổng: dữ liệu ngẫu nhiên -> GIỮ champion; B0 dự báo theo nhóm độ rộng; mọi xác suất trong [0,1]", () => {
  const d = synth(1250, 9, 0);
  const res = runModelSelection(states(d), d.VNINDEX);
  assert.equal(res.gate.verdict, "KEEP_CHAMPION");
  assert.equal(res.active, "B0-breadth");
  for (const m of Object.values(res.models)) assert.ok(m.n > 0);
  const row = { b: 70, x: new Array(11).fill(0) };
  assert.equal(predict(res.models.B0, row), res.models.B0.buckets.hi.rate);
  const p = predict(res.models.C1, { b: 50, x: featureRows(states(d), d.VNINDEX)[400].x });
  assert.ok(p >= 0 && p <= 1);
});

test("cổng thăng hạng dùng ĐỦ ba điều kiện (không thăng hạng chỉ vì Brier tốt hơn)", () => {
  const hold = Array.from({ length: 300 }, (_, i) => ({ date: `d${i}`, b: 50, x: [i % 2], y: i % 2 }));
  const champ = trainB0(hold);
  const perfect = { id: "X", kind: "C1", w: [-5, 10], mu: [0], sd: [1], iso: { xs: [0.5, 1], vs: [0, 1] } };
  assert.equal(promotionGate(hold, champ, perfect).verdict, "PROMOTE");
  const overconfidentWrong = { id: "Y", kind: "C1", w: [5, -10], mu: [0], sd: [1], iso: { xs: [0.5, 1], vs: [0, 1] } };
  assert.equal(promotionGate(hold, champ, overconfidentWrong).verdict, "KEEP_CHAMPION");
});
