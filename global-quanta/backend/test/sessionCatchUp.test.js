import test from "node:test";
import assert from "node:assert/strict";
import { createSessionCatchUp } from "../src/market/sessionCatchUp.js";
import { createScheduler } from "../src/market/scheduler.js";

const store = (dates, scanAsOf) => ({ getMarketDailyDates: async () => dates, getKv: async () => (scanAsOf ? { value: { dataAsOf: scanAsOf } } : null) });

test("bù phiên: Siêu Quét chậm hơn dữ liệu ngày -> chạy lại chuỗi theo thứ tự; lỗi một job không chặn job sau", async () => {
  const calls = [];
  const jobs = { scanUniverse: async () => calls.push("scan"), scanStrategies: async () => { calls.push("strat"); throw new Error("x"); }, buildSectorRotation: async () => calls.push("rrg") };
  const run = createSessionCatchUp({ jobs, store: store(["2026-11-12", "2026-11-13"], "2026-11-12"), now: () => Date.parse("2026-11-14T05:00:00Z"), log: {} });
  const r = await run();
  assert.deepEqual(calls, ["scan", "strat", "rrg"]);
  assert.equal(r.session, "2026-11-13");
  assert.deepEqual(r.done.map((x) => x.ok), [true, false, true]);
});

test("bù phiên: đã cập nhật -> không chạy; phiên hôm nay trước 15:40 -> để lịch thường chạy", async () => {
  let n = 0; const jobs = { scanUniverse: async () => n++ };
  assert.match((await createSessionCatchUp({ jobs, store: store(["2026-11-13"], "2026-11-13"), log: {} })()).skipped, /đã cập nhật/);
  const early = createSessionCatchUp({ jobs, store: store(["2026-11-16"], "2026-11-13"), now: () => Date.parse("2026-11-16T07:00:00Z"), log: {} }); // 14:00 VN
  assert.match((await early()).skipped, /Chưa tới giờ quét/);
  const late = createSessionCatchUp({ jobs, store: store(["2026-11-16"], "2026-11-13"), now: () => Date.parse("2026-11-16T09:00:00Z"), log: {} }); // 16:00 VN
  await late(); assert.equal(n, 1);
});

test("lập lịch: job treo quá thời hạn bị tính là lỗi và hàng đợi chạy tiếp job sau", async () => {
  const ran = [];
  const jobs = { hang: () => new Promise(() => {}), next: async () => { ran.push("next"); return 1; } };
  const s = createScheduler(jobs, { timeoutMs: 30, log: {} });
  const a = s.run("hang").catch((e) => e.message), b = s.run("next");
  assert.equal(s.status().length >= 0, true);
  assert.match(await a, /quá thời hạn/);
  assert.equal(await b, 1);
  assert.deepEqual(ran, ["next"]);
});
