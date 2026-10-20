// D1 (2026-10-20) — kiểm tra SONG SINH: store có kho đệm phải trả kết quả GIỐNG HỆT store đọc thẳng Supabase, qua hàng
// nghìn thao tác đọc/ghi ngẫu nhiên, khởi động lại (đệm đĩa), tiến trình chết trước khi ghi đĩa (nhật ký), đọc song song
// với ghi. Đồng thời đo egress: đệm phải đọc ít hơn nhiều.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createSupabaseStore } from "../src/market/store/supabaseStore.js";
import { createWarehouse } from "../src/market/store/warehouse.js";
import { createFakePostgrest } from "./helpers/fakePostgrest.js";

process.env.SUPABASE_URL = "https://x.supabase.co";
process.env.SUPABASE_SECRET_KEY = "k";
process.env.MARKET_KV_CACHE_MS = "1";

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}
const DATES = Array.from({ length: 70 }, (_, i) => new Date(Date.UTC(2026, 6, 1) + i * 864e5).toISOString().slice(0, 10)).filter((d) => ![0, 6].includes(new Date(d).getUTCDay()));
const SYMS = Array.from({ length: 130 }, (_, i) => (i % 7 === 0 ? `A${i}` : `S${String.fromCharCode(65 + (i % 26))}${i}`));

function seed(fake, r) {
  const daily = [], bars = [], flow = [], prof = [], ledger = [];
  for (const d of DATES.slice(0, 40)) for (const s of SYMS) {
    if (r() < 0.05) continue;
    const c = Math.round((10 + r() * 90) * 100) / 100;
    daily.push({ symbol: s, trading_date: d, exchange: r() < 0.5 ? "HOSE" : null, open: c, high: c + 1, low: c - 1, close: c, close_adj: c, ref_price: c, ceiling: null, floor: c - 2, volume: Math.round(r() * 1e6), value: Math.round(r() * 1e9), deal_volume: 0, deal_value: 0, foreign_buy_vol: 1, foreign_sell_vol: 2, foreign_buy_val: 3, foreign_sell_val: 4, foreign_room: r() < 0.3 ? null : 5 });
    if (r() < 0.6) bars.push({ symbol: s, trading_date: d, open: c, high: c, low: c, close: c, volume: 1, value: r() < 0.2 ? null : 2, source: r() < 0.7 ? "SSI_V3" : "LEGACY", ingested_at: "x" });
    if (r() < 0.5) flow.push({ symbol: s, trading_date: d, delta: r(), features: { a: r(), b: r() < 0.2 ? null : r() } });
    if (r() < 0.3) prof.push({ symbol: s, trading_date: d, poc: r(), bins: [r(), r()] });
    if (r() < 0.05) ledger.push({ symbol: s, signal_date: d, signal: r() < 0.5 ? "X" : "Y", direction: r() < 0.5 ? 1 : -1, score: r() < 0.1 ? null : r(), regime: r() < 0.5 ? "UP" : null });
  }
  fake.upsert("market_daily", daily);
  fake.upsert("market_ohlcv_daily", bars);
  fake.upsert("market_flow_daily", flow);
  fake.upsert("market_volume_profile_daily", prof);
  fake.upsert("market_signal_ledger", ledger);
  fake.upsert("market_adjusted_series", SYMS.slice(0, 20).map((s) => ({ symbol: s, bars: [[DATES[0], r()]], checked_at: "c" })));
  fake.upsert("market_fundamentals", SYMS.slice(0, 50).map((t) => ({ ticker: t, income: { x: r() }, balance: [r()], fetched_at: "f" })));
  fake.upsert("market_kv", [{ key: "doc", value: { v: 1 }, updated_at: "2026-10-01T00:00:00Z" }]);
}

const pick = (r, list) => list[Math.floor(r() * list.length)];
const subset = (r, list, max) => { const n = 1 + Math.floor(r() * max); return Array.from({ length: n }, () => pick(r, list)); };
const range = (r) => { const a = pick(r, DATES), b = pick(r, DATES); return a <= b ? [a, b] : [b, a]; };
const COLSETS = [undefined, "symbol,trading_date,close_adj", "symbol,trading_date,close_adj,value", "symbol,trading_date,open,high,low,close,volume,value,foreign_buy_val,foreign_sell_val", "trading_date,close"];

function reads(r) {
  return [
    ["dailyRange", () => { const [from, to] = range(r); const symbols = r() < 0.15 ? subset(r, SYMS, 140) : subset(r, SYMS, 12); const columns = pick(r, COLSETS); return (st) => st.getMarketDailyRange({ from, to, symbols, ...(columns ? { columns } : {}) }); }],
    ["dailyByDate", () => { const d = pick(r, DATES); return (st) => st.getMarketDailyByDate(d); }],
    ["dailyDates", () => (st) => st.getMarketDailyDates()],
    ["bars", () => { const [from, to] = range(r); const s = pick(r, SYMS); return (st) => st.getBars(s, from, to); }],
    ["flowShapes", () => {
      const t = r() < 0.7 ? "market_flow_daily" : "market_volume_profile_daily";
      const [from, to] = range(r);
      const shapes = [
        { eq: { trading_date: pick(r, DATES) }, select: "symbol,trading_date,features" },
        { in: { trading_date: subset(r, DATES, 6) } },
        { gte: { trading_date: from }, order: "trading_date.asc" },
        { gte: { trading_date: from }, lte: { trading_date: to } },
        { gte: { trading_date: from }, select: t === "market_flow_daily" ? "symbol,trading_date,features" : "symbol,trading_date,poc,bins" },
        { eq: { symbol: pick(r, SYMS) }, order: "trading_date.desc" },
        { in: { symbol: subset(r, SYMS, 5) }, gte: { trading_date: from } },
      ];
      const q = pick(r, shapes);
      return (st) => st.selectRows(t, q);
    }],
    ["ledger", () => { const q = pick(r, [{ select: "symbol,signal_date,signal,direction,regime" }, { eq: { symbol: pick(r, SYMS) } }, { order: "score.desc", limit: 5 }, { order: "regime.asc" }]); return (st) => st.selectRows("market_signal_ledger", q); }],
    ["adjusted", () => { const s = pick(r, SYMS.slice(0, 25)); return (st) => st.selectRows("market_adjusted_series", { eq: { symbol: s }, limit: 1 }); }],
    ["kv", () => (st) => st.getKv("doc")],
    ["fund", () => { const t = subset(r, SYMS.slice(0, 60), 8); return (st) => st.getFundamentals(t); }],
  ];
}

function writes(r) {
  const newDate = () => (r() < 0.5 ? pick(r, DATES.slice(0, 40)) : pick(r, DATES.slice(40)));
  const dailyRow = (s, d) => { const c = Math.round((10 + r() * 90) * 100) / 100; return { symbol: s, date: d, exchange: "HNX", open: c, high: c, low: c, close: c, closeAdj: c, refPrice: c, ceiling: c + 1, floor: c - 1, volume: 7, value: 8, dealVolume: 0, dealValue: 0, foreignBuyVol: 0, foreignSellVol: 0, foreignBuyVal: 0, foreignSellVal: 0, foreignRoom: null }; };
  return [
    ["upsertDaily", (st) => { const d = newDate(); return st.upsertMarketDaily(subset(r, SYMS, 30).map((s) => dailyRow(s, d))); }],
    ["applyAdj", (st) => st.applyAdjustment(pick(r, SYMS), pick(r, DATES), 0.5 + r())],
    ["upsertBars", (st) => { const s = pick(r, SYMS); return st.upsertBars(s, subset(r, DATES, 4).map((d) => ({ date: d, open: 1, high: 2, low: 0.5, close: r(), volume: 3, value: null })), r() < 0.5 ? "SSI_V3" : "LEGACY"); }],
    ["upsertFlow", (st) => { const d = newDate(); return st.upsertRows("market_flow_daily", [...new Set(subset(r, SYMS, 10))].map((s) => ({ symbol: s, trading_date: d, delta: r(), features: { a: r() } })), "symbol,trading_date"); }],
    ["flowOffCalendar", (st) => st.upsertRows("market_flow_daily", [{ symbol: pick(r, SYMS), trading_date: "2026-07-05", delta: 1, features: {} }], "symbol,trading_date")], // CN: ngoài lịch phiên
    ["upsertProfile", (st) => st.upsertRows("market_volume_profile_daily", [{ symbol: pick(r, SYMS), trading_date: newDate(), poc: r(), bins: [] }], "symbol,trading_date")],
    ["upsertLedger", (st) => st.upsertRows("market_signal_ledger", [{ symbol: pick(r, SYMS), signal_date: pick(r, DATES), signal: "Z", direction: 1, score: r(), regime: null }], "symbol,signal_date,signal")],
    ["deleteLedger", (st) => st.deleteRows("market_signal_ledger", { eq: { signal: "Z" } })],
    ["upsertAdjusted", (st) => st.upsertRows("market_adjusted_series", [{ symbol: pick(r, SYMS.slice(0, 25)), bars: [[pick(r, DATES), r()]], checked_at: "n" }], "symbol")],
    ["setKv", (st) => st.setKv("doc", { v: r() })],
    ["upsertFund", (st) => st.upsertFundamentals([{ ticker: pick(r, SYMS.slice(0, 60)), income: { y: r() }, balance: [], fetchedAt: "g" }])],
  ];
}

test("song sinh: đọc qua kho đệm == đọc thẳng qua 2500 thao tác ngẫu nhiên, khởi động lại, chết trước khi ghi đĩa", async () => {
  const r = rng(20261020);
  const fake = createFakePostgrest();
  seed(fake, r);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wh-"));
  const bytes = { direct: 0, cached: 0 };
  const counted = (who) => async (url, init) => { const res = await fake.fetchImpl(url, init); if (res.status === 200 && (init?.method ?? "GET") === "GET") { const text = await res.clone().text(); bytes[who] += text.length; const tb = url.split("/rest/v1/")[1].split("?")[0]; bytes[`${who}:${tb}`] = (bytes[`${who}:${tb}`] ?? 0) + text.length; } return res; };
  const direct = createSupabaseStore({ fetchImpl: counted("direct"), meter: null });
  const mk = () => createSupabaseStore({ fetchImpl: counted("cached"), meter: null, warehouse: createWarehouse({ dir, ramMb: 1, log: { warn() {} } }) });
  let cached = mk();
  const R = reads(r), W = writes(r);
  let restarts = 0, crashes = 0;
  const counts = {};
  for (let i = 0; i < 2500; i++) {
    const x = r();
    if (x < 0.25) { const [, w] = pick(r, W); await w(cached); continue; }
    if (x < 0.27) { cached.flushWarehouse(); cached = mk(); restarts++; continue; } // khởi động lại sạch
    if (x < 0.28) { cached = mk(); crashes++; continue; } // chết: phân vùng chờ ghi đĩa bị mất, chỉ còn nhật ký
    const [name, make] = pick(r, R);
    const read = make();
    const a = await read(cached), b = await read(direct);
    assert.deepStrictEqual(a, b, `lệch ở thao tác ${i} (${name})`);
    counts[name] = (counts[name] ?? 0) + 1;
  }
  for (const k of ["dailyRange", "dailyByDate", "bars", "flowShapes", "ledger", "adjusted", "kv", "fund"]) assert.ok(counts[k] > 30, k);
  assert.ok(restarts > 10 && crashes > 5);
  // Kịch bản cực đoan (25% thao tác là ghi, RAM 1 MB, chết thường xuyên) chỉ để kiểm ĐÚNG; egress vẫn phải thấp hơn.
  assert.ok(bytes.cached < bytes.direct, JSON.stringify(bytes));
  fs.rmSync(dir, { recursive: true, force: true });
});

test("vận hành thật: 30 phiên (đồng bộ ngày + job đọc cửa sổ dài + deploy mỗi 3 ngày) — đúng và egress < 10% đọc thẳng", async () => {
  const r = rng(7);
  const fake = createFakePostgrest();
  seed(fake, r);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wh-"));
  const bytes = { direct: 0, cached: 0 };
  const counted = (who) => async (url, init) => { const res = await fake.fetchImpl(url, init); if (res.status === 200 && (init?.method ?? "GET") === "GET") bytes[who] += (await res.clone().text()).length; return res; };
  const direct = createSupabaseStore({ fetchImpl: counted("direct"), meter: null });
  const mk = () => createSupabaseStore({ fetchImpl: counted("cached"), meter: null, warehouse: createWarehouse({ dir, ramMb: 64, log: { warn() {} } }) });
  let cached = mk();
  const universe = SYMS.slice(0, 120);
  const days = DATES.slice(40);
  for (let i = 0; i < days.length; i++) {
    const d = days[i];
    // 15:20 đồng bộ phiên (cả universe) + 16:00 dòng tiền ngày mới (ghi qua store có đệm, như Gateway)
    await cached.upsertMarketDaily(universe.map((s) => ({ symbol: s, date: d, exchange: "HOSE", open: 1, high: 1, low: 1, close: 1 + r(), closeAdj: 1, refPrice: 1, ceiling: 1, floor: 1, volume: 1, value: 1, dealVolume: 0, dealValue: 0, foreignBuyVol: 0, foreignSellVol: 0, foreignBuyVal: 0, foreignSellVal: 0, foreignRoom: 0 })));
    await cached.upsertRows("market_flow_daily", universe.map((s) => ({ symbol: s, trading_date: d, delta: r(), features: { a: r() } })), "symbol,trading_date");
    if (r() < 0.2) await cached.applyAdjustment(pick(r, universe), d, 0.9);
    const jobs = [
      (st) => st.getMarketDailyRange({ from: DATES[0], to: d, symbols: universe }), // quét universe 260 phiên
      (st) => st.getMarketDailyRange({ from: DATES[5], to: d, symbols: universe, columns: "symbol,trading_date,close_adj,value" }), // Elite
      (st) => st.getMarketDailyRange({ from: DATES[0], to: d, symbols: universe.slice(0, 10), columns: "symbol,trading_date,close_adj" }), // rủi ro
      (st) => st.selectRows("market_flow_daily", { gte: { trading_date: DATES[0] }, order: "trading_date.asc" }), // nghiên cứu
      (st) => st.selectRows("market_flow_daily", { select: "symbol,trading_date,features", eq: { trading_date: d } }), // bảng Elite
      (st) => st.getMarketDailyByDate(d),
      (st) => st.getMarketDailyDates(),
      ((s) => (st) => st.getBars(s, DATES[0], d))(pick(r, universe)),
    ];
    for (const job of jobs) for (let k = 0; k < 2; k++) assert.deepStrictEqual(await job(cached), await job(direct));
    if (i % 3 === 2) { cached.flushWarehouse(); cached = mk(); } // deploy
  }
  console.log(`egress vận hành: thẳng ${(bytes.direct / 1e6).toFixed(1)} MB, qua đệm ${(bytes.cached / 1e6).toFixed(2)} MB`);
  assert.ok(bytes.cached < bytes.direct * 0.1, JSON.stringify(bytes));
  fs.rmSync(dir, { recursive: true, force: true });
});

test("đọc chạy song song với ghi: lượt đọc bắt đầu TRƯỚC lệnh ghi không được lưu bản cũ vào đệm", async () => {
  let slow = false;
  const gate = [];
  const fake = createFakePostgrest({ delay: async (url, init) => { if (slow && (init?.method ?? "GET") === "GET") await new Promise((res) => gate.push(res)); } });
  seed(fake, rng(3));
  const direct = createSupabaseStore({ fetchImpl: fake.fetchImpl, meter: null });
  const cached = createSupabaseStore({ fetchImpl: fake.fetchImpl, meter: null, warehouse: createWarehouse({ ramMb: 64 }) });
  const d = DATES[10];
  const row = (s, close) => ({ symbol: s, date: d, exchange: "HOSE", open: close, high: close, low: close, close, closeAdj: close, refPrice: close, ceiling: close, floor: close, volume: 1, value: 1, dealVolume: 0, dealValue: 0, foreignBuyVol: 0, foreignSellVol: 0, foreignBuyVal: 0, foreignSellVal: 0, foreignRoom: 0 });
  const cases = [
    ["dailyRange", (st) => st.getMarketDailyRange({ from: DATES[0], to: DATES[20], symbols: SYMS.slice(0, 5) }), (st) => st.upsertMarketDaily([row(SYMS[0], 999)])],
    ["byDate", (st) => st.getMarketDailyByDate(d), (st) => st.upsertMarketDaily([row(SYMS[1], 555)])],
    ["bars", (st) => st.getBars(SYMS[2], DATES[0], DATES[20]), (st) => st.upsertBars(SYMS[2], [{ date: d, open: 9, high: 9, low: 9, close: 9, volume: 9, value: 9 }], "SSI_V3")],
    ["flowRange", (st) => st.selectRows("market_flow_daily", { gte: { trading_date: DATES[0] } }), (st) => st.upsertRows("market_flow_daily", [{ symbol: SYMS[3], trading_date: d, delta: 42, features: {} }], "symbol,trading_date")],
    ["ledger", (st) => st.selectRows("market_signal_ledger", {}), (st) => st.upsertRows("market_signal_ledger", [{ symbol: SYMS[4], signal_date: d, signal: "W", direction: 1, score: 1, regime: null }], "symbol,signal_date,signal")],
    ["adjust", (st) => st.getMarketDailyRange({ from: DATES[0], to: DATES[20], symbols: [SYMS[5]] }), (st) => st.applyAdjustment(SYMS[5], DATES[20], 0.5)],
  ];
  for (const [name, read, write] of cases) {
    slow = true;
    const pending = read(cached); // đọc bị treo ở fetch
    await new Promise((res) => setTimeout(res, 5));
    slow = false;
    const w = write(cached); // ghi hoàn tất trong khi lượt đọc còn treo
    await w;
    while (gate.length) gate.shift()();
    await pending;
    assert.deepStrictEqual(await read(cached), await read(direct), name);
  }
});

test("đọc bắt đầu khi lệnh ghi còn đang chạy (Supabase chưa áp dụng): bản cũ không được lưu vào đệm", async () => {
  let holdWrites = false;
  const gate = [];
  const fake = createFakePostgrest({ delay: async (url, init) => { if (holdWrites && init?.method === "POST") await new Promise((res) => gate.push(res)); } });
  seed(fake, rng(5));
  const direct = createSupabaseStore({ fetchImpl: fake.fetchImpl, meter: null });
  const cached = createSupabaseStore({ fetchImpl: fake.fetchImpl, meter: null, warehouse: createWarehouse({ ramMb: 64 }) });
  const d = DATES[12];
  const row = (s, close) => ({ symbol: s, date: d, exchange: "HOSE", open: close, high: close, low: close, close, closeAdj: close, refPrice: close, ceiling: close, floor: close, volume: 1, value: 1, dealVolume: 0, dealValue: 0, foreignBuyVol: 0, foreignSellVol: 0, foreignBuyVal: 0, foreignSellVal: 0, foreignRoom: 0 });
  const cases = [
    ["dailyRange", (st) => st.getMarketDailyRange({ from: DATES[0], to: DATES[20], symbols: SYMS.slice(0, 5) }), (st) => st.upsertMarketDaily([row(SYMS[0], 999)])],
    ["byDate", (st) => st.getMarketDailyByDate(d), (st) => st.upsertMarketDaily([row(SYMS[1], 555)])],
    ["dates", (st) => st.getMarketDailyDates(), (st) => st.upsertMarketDaily([{ ...row(SYMS[1], 1), date: "2026-09-30" }])],
    ["bars", (st) => st.getBars(SYMS[2], DATES[0], DATES[20]), (st) => st.upsertBars(SYMS[2], [{ date: d, open: 9, high: 9, low: 9, close: 9, volume: 9, value: 9 }], "SSI_V3")],
    ["flowRange", (st) => st.selectRows("market_flow_daily", { gte: { trading_date: DATES[0] } }), (st) => st.upsertRows("market_flow_daily", [{ symbol: SYMS[3], trading_date: d, delta: 42, features: {} }], "symbol,trading_date")],
    ["flowEq", (st) => st.selectRows("market_flow_daily", { eq: { symbol: SYMS[3] } }), (st) => st.upsertRows("market_flow_daily", [{ symbol: SYMS[3], trading_date: d, delta: 43, features: {} }], "symbol,trading_date")],
    ["ledger", (st) => st.selectRows("market_signal_ledger", {}), (st) => st.upsertRows("market_signal_ledger", [{ symbol: SYMS[4], signal_date: d, signal: "W", direction: 1, score: 1, regime: null }], "symbol,signal_date,signal")],
    ["kv", (st) => st.getKv("doc"), (st) => st.setKv("doc", { v: 77 })],
    ["fund", (st) => st.getFundamentals([SYMS[6]]), (st) => st.upsertFundamentals([{ ticker: SYMS[6], income: { z: 1 }, balance: [], fetchedAt: "h" }])],
  ];
  for (const [name, read, write] of cases) {
    await read(cached); // có sẵn trong đệm
    holdWrites = true;
    const w = write(cached); // dấu "trước" đã đặt, lệnh ghi bị treo ở Supabase
    await new Promise((res) => setTimeout(res, 5));
    await read(cached); // đọc lúc Supabase CHƯA áp dụng -> nhận bản cũ (đúng lúc đó), không được giữ làm đệm
    holdWrites = false;
    while (gate.length) gate.shift()();
    await w;
    assert.deepStrictEqual(await read(cached), await read(direct), name);
  }
});
