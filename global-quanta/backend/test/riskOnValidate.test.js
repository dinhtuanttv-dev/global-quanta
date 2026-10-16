import { test } from "node:test";
import assert from "node:assert/strict";
import { blockBootstrap, buildSamples, riskOnIndex, runRiskOnValidation, spearman } from "../src/market/riskOnValidation/riskOnValidate.js";

test("riskOnIndex: khớp công thức Project A (ngưỡng & trọng số)", () => {
  assert.deepEqual(riskOnIndex({ dxy: 101.92, vix: 16.46, treasury10y: 5.089 }), { score: 66, status: "RISK_ON" }); // 40 + 25,5 + 0
  assert.equal(riskOnIndex({ dxy: 106, vix: 30, treasury10y: 5 }).score, 0);
  assert.equal(riskOnIndex({ dxy: 100, vix: 12, treasury10y: 3.5 }).score, 100);
  assert.equal(riskOnIndex({ dxy: 103.5, vix: 20, treasury10y: 4.4 }).status, "NEUTRAL");
});

test("buildSamples: tín hiệu dùng giá Mỹ NGÀY TRƯỚC; mẫu không chồng lấn mỗi 20 phiên", () => {
  const days = Array.from({ length: 100 }, (_, i) => new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10));
  const vn = days.map((d, i) => ({ date: d, close: 1000 + i }));
  const us = (v) => days.map((d) => ({ date: d, close: v }));
  const s = buildSamples(vn, us(100), us(14), us(3.9));
  assert.equal(s.length, 4);
  assert.equal(s[1].date, days[21]);
  assert.ok(Math.abs(s[0].fwd - Math.log(1021 / 1001) * 100) < 1e-9);
  assert.equal(s[0].score, 100);
});

test("spearman + bootstrap khối tất định; quy tắc ĐẠT cần n ≥ 60 và cận dưới > 0", () => {
  assert.equal(spearman([1, 2, 3, 4], [10, 20, 30, 40]), 1);
  assert.equal(spearman([1, 2, 3, 4], [4, 3, 2, 1]), -1);
  const a = blockBootstrap(50, (idx) => idx.length, { B: 100, seed: 1 });
  assert.deepEqual(a, { lo: 50, hi: 50 });
  const good = Array.from({ length: 80 }, (_, i) => ({ date: `d${i}`, score: i, status: i > 60 ? "RISK_ON" : i < 20 ? "RISK_OFF" : "NEUTRAL", fwd: i * 0.1 + Math.sin(i) }));
  assert.equal(runRiskOnValidation(good, { horizon: 20, minN: 60, block: 3, B: 2000, seed: 1, minGroup: 10 }).verdict, "PASS");
  assert.equal(runRiskOnValidation(good.slice(0, 40), { horizon: 20, minN: 60, block: 3, B: 500, seed: 1, minGroup: 10 }).verdict, "INSUFFICIENT_SAMPLE");
});
