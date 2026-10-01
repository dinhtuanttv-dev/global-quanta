import test from "node:test";
import assert from "node:assert/strict";

import {
  canonicalSymbol, isIndexSymbol, normalizeBars, normalizeIndexSnapshot, normalizeQuote, toIsoDate, toSsiV2Date,
} from "../src/market/normalizer.js";
import { CircuitBreaker, BreakerState } from "../src/market/circuitBreaker.js";
import { SourceRouter } from "../src/market/sourceRouter.js";
import { classifyError, fallbackReason, UnsupportedError, ValidationError } from "../src/market/errors.js";
import { currentSession, expectsLiveTicks, lastCompletedSessionDate } from "../src/market/calendar.js";
import { createMemoryStore, shouldReplace } from "../src/market/store/memoryStore.js";
import { dateWindows } from "../src/market/util.js";

// 2026-10-01 là thứ Năm. Giờ VN = UTC+7.
const vnTime = (h, m = 0, day = 1) => new Date(Date.UTC(2026, 9, day, h - 7, m));

// ---------- normalizer ----------

test("normalizer: ngày SSI v2 dd/mm/yyyy và định dạng v3 đều về YYYY-MM-DD", () => {
  assert.equal(toIsoDate("05/09/2026"), "2026-09-05");
  assert.equal(toIsoDate("2026/09/05 00:00:00"), "2026-09-05");
  assert.equal(toIsoDate("2026-09-05T00:00:00"), "2026-09-05");
  assert.equal(toSsiV2Date("2026-09-05"), "05/09/2026");
});

test("normalizer: chỉ số và mã cổ phiếu bắt đầu bằng VN không bị nhầm", () => {
  assert.equal(canonicalSymbol("^vnindex"), "VNINDEX");
  assert.equal(canonicalSymbol("HNX"), "HNXINDEX");
  assert.equal(canonicalSymbol("fpt.vn"), "FPT");
  assert.equal(isIndexSymbol("VN30"), true);
  assert.equal(isIndexSymbol("VNM"), false);
  assert.equal(isIndexSymbol("VND"), false);
});

test("normalizer: nến SSI v2 DailyOhlc được sắp tăng dần và loại trùng", () => {
  const bars = normalizeBars([
    { Symbol: "SSI", TradingDate: "02/09/2026", Open: "30000", High: "31000", Low: "29500", Close: "30500", Volume: "1000", Value: "3e7" },
    { Symbol: "SSI", TradingDate: "01/09/2026", Open: "29000", High: "30000", Low: "28800", Close: "29900", Volume: "900" },
    { Symbol: "SSI", TradingDate: "02/09/2026", Open: "30000", High: "31000", Low: "29500", Close: "30600", Volume: "1100" },
  ]);
  assert.deepEqual(bars.map((b) => [b.date, b.close]), [["2026-09-01", 29900], ["2026-09-02", 30600]]);
  assert.equal(bars[0].value, null);
});

test("normalizer: nến SDK v3 (openPrice/closePrice)", () => {
  const [bar] = normalizeBars([{ symbol: "SSI", tradingDate: "2026/09/02", openPrice: 1, highPrice: 2, lowPrice: 0.5, closePrice: 1.5, volume: 10, value: 15 }]);
  assert.deepEqual(bar, { date: "2026-09-02", open: 1, high: 2, low: 0.5, close: 1.5, volume: 10, value: 15 });
});

test("normalizer: quote từ stream X có 3 bước giá và tính change từ tham chiếu", () => {
  const q = normalizeQuote({
    DataType: "X",
    Content: {
      Symbol: "hpg", Exchange: "HOSE", RefPrice: 28000, Ceiling: 29950, Floor: 26050, LastPrice: 28500,
      BidPrice1: 28450, BidVol1: 1000, AskPrice1: 28500, AskVol1: 500, TotalVol: 123456, TradingDate: "01/10/2026", Time: "10:15:03",
    },
  });
  assert.equal(q.symbol, "HPG");
  assert.equal(q.price, 28500);
  assert.equal(q.change, 500);
  assert.ok(Math.abs(q.changePct - 1.7857) < 0.001);
  assert.deepEqual(q.bid, [{ price: 28450, volume: 1000 }]);
  assert.equal(q.time, "2026-10-01T10:15:03+07:00");
});

test("normalizer: snapshot chỉ số MI và DailyIndex có độ rộng thị trường", () => {
  const mi = normalizeIndexSnapshot({ Content: { IndexId: "VNINDEX", IndexValue: 1285.5, PriorIndexValue: 1280, Advances: 200, Declines: 150 } });
  assert.equal(mi.code, "VNINDEX");
  assert.equal(mi.change, 5.5);
  assert.equal(mi.advances, 200);
  const daily = normalizeIndexSnapshot({ Indexcode: "HNXIndex", IndexValue: "230.1", Change: "-1.2", RatioChange: "-0.5", Advances: "50", Declines: "80", TradingDate: "01/10/2026" });
  assert.equal(daily.code, "HNXINDEX");
  assert.equal(daily.declines, 80);
  assert.equal(daily.date, "2026-10-01");
});

// ---------- lịch giao dịch ----------

test("calendar: phiên giao dịch theo giờ Việt Nam", () => {
  assert.equal(currentSession(vnTime(9, 5)), "ATO");
  assert.equal(currentSession(vnTime(10, 0)), "LO");
  assert.equal(currentSession(vnTime(12, 0)), "BREAK");
  assert.equal(currentSession(vnTime(14, 35)), "ATC");
  assert.equal(currentSession(vnTime(20, 0)), "CLOSED");
  assert.equal(currentSession(vnTime(10, 0, 3)), "CLOSED"); // thứ Bảy
  assert.equal(expectsLiveTicks(vnTime(12, 0)), false);
});

test("calendar: phiên đã đóng gần nhất", () => {
  assert.equal(lastCompletedSessionDate(vnTime(10, 0)), "2026-09-30");
  assert.equal(lastCompletedSessionDate(vnTime(16, 0)), "2026-10-01");
  assert.equal(lastCompletedSessionDate(vnTime(10, 0, 5)), "2026-10-02"); // thứ Hai -> thứ Sáu
});

test("util: chia khoảng ngày theo cửa sổ", () => {
  assert.deepEqual(dateWindows("2026-01-01", "2026-01-25", 10), [
    ["2026-01-01", "2026-01-10"], ["2026-01-11", "2026-01-20"], ["2026-01-21", "2026-01-25"],
  ]);
});

// ---------- phân loại lỗi ----------

test("errors: lỗi tham số không fallback, lỗi mạng/quota/token có fallback", () => {
  assert.equal(classifyError(new ValidationError("x")), "client");
  assert.equal(classifyError(Object.assign(new Error("bad"), { statusCode: 400 })), "client");
  assert.equal(classifyError(Object.assign(new Error("down"), { statusCode: 502 })), "transient");
  assert.equal(classifyError(Object.assign(new Error("slow"), { name: "TimeoutError" })), "transient");
  assert.equal(classifyError(new UnsupportedError("n/a")), "unsupported");
  assert.equal(fallbackReason(Object.assign(new Error("q"), { statusCode: 429 })), "QUOTA");
  assert.equal(fallbackReason(Object.assign(new Error("a"), { statusCode: 401 })), "AUTH");
});

// ---------- circuit breaker ----------

test("circuit breaker: mở sau N lỗi, cần K lần thành công liên tiếp mới đóng (hysteresis)", () => {
  let t = 0;
  const changes = [];
  const b = new CircuitBreaker("ssi", { failureThreshold: 2, windowMs: 1000, cooldownMs: 100, recoverySuccesses: 2, now: () => t, onChange: (e) => changes.push(e.to) });
  b.recordFailure(new Error("1"));
  assert.equal(b.state, BreakerState.CLOSED);
  b.recordFailure(new Error("2"));
  assert.equal(b.state, BreakerState.OPEN);
  assert.equal(b.canRequest(), false);
  t = 150;
  assert.equal(b.canRequest(), true);
  assert.equal(b.state, BreakerState.HALF_OPEN);
  b.recordSuccess();
  assert.equal(b.state, BreakerState.HALF_OPEN, "1 lần thành công chưa đủ để quay lại");
  b.recordSuccess();
  assert.equal(b.state, BreakerState.CLOSED);
  assert.deepEqual(changes, ["OPEN", "HALF_OPEN", "CLOSED"]);
});

test("circuit breaker: thử lại thất bại ở HALF_OPEN thì mở lại với cooldown dài hơn", () => {
  let t = 0;
  const b = new CircuitBreaker("ssi", { failureThreshold: 1, cooldownMs: 100, now: () => t });
  b.recordFailure(new Error("x"));
  t = 100;
  b.canRequest();
  b.recordFailure(new Error("y"));
  assert.equal(b.state, BreakerState.OPEN);
  t = 250;
  assert.equal(b.canRequest(), false, "cooldown đã tăng gấp đôi lên 200ms");
  t = 300;
  assert.equal(b.canRequest(), true);
});

// ---------- source router ----------

function provider(source, impl, configured = true) {
  return { source, isConfigured: () => configured, ...impl };
}

test("router: SSI thành công thì không fallback", async () => {
  const router = new SourceRouter({
    ssiV3: provider("SSI_V3", { getQuotes: async () => ["v3"] }),
    ssiFcV2: provider("SSI_FC_V2", { getQuotes: async () => ["v2"] }),
    legacy: provider("LEGACY", { getQuotes: async () => ["legacy"] }),
  });
  const r = await router.run("quotes", "getQuotes", [["SSI"]]);
  assert.deepEqual(r.data, ["v3"]);
  assert.equal(r.source, "SSI_V3");
  assert.equal(r.fallbackReason, null);
});

test("router: provider chưa cấu hình bị bỏ qua im lặng (không tính là fallback)", async () => {
  const router = new SourceRouter({
    ssiV3: provider("SSI_V3", { getQuotes: async () => ["v3"] }, false),
    ssiFcV2: provider("SSI_FC_V2", { getQuotes: async () => ["v2"] }),
  });
  const r = await router.run("quotes", "getQuotes", [["SSI"]]);
  assert.equal(r.source, "SSI_FC_V2");
  assert.equal(r.fallbackReason, null);
});

test("router: lỗi mạng của SSI -> fallback kèm lý do; lỗi tham số -> không fallback", async () => {
  const down = Object.assign(new Error("ECONNRESET"), { statusCode: 502 });
  const bad = Object.assign(new Error("pageSize sai"), { statusCode: 400 });
  let legacyCalls = 0;
  const legacy = provider("LEGACY", { getDailyOhlcv: async () => { legacyCalls++; return ["legacy"]; } });

  const r = await new SourceRouter({ ssiV3: provider("SSI_V3", { getDailyOhlcv: async () => { throw down; } }), legacy })
    .run("ohlcvDaily", "getDailyOhlcv", ["SSI"]);
  assert.equal(r.source, "LEGACY");
  assert.equal(r.fallbackReason, "NETWORK");
  assert.equal(r.attempts[0].provider, "ssiV3");

  await assert.rejects(
    new SourceRouter({ ssiV3: provider("SSI_V3", { getDailyOhlcv: async () => { throw bad; } }), legacy })
      .run("ohlcvDaily", "getDailyOhlcv", ["SSI"]),
    /pageSize sai/,
  );
  assert.equal(legacyCalls, 1, "lỗi tham số không được che bằng nguồn dự phòng");
});

test("router: breaker mở thì bỏ qua SSI tới khi hết cooldown", async () => {
  let ssiCalls = 0;
  const router = new SourceRouter({
    ssiFcV2: provider("SSI_FC_V2", { getQuotes: async () => { ssiCalls++; throw Object.assign(new Error("down"), { statusCode: 503 }); } }),
    legacy: provider("LEGACY", { getQuotes: async () => ["legacy"] }),
  });
  for (let i = 0; i < 5; i++) await router.run("quotes", "getQuotes", [[]]);
  assert.equal(ssiCalls, 3, "sau 3 lỗi breaker mở, không gọi SSI nữa");
  const r = await router.run("quotes", "getQuotes", [[]]);
  assert.equal(r.fallbackReason, "CIRCUIT_OPEN");
  assert.deepEqual(router.snapshot().degraded, ["ssiFcV2:quotes"]);
});

test("router: tất cả nguồn lỗi -> 502 kèm danh sách attempts", async () => {
  const router = new SourceRouter({
    ssiFcV2: provider("SSI_FC_V2", { getQuotes: async () => { throw new Error("a"); } }),
    legacy: provider("LEGACY", { getQuotes: async () => { throw new Error("b"); } }),
  });
  await assert.rejects(router.run("quotes", "getQuotes", [[]]), (error) => error.statusCode === 502 && error.attempts.length === 2);
});

// ---------- store ----------

test("store: bản ghi SSI không bị nguồn dự phòng ghi đè, bản ghi dự phòng bị SSI thay thế", async () => {
  assert.equal(shouldReplace("SSI_FC_V2", "LEGACY"), false);
  assert.equal(shouldReplace("LEGACY", "SSI_V3"), true);
  const store = createMemoryStore();
  await store.upsertBars("SSI", [{ date: "2026-09-01", close: 100 }], "SSI_FC_V2");
  await store.upsertBars("SSI", [{ date: "2026-09-01", close: 999 }, { date: "2026-09-02", close: 101 }], "LEGACY");
  let bars = await store.getBars("SSI", "2026-09-01", "2026-09-30");
  assert.deepEqual(bars.map((b) => [b.close, b.source]), [[100, "SSI_FC_V2"], [101, "LEGACY"]]);
  await store.upsertBars("SSI", [{ date: "2026-09-02", close: 102 }], "SSI_V3");
  bars = await store.getBars("SSI", "2026-09-01", "2026-09-30");
  assert.deepEqual(bars.map((b) => b.source), ["SSI_FC_V2", "SSI_V3"]);
  assert.deepEqual(await store.listNonSsiBars("2026-01-01"), []);
});
