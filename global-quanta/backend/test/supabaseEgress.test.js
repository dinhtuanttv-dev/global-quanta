// Băng thông Supabase (10/2026): cache KV trong bộ nhớ (chỉ hỏi updated_at khi hết hạn), chọn cột tường minh,
// bộ nhớ đệm chuỗi giá cỡ universe dùng chung giữa các job trong cùng ngày dữ liệu.
import test from "node:test";
import assert from "node:assert/strict";
import { createSupabaseStore } from "../src/market/store/supabaseStore.js";
import { createScreenerSeries, resetScreenerSeriesMemo, screenerSeriesMemoInfo } from "../src/market/strategies/screenerSeries.js";

function fakeSupabase() {
  const kv = new Map([["big", { value: { doc: "x".repeat(1000) }, updated_at: "2026-10-15T00:00:00+00:00" }]]);
  const calls = [];
  const fetchImpl = async (url, opts) => {
    const path = decodeURIComponent(url.split("/rest/v1/")[1]);
    calls.push({ path, method: opts.method });
    const ok = (body) => ({ ok: true, status: 200, text: async () => JSON.stringify(body) });
    if (opts.method === "POST") { const [row] = JSON.parse(opts.body); kv.set(row.key, { value: row.value, updated_at: row.updated_at.replace("Z", "+00:00") }); return { ok: true, status: 201, text: async () => "" }; }
    const key = /key=eq\.([^&]+)/.exec(path)?.[1];
    const row = kv.get(key);
    if (path.startsWith("market_kv?select=updated_at")) return ok(row ? [{ updated_at: row.updated_at }] : []);
    if (path.startsWith("market_kv?select=value,updated_at")) return ok(row ? [{ value: row.value, updated_at: row.updated_at }] : []);
    if (path.startsWith("market_ohlcv_daily")) return ok([]);
    return ok([]);
  };
  return { kv, calls, fetchImpl };
}

test("getKv: lần 2 trong hạn không gọi Supabase; hết hạn chỉ hỏi updated_at; tài liệu đổi -> tải lại; setKv xoá đệm; trả bản sao", async () => {
  process.env.SUPABASE_URL = "https://x.supabase.co"; process.env.SUPABASE_SECRET_KEY = "k"; process.env.MARKET_KV_CACHE_MS = "1";
  const f = fakeSupabase();
  const store = createSupabaseStore({ fetchImpl: f.fetchImpl });
  const a = await store.getKv("big");
  assert.equal(f.calls.length, 1);
  assert.ok(f.calls[0].path.startsWith("market_kv?select=value,updated_at")); // không select *
  a.value.doc = "mutated";
  await new Promise((r) => setTimeout(r, 5));
  const b = await store.getKv("big"); // hết hạn 1 ms -> chỉ hỏi updated_at
  assert.equal(f.calls.length, 2);
  assert.ok(f.calls[1].path.startsWith("market_kv?select=updated_at"));
  assert.equal(b.value.doc, "x".repeat(1000)); // bản trong đệm không bị sửa
  f.kv.set("big", { value: { doc: "new" }, updated_at: "2026-10-16T00:00:00+00:00" });
  await new Promise((r) => setTimeout(r, 5));
  const c = await store.getKv("big");
  assert.equal(c.value.doc, "new");
  assert.equal(f.calls.length, 4); // head + tải lại value
  await store.setKv("big", { doc: "saved" });
  const d = await store.getKv("big");
  assert.equal(d.value.doc, "saved");
  delete process.env.MARKET_KV_CACHE_MS;
});

test("getBars / getMarketDailyRange chọn cột tường minh", async () => {
  process.env.SUPABASE_URL = "https://x.supabase.co"; process.env.SUPABASE_SECRET_KEY = "k";
  const f = fakeSupabase();
  const store = createSupabaseStore({ fetchImpl: f.fetchImpl });
  await store.getBars("FPT", "2026-01-01", "2026-10-15");
  await store.getMarketDailyRange({ from: "2026-10-01", to: "2026-10-15", symbols: ["FPT"], columns: "symbol,trading_date,close" });
  assert.ok(f.calls[0].path.startsWith("market_ohlcv_daily?select=trading_date,open,high,low,close,volume,value,source&"));
  assert.ok(f.calls[1].path.startsWith("market_daily?select=symbol,trading_date,close&"));
});

test("chuỗi cỡ universe: nạp MỘT lần cho ngày dữ liệu, job cần ít lịch sử cắt từ bản dài; đổi ngày -> nạp lại; nạp nhỏ không đệm", async () => {
  resetScreenerSeriesMemo();
  const DATES = Array.from({ length: 2000 }, (_, i) => new Date(Date.UTC(2021, 0, 1) + i * 864e5).toISOString().slice(0, 10));
  let to = DATES.at(-1);
  const counts = { bars: 0, daily: 0, adj: 0 };
  const store = {
    getMarketDailyDates: async () => DATES.filter((d) => d <= to),
    getMarketDailyRange: async () => { counts.daily++; return []; },
    getBars: async (symbol, from, until) => { counts.bars++; return DATES.filter((d) => d >= from && d <= until).map((date) => ({ date, open: 10, high: 10, low: 10, close: 10, volume: 1, value: 10 })); },
    selectRows: async () => { counts.adj++; return [{ bars: DATES.map((d) => [d, 10]) }]; },
  };
  const ca = { get: async () => ({ events: [] }) };
  const syms = Array.from({ length: 60 }, (_, i) => `S${i}`);
  const long = await createScreenerSeries({ store, corporateActions: ca, historyDays: 1826 }).prepare(syms);
  const a = await long("S1");
  const short = await createScreenerSeries({ store, corporateActions: ca, historyDays: 400 }).prepare(syms);
  const b = await short("S1");
  await short("S2"); await long("S2");
  assert.equal(counts.bars, 2); assert.equal(counts.adj, 2); assert.equal(counts.daily, 1);
  assert.ok(b.bars.length < a.bars.length && b.bars[0].date >= DATES.at(-401));
  assert.deepEqual(b.bars.at(-1), a.bars.at(-1));
  assert.equal(screenerSeriesMemoInfo().cached, 2);
  // job 1096 ngày (mặc định chiến lược) cũng dùng chung
  await (await createScreenerSeries({ store, corporateActions: ca }).prepare(syms))("S1");
  assert.equal(counts.bars, 2);
  // ngày dữ liệu mới -> nạp lại
  to = DATES.at(-2); // giả lập đổi `to`
  await (await createScreenerSeries({ store, corporateActions: ca, historyDays: 400 }).prepare(syms))("S1");
  assert.equal(counts.bars, 3);
  // nạp nhỏ (route theo mã) không đệm
  const one = await createScreenerSeries({ store, corporateActions: ca }).prepare(["FPT"]);
  await one("FPT"); await one("FPT");
  assert.equal(counts.bars, 5);
});
