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
