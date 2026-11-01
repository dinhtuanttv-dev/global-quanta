import { test } from "node:test";
import assert from "node:assert/strict";
import { buildScenariosR2, enrich, ewmaVol, fitScaled, msVol, stateProbs, zBucket } from "../src/market/preopen/preopenR2.js";

function rowsOf(n = 260) {
  let a = 19; const r = () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
  return Array.from({ length: n }, (_, i) => { const es = (r() - 0.5) * 3, gap = 0.4 * es + (r() - 0.5) * 0.4, oc = (r() - 0.5) * 1.5; return { date: `d${i}`, es, gap, oc, cc: gap + oc, ew: 1 + r() * 0.2, ms: 1 + r() * 0.2, above: i % 2 === 0 }; });
}
function closes(n) { let a = 5, p = 100; const r = () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; const out = [p]; for (let i = 0; i < n; i++) { p *= Math.exp((i % 200 < 100 ? 0.006 : 0.025) * Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r())); out.push(p); } return out; }
const OFF = { openBand: false, dayBand: false, dayModel: "uncond", probabilities: false, noPanicSell: false, noChase: false };

test("nhóm theo độ lệch chuẩn", () => {
  assert.deepEqual([zBucket(-2, 2), zBucket(0, 2), zBucket(2, 2), zBucket(1.9, 2)], ["neg", "mid", "pos", "mid"]);
  assert.equal(zBucket(5, 0), "mid");
});

test("σ̂ không nhìn trước: bỏ dữ liệu sau không đổi giá trị trước", () => {
  const c = closes(420);
  assert.deepEqual(ewmaVol(c.slice(0, 300)).slice(0, 300), ewmaVol(c).slice(0, 300));
  const full = msVol(c, 300), part = msVol(c.slice(0, 340), 300);
  for (let i = 300; i < 340; i++) assert.ok(Math.abs(full[i] - part[i]) < 1e-9, String(i));
  assert.equal(full.length, c.length + 1);
  assert.ok(full[c.length] > 0, "có σ̂ cho phiên kế tiếp");
});

test("biến kỹ thuật dùng giá đến phiên trước", () => {
  const bars = Array.from({ length: 60 }, (_, i) => ({ date: `2026-01-${String(i).padStart(2, "0")}`, close: i === 59 ? 1 : 100 + i }));
  const r = enrich([{ date: bars[59].date, es: 0, gap: 0, oc: 0, cc: 0 }], bars, { useMs: false })[0];
  assert.equal(r.above, true, "nến 59 rơi mạnh nhưng above tính đến nến 58");
});

test("dải chuẩn hoá co giãn theo σ̂", () => {
  const f = fitScaled(rowsOf(), "cc", "ew");
  const a = f.predict(0, 1), b = f.predict(0, 2);
  assert.ok(b.hi - b.lo > 1.9 * (a.hi - a.lo));
  assert.equal(fitScaled(rowsOf(10), "cc", "ew"), null);
});

test("xác suất co về nền khi ô ít mẫu, luôn cộng bằng 1", () => {
  const rows = rowsOf(), st = stateProbs(rows, 1), p = st.probs(0, true);
  assert.ok(Math.abs(p.neg + p.mid + p.pos - 1) < 1e-9);
  const empty = st.probs(0, null);
  assert.ok(Math.abs(empty.mid - st.base.mid) < 1e-9);
});

test("thiếu ES thì không có kịch bản dẫn đầu; không đạt thì ẩn; số ẩn vẫn có cho sổ tiến", () => {
  const base = { rows: rowsOf(), prevClose: 1000, levels: { ma20: 990, ma50: 1020, ma200: 1050 }, volNow: { ew: 1, ms: 1 } };
  assert.equal(buildScenariosR2({ ...base, es: null, evidence: OFF }).lead, null);
  const off = buildScenariosR2({ ...base, es: -3, evidence: OFF });
  assert.equal(off.lead, "neg");
  for (const s of off.scenarios) { assert.equal(s.open, null); assert.equal(s.probability, null); assert.ok(s.shadowOpen); assert.ok(Number.isFinite(s.shadowProbability)); assert.doesNotMatch(s.posture + s.action, /\bMUA\b|\bBÁN\b/); }
  assert.deepEqual(off.scenarios[0].day, off.scenarios[2].day, "dải không điều kiện giống nhau ở 3 thẻ");
  assert.match(off.scenarios[0].confirm, /Dưới 990/);
  assert.match(off.scenarios[2].confirm, /Trên 1\.020/);
  const on = buildScenariosR2({ ...base, es: -3, evidence: { ...OFF, openBand: true, probabilities: true, dayBand: true, dayModel: "ms", noPanicSell: true } });
  assert.ok(on.scenarios[0].open && Number.isFinite(on.scenarios[0].probability));
  assert.match(on.scenarios[0].action, /không bán đuổi/);
  assert.notDeepEqual(on.scenarios[0].day, on.scenarios[2].day);
});
