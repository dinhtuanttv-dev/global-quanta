import assert from "node:assert/strict";
import test from "node:test";
import { addSessions, createLedgerHealth, LEDGER_SPECS, summarizeLedger } from "../src/market/ledgerHealth.js";

const CAL = ["2026-10-22", "2026-10-23", "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-11-02", "2026-11-03", "2026-11-04"];
const spec = (over = {}) => ({ id: "x", name: "X", tab: "T", what: "w", cadence: "session", writeAt: "16:05", horizon: 21, ...over });
// 05/11/2026 (thứ Năm) 10:00 giờ VN: phiên 05/11 chưa đóng -> sổ lẽ ra đã có tới 04/11.
const MORNING = Date.parse("2026-11-05T03:00:00Z");
// 04/11/2026 16:10 giờ VN: mới qua 16:05 chưa đủ 30 phút -> chưa đòi phiên 04/11.
const JUST_AFTER = Date.parse("2026-11-04T09:10:00Z");

test("đủ phiên thì ổn; thiếu một phiên ở giữa thì báo đúng phiên đó", () => {
  const ok = summarizeLedger({ spec: spec(), dates: CAL.slice(1), calendar: CAL, now: MORNING });
  assert.equal(ok.status, "ok");
  const gap = summarizeLedger({ spec: spec(), dates: CAL.slice(1).filter((d) => d !== "2026-10-26"), calendar: CAL, now: MORNING });
  assert.equal(gap.status, "gap");
  assert.deepEqual(gap.missing, ["2026-10-26"]);
  assert.equal(gap.strip.find((c) => c.date === "2026-10-26").state, "missing");
  assert.equal(gap.strip.find((c) => c.date === "2026-10-22").state, "before");
});

test("trễ khi phiên lẽ ra đã ghi mà chưa có; chưa quá giờ ghi thì không tính trễ", () => {
  const late = summarizeLedger({ spec: spec(), dates: CAL.slice(1, -1), calendar: CAL, now: MORNING });
  assert.equal(late.status, "late");
  assert.equal(late.expected, "2026-11-04");
  const early = summarizeLedger({ spec: spec(), dates: CAL.slice(1, -1), calendar: CAL, now: JUST_AFTER });
  assert.equal(early.status, "ok");
  assert.equal(early.expected, "2026-11-03");
});

test("sổ ghi khi có tín hiệu: phiên trống là bình thường, không báo thiếu hay trễ", () => {
  const s = summarizeLedger({ spec: spec({ cadence: "signal" }), dates: ["2026-10-23", "2026-10-29"], calendar: CAL, now: MORNING });
  assert.equal(s.status, "ok");
  assert.deepEqual(s.missing, []);
  assert.equal(s.strip.find((c) => c.date === "2026-10-26").state, "none");
});

test("job ghi sổ lỗi hôm nay thì báo lỗi job; sổ trống thì báo trống", () => {
  const job = { name: "j", at: "16:05", lastRunDate: "2026-11-05", last: { ok: false, error: "kho tạm khoá" } };
  assert.equal(summarizeLedger({ spec: spec(), dates: CAL.slice(1), calendar: CAL, job, now: MORNING }).status, "job_error");
  assert.equal(summarizeLedger({ spec: spec(), dates: [], calendar: CAL, now: MORNING }).status, "empty");
});

test("ngày chấm đầu tiên: theo lịch thật nếu đủ, không thì ước tính theo ngày làm việc", () => {
  assert.deepEqual(addSessions(CAL, "2026-10-22", 3), { date: "2026-10-27", estimated: false });
  assert.deepEqual(addSessions(CAL, "2026-10-23", 21), { date: "2026-11-23", estimated: true });
  const s = summarizeLedger({ spec: spec(), dates: CAL.slice(1), calendar: CAL, now: MORNING });
  assert.equal(s.firstScore.date, "2026-11-23");
});

test("đọc đủ 9 sổ; lỗi đọc một sổ không làm hỏng cả trang", async () => {
  const kv = new Map([["cycles:ledger:index", { dates: CAL.slice(1) }], ["preopen:ledger:v1", { days: { "2026-11-04": {} } }]]);
  const store = {
    getKv: async (k) => (kv.has(k) ? { value: kv.get(k) } : null),
    listKv: async () => [],
    selectRows: async (t) => { if (t === "market_elliott_ledger") throw new Error("hỏng"); return []; },
  };
  const h = createLedgerHealth({ store, getCalendar: async () => CAL, now: () => MORNING });
  const r = await h.report();
  assert.equal(r.ledgers.length, LEDGER_SPECS.length);
  assert.equal(r.ledgers.find((l) => l.id === "cycles").status, "ok");
  assert.equal(r.ledgers.find((l) => l.id === "elliott").status, "read_error");
  assert.equal(r.summary.readError, 1);
  assert.equal(r.calendarThrough, "2026-11-04");
});
