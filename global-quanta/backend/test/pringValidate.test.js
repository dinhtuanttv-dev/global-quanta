// Pattern Scanner v2 (Pring) — P3: các hàm của kiểm định đặt trước (điều kiện tập mã tại ngày, lợi suất, khử trùng lặp, tiêu chí, BH).
import test from "node:test";
import assert from "node:assert/strict";
import { bhQ, dedup, eligibility, extractEvents, forward, groupOf, PRING_PREREG, verdict } from "../src/market/strategies/pring/validate.js";

const day = (i) => new Date(Date.UTC(2023, 0, 2) + i * 86_400_000).toISOString().slice(0, 10);
const flat = (n, { close = 20_000, volume = 500_000 } = {}) => Array.from({ length: n }, (_, i) => ({ date: day(i), open: close, high: close * 1.01, low: close * 0.99, close, volume, value: close * volume }));

test("tiêu chí đặt trước đóng băng đúng bản đã duyệt", () => {
  assert.equal(PRING_PREREG.version, "pring/P3-prereg-2026-10-10");
  assert.equal(PRING_PREREG.oosFrom, "2026-03-07");
  assert.deepEqual([PRING_PREREG.horizon, PRING_PREREG.feePct, PRING_PREREG.minOosN, PRING_PREREG.dedupBars], [20, 0.6, 30, 20]);
  assert.ok(Object.isFrozen(PRING_PREREG));
  assert.deepEqual(["double", "hs", "triangle", "rect", "wedge", "broadening", "flag", "rounding", "island"].map(groupOf), ["G1", "G1", "G2", "G2", "G3", "G3", "G4", "G4", "G1"]);
});

test("điều kiện tập mã TẠI ngày: ≥ 260 nến, giá ≥ 5.000đ, GTGD TB20 ≥ 5 tỷ", () => {
  const e = eligibility(flat(300));
  assert.equal(e[258], false); assert.equal(e[259], true);
  assert.equal(eligibility(flat(300, { volume: 100_000 }))[299], false, "2 tỷ/phiên");
  assert.equal(eligibility(flat(300, { close: 4_000, volume: 5_000_000 }))[299], false, "giá thấp");
});

test("lợi suất mở cửa T+1 -> đóng cửa T+h; thiếu nến -> NaN", () => {
  const b = flat(30).map((x, i) => ({ ...x, open: 100 + i, close: 100 + i }));
  const f = forward(b, 5);
  assert.ok(Math.abs(f[0] - (105 / 101 - 1)) < 1e-12);
  assert.ok(Number.isNaN(f[25]));
});

test("khử trùng lặp: 1 sự kiện / mã / hướng / loại trong 20 phiên", () => {
  const ev = [0, 5, 19, 20, 41].map((t) => ({ symbol: "A", dir: "bull", kind: "CONFIRMED", t }));
  assert.deepEqual(dedup(ev).map((e) => e.t), [0, 20, 41]);
  assert.equal(dedup([...ev, { symbol: "A", dir: "bear", kind: "CONFIRMED", t: 5 }]).length, 4);
});

test("tiêu chí H1/H2: n OOS ≥ 30, dấu TB, cận KTC, cùng dấu trong mẫu", () => {
  assert.equal(verdict({ mean: 1 }, { n: 29, mean: 2, ci: [0.5, 3] }, 1).verdict, "INSUFFICIENT");
  assert.equal(verdict({ mean: 1 }, { n: 40, mean: 2, ci: [0.5, 3] }, 1).verdict, "PASS");
  assert.equal(verdict({ mean: -1 }, { n: 40, mean: 2, ci: [0.5, 3] }, 1).verdict, "FAIL", "trong mẫu ngược dấu");
  assert.equal(verdict({ mean: 1 }, { n: 40, mean: 2, ci: [-0.1, 3] }, 1).verdict, "FAIL");
  assert.equal(verdict({ mean: -1 }, { n: 40, mean: -2, ci: [-3, -0.2] }, -1).verdict, "PASS");
});

test("Benjamini–Hochberg", () => {
  assert.deepEqual(bhQ([0.01, 0.04, 0.03, null]), [0.03, 0.04, 0.04, null]);
});

test("trích sự kiện không nhìn trước: sự kiện tới phiên k giống nhau dù chuỗi có thêm nến sau k", () => {
  const legs = [[0, 100], [200, 104], [240, 120], [300, 80], [315, 92], [330, 80.5], [340, 91], [343, 95], [360, 99], [420, 96]];
  const bars = []; for (let i = 0; i <= 420; i++) { let j = 1; while (legs[j][0] < i) j++; const [i0, p0] = legs[j - 1], [i1, p1] = legs[j]; const c = (p0 + ((p1 - p0) * (i - i0)) / (i1 - i0)) * (1 + 0.004 * Math.sin(i * 1.7)) * 1000; const o = i ? bars[i - 1].close : c; bars.push({ date: day(i), open: o, high: Math.max(o, c) * 1.006, low: Math.min(o, c) * 0.994, close: c, volume: i === 341 || i === 342 ? 3e6 : 1e6 }); }
  const elig = bars.map((_, i) => i >= 259);
  const full = extractEvents("X", bars, elig, { lastT: 380 }).filter((e) => e.t <= 360);
  const cut = extractEvents("X", bars.slice(0, 361), elig.slice(0, 361), { lastT: 360 });
  assert.deepEqual(cut.map((e) => [e.t, e.kind, e.key]), full.map((e) => [e.t, e.kind, e.key]));
  assert.ok(full.some((e) => e.type === "DOUBLE_BOTTOM" && e.kind === "CONFIRMED"), full.map((e) => e.type).join(","));
});

test("kết quả lưu (validation.js) khớp tiêu chí đã duyệt; nhãn suy ra từ kết quả, không gắn tay", async () => {
  const { PRING_VALIDATION: V } = await import("../src/market/strategies/pring/validation.js");
  const { PATTERN_EVIDENCE } = await import("../src/market/strategies/patternScan.js");
  assert.equal(V.prereg, PRING_PREREG.version);
  assert.equal(V.period.oosFrom, PRING_PREREG.oosFrom);
  const anyPass = Object.values(V.H1).some((g) => g.verdict === "PASS");
  assert.equal(V.label, anyPass ? "VALIDATED" : "EXPERIMENTAL");
  for (const g of Object.values(V.H1)) if (g.verdict === "INSUFFICIENT") assert.ok(g.oos.n < PRING_PREREG.minOosN);
  assert.equal(PATTERN_EVIDENCE.label, V.label);
});
