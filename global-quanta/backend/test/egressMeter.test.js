// D0 (2026-10-20): đồng hồ egress Supabase theo nhãn + ngân sách ngày.
import test from "node:test";
import assert from "node:assert/strict";
import { createEgressMeter, withDbTag, EgressBudgetError } from "../src/market/store/egressMeter.js";

const MB = 1024 * 1024;

test("đo theo nhãn job/route và bảng; vượt ngưỡng chặn route trước, job sau; cảnh báo một lần mỗi mức", async () => {
  let t = Date.parse("2026-10-20T03:00:00Z");
  const alerts = [];
  const m = createEgressMeter({ now: () => t, softMb: 1, hardMb: 2, jobMb: 3, onAlert: (level) => alerts.push(level) });
  await withDbTag("http:/api/market/ta-series", async () => { m.check(); m.record(1.5 * MB, { table: "market_daily" }); });
  assert.deepEqual(alerts, ["soft"]);
  await withDbTag("job:scanUniverse", async () => { m.check(); m.record(0.6 * MB, { table: "market_ohlcv_daily" }); });
  assert.deepEqual(alerts, ["soft", "hard"]);
  await withDbTag("http:/api/market/ta-series", async () => assert.throws(() => m.check(), EgressBudgetError)); // route bị chặn
  await withDbTag("job:scanUniverse", async () => { m.check(); m.record(1 * MB, { table: "market_daily" }); }); // job vẫn chạy
  await withDbTag("job:scanUniverse", async () => assert.throws(() => m.check(), /trần 3 MB/)); // tới trần tuyệt đối
  const mm = createEgressMeter({ now: () => t, monthlyQuotaMb: 10 });
  mm.record(9.2 * MB);
  await withDbTag("http:/x", async () => assert.throws(() => mm.check(), /đã dùng 92% hạn mức/)); // tháng ≥ 90%: chặn route
  await withDbTag("job:x", async () => mm.check()); // job còn chạy tới 97%
  mm.record(0.6 * MB);
  await withDbTag("job:x", async () => assert.throws(() => mm.check(), /98% hạn mức/));
  const s = m.snapshot();
  assert.equal(s.today.blocked, 2);
  assert.equal(s.byTag[0].key, "job:scanUniverse");
  assert.equal(s.byTable.find((x) => x.key === "market_daily").requests, 2);
  assert.equal(s.budget.status, "blocked");
  // sang ngày mới (giờ VN) -> đặt lại ngân sách ngày, giữ tổng tháng
  t = Date.parse("2026-10-20T18:00:00Z");
  m.check();
  const s2 = m.snapshot();
  assert.equal(s2.today.mb, 0);
  assert.ok(s2.monthToDate.mb > 3);
});

test("lưu / khôi phục tổng tháng qua khởi động lại; tháng khác thì bỏ", () => {
  const t = Date.parse("2026-10-20T03:00:00Z");
  const a = createEgressMeter({ now: () => t });
  a.record(10 * MB);
  const doc = { ...a.persistable(), days: { ...a.persistable().days, "2026-10-19": 20 * MB } };
  const b = createEgressMeter({ now: () => t });
  b.record(1 * MB);
  b.restore(doc);
  assert.equal(b.snapshot().today.mb, 11);
  assert.equal(b.snapshot().monthToDate.mb, 31);
  const c = createEgressMeter({ now: () => t });
  c.restore({ month: "2026-09", days: { "2026-09-30": 99 * MB } });
  assert.equal(c.snapshot().monthToDate.mb, 0);
});
