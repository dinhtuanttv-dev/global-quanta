import test from "node:test";
import assert from "node:assert/strict";
import { KQ_PREREG, attachExcess, availDate, cohortStats, entryDateOf, priceIndex } from "../src/market/fundamentals/kqkdValidate.js";

test("KQ-r1 ngày có sẵn: createdDate trễ 0–120 ngày dùng thật; ngày nhập liệu hàng loạt -> kết thúc quý + 45", () => {
  assert.equal(availDate({ fiscal: "2023-09-30", created: "2023-10-29" }), "2023-10-29");
  assert.equal(availDate({ fiscal: "2015-09-30", created: "2019-07-01" }), "2015-11-14");
  assert.equal(availDate({ fiscal: "2015-09-30", created: null }), "2015-11-14");
  // ngày vào = max(hạn nộp, ngày có sẵn): nộp sớm vẫn vào ở hạn; nộp muộn vào ở ngày nộp
  assert.equal(entryDateOf({ fiscal: "2023-09-30", created: "2023-10-20" }), "2023-11-14");
  assert.equal(entryDateOf({ fiscal: "2023-09-30", created: "2023-12-01" }), "2023-12-01");
});

test("KQ-r1 IC theo lứa: tín hiệu đồng biến lợi suất -> IC 1, Q5−Q1 trừ chi phí; lọc thanh khoản và lứa nhỏ", () => {
  const ev = [];
  for (let i = 0; i < 40; i++) ev.push({ k: "2021-1", sueCore: i, x60: i / 100, liq: 2e9 });
  ev.push({ k: "2021-1", sueCore: 99, x60: -1, liq: 1e8 }); // thanh khoản thấp: bỏ
  for (let i = 0; i < 10; i++) ev.push({ k: "2021-2", sueCore: i, x60: i, liq: 2e9 }); // lứa < 30: bỏ
  const rows = cohortStats(ev, "sueCore", { range: ["2020-1", "2026-1"] });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].ic, 1);
  assert.ok(Math.abs(rows[0].spread - ((mean(32, 39) - mean(0, 7)) / 100 - KQ_PREREG.cost)) < 1e-4);
  function mean(a, b) { let s = 0; for (let i = a; i <= b; i++) s += i; return s / (b - a + 1); }
});

test("KQ-r1 lợi suất vượt = lợi suất mã − bình quân đều các mã có giá ở cả hai mốc", () => {
  const days = Array.from({ length: 80 }, (_, i) => new Date(Date.UTC(2021, 0, 1) + i * 864e5).toISOString().slice(0, 10));
  const pxOf = new Map();
  for (let j = 0; j < 30; j++) pxOf.set(`T${j}`, priceIndex(days.map((d, i) => [d, 10 * (1 + 0.001 * j * i), 1e9])));
  const px = pxOf.get("T29");
  const e = { d0: days[5], i0: 5, r60: px.close[65] / px.close[5] - 1, r20: px.close[25] / px.close[5] - 1 };
  attachExcess([e], pxOf);
  const all = [...pxOf.values()].map((p) => p.close[65] / p.close[5] - 1);
  assert.ok(Math.abs(e.x60 - (e.r60 - all.reduce((a, b) => a + b, 0) / all.length)) < 1e-9);
  assert.ok(e.x60 > 0);
});

test("KQ-r1 báo cáo trong kho -> nhãn: ước tính cả năm THĂM DÒ (H3 đạt), SUE lõi MÔ TẢ (H1 không đạt), dải hẹp hơn thực tế", async () => {
  const fs = await import("node:fs");
  const { evidenceFrom } = await import("../src/market/fundamentals/kqkdEngine.js");
  const rep = JSON.parse(fs.readFileSync(new URL("../src/market/fundamentals/kq-r1-report.json", import.meta.url), "utf8"));
  const e = evidenceFrom(rep);
  assert.equal(e.nowcast.label, "THĂM DÒ");
  assert.equal(e.sueCore.label, "MÔ TẢ");
  assert.equal(e.accuracy.pass, false);
  assert.ok(e.accuracy.coverage < 0.7);
  assert.equal(rep.frozenSha256.length, 64);
});

test("KQ-L1 sổ tiến: chỉ ghi khi ≥ ngày vào, ghi một lần, chấm IC/Q5−Q1 sau 60 phiên, độ chính xác khi có cả năm", async () => {
  const { entryDate, recordLedger, scoreLedger } = await import("../src/market/fundamentals/kqkdLedger.js");
  assert.equal(entryDate("2026-09-30", "2026-10-29"), "2026-11-14");
  assert.equal(entryDate("2026-09-30", "2026-11-20"), "2026-11-20");
  const rows = Array.from({ length: 40 }, (_, i) => ({ t: `T${i}`, tpl: "corp", fiscal: "2026-09-30", quarter: "Q3/2026", created: "2026-10-29", current: true, nowcast: { growth: i / 40, est: 100, lo: 90, hi: 110 } }));
  rows.push({ t: "LATE", fiscal: "2026-09-30", quarter: "Q3/2026", created: "2026-11-20", current: true, nowcast: { growth: 1, est: 1, lo: 1, hi: 1 } });
  const L = { entries: [] };
  assert.equal(recordLedger(L, rows, "2026-11-10"), 0); // trước hạn nộp: chưa ghi
  assert.equal(recordLedger(L, rows, "2026-11-14"), 40); // LATE chưa tới ngày công bố
  assert.equal(recordLedger(L, rows, "2026-11-15"), 0); // không ghi trùng
  const days = Array.from({ length: 90 }, (_, k) => new Date(Date.UTC(2026, 10, 15) + k * 864e5).toISOString().slice(0, 10));
  const closesOf = (t) => { const i = Number(t.slice(1)); return days.map((d, k) => ({ date: d, close: 10 * (1 + 0.0005 * i * k) })); };
  const s = scoreLedger(L, { closesOf, fyOf: (t) => (t === "T0" ? 105 : null) });
  const c = s.cohorts[0];
  assert.equal(c.status, "SCORED");
  assert.equal(c.ic, 1);
  assert.ok(c.spread > 0);
  assert.deepEqual(c.accuracy, { n: 1, medianApe: 0.0476, coverage: 1 });
  const pending = scoreLedger(L, { closesOf: () => [], fyOf: () => null });
  assert.equal(pending.cohorts[0].status, "PENDING");
});
