// Không bao giờ gửi cảnh báo Telegram thật khi chạy test.
process.env.MARKET_ALERTS_ENABLED = "false";

import test from "node:test";
import assert from "node:assert/strict";

import { createMarketDataService } from "../src/market/marketDataService.js";
import { createMemoryStore } from "../src/market/store/memoryStore.js";
import { createJobs } from "../src/market/jobs.js";
import { addDays } from "../src/market/util.js";

const NOW = Date.UTC(2026, 9, 1, 9, 0); // 16:00 thứ Năm 01/10/2026 giờ VN, phiên hôm nay đã đóng

function tradingDays(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const wd = new Date(`${d}T00:00:00Z`).getUTCDay();
    if (wd !== 0 && wd !== 6) out.push(d);
  }
  return out;
}

const barsFor = (from, to, close = 100) => tradingDays(from, to).map((date) => ({ date, open: close, high: close, low: close, close, volume: 1, value: null }));

function fakeProvider(source, impl, configured = true) {
  const calls = [];
  const wrapped = {};
  for (const [name, fn] of Object.entries(impl)) {
    wrapped[name] = async (...args) => {
      calls.push([name, ...args]);
      return fn(...args);
    };
  }
  return { source, isConfigured: () => configured, calls, ...wrapped };
}

const networkDown = () => Object.assign(new Error("ECONNRESET"), { statusCode: 502 });

function makeService(providers, { hub } = {}) {
  const store = createMemoryStore();
  const service = createMarketDataService({ providers, store, now: () => NOW });
  if (hub) service.hub = hub;
  return { service, store };
}

test("service: OHLCV lấy từ SSI, ghi kho, lần sau đọc kho không gọi lại SSI", async () => {
  const ssi = fakeProvider("SSI_FC_V2", { getDailyOhlcv: async (s, from, to) => barsFor(from, to, 30000) });
  const { service, store } = makeService({ ssiFcV2: ssi });

  const first = await service.getOhlcv({ ticker: "fpt", range: "3mo" });
  assert.equal(first.symbol, "FPT");
  assert.equal(first.provenance.source, "SSI_FC_V2");
  assert.equal(first.provenance.isStale, false);
  assert.equal(first.bars.at(-1).date, "2026-10-01");
  assert.deepEqual(Object.keys(first.bars[0]).sort(), ["close", "date", "high", "low", "open", "value", "volume"]);
  assert.equal((await store.coverage("FPT")).last, "2026-10-01");

  service.cache.clear();
  const second = await service.getOhlcv({ ticker: "FPT", range: "3mo" });
  assert.equal(ssi.calls.length, 1, "lần 2 đọc từ kho");
  assert.equal(second.bars.length, first.bars.length);
});

test("service: chỉ thiếu phần đuôi thì chỉ lấy thêm vài ngày cuối", async () => {
  const ssi = fakeProvider("SSI_FC_V2", { getDailyOhlcv: async (s, from, to) => barsFor(from, to) });
  const { service, store } = makeService({ ssiFcV2: ssi });
  await store.upsertBars("HPG", barsFor("2026-06-01", "2026-09-25"), "SSI_FC_V2");
  await service.getOhlcv({ symbol: "HPG", from: "2026-06-01", to: "2026-10-01" });
  assert.equal(ssi.calls.length, 1);
  assert.equal(ssi.calls[0][2], "2026-09-22", "bắt đầu từ 3 ngày trước nến cuối trong kho");
});

test("service: SSI lỗi -> trả dữ liệu dự phòng có nhãn LEGACY; mã chỉ số đi đúng dataset", async () => {
  const ssi = fakeProvider("SSI_FC_V2", {
    getDailyOhlcv: async () => { throw networkDown(); },
    getIndexDaily: async (s, from, to) => barsFor(from, to, 1280),
  });
  const legacy = fakeProvider("LEGACY", { getDailyOhlcv: async (s, from, to) => barsFor(from, to, 99) });
  const { service } = makeService({ ssiFcV2: ssi, legacy });

  const stock = await service.getOhlcv({ symbol: "VNM", range: "1mo" });
  assert.equal(stock.provenance.source, "LEGACY");
  assert.equal(stock.provenance.fallbackReason, "NETWORK");

  const index = await service.getOhlcv({ symbol: "VNINDEX", range: "1mo" });
  assert.equal(index.provenance.source, "SSI_FC_V2");
  assert.equal(index.bars.at(-1).close, 1280);
});

test("service: dữ liệu thiếu phiên gần nhất bị đánh dấu isStale", async () => {
  const ssi = fakeProvider("SSI_FC_V2", { getDailyOhlcv: async (s, from) => barsFor(from, "2026-09-28") });
  const { service } = makeService({ ssiFcV2: ssi });
  const r = await service.getOhlcv({ symbol: "MWG", range: "1mo" });
  assert.equal(r.provenance.asOf, "2026-09-28");
  assert.equal(r.provenance.isStale, true);
});

test("service: tham số sai trả 400 và không gọi nguồn nào", async () => {
  const ssi = fakeProvider("SSI_FC_V2", { getDailyOhlcv: async () => [] });
  const { service } = makeService({ ssiFcV2: ssi });
  await assert.rejects(service.getOhlcv({ symbol: "BAD SYMBOL" }), (e) => e.statusCode === 400);
  await assert.rejects(service.getOhlcv({ symbol: "FPT", range: "7w" }), (e) => e.statusCode === 400);
  await assert.rejects(service.getOhlcv({ symbol: "FPT", from: "2026-10-05", to: "2026-10-01" }), (e) => e.statusCode === 400);
  assert.equal(ssi.calls.length, 0);
});

test("service: giá điều chỉnh không có nguồn hỗ trợ -> trả giá gốc và báo ADJUSTED_UNAVAILABLE", async () => {
  const legacy = fakeProvider("LEGACY", { getDailyOhlcv: async (s, from, to) => barsFor(from, to) });
  const { service } = makeService({ legacy });
  const r = await service.getOhlcv({ symbol: "FPT", range: "1mo", adjusted: "true" });
  assert.equal(r.adjusted, false);
  assert.equal(r.provenance.fallbackReason, "ADJUSTED_UNAVAILABLE");
});

test("service: quote ưu tiên SSI stream còn mới, mã còn lại lấy qua chuỗi nguồn", async () => {
  const hub = {
    getFreshStreamQuote: (s) => (s === "HPG" ? { symbol: "HPG", price: 28500, provenance: { source: "SSI_STREAM" } } : null),
    getFreshIndex: () => null,
  };
  const v3 = fakeProvider("SSI_V3", { getQuotes: async (symbols) => symbols.map((symbol) => ({ symbol, price: 1, time: "2026-10-01T15:00:00+07:00" })) });
  const { service } = makeService({ ssiV3: v3 }, { hub });
  const r = await service.getQuotes(["hpg", "fpt"]);
  assert.equal(r.quotes.HPG.provenance.source, "SSI_STREAM");
  assert.equal(r.quotes.FPT.provenance.source, "SSI_V3");
  assert.deepEqual(v3.calls[0][1], ["FPT"]);
  assert.deepEqual(r.missing, []);
});

test("service: universe lấy thành phần chỉ số từ SSI, bổ sung ngành từ nguồn cũ khi SSI thiếu", async () => {
  const ssi = fakeProvider("SSI_FC_V2", {
    getIndexComponents: async (code) => (code === "VN30" ? ["FPT", "HPG"] : ["FPT", "HPG", "DGC"]),
    getSecurities: async () => [{ symbol: "FPT", exchange: "HOSE", name: "FPT Corp", sector: null }],
  });
  const legacy = fakeProvider("LEGACY", { getSecurities: async () => [{ symbol: "FPT", sector: "Công nghệ" }, { symbol: "HPG", sector: "Thép" }] });
  const { service } = makeService({ ssiFcV2: ssi, legacy });
  const r = await service.getUniverse();
  assert.deepEqual(r.tickers.map((t) => [t.ticker, t.sector]), [["DGC", "Khác"], ["FPT", "Công nghệ"], ["HPG", "Thép"]]);
  assert.equal(r.tickers.find((t) => t.ticker === "FPT").name, "FPT Corp");
  assert.equal(r.provenance.source, "SSI_FC_V2");
});

test("service: độ rộng thị trường tương thích định dạng { advancers, decliners } cũ", async () => {
  const ssi = fakeProvider("SSI_FC_V2", { getIndexSnapshot: async () => ({ code: "VNINDEX", value: 1280, advances: 210, declines: 140, noChanges: 50 }) });
  const { service } = makeService({ ssiFcV2: ssi });
  const r = await service.getBreadth();
  assert.equal(r.advancers, 210);
  assert.equal(r.decliners, 140);
  assert.equal(r.provenance.source, "SSI_FC_V2");
});

test("jobs.reconcile: nến dự phòng được thay bằng nến SSI khi SSI hoạt động lại, phát hiện lệch giá", async () => {
  let ssiUp = false;
  const ssi = fakeProvider("SSI_FC_V2", {
    getDailyOhlcv: async (s, from, to) => {
      if (!ssiUp) throw networkDown();
      return barsFor(from, to, 100);
    },
  });
  const legacy = fakeProvider("LEGACY", { getDailyOhlcv: async (s, from, to) => barsFor(from, to, 105) });
  const { service, store } = makeService({ ssiFcV2: ssi, legacy });
  await service.getOhlcv({ symbol: "FPT", range: "1mo" });
  assert.ok((await store.listNonSsiBars("2026-01-01")).length > 0);

  ssiUp = true;
  const jobs = createJobs(service, { now: () => NOW, pauseMs: 0 });
  const result = await jobs.reconcile();
  assert.equal((await store.listNonSsiBars("2026-01-01")).length, 0, "không còn nến dự phòng trong 60 ngày");
  assert.ok(result.healed > 0);
  assert.ok(result.deviations.length > 0 && result.deviations[0].diffPct > 4);
  const bars = await store.getBars("FPT", "2026-09-01", "2026-10-01");
  assert.ok(bars.every((b) => b.source === "SSI_FC_V2" && b.close === 100));
});

test("jobs.backfill: bổ sung lịch sử cho mã chưa có trong kho, bỏ qua mã đã đủ", async () => {
  process.env.MARKET_BACKFILL_YEARS = "1";
  process.env.MARKET_STREAM_INDICES = "VNINDEX";
  try {
    const ssi = fakeProvider("SSI_FC_V2", {
      getIndexComponents: async () => ["FPT", "HPG"],
      getSecurities: async () => [],
      getDailyOhlcv: async (s, from, to) => barsFor(from, to),
      getIndexDaily: async (s, from, to) => barsFor(from, to, 1280),
    });
    const { service, store } = makeService({ ssiFcV2: ssi });
    await store.upsertBars("HPG", barsFor("2025-09-01", "2026-10-01"), "SSI_FC_V2");
    const jobs = createJobs(service, { now: () => NOW, pauseMs: 0 });
    const r = await jobs.backfill();
    assert.deepEqual(r.done.map((d) => d.symbol).sort(), ["FPT", "VNINDEX"]);
    assert.ok((await store.coverage("FPT")).count > 240);
  } finally {
    delete process.env.MARKET_BACKFILL_YEARS;
    delete process.env.MARKET_STREAM_INDICES;
  }
});

test("service: nến chỉ số SSI chỉ có giá đóng cửa -> bổ sung open/high/low từ nguồn cũ khi giá đóng cửa khớp", async () => {
  const ssi = fakeProvider("SSI_FC_V2", {
    getIndexDaily: async (s, from, to) => barsFor(from, to, 1749.3).map((b) => ({ ...b, closeOnly: true })),
  });
  const legacy = fakeProvider("LEGACY", {
    getIndexDaily: async (s, from, to) => barsFor(from, to).map((b) => ({ ...b, open: 1760, high: 1765, low: 1745, close: b.date === "2026-10-01" ? 1700 : 1749 })),
  });
  const { service } = makeService({ ssiFcV2: ssi, legacy });
  const r = await service.getOhlcv({ symbol: "VNINDEX", range: "1mo" });
  const last = r.bars.at(-1);
  const prev = r.bars.at(-2);
  assert.equal(r.provenance.source, "SSI_FC_V2");
  assert.deepEqual([prev.open, prev.high, prev.low, prev.close], [1760, 1765, 1745, 1749.3], "close vẫn của SSI");
  assert.deepEqual([last.open, last.high, last.low, last.close], [1749.3, 1749.3, 1749.3, 1749.3], "lệch >1% thì không bổ sung");
  assert.ok(r.bars.every((b) => !("closeOnly" in b)));
});
