import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { analogSummary, weightedQuantile } from "../src/market/cycles/analogStats.js";

const nb = (d20, weight, pattern = [100, 101]) => ({ weight, excess: { d20 }, pattern });

test("phân vị có trọng số giống hệt công thức giao diện", () => {
  assert.equal(weightedQuantile([{ v: 1, w: 1 }, { v: 2, w: 1 }, { v: 3, w: 1 }], 0.5), 2);
  assert.equal(weightedQuantile([{ v: 1, w: 9 }, { v: 100, w: 1 }], 0.5), 1);
  assert.equal(weightedQuantile([], 0.5), null);
});

test("tóm tắt: trung vị không bị ngoại lệ kéo, đếm giai đoạn lệch biên độ, bỏ giá trị thiếu", () => {
  const q = { symbol: "FPT", asOf: "2026-10-30", current: { pattern: [100, 79.4] }, forecast: { nEff: 12.5 },
    neighbors: [nb(1, 1, [100, 51.3]), nb(2, 1), nb(-1, 1), nb(0.5, 1), nb(130, 1), nb(null, 1)] };
  const s = analogSummary(q);
  assert.equal(s.median, 1); assert.equal(s.p10, -1); assert.equal(s.p90, 130);
  assert.equal(s.n, 5); assert.equal(s.neighbors, 6);
  assert.equal(s.shareUp, 0.8);
  assert.equal(s.mismatched, 1);
  assert.equal(s.move, -20.6);
});

test("khớp số liệu thật của giao diện trên cùng dữ liệu NT2", () => {
  const fx = JSON.parse(fs.readFileSync(new URL("../../src/components/MainTabs/LocNganh/__fixtures__/cycle-v2-nt2.json", import.meta.url), "utf8"));
  const s = analogSummary(fx);
  const items = fx.neighbors.filter((n) => n.excess.d20 != null).map((n) => ({ v: n.excess.d20, w: n.weight ?? 1 }));
  assert.equal(s.median, weightedQuantile(items, 0.5));
  assert.equal(s.n, items.length);
  assert.ok(s.p10 <= s.median && s.median <= s.p90);
});
