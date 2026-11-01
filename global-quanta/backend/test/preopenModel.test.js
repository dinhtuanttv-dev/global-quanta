import { test } from "node:test";
import assert from "node:assert/strict";
import { alignRows, bucketOf, buildScenarios, classOf, esSinceClose, fitBuckets, fitOpen, priceAt, trackSession } from "../src/market/preopen/preopenModel.js";

const ts = (s) => Date.parse(s) / 1000;
const NONE = { openBand: false, dayBand: false, probabilities: false, noPanicSell: false, noChase: false };
const ALL = { openBand: true, dayBand: true, probabilities: true, noPanicSell: true, noChase: true };
function rowsOf(n = 200) {
  let a = 11; const r = () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
  return Array.from({ length: n }, (_, i) => { const es = (r() - 0.5) * 4, gap = 0.5 * es + (r() - 0.5) * 0.4, oc = (r() - 0.5) * 2; return { date: `d${i}`, es, gap, oc, cc: gap + oc }; });
}

test("nến 60 phút chỉ dùng sau khi kết thúc: không nhìn trước", () => {
  const bars = [{ t: ts("2026-10-30T00:00:00Z"), close: 100 }, { t: ts("2026-10-30T01:00:00Z"), close: 105 }];
  assert.equal(priceAt(bars, ts("2026-10-30T01:30:00Z")), 100);
  assert.equal(priceAt(bars, ts("2026-10-30T02:00:00Z")), 105);
  assert.equal(priceAt(bars, ts("2026-10-29T00:00:00Z")), null);
});

test("ES tính từ lúc VN đóng cửa phiên trước, nên sáng thứ Hai có cả phiên Mỹ thứ Sáu", () => {
  const bars = [{ t: ts("2026-10-30T07:00:00Z"), close: 100 }, { t: ts("2026-10-30T20:00:00Z"), close: 98 }, { t: ts("2026-11-02T00:00:00Z"), close: 97 }];
  assert.ok(Math.abs(esSinceClose(bars, "2026-10-30", "2026-11-02") + 3) < 1e-9);
  assert.equal(esSinceClose([], "2026-10-30", "2026-11-02"), null);
});

test("ghép phiên VN với ES đã biết", () => {
  const vn = [{ date: "2026-10-29", open: 100, close: 100 }, { date: "2026-10-30", open: 99, close: 101 }];
  const es = [{ t: ts("2026-10-29T07:00:00Z"), close: 50 }, { t: ts("2026-10-30T00:00:00Z"), close: 49 }];
  const [r] = alignRows(vn, es);
  assert.ok(Math.abs(r.es + 2) < 1e-9);
  assert.ok(Math.abs(r.gap + 1) < 1e-9);
  assert.ok(Math.abs(r.cc - 1) < 1e-9);
  assert.ok(Math.abs(r.oc - (101 / 99 - 1) * 100) < 1e-9);
});

test("nhóm và lớp theo đúng ngưỡng đặt trước", () => {
  assert.deepEqual([bucketOf(-0.8), bucketOf(0), bucketOf(0.8)], ["neg", "mid", "pos"]);
  assert.deepEqual([classOf(-0.6), classOf(0.5), classOf(0.6)], ["neg", "mid", "pos"]);
});

test("vùng mở cửa phục hồi đúng hệ số và có độ phủ quanh 80% trên chính mẫu", () => {
  const rows = rowsOf(), m = fitOpen(rows);
  assert.ok(Math.abs(m.b - 0.5) < 0.05);
  const cov = rows.filter((r) => { const o = m.predict(r.es); return r.gap >= o.lo && r.gap <= o.hi; }).length / rows.length;
  assert.ok(cov > 0.75 && cov < 0.85, String(cov));
});

test("xác suất từng nhóm cộng lại bằng 1, thiếu mẫu thì dùng cả mẫu", () => {
  const f = fitBuckets(rowsOf());
  for (const b of Object.values(f.buckets)) assert.ok(Math.abs(b.probs.neg + b.probs.mid + b.probs.pos - 1) < 1e-9);
  const thin = rowsOf(30).map((r) => ({ ...r, es: 0 }));
  const g = fitBuckets(thin);
  assert.equal(g.buckets.neg.n, 0);
  assert.ok(g.buckets.neg.dayHi > g.buckets.neg.dayLo);
});

test("không đạt kiểm định thì không hiện vùng mở cửa, %, câu hành động; đạt thì hiện", () => {
  const off = buildScenarios({ rows: rowsOf(), es: -1.5, prevClose: 1741.6, evidence: NONE });
  assert.equal(off.lead, "neg");
  assert.equal(off.scenarios.length, 3);
  for (const s of off.scenarios) { assert.equal(s.open, null); assert.equal(s.probability, null); assert.ok(s.day.hi > s.day.lo); assert.doesNotMatch(s.posture + s.action, /\bMUA\b|\bBÁN\b/); }
  assert.match(off.scenarios[0].action, /chưa có bằng chứng/);
  const on = buildScenarios({ rows: rowsOf(), es: -1.5, prevClose: 1741.6, evidence: ALL });
  const neg = on.scenarios[0];
  assert.ok(neg.open.lo < neg.open.hi && neg.open.mid < 1741.6);
  assert.ok(Number.isFinite(neg.probability));
  assert.match(neg.action, /không bán đuổi/);
  assert.equal(neg.esAnchor, -1.5);
  assert.equal(buildScenarios({ rows: rowsOf(), es: null, prevClose: 1000, evidence: NONE }).lead, "mid");
});

test("theo dõi trong phiên: báo đúng vô hiệu và còn hiệu lực", () => {
  const { scenarios } = buildScenarios({ rows: rowsOf(), es: -1.5, prevClose: 1000, evidence: ALL });
  const alive = trackSession({ scenarios, lead: "neg", open: 990, last: 985, prevClose: 1000 });
  assert.equal(alive.invalidated, false);
  assert.equal(alive.current, "neg");
  assert.equal(trackSession({ scenarios, lead: "neg", open: 990, last: 1005, prevClose: 1000 }).invalidated, true);
  assert.equal(trackSession({ scenarios, lead: "pos", open: 1010, last: 995, prevClose: 1000 }).invalidated, true);
  assert.equal(trackSession({ scenarios, lead: "neg", open: 0, last: 985, prevClose: 1000 }), null);
});
