import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregate, alignPairs, labelOf, newSinceVnClose, relation, sectorScores, zMove } from "../src/market/worldSectors/worldSectorAnalytics.js";
import { compositeSeries } from "../src/market/worldSectors/worldSectorService.js";

const days = (n, start = Date.UTC(2025, 0, 1)) => Array.from({ length: n }, (_, i) => new Date(start + i * 86_400_000).toISOString().slice(0, 10));
const rnd = (seed) => { let a = seed; return () => { a = (a * 16807) % 2147483647; return a / 2147483647 - 0.5; }; };
const walk = (d, f) => { let p = 100; return d.map((x, i) => [x, (p *= 1 + f(i))]); };

test("newSinceVnClose: 'prev' tính phiên cùng ngày VN (đóng sau giờ VN), 'same' chỉ phiên sau; không có phiên mới -> null (không phải 0)", () => {
  const pts = [["2026-10-14", 100], ["2026-10-15", 101], ["2026-10-16", 102]];
  const big = Array.from({ length: 40 }, (_, i) => [`2026-08-${String(i + 1).padStart(2, "0")}`, 100 + (i % 2)]).concat(pts);
  assert.deepEqual(newSinceVnClose(big, "prev", "2026-10-16").sessions, ["2026-10-16"]);
  assert.deepEqual(newSinceVnClose(big, "same", "2026-10-15").sessions, ["2026-10-16"]);
  const none = newSinceVnClose(big, "same", "2026-10-16");
  assert.equal(none.z, null);
});

test("aggregate: trung bình theo mức khớp trong khu vực, đều giữa khu vực, z chặn ±3, bỏ null", () => {
  const a = aggregate([
    { region: "US", match: "close", z: 1 }, { region: "US", match: "close", z: 1 }, { region: "US", match: "partial", z: 10 },
    { region: "EU", match: "exact", z: -1 }, { region: "JP", match: "close", z: null },
  ]);
  // US: (0.75 + 0.75 + 0.4×3)/(1.9) = 1.4211 ; EU: -1 ; mean = 0.2105
  assert.ok(Math.abs(a.byRegion.US.z - 1.421) < 1e-3);
  assert.equal(a.byRegion.EU.z, -1);
  assert.equal(a.byRegion.JP, undefined);
  assert.ok(Math.abs(a.score - 0.211) < 1e-3);
  assert.equal(labelOf(0.6), "tailwind");
  assert.equal(labelOf(-0.6), "headwind");
  assert.equal(labelOf(0.2), "neutral");
  assert.equal(labelOf(null), "na");
});

test("alignPairs/relation: nước ngoài phiên TRƯỚC dẫn VN được phát hiện; 'same' có tương quan đồng thời riêng", () => {
  const d = days(400);
  const r = rnd(11), shocks = d.map(() => r() * 0.04);
  const foreign = walk(d, (i) => shocks[i]);
  const vn = walk(d, (i) => (i > 0 ? 0.8 * shocks[i - 1] : 0) + r() * 0.004);
  const rel = relation(vn, foreign, "prev");
  assert.ok(rel.corr > 0.9 && rel.significant && rel.exploratory);
  assert.equal(rel.leadLag[0].lag, 0);
  const same = relation(vn, foreign, "same");
  assert.ok(same.contemporaneous != null && Math.abs(same.contemporaneous) < 0.3);
  const pairs = alignPairs(vn, foreign, "prev", true);
  assert.ok(pairs.every(([dd], k) => k === 0 || dd > pairs[k - 1][0]));
});

test("sectorScores: ngắn hạn chỉ từ phiên mới, trung hạn 3 tháng, hàng hoá theo chiều, nhãn đúng", () => {
  const d = days(300);
  const flat = (i) => (i % 2 ? 0.01 : -0.01);
  const vn = walk(d.slice(0, 299), flat); // VN chậm hơn 1 ngày
  const us = walk(d, (i) => (i === 299 ? 0.05 : flat(i)));
  const sc = sectorScores(vn, [{ symbol: "X", region: "US", match: "close", session: "prev", points: us }],
    [{ id: "C", nameVi: "C", sign: -1, freq: "day", points: walk(d, (i) => (i === 299 ? 0.05 : flat(i))) }]);
  assert.ok(sc.short.sectors.score > 2);
  assert.ok(sc.short.commodity < 0); // giá tăng nhưng chiều -1 -> bất lợi
  assert.equal(sc.short.label, "tailwind");
  assert.ok(sc.medium.gap3m != null);
  assert.ok(zMove(us, 63).pct != null);
});

test("compositeSeries: gộp đều giữa khu vực theo phiên VN", () => {
  const d = days(80);
  const r = rnd(5);
  const a = walk(d, () => r() * 0.02), b = walk(d, () => r() * 0.02), vn = walk(d, () => r() * 0.01);
  const c = compositeSeries(vn, [{ region: "US", match: "close", session: "prev", points: a }, { region: "EU", match: "exact", session: "prev", points: b }]);
  assert.ok(c.length > 60);
  assert.ok(c.every(([, x]) => Number.isFinite(x)));
});
