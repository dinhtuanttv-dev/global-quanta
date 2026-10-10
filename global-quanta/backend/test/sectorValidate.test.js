// Lọc ngành (L3) — các hàm của kiểm định đặt trước.
import test from "node:test";
import assert from "node:assert/strict";
import { excessAfter, improvingEvents, SECTOR_PREREG, stat, verdict } from "../src/market/sectors/validate.js";

test("tiêu chí đóng băng đúng bản đã duyệt", () => {
  assert.equal(SECTOR_PREREG.version, "locnganh/L3-prereg-2026-10-10");
  assert.deepEqual([SECTOR_PREREG.horizon, SECTOR_PREREG.oosFraction, SECTOR_PREREG.minOosN], [20, 0.3, 30]);
  assert.deepEqual(SECTOR_PREREG.extraHorizons, [10, 40, 60]);
  assert.ok(Object.isFrozen(SECTOR_PREREG));
});

test("sự kiện: chỉ lần chuyển VÀO Cải thiện, chỉ tuần đã đóng, theo góc đã lọc nhiễu hoặc góc thô", () => {
  const rrg = [["LAGGING", "LAGGING"], ["IMPROVING", "IMPROVING"], ["IMPROVING", "LAGGING"], ["LEADING", "IMPROVING"], ["LAGGING", "LAGGING"], ["IMPROVING", "IMPROVING"]]
    .map(([q, raw], i) => ({ week: `2026-01-${String(i + 2).padStart(2, "0")}`, date: `2026-01-${String(i + 2).padStart(2, "0")}`, quadrant: q, quadrantRaw: raw }));
  assert.deepEqual(improvingEvents(rrg, null).map((e) => e.week), ["2026-01-03", "2026-01-07"]);
  assert.deepEqual(improvingEvents(rrg, "2026-01-06").map((e) => e.week), ["2026-01-03"], "tuần chưa đóng không tính");
  assert.equal(improvingEvents(rrg, null, "quadrantRaw").length, 3);
});

test("lợi suất vượt trội: từ đóng cửa phiên SAU sự kiện tới h phiên; thiếu dữ liệu -> null", () => {
  const dates = ["d1", "d2", "d3", "d4"].map((x, i) => `2026-02-0${i + 1}`);
  const s = new Map(dates.map((d, i) => [d, 100 * (1 + 0.1 * i)])), b = new Map(dates.map((d) => [d, 100]));
  assert.ok(Math.abs(excessAfter("2026-02-01", 2, s, dates, b) - ((130 / 110 - 1) * 100)) < 1e-9);
  assert.equal(excessAfter("2026-02-03", 2, s, dates, b), null);
});

test("luật ĐẠT: OOS n ≥ 30, TB > 0, cận dưới > 0, trong mẫu > 0; KTC theo cụm tuần", () => {
  assert.equal(verdict({ mean: 1 }, { n: 29, mean: 1, ci: [0.1, 2] }).verdict, "INSUFFICIENT");
  assert.equal(verdict({ mean: 1 }, { n: 40, mean: 1, ci: [0.1, 2] }).verdict, "PASS");
  assert.equal(verdict({ mean: -1 }, { n: 40, mean: 1, ci: [0.1, 2] }).verdict, "FAIL");
  assert.equal(verdict({ mean: 1 }, { n: 40, mean: 1, ci: [-0.1, 2] }).verdict, "FAIL");
  const s = stat(Array.from({ length: 40 }, (_, i) => ({ week: `w${i % 10}`, x: 1 + (i % 3) })));
  assert.equal(s.n, 40); assert.equal(s.weeks, 10); assert.ok(s.ci[0] <= s.mean && s.mean <= s.ci[1]);
});

test("kết quả lưu khớp tiêu chí; nhãn suy ra từ kết quả; bản tóm tắt RRG mang bằng chứng", async () => {
  const { SECTOR_VALIDATION: V } = await import("../src/market/sectors/validation.js");
  assert.equal(V.prereg, SECTOR_PREREG.version);
  assert.equal(V.label, V.verdict === "PASS" ? "VALIDATED" : "EXPERIMENTAL");
  if (V.verdict === "PASS") assert.ok(V.oos.n >= 30 && V.oos.mean > 0 && V.oos.ci[0] > 0 && V.is.mean > 0);
});
