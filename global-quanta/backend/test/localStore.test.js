// M0 — kho cục bộ bền (localStore) cùng ngữ nghĩa với memoryStore (kể cả sau khi khởi động lại từ đĩa) và kho ưu tiên cục bộ
// (localFirstStore): tính năng chạy khi Supabase lỗi 402, cầu dao, sao chép, nhập lịch sử một lần, dữ liệu người dùng đi thẳng Supabase.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createMemoryStore } from "../src/market/store/memoryStore.js";
import { createLocalStore } from "../src/market/store/localStore.js";
import { createLocalFirstStore } from "../src/market/store/localFirstStore.js";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "gq-local-"));
const day = (symbol, date, close, extra = {}) => ({
  symbol, date, exchange: "HOSE", open: close, high: close, low: close, close, closeAdj: close, refPrice: close, ceiling: close * 1.07, floor: close * 0.93,
  volume: 1000, value: close * 1000, dealVolume: 0, dealValue: 0, foreignBuyVol: 0, foreignSellVol: 0, foreignBuyVal: 5, foreignSellVal: 1, foreignRoom: null, ...extra,
});

/** Kịch bản thao tác dùng chung — trả mọi kết quả đọc để so sánh hai kho. */
async function script(s) {
  const out = {};
  await s.upsertMarketDaily([day("FPT", "2026-10-01", 100), day("HPG", "2026-10-01", 25), day("FPT", "2026-10-02", 101), day("HPG", "2026-10-02", 26)]);
  await s.upsertMarketDaily([day("FPT", "2026-10-02", 102)]);
  await s.applyAdjustment("FPT", "2026-10-01", 0.5);
  out.dates = await s.getMarketDailyDates();
  out.byDate = (await s.getMarketDailyByDate("2026-10-02")).sort((a, b) => a.symbol.localeCompare(b.symbol));
  out.range = await s.getMarketDailyRange({ from: "2026-10-01", to: "2026-10-02", symbols: ["FPT"] });
  await s.setKv("scanner:latest", { items: [1, 2], nested: { a: 1 } });
  out.kv = (await s.getKv("scanner:latest")).value;
  out.kvNone = await s.getKv("không-có");
  await s.upsertFundamentals([{ ticker: "FPT", income: { available: true, quarters: [{ q: 1 }] }, balance: { available: false, quarters: [] }, fetchedAt: "2026-10-01T00:00:00Z" }]);
  out.fund = [...(await s.getFundamentals(["FPT", "VCB"])).entries()];
  await s.upsertTickFlow([{ symbol: "FPT", date: "2026-10-02", minute: 555, buy: 1, sell: 2, unknown: 0, prints: 3, sizes: { s: 1 } }, { symbol: "FPT", date: "2026-10-02", minute: 541, buy: 4, sell: 0, unknown: 1, prints: 5 }]);
  out.ticks = await s.getTickFlowRange({ symbol: "FPT", from: "2026-10-01", to: "2026-10-03" });
  await s.upsertRows("market_flow_daily", [{ symbol: "FPT", trading_date: "2026-09-30", features: { x: 1 } }, { symbol: "FPT", trading_date: "2026-10-02", features: { x: 2 } }, { symbol: "HPG", trading_date: "2026-10-02", features: { x: 3 } }], "symbol,trading_date");
  await s.upsertRows("market_flow_daily", [{ symbol: "FPT", trading_date: "2026-10-02", note: "merged" }], "symbol,trading_date");
  out.sel1 = await s.selectRows("market_flow_daily", { eq: { symbol: "FPT" }, order: "trading_date.desc", limit: 5 });
  out.sel2 = await s.selectRows("market_flow_daily", { gte: { trading_date: "2026-10-01" }, order: "symbol.asc" });
  out.sel3 = await s.selectRows("market_flow_daily", { in: { symbol: ["HPG"] } });
  await s.deleteRows("market_flow_daily", { eq: { symbol: "HPG" } });
  out.afterDelete = (await s.selectRows("market_flow_daily", { order: "trading_date.asc" })).map((r) => `${r.symbol}@${r.trading_date}`);
  await s.upsertBars("FPT", [{ date: "2026-10-01", open: 1, high: 2, low: 1, close: 2, volume: 9, value: null }], "LEGACY");
  await s.upsertBars("FPT", [{ date: "2026-10-01", open: 1, high: 2, low: 1, close: 3, volume: 9, value: null }, { date: "2026-10-02", open: 3, high: 3, low: 3, close: 3, volume: 1, value: 3 }], "SSI_FC_V2");
  await s.upsertBars("FPT", [{ date: "2026-10-02", open: 9, high: 9, low: 9, close: 9, volume: 1, value: 9 }], "LEGACY"); // không được đè SSI
  out.bars = await s.getBars("FPT", "2026-01-01", "2026-12-31");
  out.coverage = await s.coverage("FPT");
  await s.upsertBars("HPG", [{ date: "2026-10-03", open: 1, high: 1, low: 1, close: 1, volume: 1, value: 1 }], "LEGACY");
  out.nonSsi = await s.listNonSsiBars("2026-01-01");
  await s.setIndexComponents("VN30", ["FPT", "HPG"], "SSI");
  out.ic = (await s.getIndexComponents("VN30")).symbols;
  return out;
}

const norm = (o) => JSON.parse(JSON.stringify(o, (k, v) => (k === "updatedAt" || k === "createdAt" ? undefined : v)));

test("localStore cùng kết quả với memoryStore; khởi động lại từ đĩa vẫn y nguyên", async () => {
  const dir = tmp();
  const mem = await script(createMemoryStore());
  const loc = createLocalStore({ dir, log: { warn() {} } });
  const got = await script(loc);
  assert.deepEqual(norm(got), norm(mem));
  loc.flush();
  const again = createLocalStore({ dir, log: { warn() {} } });
  assert.deepEqual(await again.getMarketDailyDates(), mem.dates);
  assert.deepEqual(norm(await again.getMarketDailyRange({ from: "2026-10-01", to: "2026-10-02", symbols: ["FPT"] })), norm(mem.range));
  assert.deepEqual((await again.getKv("scanner:latest")).value, mem.kv);
  assert.deepEqual(norm(await again.selectRows("market_flow_daily", { order: "trading_date.asc" })).map((r) => `${r.symbol}@${r.trading_date}`), mem.afterDelete);
  assert.deepEqual(norm(await again.getTickFlowRange({ symbol: "FPT", from: "2026-10-01", to: "2026-10-03" })), norm(mem.ticks));
  assert.deepEqual(norm(await again.getBars("FPT", "2026-01-01", "2026-12-31")), norm(mem.bars));
  assert.ok(again.info().diskMb >= 0);
});

test("select chỉ trả cột yêu cầu (như PostgREST); dữ liệu sửa ở nơi gọi không làm hỏng kho", async () => {
  const loc = createLocalStore({ dir: tmp(), log: { warn() {} } });
  await loc.upsertRows("market_regime_daily", [{ trading_date: "2026-10-01", regime: "UP", score: 1 }], null);
  assert.deepEqual(await loc.selectRows("market_regime_daily", { select: "trading_date,regime" }), [{ trading_date: "2026-10-01", regime: "UP" }]);
  const kvDoc = { a: [1] };
  await loc.setKv("k", kvDoc);
  kvDoc.a.push(2);
  const read = await loc.getKv("k");
  read.value.a.push(3);
  assert.deepEqual((await loc.getKv("k")).value, { a: [1] });
});

/** Supabase bị khoá hạn mức: mọi lệnh ném lỗi 402 và đếm số lần bị gọi. */
function lockedSupabase() {
  const calls = { n: 0 };
  const fail = async () => { calls.n++; throw new Error('Supabase GET market_kv lỗi HTTP 402: {"message":"exceed_egress_quota"}'); };
  const inner = new Proxy({ kind: "supabase" }, { get: (t, p) => (p in t ? t[p] : fail) });
  return { inner, calls };
}

test("Supabase khoá 402: tính năng vẫn ghi/đọc bình thường từ đĩa; cầu dao mở -> không gọi Supabase nữa", async () => {
  let t = Date.parse("2026-10-22T08:00:00Z");
  const { inner, calls } = lockedSupabase();
  const s = createLocalFirstStore({ local: createLocalStore({ dir: tmp(), log: { warn() {} } }), inner, now: () => t, log: { warn() {} } });
  await s.setKv("scanner:latest", { items: [1] });
  assert.deepEqual((await s.getKv("scanner:latest")).value, { items: [1] });
  await s.upsertMarketDaily([day("FPT", "2026-10-21", 50)]);
  assert.deepEqual(await s.getMarketDailyDates(), ["2026-10-21"]);
  await s.upsertRows("market_flow_daily", [{ symbol: "FPT", trading_date: "2026-10-21", features: {} }], "symbol,trading_date");
  assert.equal((await s.selectRows("market_flow_daily", {})).length, 1);
  assert.equal(await s.getKv("chưa-có"), null);
  await s.drainReplica();
  const afterFirst = calls.n;
  assert.ok(afterFirst >= 1, "đã thử Supabase ít nhất một lần");
  for (let i = 0; i < 20; i++) { await s.setKv(`k${i}`, i); await s.getKv(`miss${i}`); }
  await s.drainReplica();
  assert.equal(calls.n, afterFirst, "cầu dao mở: không gọi Supabase thêm");
  assert.equal(s.localInfo().replica.healthy, false);
  t += 16 * 60_000; // hết 15 phút -> thử lại
  await s.getKv("miss-x");
  assert.equal(calls.n, afterFirst + 1);
  // dữ liệu người dùng + tài khoản (từ 23/10/2026): CHỈ trên Volume, không gọi / không sao Supabase.
  const before = calls.n;
  await s.upsertRows("market_user_watchlists", [{ user_id: "u", lists: [] }], "user_id");
  await s.upsertRows("auth_users", [{ id: "u", email: "a@b.vn", password_hash: "x" }], "id");
  assert.equal((await s.selectRows("market_user_watchlists", { eq: { user_id: "u" } })).length, 1);
  await s.drainReplica();
  assert.equal(calls.n, before, "bảng người dùng / auth_* không chạm Supabase");
});

test("Supabase khoẻ: sao chép ghi; nhập lịch sử sổ tín hiệu MỘT lần, không đè dòng mới cục bộ; KV thiếu đọc một lần rồi lưu đĩa", async () => {
  const inner = createMemoryStore();
  await inner.upsertRows("market_signal_ledger", [{ symbol: "FPT", signal_date: "2026-10-01", signal: "SCR_X", v: "old" }, { symbol: "HPG", signal_date: "2026-10-01", signal: "SCR_X", v: "old" }], "symbol,signal_date,signal");
  await inner.setKv("sectors:rrg", { q: 1 });
  let innerSelects = 0;
  const spy = { ...inner, kind: "supabase", selectRows: (...a) => { innerSelects++; return inner.selectRows(...a); } };
  const local = createLocalStore({ dir: tmp(), log: { warn() {} } });
  const s = createLocalFirstStore({ local, inner: spy, log: { warn() {} } });
  await s.upsertRows("market_signal_ledger", [{ symbol: "FPT", signal_date: "2026-10-01", signal: "SCR_X", v: "new" }], "symbol,signal_date,signal");
  const rows = await s.selectRows("market_signal_ledger", { order: "symbol.asc" });
  assert.deepEqual(rows.map((r) => `${r.symbol}:${r.v}`), ["FPT:new", "HPG:old"]);
  await s.selectRows("market_signal_ledger", {});
  assert.equal(innerSelects, 1, "chỉ nhập toàn bảng một lần");
  assert.deepEqual((await s.getKv("sectors:rrg")).value, { q: 1 });
  assert.ok(local.hasKv("sectors:rrg"), "KV đã lưu cục bộ");
  await s.setKv("scanner:latest", { ok: true });
  await s.upsertMarketDaily([day("FPT", "2026-10-21", 50)]);
  await s.drainReplica();
  assert.deepEqual((await inner.getKv("scanner:latest")).value, { ok: true }, "ghi được sao sang Supabase");
  assert.deepEqual(await inner.getMarketDailyDates(), ["2026-10-21"]);
  assert.equal(s.localInfo().replica.replicated >= 2, true);
});

test("Siêu quét chạy trọn khi Supabase khoá: backfill SSI -> universe -> BCTC -> quét -> khởi động lại vẫn đọc được kết quả", async () => {
  const { createScannerJobs, tradingDatesBack, KV } = await import("../src/market/scanner/scannerJobs.js");
  const dir = tmp();
  const { inner } = lockedSupabase();
  const mk = () => createLocalFirstStore({ local: createLocalStore({ dir, log: { warn() {} } }), inner, log: { warn() {} } });
  const store = mk();
  const symbols = Array.from({ length: 30 }, (_, i) => `S${String(i).padStart(2, "0")}`).concat(["FPT", "VNM"]);
  let seed = 7; const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const fetchDay = async (date) => ({ date, requests: 3, rows: symbols.map((symbol, i) => {
    const close = 20_000 + r() * 1_000;
    return { symbol, date, exchange: "HOSE", open: close, high: close * 1.01, low: close * 0.99, close, closeAdj: close, volume: 1e5, value: (32 - i) * 2e8, foreignBuyVal: r() * 1e9, foreignSellVal: r() * 1e9 };
  }) });
  const dates = tradingDatesBack("2026-10-01", 120);
  const indexBars = dates.map((date, i) => ({ date, open: 1700 + i, high: 1710 + i, low: 1690 + i, close: 1700 + i, volume: 1 }));
  const service = { store, getOhlcv: async () => ({ bars: indexBars, provenance: { source: "SSI_FC_V2" } }) };
  const fakeFetch = async (url) => {
    const json = (body) => ({ ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => body });
    if (String(url).includes("tradingview")) return json({ data: [] });
    if (String(url).includes("vietcap")) return json({ successful: false, msg: "test" });
    throw new Error(`Project A (Neon khoá) ${url}`);
  };
  process.env.SCANNER_UNIVERSE_SIZE = "10";
  process.env.SCANNER_MIN_AVG_VALUE = String(3e9);
  process.env.SCANNER_UNIVERSE_SESSIONS = "20";
  try {
    const jobs = createScannerJobs(service, { now: () => Date.parse("2026-10-01T09:00:00Z"), fetchDay, fetchImpl: fakeFetch, pauseMs: 0 });
    const bf = await jobs.backfillMarketDaily({ sessions: 120, maxDays: 200 });
    assert.ok(bf.sessionsLoaded >= 100);
    await jobs.buildUniverse();
    await jobs.refreshFundamentals();
    const scan = await jobs.scanUniverse();
    assert.ok(scan.scanned >= 10);
    store.flushWarehouse();
    const restarted = mk();
    const doc = (await restarted.getKv(KV.latest)).value;
    assert.equal(doc.dataAsOf, "2026-10-01");
    assert.equal(doc.items.length, scan.scanned);
  } finally {
    delete process.env.SCANNER_UNIVERSE_SIZE; delete process.env.SCANNER_MIN_AVG_VALUE; delete process.env.SCANNER_UNIVERSE_SESSIONS;
  }
});

test("tự dựng lại dữ liệu cục bộ: đúng thứ tự phụ thuộc, bước phụ lỗi không dừng chuỗi, bước bắt buộc lỗi thì dừng; tự chạy khi thiếu", async () => {
  const { createLocalBootstrap, BOOTSTRAP_KV } = await import("../src/market/store/localBootstrap.js");
  const store = createLocalStore({ dir: tmp(), log: { warn() {} } });
  const order = [];
  const jobs = {
    backfillMarketDaily: async () => { order.push("backfill"); await store.upsertMarketDaily([day("FPT", "2026-10-21", 1)]); return { sessionsLoaded: 1 }; },
    buildUniverse: async () => { order.push("universe"); await store.setKv("scanner:universe", { builtAt: new Date().toISOString(), tickers: [] }); },
    refreshFundamentals: async () => { order.push("fa"); throw new Error("VCI 403"); },
    scanUniverse: async () => { order.push("scan"); await store.setKv("scanner:latest", { items: [{ ticker: "FPT" }] }); return { scanned: 1 }; },
    scanStrategies: async () => { order.push("strategies"); },
  };
  const b = createLocalBootstrap({ jobs, store, log: { warn() {} } });
  const auto = await b.autoStart();
  assert.equal(auto.started, true);
  const st = await b.run({ wait: true });
  assert.equal(st.running, true, "không chạy chồng hai lượt");
  for (let i = 0; i < 50 && b.status().status === "running"; i++) await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(order, ["backfill", "universe", "fa", "scan", "strategies"]);
  const saved = (await store.getKv(BOOTSTRAP_KV)).value;
  assert.equal(saved.status, "done");
  assert.equal(saved.steps.find((s) => s.name === "refreshFundamentals").status, "error");
  // Bước bắt buộc lỗi -> dừng chuỗi
  const b2 = createLocalBootstrap({ jobs: { ...jobs, backfillMarketDaily: async () => { throw new Error("SSI 500"); } }, store, log: { warn() {} } });
  const r2 = await b2.run({ wait: true });
  assert.equal(r2.status, "error");
  assert.equal(r2.steps.length, 1);
});

test("dòng market_daily đọc từ đĩa: đủ 20 cột theo đúng thứ tự, giá trị y hệt dòng ghi (object hình dạng cố định)", async () => {
  const dir = tmp();
  const row = { symbol: "FPT", date: "2026-10-02", exchange: "HOSE", open: 1, high: 2, low: 0.5, close: 1.5, closeAdj: 1.4, refPrice: 1.2, ceiling: 1.3, floor: 1.1, volume: 10,
    value: 15.5, dealVolume: 0, dealValue: 0, foreignBuyVol: 3, foreignSellVol: 1, foreignBuyVal: 4.5, foreignSellVal: 1.5, foreignRoom: 99 };
  const a = createLocalStore({ dir, log: { warn() {} } });
  await a.upsertMarketDaily([row, { symbol: "VNM", date: "2026-10-02", close: 60 }]);
  await new Promise((r) => setTimeout(r, 2100)); // ghi gom xuống đĩa
  const b = createLocalStore({ dir, log: { warn() {} } }); // đọc lại từ đĩa
  const [fpt, vnm] = (await b.getMarketDailyByDate("2026-10-02")).sort((x, y) => x.symbol.localeCompare(y.symbol));
  assert.deepEqual(Object.keys(fpt), Object.keys(row));
  assert.deepEqual(fpt, row);
  assert.equal(vnm.close, 60); assert.equal(vnm.high, null); assert.equal(Object.keys(vnm).length, 20);
  assert.deepEqual(await b.getMarketDailyRange({ from: "2026-10-01", to: "2026-10-03", symbols: ["FPT"] }), [row]);
  fs.rmSync(dir, { recursive: true, force: true });
});
