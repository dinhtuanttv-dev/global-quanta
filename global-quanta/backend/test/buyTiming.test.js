// B1 — Timeline điểm mua qua Gateway: tính lại theo hôm nay, single-flight, lùi khi lỗi, phục vụ bản lưu khi Project A lỗi,
// bền qua khởi động lại, KV `local:` không sao sang Supabase.
import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryStore } from "../src/market/store/memoryStore.js";
import { createLocalFirstStore, isLocalOnlyKv } from "../src/market/store/localFirstStore.js";
import { BUY_TIMING_KV, createBuyTimingService, rebaseRows, sessionsBetween } from "../src/market/elite/buyTiming.js";

const weekdays = (d) => { const w = new Date(`${d}T00:00:00Z`).getUTCDay(); return w !== 0 && w !== 6 && d !== "2026-10-27"; }; // 27/10 giả lập ngày nghỉ
const row = (ticker, from, to, extra = {}) => ({ id: `${ticker}-${from}`, ticker, sector: null, kind: "DIVIDEND", tier: "VALIDATED", status: "UPCOMING", eventLabel: "x", eventDate: to, eventDateBasis: "x",
  windowId: "w1", windowLabel: "W", entryFrom: -5, entryTo: -1, exitOffset: 5, entryFromDate: from, entryToDate: to, exitDate: to, sessionsToEntry: 99, nEvents: 12, winRate: 0.7,
  probability: null, netExpectancy: 0.02, netExpectancyLcb: 0.005, fdrQValue: 0.04, decisionLevel: null, missing: [], ...extra });
const doc = (rows) => ({ today: "2026-10-23", asOf: { decisions: "2026-10-23", seasonality: "2026-10-23" }, coverage: { decisions: 281, seasonality: 281, universe: 281 }, counts: { validated: 1, near: 0, inWindow: 0, upcoming: 1 }, rows });
const T = (iso) => () => Date.parse(iso);

test("sessionsBetween / rebaseRows: tính lại theo hôm nay, bỏ cuối tuần + ngày nghỉ", () => {
  assert.equal(sessionsBetween("2026-10-23", "2026-10-29", weekdays), 3); // 26, 28, 29 (27 nghỉ)
  const r = rebaseRows([row("AAA", "2026-10-29", "2026-11-02"), row("BBB", "2026-10-20", "2026-10-28"), row("CCC", "2026-10-01", "2026-10-10")], "2026-10-26", weekdays);
  assert.deepEqual(r.map((x) => [x.ticker, x.status, x.sessionsToEntry]), [["AAA", "UPCOMING", 2], ["BBB", "IN_WINDOW", 0], ["CCC", "PASSED", 0]]);
});

test("single-flight: 5 lượt gọi đồng thời -> 1 yêu cầu tới Project A; lọc theo mã; trạng thái tính lại theo hôm nay", async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; await new Promise((r) => setTimeout(r, 20)); return new Response(JSON.stringify(doc([row("FPT", "2026-10-29", "2026-11-03"), row("HPG", "2026-10-21", "2026-10-30")])), { status: 200 }); };
  const svc = createBuyTimingService({ store: createMemoryStore(), fetchImpl, now: T("2026-10-26T03:00:00Z"), isTrading: weekdays, log: {} });
  const out = await Promise.all([1, 2, 3, 4, 5].map(() => svc.get({ tickers: ["fpt"] })));
  assert.equal(calls, 1);
  assert.equal(out[0].available, true);
  assert.deepEqual(out[0].rows.map((x) => [x.ticker, x.status, x.sessionsToEntry]), [["FPT", "UPCOMING", 2]]);
  assert.equal(out[0].today, "2026-10-26");
  assert.equal(out[0].meta.stale, false);
});

test("Project A lỗi (Neon hết hạn mức): giữ bản tốt gần nhất, lùi theo cấp số nhân, không gọi lại trong lúc lùi", async () => {
  let t = Date.parse("2026-10-26T03:00:00Z"), ok = true, calls = 0;
  const fetchImpl = async () => { calls++; return ok ? new Response(JSON.stringify(doc([row("FPT", "2026-10-29", "2026-11-03")])), { status: 200 }) : new Response(JSON.stringify({ error: "quota" }), { status: 500 }); };
  const store = createMemoryStore();
  const svc = createBuyTimingService({ store, fetchImpl, now: () => t, random: () => 0.5, isTrading: weekdays, log: {} });
  await svc.get();
  ok = false; t += 2 * 3_600_000; // quá hạn 60 phút -> làm mới nền -> lỗi
  const r1 = await svc.get(); await svc.refresh();
  assert.equal(r1.available, true, "vẫn phục vụ bản lưu");
  assert.equal(svc.status().failures, 1);
  const before = calls;
  t += 5 * 60_000; await svc.get(); await svc.refresh();
  assert.equal(calls, before, "đang lùi 15 phút -> không gọi Project A");
  t += 20 * 60_000; await svc.refresh();
  assert.equal(svc.status().failures, 2, "hết thời gian lùi -> thử lại");
  assert.match(svc.status().lastError, /Project A 500/);
  const r2 = await svc.get();
  assert.equal(r2.meta.stale, true);
  // Khởi động lại: bản tốt gần nhất đọc lại từ kho.
  const svc2 = createBuyTimingService({ store, fetchImpl, now: () => t, isTrading: weekdays, log: {} });
  assert.equal((await svc2.get({ tickers: ["FPT"] })).rows.length, 1);
});

test("chưa từng có bản nào + Project A lỗi -> available: false kèm lỗi (không ném)", async () => {
  const svc = createBuyTimingService({ store: createMemoryStore(), fetchImpl: async () => new Response("{}", { status: 500 }), now: T("2026-10-26T03:00:00Z"), isTrading: weekdays, log: {} });
  const r = await svc.get();
  assert.equal(r.available, false);
  assert.match(r.meta.lastError, /500/);
});

test("KV `local:` chỉ ở Railway Volume — không sao / không hỏi Supabase", async () => {
  assert.equal(isLocalOnlyKv(BUY_TIMING_KV), true);
  const writes = [];
  const inner = { ...createMemoryStore(), setKv: async (k) => { writes.push(k); }, getKv: async (k) => { writes.push(`get:${k}`); return null; } };
  const s = createLocalFirstStore({ local: createMemoryStore(), inner, log: {} });
  await s.setKv(BUY_TIMING_KV, { a: 1 }); await s.getKv("local:khác");
  await s.setKv("thường", 1);
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual(writes, ["thường"]);
});

test("nextSessions: phiên kế tiếp bỏ cuối tuần + ngày nghỉ; phản hồi có `sessions`", async () => {
  const { nextSessions } = await import("../src/market/elite/buyTiming.js");
  assert.deepEqual(nextSessions("2026-10-23", 4, weekdays), ["2026-10-26", "2026-10-28", "2026-10-29", "2026-10-30"]);
  const svc = createBuyTimingService({ store: createMemoryStore(), fetchImpl: async () => new Response("{}", { status: 500 }), now: T("2026-10-26T03:00:00Z"), isTrading: weekdays, log: {} });
  const r = await svc.get();
  assert.ok(r.sessions.includes("2026-10-23") && r.sessions.includes("2026-10-28") && !r.sessions.includes("2026-10-27"));
});
