import assert from "node:assert/strict";
import test from "node:test";
import { VOL_TERM, VOL_TERM_EVIDENCE, volTermStructure } from "../src/market/world/volTerm.js";

test("VolSlope = VIX/VIX3M − 1, ba trạng thái theo ngưỡng ±0,05", () => {
  const c = volTermStructure(16.61, 18.8);
  assert.ok(Math.abs(c.slope - (16.61 / 18.8 - 1)) < 1e-4);
  assert.equal(c.state, "CONTANGO"); assert.equal(c.regime, "RISK_ON");
  assert.equal(volTermStructure(20, 20).state, "FLAT");
  assert.equal(volTermStructure(30, 25).state, "BACKWARDATION");
  assert.equal(volTermStructure(30, 25).regime, "RISK_OFF");
  // đúng ngưỡng: −0,05 chưa phải contango, +0,05 chưa phải backwardation
  assert.equal(volTermStructure(19, 20).state, "FLAT");
  assert.equal(volTermStructure(21, 20).state, "FLAT");
  assert.equal(VOL_TERM.contango, -0.05);
});

test("thiếu hoặc sai số liệu thì không đoán trạng thái", () => {
  for (const [a, b] of [[null, 20], [20, null], [0, 20], [20, 0], [Number.NaN, 20], [-1, 20]]) assert.equal(volTermStructure(a, b), null);
});

test("nhãn bằng chứng: chỉ mô tả, ghi rõ chưa kiểm định đặt trước", () => {
  assert.equal(VOL_TERM_EVIDENCE.label, "MÔ TẢ");
  assert.equal(VOL_TERM_EVIDENCE.verdict, "EXPLORATORY");
  assert.match(VOL_TERM_EVIDENCE.note, /Chưa kiểm định đặt trước/);
});
