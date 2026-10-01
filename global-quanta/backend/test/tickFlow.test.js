import test from "node:test";
import assert from "node:assert/strict";

import { createMemoryStore } from "../src/market/store/memoryStore.js";
import { createSupabaseStore } from "../src/market/store/supabaseStore.js";
import { groupTickRows, mergeTickFlow, loadTickFlows, createTickRecorder } from "../src/market/scanner/tickFlowService.js";

const row = (date, minute, buy, sell = 0, extra = {}) => ({ symbol: "HPG", date, minute, buy, sell, unknown: 0, prints: 1, sizes: { [buy + sell]: 1 }, ...extra });

test("tick flow: memory store upsert idempotent theo (mã, ngày, phút) và đọc theo khoảng", async () => {
  const store = createMemoryStore();
  await store.upsertTickFlow([row("2026-09-30", 600, 100), row("2026-10-01", 600, 200), row("2026-10-01", 601, 50, 20)]);
  await store.upsertTickFlow([row("2026-10-01", 600, 300)]); // ghi lại phút 600 bằng bản cộng dồn
  await store.upsertTickFlow([{ ...row("2026-10-01", 600, 9), symbol: "FPT" }]);
  const rows = await store.getTickFlowRange({ symbol: "HPG", from: "2026-10-01", to: "2026-10-01" });
  assert.deepEqual(rows.map((r) => [r.date, r.minute, r.buy, r.sell]), [["2026-10-01", 600, 300, 0], ["2026-10-01", 601, 50, 20]]);
  const g = groupTickRows(await store.getTickFlowRange({ symbol: "HPG", from: "2026-09-01", to: "2026-10-31" }));
  assert.deepEqual([...g.keys()], ["2026-09-30", "2026-10-01"]);
  assert.equal(g.get("2026-10-01").classifiedVolume, 370);
});

test("tick flow: supabase store gọi đúng bảng, on_conflict, cột snake_case và chuyển kiểu khi đọc", async () => {
  const saved = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SECRET_KEY };
  process.env.SUPABASE_URL = "https://x.supabase.co";
  process.env.SUPABASE_SECRET_KEY = "sb_secret_test";
  try {
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url, init });
      if (init.method === "POST") return new Response(null, { status: 201 });
      return new Response(JSON.stringify([{ symbol: "HPG", trading_date: "2026-10-01", minute: 600, buy: "300", sell: "10", unknown: "0", prints: 4, sizes: { 100: 3 } }]), { status: 200 });
    };
    const store = createSupabaseStore({ fetchImpl });
    await store.upsertTickFlow([row("2026-10-01", 600, 300, 10)]);
    assert.match(calls[0].url, /\/rest\/v1\/market_tick_flow\?on_conflict=symbol,trading_date,minute$/);
    assert.match(calls[0].init.headers.prefer, /merge-duplicates/);
    const body = JSON.parse(calls[0].init.body)[0];
    assert.deepEqual([body.symbol, body.trading_date, body.minute, body.buy, body.sell], ["HPG", "2026-10-01", 600, 300, 10]);
    const out = await store.getTickFlowRange({ symbol: "HPG", from: "2026-09-01", to: "2026-10-01" });
    assert.match(calls[1].url, /symbol=eq\.HPG&trading_date=gte\.2026-09-01&trading_date=lte\.2026-10-01/);
    assert.deepEqual(out[0], { symbol: "HPG", date: "2026-10-01", minute: 600, buy: 300, sell: 10, unknown: 0, prints: 4, sizes: { 100: 3 } });
  } finally {
    for (const [k, v] of [["SUPABASE_URL", saved.url], ["SUPABASE_SECRET_KEY", saved.key]]) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }
});

test("tick flow: ghép phiên hôm nay — phút trong bộ nhớ ghi đè phút đã lưu, giữ phần trước khi khởi động lại", () => {
  const stored = groupTickRows([row("2026-10-01", 600, 100), row("2026-10-01", 601, 40)]).get("2026-10-01");
  const live = { date: "2026-10-01", classifiedVolume: 70, minutes: [{ minute: 601, buy: 60, sell: 0, unknown: 0, prints: 2, sizes: {} }, { minute: 602, buy: 10, sell: 0, unknown: 0, prints: 1, sizes: {} }] };
  const merged = mergeTickFlow(stored, live);
  assert.deepEqual(merged.minutes.map((m) => [m.minute, m.buy]), [[600, 100], [601, 60], [602, 10]]);
  assert.equal(merged.classifiedVolume, 170);
  assert.equal(mergeTickFlow(null, live), live);
  assert.equal(mergeTickFlow(stored, { ...live, date: "2026-10-02" }), stored);
});

test("tick flow: loadTickFlows tách lịch sử và phiên đang xem; store lỗi không làm hỏng IFE", async () => {
  const store = createMemoryStore();
  await store.upsertTickFlow([row("2026-09-30", 600, 100), row("2026-10-01", 600, 200)]);
  const hub = { getTickFlow: () => ({ date: "2026-10-01", classifiedVolume: 5, minutes: [{ minute: 601, buy: 5, sell: 0, unknown: 0, prints: 1, sizes: {} }] }) };
  const out = await loadTickFlows({ store, hub, symbol: "HPG", from: "2026-09-01", to: "2026-10-01", today: "2026-10-01" });
  assert.deepEqual([...out.history.keys()], ["2026-09-30"]);
  assert.equal(out.today.classifiedVolume, 205);
  const broken = { getTickFlowRange: async () => { throw new Error("boom"); } };
  const fallback = await loadTickFlows({ store: broken, hub, symbol: "HPG", from: "2026-09-01", to: "2026-10-01", today: "2026-10-01" });
  assert.equal(fallback.history.size, 0);
  assert.equal(fallback.today.classifiedVolume, 5);
});

test("tick flow: recorder ghi các phút đã đổi; lỗi ghi -> đánh dấu lại và lần sau ghi tiếp", async () => {
  let pending = [row("2026-10-01", 600, 100)];
  const remarked = [];
  const hub = {
    drainTickFlow: () => { const r = pending; pending = []; return r; },
    markTickFlowDirty: (rows) => { remarked.push(...rows); pending.push(...rows); },
  };
  let fail = true;
  const written = [];
  const store = { kind: "test", upsertTickFlow: async (rows) => { if (fail) throw new Error("HTTP 503"); written.push(...rows); }, getKv: async () => null };
  const rec = createTickRecorder({ hub, store, backgroundSymbols: 0 });
  assert.equal(await rec.flush(), 0);
  assert.equal(remarked.length, 1);
  assert.equal(rec.status().errors, 1);
  fail = false;
  assert.equal(await rec.flush(), 1);
  assert.deepEqual(written.map((r) => r.minute), [600]);
  assert.equal(await rec.flush(), 0, "không có gì mới thì không gọi store");
  assert.equal(rec.status().rowsWritten, 1);
});

test("tick flow: ghi nền đăng ký N mã thanh khoản cao nhất trong giờ khớp liên tục, huỷ khi hết giờ", async () => {
  let t = new Date(Date.UTC(2026, 9, 1, 3, 0)); // 10:00 VN thứ Năm
  const subs = [];
  let unsubscribed = 0;
  const hub = { drainTickFlow: () => [], markTickFlowDirty() {}, subscribe: (s) => { subs.push(s); return () => { unsubscribed++; }; } };
  const universe = { tickers: [{ ticker: "AAA", avgValue20: 1 }, { ticker: "BBB", avgValue20: 9 }, { ticker: "CCC", avgValue20: 5 }] };
  const store = { upsertTickFlow: async () => {}, getKv: async () => ({ value: universe }) };
  const rec = createTickRecorder({ hub, store, backgroundSymbols: 2, now: () => t });
  await rec.tick();
  assert.deepEqual(subs[0].symbols, ["BBB", "CCC"]);
  assert.equal(subs[0].raw, true);
  await rec.tick();
  assert.equal(subs.length, 1, "không đăng ký lặp");
  t = new Date(Date.UTC(2026, 9, 1, 10, 0)); // 17:00 VN
  await rec.tick();
  assert.equal(unsubscribed, 1);
  assert.equal(rec.status().watching, 0);
});
