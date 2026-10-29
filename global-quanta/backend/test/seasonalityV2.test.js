// SEAS-prereg-v2 — bộ kiểm định chạy đúng TRƯỚC khi chạm dữ liệu 2013–2019: mùa vụ lặp lại dựng sẵn -> PASS (dấu +1 chốt trước);
// đảo chiều hoặc nhiễu -> FAIL; benchmark bình quân đều; hồi quy kiểm soát cơ chế.
import test from "node:test";
import assert from "node:assert/strict";
import { equalWeightIndex, runValidationV2 } from "../src/market/seasonality/validateV2.js";
import { mulberry32 } from "../src/market/seasonality/strength.js";
import { SEAS } from "../src/market/seasonality/config.js";

const CFG = {
  prereg: "SEAS-v2-test", sign: 1, engine: { ...SEAS }, trainStartYear: 2013, minTrainYears: 3, maxTrainYears: 5, testYears: [2016, 2017, 2018, 2019],
  testEnd: "2019-12", minCrossSection: 12, quantiles: 5, bootstrap: { iters: 2000, seed: 5, level: 0.9 }, thresholds: { tMin: 2, yearsPositiveMin: 3 },
};

function sectors({ phi, n = 20, seed = 3 }) {
  const rng = mulberry32(seed);
  const g = () => { const u = Math.max(1e-12, rng()), v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const seriesOf = new Map();
  for (let s = 0; s < n; s++) {
    // hiệu ứng tháng theo năm: e(y) = φ·e(y−1) + nhiễu  (φ < 0 = đảo chiều)
    const eff = new Map(); let prev = Array.from({ length: 12 }, () => 0.04 * g());
    for (let y = 2012; y <= 2020; y++) { const cur = prev.map((e) => phi * e + 0.04 * g()); eff.set(y, cur); prev = cur; }
    const bars = []; let px = 100;
    for (let d = new Date("2012-12-03T00:00:00Z"); d <= new Date("2020-01-31T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 1)) {
      const w = d.getUTCDay(); if (w === 0 || w === 6) continue;
      px *= Math.exp(eff.get(d.getUTCFullYear())[d.getUTCMonth()] / 21 + 0.01 * g());
      bars.push({ date: d.toISOString().slice(0, 10), close: px });
    }
    seriesOf.set(`S${s}`, bars);
  }
  return seriesOf;
}

test("chỉ số bình quân đều: lợi suất ngày = TB các chuỗi", () => {
  const a = [{ date: "2020-01-01", close: 100 }, { date: "2020-01-02", close: 110 }];
  const b = [{ date: "2020-01-01", close: 50 }, { date: "2020-01-02", close: 45 }];
  const ew = equalWeightIndex(new Map([["A", a], ["B", b]]));
  assert.ok(Math.abs(ew[0].close - 100) < 1e-9, "(+10% − 10%)/2 = 0");
});

test("mùa vụ lặp lại (φ = +0,8) -> PASS với dấu +1 chốt trước; đảo chiều (φ = −0,8) và nhiễu -> FAIL; sai dấu -> FAIL", () => {
  const pers = runValidationV2({ seriesOf: sectors({ phi: 0.8 }), cfg: CFG });
  assert.equal(pers.verdict, "PASS", JSON.stringify(Object.fromEntries(Object.entries(pers.criteria).map(([k, v]) => [k, v.pass]))));
  assert.equal(pers.criteria.C1_ic.months, 48);
  assert.ok(pers.mechanism.partialIcMean != null);
  assert.equal(runValidationV2({ seriesOf: sectors({ phi: -0.8 }), cfg: CFG }).verdict, "FAIL", "đảo chiều không được tính là mùa vụ");
  assert.equal(runValidationV2({ seriesOf: sectors({ phi: 0, seed: 11 }), cfg: CFG }).verdict, "FAIL");
  assert.equal(runValidationV2({ seriesOf: sectors({ phi: 0.8 }), cfg: { ...CFG, sign: -1 } }).verdict, "FAIL", "kiểm định không tự thích nghi dấu");
});
