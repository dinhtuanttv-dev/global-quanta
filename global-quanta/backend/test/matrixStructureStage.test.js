import { test } from "node:test";
import assert from "node:assert/strict";
import { stageFromStructure3 } from "../src/market/tradingMatrix/matrixService.js";

// Dạng thật của /api/market/structure3/VNINDEX (21/11/2026), rút gọn.
const doc = {
  version: "mtf3", asOf: "2026-11-20",
  structure: { context: { D: { tf: "D", date: "2026-11-20", dow: "DOWN_WEAK", dowLabel: "Giảm suy yếu (đáy cao hơn, chưa vượt đỉnh hồi)", stage: "S4", stageLabel: "Giai đoạn 4 · Giảm giá", stageAge: 15 } } },
  evidence: { label: "MÔ TẢ" },
};

test("giai đoạn ngày MTF v3 → dạng regime.stageOdds, không có xác suất", () => {
  const s = stageFromStructure3(doc);
  assert.equal(s.stage, "Giai đoạn 4 · Giảm giá");
  assert.equal(s.age, 15);
  assert.equal(s.up, null);
  assert.equal(s.down, null);
  assert.equal(s.dayStage, "S4");
  assert.equal(s.dow, "Giảm suy yếu (đáy cao hơn, chưa vượt đỉnh hồi)");
  assert.match(s.label, /^MÔ TẢ · MTF v3, không có xác suất/);
});

test("thiếu dữ liệu hoặc giai đoạn NA thì không hiện, không bịa", () => {
  assert.equal(stageFromStructure3(null), null);
  assert.equal(stageFromStructure3({ structure: { context: { D: { stage: "NA" } } } }), null);
  assert.equal(stageFromStructure3({ structure: { context: { D: { stage: "S2" } } } }).age, null);
});
