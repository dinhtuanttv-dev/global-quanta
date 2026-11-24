// Tự phục hồi: job lỗi được thử lại sau 30 phút, tối đa 3 lần/ngày; thành công thì thôi; chạy tay không tạo lần thử lại.
import test from "node:test";
import assert from "node:assert/strict";
import { createScheduler } from "../src/market/scheduler.js";

const noop = Object.fromEntries(["syncSecurities", "syncPriceLimits", "syncEod", "reconcile", "backfill"].map((n) => [n, async () => {}]));

test("job lỗi -> thử lại sau retryMs, tối đa retryMax lần/ngày; thành công thì dừng", async () => {
  let t = Date.parse("2026-10-20T03:00:00Z"); // 10:00 VN, ngày giao dịch
  let calls = 0, failUntil = 3;
  const sched = createScheduler({ ...noop, job: async () => { calls++; if (calls < failUntil) throw new Error("Supabase 402"); return "ok"; } }, { now: () => t, extraSchedule: [{ name: "job", at: "09:00", tradingDayOnly: false }], retryMs: 60_000, retryMax: 3 });
  const settle = () => new Promise((r) => setTimeout(r, 5));
  sched.tick(); await settle();
  assert.equal(calls, 1);
  sched.tick(); await settle();
  assert.equal(calls, 1); // chưa tới giờ thử lại
  t += 61_000; sched.tick(); await settle();
  assert.equal(calls, 2); // lần thử lại 1 (vẫn lỗi)
  t += 61_000; sched.tick(); await settle();
  assert.equal(calls, 3); // lần thử lại 2 -> thành công
  t += 61_000; sched.tick(); await settle();
  assert.equal(calls, 3); // không chạy nữa
  assert.equal(sched.status().find((j) => j.name === "job").last.ok, true);
});

test("lỗi mãi: dừng sau retryMax lần thử lại trong ngày", async () => {
  let t = Date.parse("2026-10-20T03:00:00Z");
  let calls = 0;
  const sched = createScheduler({ ...noop, job: async () => { calls++; throw new Error("down"); } }, { now: () => t, extraSchedule: [{ name: "job", at: "09:00", tradingDayOnly: false }], retryMs: 1000, retryMax: 2 });
  for (let i = 0; i < 10; i++) { sched.tick(); await new Promise((r) => setTimeout(r, 5)); t += 1500; }
  assert.equal(calls, 3); // 1 lần theo lịch + 2 lần thử lại
});

test("phiên đóng đi tiếp khi job nền đang chạy và bù dữ liệu trước khi báo công bố", async () => {
  let now = Date.parse("2026-11-24T09:00:00Z"), release, attempts = 0;
  const background = new Promise((resolve) => { release = resolve; });
  const published = [];
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  const sched = createScheduler({ ...noop, backfill: () => background,
    close: async () => ({ awaitingData: ++attempts === 1 }), rebuild: async () => published.push(now),
  }, { now: () => now, closeJobs: ["close", "rebuild"], retryMs: 1_000, log: {}, extraSchedule: [{ name: "close", at: "09:00", followUp: "rebuild" }] });
  sched.tick(); await flush();
  assert.equal(sched.status().find((j) => j.name === "backfill").last.running, true);
  assert.equal(sched.status().find((j) => j.name === "close").last.awaitingData, true);
  assert.deepEqual(published, []);
  now += 1_001; sched.tick(); await flush();
  assert.equal(attempts, 2);
  assert.deepEqual(published, [now]);
  release(); await flush();
});
