import { test } from "node:test";
import assert from "node:assert/strict";
import { abnormalReturns, binomUpperP, clusterBootstrap, eventIndex, runEventStudy, vnDateOf } from "../src/market/catalystValidation/eventStudy.js";

const day = (i) => new Date(Date.UTC(2026, 8, 1 + i)).toISOString().slice(0, 10);
const mk = (f, n = 60) => Array.from({ length: n }, (_, i) => ({ date: day(i), close: f(i) }));

test("X6: t0 = phiên đầu tiên >= ngày VN của scannedAt (quét 22:56 UTC = sáng hôm sau giờ VN)", () => {
  assert.equal(vnDateOf("2026-09-10T22:56:00Z"), "2026-09-11");
  assert.equal(eventIndex(["2026-09-10", "2026-09-11", "2026-09-14"], "2026-09-10T22:56:00Z"), 1);
  assert.equal(eventIndex(["2026-09-10"], "2026-09-20T00:00:00Z"), null);
});

test("X6: AR = log lợi suất mã − chỉ số; chưa đủ phiên -> không có AR", () => {
  const idx = mk((i) => 100 * Math.exp(0.001 * i));
  const st = mk((i) => 10 * Math.exp(0.003 * i));
  const { t0, ar } = abnormalReturns(st, idx, `${day(5)}T00:00:00Z`);
  assert.equal(t0, day(5));
  assert.ok(Math.abs(ar[20] - 0.002 * 20) < 1e-9);
  assert.equal(abnormalReturns(st, idx, `${day(50)}T00:00:00Z`).ar[20], undefined);
});

test("X6: bootstrap theo cụm tất định theo seed; nhị thức", () => {
  const a = clusterBootstrap([0.01, 0.02, -0.01, 0.03], ["a", "a", "b", "c"], { B: 2000, seed: 1 });
  const b = clusterBootstrap([0.01, 0.02, -0.01, 0.03], ["a", "a", "b", "c"], { B: 2000, seed: 1 });
  assert.deepEqual(a, b);
  assert.equal(a.clusters, 3);
  assert.ok(a.lo <= a.mean && a.mean <= a.hi);
  assert.ok(Math.abs(binomUpperP(5, 10) - 0.623046875) < 1e-12);
});

test("X6: harm đảo dấu; < 30 mẫu -> INSUFFICIENT_SAMPLE + EXPERIMENTAL", () => {
  const idx = mk(() => 100);
  const up = mk((i) => 10 * (1 + 0.01 * i));
  const recs = [
    { id: "1", ticker: "UP", direction: "benefit", category: "macro", sourceId: "s1", scannedAt: `${day(2)}T00:00:00Z` },
    { id: "2", ticker: "UP", direction: "harm", category: "macro", sourceId: "s2", scannedAt: `${day(2)}T00:00:00Z` },
    { id: "3", ticker: "NOPE", direction: "benefit", category: "macro", sourceId: "s3", scannedAt: `${day(2)}T00:00:00Z` },
  ];
  const r = runEventStudy(recs, { UP: up }, idx);
  assert.equal(r.sample.excluded.noPrice, 1);
  assert.ok(r.rows[0].sar20 > 0 && r.rows[1].sar20 < 0);
  assert.equal(r.verdict, "INSUFFICIENT_SAMPLE");
  assert.equal(r.evidence, "EXPERIMENTAL");
});
