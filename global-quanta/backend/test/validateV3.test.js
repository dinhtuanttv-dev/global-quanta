// MTF v3 · S7 — bộ kiểm định: tập đủ điều kiện, lợi suất vượt trội, chống lặp, bootstrap / BH-FDR / phán quyết chạy được trên dữ liệu tổng hợp.
import test from "node:test";
import assert from "node:assert/strict";
import { benchmark3, clusterBoot, prepare3, runValidationV3, P3 } from "../src/market/structure/validateV3.js";

function doc(ticker, seed, drift, n = 1400) {
  let s = seed, p = 20;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const bars = [];
  for (let k = 0; bars.length < n; k++) {
    const d = new Date(Date.UTC(2012, 5, 1) + k * 86400000);
    if (d.getUTCDay() % 6 === 0) continue;
    const o = p, c = p * (1 + drift + 0.02 * (rnd() + rnd() + rnd() - 1.5));
    bars.push([d.toISOString().slice(0, 10), o, Math.max(o, c) * 1.01, Math.min(o, c) * 0.99, c, c, 1_000_000, 20e9 * (0.5 + rnd())]);
    p = c;
  }
  return { ticker, status: "listed", bars };
}

test("tập đủ điều kiện: cần ≥ 260 phiên, GTGD TB20 ≥ 10 tỷ, giá danh nghĩa ≥ 5 (nghìn)", () => {
  const u = prepare3(doc("AAA", 3, 0.001, 400));
  assert.equal(u.elig[100], 0);
  assert.equal(u.elig[300], 1);
  const cheap = prepare3({ ...doc("BBB", 5, 0, 400), bars: doc("BBB", 5, 0, 400).bars.map((b) => [...b.slice(0, 5), 3, b[6], b[7]]) });
  assert.equal(cheap.elig[300], 0, "giá danh nghĩa < 5.000");
});

test("chuẩn so sánh = TB tập đủ điều kiện (cần ≥ 20 mã); bootstrap cụm tuần cho KTC chứa TB", () => {
  const us = Array.from({ length: 25 }, (_, i) => prepare3(doc(`S${i}`, i + 2, 0.0005)));
  const b = benchmark3(us);
  assert.ok(Number.isFinite(b(us[0].bars[500].date, 20)));
  assert.equal(benchmark3(us.slice(0, 5))(us[0].bars[500].date, 20), null);
  const rows = Array.from({ length: 200 }, (_, i) => ({ date: us[0].bars[300 + i].date, x: 1 + Math.sin(i) }));
  const s = clusterBoot(rows, 1);
  assert.ok(s.ci[0] <= s.mean && s.mean <= s.ci[1]);
  assert.ok(s.p < 0.05);
});

test("chạy toàn bộ (không Elliott): phán quyết H1–H6 + bảng mô tả; chống lặp 20 phiên", () => {
  const docs = Array.from({ length: 24 }, (_, i) => doc(`T${i}`, 11 + i, i % 2 ? 0.0012 : -0.0004));
  const r = runValidationV3(docs, { elliott: false });
  assert.deepEqual(Object.keys(r.verdicts).sort(), ["H1", "H2", "H3", "H4", "H5", "H6"]);
  for (const v of Object.values(r.verdicts)) assert.ok(v === "PASS" || v === "FAIL");
  assert.equal(r.counts.H6, 0);
  assert.ok(r.stageTable.S2 || r.stageTable.S4);
  assert.equal(r.params.feePct, P3.feePct);
});
