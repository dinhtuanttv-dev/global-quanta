import { test } from "node:test";
import assert from "node:assert/strict";
import { CONFIRM_RULE, evaluateConfirm, leadVsBaseline, ledgerRows, wilson } from "../src/market/preopen/preopenConfirm.js";

// Sổ giả: n phiên chấm liên tiếp từ 02/11/2026, k phiên đầu "dayIn".
function ledger(n, k, { start = "2026-11-02", lead = "neg", outcome = (i) => (i % 3 === 0 ? "mid" : "neg") } = {}) {
  const days = {};
  for (let i = 0; i < n; i++) {
    const date = new Date(Date.parse(`${start}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10), o = outcome(i);
    days[date] = {
      prevClose: 1000, slots: { "08:50": { at: `${date}T01:50:00Z`, es: -1.2, lead, shadow: [{ id: "neg", open: { lo: 990, mid: 995, hi: 999 }, day: { lo: 980, hi: 1010 }, probability: 41 }] } },
      score: { open: 995, close: 1001, gapPct: -0.5, ccPct: 0.1, dayIn: i < k, openIn: true, outcome: o, leadHit: lead === o, slot: "08:50" },
    };
  }
  return { days };
}

test("Wilson khớp giá trị chuẩn", () => {
  const c = wilson(5, 10);
  assert.ok(Math.abs(c.lo - 23.66) < 0.05 && Math.abs(c.hi - 76.34) < 0.05);
  assert.equal(wilson(0, 0), null);
  assert.equal(wilson(0, 20).lo, 0);
  assert.equal(wilson(20, 20).hi, 100);
});

test("PO-r2-F: chưa đủ 60 phiên thì đang xác nhận, kể cả khi số đang đẹp", () => {
  const c = evaluateConfirm(ledger(59, 48));
  assert.equal(c.status, "confirming");
  assert.equal(c.n, 59);
  assert.equal(c.decidedOn, null);
});

test("PO-r2-F: đủ 60 phiên, phủ 80% → đạt; 65% → không đạt; 95% (dải quá rộng) → không đạt", () => {
  assert.equal(evaluateConfirm(ledger(60, 48)).status, "passed");
  assert.equal(evaluateConfirm(ledger(60, 39)).status, "failed");
  assert.equal(evaluateConfirm(ledger(60, 57)).status, "failed");
});

test("PO-r2-F: biên 72% đạt khi KTC còn chứa 80%; 70% không đạt vì ngoài khoảng", () => {
  const at72 = evaluateConfirm(ledger(60, 43)); // 71,7% -> làm tròn 71,7 < 72
  assert.equal(at72.status, "failed");
  const ok = evaluateConfirm(ledger(60, 44)); // 73,3%
  assert.equal(ok.status, "passed");
  assert.ok(ok.wilsonLo <= 80 && ok.wilsonHi >= 80);
});

test("PO-r2-F: kết luận khoá ở 60 phiên đầu, phiên sau không đổi kết luận", () => {
  const l = ledger(90, 48); // 48/60 đầu đạt; 30 phiên sau đều trượt
  const c = evaluateConfirm(l);
  assert.equal(c.status, "passed");
  assert.equal(c.n, 60);
  assert.equal(c.decidedOn, "2026-12-31");
  assert.ok(c.afterRegistration.n > 0, "có mẫu phụ sau ngày đăng ký");
});

test("mẫu phụ chỉ gồm phiên chấm sau ngày đăng ký", () => {
  const c = evaluateConfirm(ledger(25, 25));
  assert.equal(c.afterRegistration.n, 25 - 20); // 02/11..21/11 là 20 ngày lịch, từ 22/11 mới tính
  assert.equal(CONFIRM_RULE.registered, "2026-11-21");
});

test("đường cơ sở: khớp ES so với luôn đoán Trung tính trên cùng phiên", () => {
  const l = ledger(30, 20);
  const r = leadVsBaseline(l);
  assert.equal(r.lead.n, 30);
  assert.equal(r.lead.k, 20); // 2/3 phiên kết quả "neg" và kịch bản khớp "neg"
  assert.equal(r.alwaysMid.k, 10);
  assert.ok(r.lead.lo < r.lead.pct && r.lead.pct < r.lead.hi);
});

test("bảng từng phiên: mới nhất trước, chỉ dải cả phiên, không lộ vùng mở cửa / xác suất bị ẩn", () => {
  const rows = ledgerRows(ledger(5, 3), 3);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].date, "2026-11-06");
  assert.deepEqual(rows[0].day, { lo: 980, hi: 1010 });
  const s = JSON.stringify(rows);
  assert.ok(!s.includes("probability") && !s.includes('"mid":995'), "không có số bị ẩn");
});
