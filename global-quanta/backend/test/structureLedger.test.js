// Cấu trúc đa khung (T6) — sổ dự báo thực tế + ACI: chấm đúng kỳ hạn, không chấm dở dang, α tự điều chỉnh theo độ phủ.
import test from "node:test";
import assert from "node:assert/strict";
import { ACI, emptyAciState, ledgerStats, quantile, scoreLedger } from "../src/market/structure/ledger.js";

const series = (n, step = 0.001) => {
  const close = Array.from({ length: n }, (_, i) => 100 * Math.exp(step * i));
  const dates = close.map((_, i) => `2026-0${1 + Math.floor(i / 28)}-${String(1 + (i % 28)).padStart(2, "0")}`);
  return { dates, close, idx: new Map(dates.map((d, i) => [d, i])) };
};

test("chấm khi đủ kỳ hạn; phiên chưa đủ dừng lại (không chấm dở dang); lợi suất 10 phiên theo kết luận", () => {
  const s = series(40);
  const entries = {};
  for (let i = 0; i < 35; i++) entries[s.dates[i]] = [{ t: "AAA", st: "UP", v: "MUA", cone: { 5: [-0.05, 0.05, 0.01], 10: [-0.05, 0.05, 0.01], 20: [-0.05, 0.05, 0.01] } }];
  const st = scoreLedger(emptyAciState(), entries, () => s);
  assert.equal(st.scoredThrough[5], s.dates[34]);   // 34 + 5 = 39 < 40
  assert.equal(st.scoredThrough[10], s.dates[29]);  // 29 + 10 = 39
  assert.equal(st.scoredThrough[20], s.dates[19]);
  assert.equal(st.verdicts.MUA.n, 30);
  const again = scoreLedger(st, entries, () => s);
  assert.equal(again.verdicts.MUA.n, 30, "chấm lại không đếm trùng");
});

test("ACI: dự báo luôn trúng (độ phủ 100% > 80%) -> α tăng (khoảng hẹp lại); luôn trượt -> α giảm (khoảng rộng ra)", () => {
  const s = series(300);
  const wide = {}, narrow = {};
  for (let i = 0; i < 280; i++) {
    wide[s.dates[i]] = [{ t: "AAA", v: "CHỜ MUA", cone: { 5: [-0.5, 0.5, 0], 10: [-0.5, 0.5, 0], 20: [-0.5, 0.5, 0] } }];
    narrow[s.dates[i]] = [{ t: "AAA", v: "CHỜ MUA", cone: { 5: [0.1, 0.2, 0], 10: [0.1, 0.2, 0], 20: [0.1, 0.2, 0] } }];
  }
  const a = scoreLedger(emptyAciState(), wide, () => s), b = scoreLedger(emptyAciState(), narrow, () => s);
  for (const h of [5, 10, 20]) {
    assert.ok(a.alpha[h] > ACI.target, `α tăng h=${h}`);
    assert.ok(b.alpha[h] < ACI.target, `α giảm h=${h}`);
    assert.ok(Number.isFinite(a.offset[h]) && a.offset[h] < 0, "điểm không phù hợp âm -> offset âm (thu hẹp)");
    assert.ok(b.offset[h] > 0, "trượt -> offset dương (mở rộng)");
  }
  const stats = ledgerStats(a);
  assert.equal(stats.coverage[5].coverage, 1);
  assert.equal(quantile([1, 2, 3, 4], 0.5), 2);
});
