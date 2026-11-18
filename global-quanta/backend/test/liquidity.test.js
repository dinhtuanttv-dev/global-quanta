// LQ-v1 — số đo thanh khoản mô tả: trung vị bền với đột biến, sàn ngày xấu, mật độ, Amihud dạng tổng, phiên cạn cầu, năng lực theo vốn.
import test from "node:test";
import assert from "node:assert/strict";
import { liquidityStats, liquiditySeries, lqCapacity, lqThresholds, quantile, LQ_RULES } from "../src/market/elite/liquidity.js";

const day = (i) => new Date(Date.UTC(2026, 6, 1) + i * 864e5).toISOString().slice(0, 10);
/** 61 phiên; vals(i) = GTGD tỷ đồng, ret(i) = lợi suất phiên i. */
const rows = (vals, ret = () => 0.01) => { let p = 10000; return Array.from({ length: 61 }, (_, i) => { if (i) p *= 1 + ret(i); return { date: day(i), closeAdj: p, value: vals(i) == null ? null : vals(i) * 1e9 }; }); };

test("ngưỡng là hàm của vốn: A=5 tỷ -> trung vị 7,5 tỷ, p10 1,25 tỷ, ngày 2,5 tỷ; A=1 tỷ -> sàn tuyệt đối 5 tỷ", () => {
  const a5 = lqThresholds(LQ_RULES, 5);
  assert.equal(a5.medMin, 7.5); assert.equal(a5.dayMin, 2.5); assert.ok(Math.abs(a5.p10Min - 1.25) < 1e-12);
  const a1 = lqThresholds(LQ_RULES, 1); assert.equal(a1.medMin, 5); assert.ok(Math.abs(a1.p10Min - 0.25) < 1e-12);
  assert.equal(quantile([1, 2, 3, 4], 0.5), 2.5); assert.equal(quantile([], 0.5), null);
});

test("bẫy đột biến: 19 phiên 0,3 tỷ + 1 phiên 95 tỷ -> trung bình ≥ 5 tỷ nhưng trung vị 0,3 -> L4, cờ đột biến không che được", () => {
  const s = liquidityStats(rows((i) => (i === 60 ? 95 : 0.3)), 0.02);
  assert.ok(s.mean20 >= 5, `mean ${s.mean20}`); assert.equal(s.med20, 0.3); assert.equal(s.tier, "L4"); assert.ok(s.reasons.includes("MED_ABS"));
});

test("mã thanh khoản sâu, đều -> L1; năng lực giao dịch và chi phí tác động theo luật căn bậc hai", () => {
  const s = liquidityStats(rows(() => 100, (i) => (i % 2 ? 0.003 : -0.003)), 0.012);
  assert.equal(s.tier, "L1"); assert.deepEqual(s.reasons, []); assert.equal(s.density, 20); assert.equal(s.stressDays, 0);
  assert.ok(Math.abs(s.illiq - 0.003) < 1e-6, `illiq ${s.illiq}`); // |r| 0,3% / 100 tỷ = 0,003 %/tỷ
  // Q = 10% × 5 tỷ = 0,5 tỷ: impact = 0,8 × 1,2% × √(0,5/100) ≈ 0,068%; thoát = 0,5 / (20% × 100) = 0,025 phiên
  assert.ok(Math.abs(s.impactPct - 0.8 * 1.2 * Math.sqrt(0.005)) < 1e-3); assert.ok(Math.abs(s.dtl - 0.025) < 1e-9);
  assert.equal(s.binding, "in"); assert.equal(s.capacityBn, 10); assert.ok(Math.abs(s.capitalMaxBn - 10 / 0.15) < 0.01);
});

test("L3: đạt sàn tuyệt đối nhưng trượt ngưỡng theo vốn, sàn ngày xấu, mật độ; phiên giảm sâu mà cạn cầu được đếm", () => {
  // 60 phiên ~6 tỷ, 8 phiên rất mỏng 0,2 tỷ; phiên 50 giảm 6% với 0,2 tỷ (cạn cầu).
  const thin = new Set([20, 25, 30, 35, 41, 44, 50, 55]);
  const s = liquidityStats(rows((i) => (thin.has(i) ? 0.2 : 6), (i) => (i === 50 ? -0.06 : 0.005)), 0.02);
  assert.equal(s.tier, "L3");
  for (const id of ["MED", "P10", "STRESS"]) assert.ok(s.reasons.includes(id), `thiếu ${id}: ${s.reasons}`);
  assert.equal(s.stressDays, 1);
});

test("Amihud vượt trần -> L4 kể cả khi trung vị đạt; thiếu số liệu -> NA (không đoán)", () => {
  const s = liquidityStats(rows(() => 6, (i) => (i % 2 ? 0.07 : -0.065)), 0.05);
  assert.ok(s.illiq > LQ_RULES.illiqMax, `illiq ${s.illiq}`); assert.equal(s.tier, "L4"); assert.ok(s.reasons.includes("ILLIQ_MAX"));
  const na = liquidityStats(rows((i) => (i > 50 ? 10 : null)));
  assert.equal(na.tier, "NA"); assert.deepEqual(na.reasons, ["NO_DATA"]);
});

test("năng lực: ràng buộc chặt nhất quyết định; chuỗi 60 phiên cho Hồ sơ", () => {
  const c = lqCapacity({ med20: 3.6, p10: 0.3, sigma20: 0.042 }, 0.5);
  // Mẫu giống VCP (trung vị 3,6 tỷ, p10 0,3 tỷ, σ 4,2%): tác động là ràng buộc chặt nhất -> vị thế tối đa ≈ 0,08 tỷ.
  assert.equal(c.binding, "impact"); assert.ok(Math.abs(c.capacityBn - 3.6 * (0.005 / (0.8 * 0.042)) ** 2) < 1e-12);
  assert.ok(c.impactPct > 1, `impact ${c.impactPct}`); assert.ok(Math.abs(c.dtl - 0.5 / 0.06) < 1e-9);
  assert.equal(lqCapacity({ med20: 100, p10: 0.5, sigma20: 0.01 }, 1).binding, "out");
  const ser = liquiditySeries(rows(() => 2));
  assert.equal(ser.length, 60); assert.equal(ser[0].d, day(1)); assert.equal(ser[0].v, 2); assert.ok(Math.abs(ser[0].r - 0.01) < 1e-9);
});
