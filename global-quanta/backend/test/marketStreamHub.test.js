import test from "node:test";
import assert from "node:assert/strict";

import { StreamHub } from "../src/market/stream/streamHub.js";

const IN_SESSION = Date.UTC(2026, 9, 1, 3, 0); // 10:00 thứ Năm giờ VN
const AFTER_CLOSE = Date.UTC(2026, 9, 1, 13, 0); // 20:00

function setup({ start = IN_SESSION, upstream = true, fallback } = {}) {
  let t = start;
  const connections = [];
  const polls = [];
  const hub = new StreamHub({
    now: () => t,
    monitorIntervalMs: 60_000,
    upstreamEnabled: () => upstream,
    createConnection: (opts) => {
      const conn = {
        channel: opts.channel, started: false, stopped: false, opts,
        start() { this.started = true; },
        stop() { this.stopped = true; },
        setChannel(channel) { this.channel = channel; },
      };
      connections.push(conn);
      return conn;
    },
    fetchFallbackQuotes: async (symbols) => {
      polls.push(symbols);
      if (fallback) return fallback(symbols);
      return { quotes: symbols.map((symbol) => ({ symbol, price: 1000, bid: [], ask: [] })), source: "LEGACY", fallbackReason: "NETWORK" };
    },
  });
  const events = [];
  const subscribe = (symbols, extra = {}) => hub.subscribe({ symbols, send: (event, data) => events.push({ event, data }), ...extra });
  return {
    hub, connections, polls, events, subscribe,
    advance: (ms) => { t += ms; },
    xShards: () => connections.filter((c) => !c.stopped && c.channel.startsWith("X:")),
    connectIndex: () => connections.find((c) => c.opts.channel.startsWith("MI:"))?.opts.onStatus("connected"),
    lastStatus: () => events.filter((e) => e.event === "status").at(-1)?.data,
    tick: (symbol, price, extra = {}) => ({ DataType: "X", Content: { Symbol: symbol, LastPrice: price, RefPrice: 1000, TradingDate: "01/10/2026", Time: "10:00:00", ...extra } }),
  };
}

const symbolsN = (n) => Array.from({ length: n }, (_, i) => `M${String(i).padStart(3, "0")}`);

test("stream: 120 mã được chia thành 3 kết nối SSI, mỗi kết nối tối đa 50 mã, cộng 1 kết nối chỉ số", async () => {
  const s = setup();
  s.subscribe(symbolsN(120));
  const shards = s.xShards();
  assert.equal(shards.length, 3);
  for (const shard of shards) assert.ok(shard.channel.slice(2).split("-").length <= 50);
  const all = shards.flatMap((c) => c.channel.slice(2).split("-"));
  assert.equal(new Set(all).size, 120);
  const mi = s.connections.find((c) => c.opts.channel.startsWith("MI:"));
  assert.ok(mi, "có kết nối MI cho chỉ số");
  assert.match(mi.opts.channel, /HNXIndex/);
  s.hub.shutdown();
});

test("stream: huỷ đăng ký chỉ ảnh hưởng shard chứa mã đó, shard rỗng bị đóng", async () => {
  const s = setup();
  const offA = s.subscribe(symbolsN(50));
  const offB = s.subscribe(["ZZZ"]);
  assert.equal(s.xShards().length, 2);
  const firstChannel = s.xShards()[0].channel;
  offB();
  assert.equal(s.xShards().length, 1);
  assert.equal(s.xShards()[0].channel, firstChannel, "shard của các mã còn lại không bị đổi channel");
  offA();
  assert.equal(s.xShards().length, 0);
  s.hub.shutdown();
});

test("stream: socket mở nhưng chưa có tick thì KHÔNG báo LIVE; có tick SSI mới báo LIVE", async () => {
  const s = setup();
  s.subscribe(["HPG"]);
  const shard = s.xShards()[0];
  shard.opts.onStatus("connected");
  s.connectIndex();
  await s.hub.tick();
  assert.deepEqual(s.lastStatus().live, []);
  assert.equal(s.lastStatus().transport, "connected");
  assert.deepEqual(s.lastStatus().fallback, ["HPG"], "giá ban đầu lấy từ snapshot dự phòng");

  shard.opts.onMessage(s.tick("HPG", 28500));
  assert.deepEqual(s.lastStatus().live, ["HPG"]);
  const quote = s.events.filter((e) => e.event === "quote").at(-1).data;
  assert.equal(quote.price, 28500);
  assert.equal(quote.provenance.source, "SSI_STREAM");
  s.hub.shutdown();
});

test("stream: shard im lặng quá ngưỡng trong phiên -> poll nguồn dự phòng và báo FALLBACK; có tick lại -> LIVE", async () => {
  const s = setup();
  s.subscribe(["HPG", "SSI"]);
  const shard = s.xShards()[0];
  shard.opts.onStatus("connected");
  shard.opts.onMessage(s.tick("HPG", 28500));
  shard.opts.onMessage(s.tick("SSI", 30000));
  await s.hub.tick();
  const pollsBefore = s.polls.length;

  s.advance(61_000); // > MARKET_STALE_MS mặc định 60s
  await s.hub.tick();
  assert.equal(s.polls.length, pollsBefore + 1);
  assert.deepEqual(s.polls.at(-1).sort(), ["HPG", "SSI"]);
  assert.deepEqual(s.lastStatus().fallback.sort(), ["HPG", "SSI"]);
  const q = s.events.filter((e) => e.event === "quote").at(-1).data;
  assert.equal(q.provenance.source, "LEGACY");
  assert.equal(q.provenance.fallbackReason, "NETWORK");

  shard.opts.onMessage(s.tick("HPG", 28600));
  assert.ok(s.lastStatus().live.includes("HPG"));
  s.hub.shutdown();
});

test("stream: mất kết nối SSI -> transport down + giá dự phòng; nối lại -> connected", async () => {
  const s = setup();
  s.subscribe(["HPG"]);
  const shard = s.xShards()[0];
  shard.opts.onStatus("connected");
  s.connectIndex();
  shard.opts.onMessage(s.tick("HPG", 28500));
  shard.opts.onStatus("down");
  s.advance(16_000);
  await s.hub.tick();
  assert.equal(s.lastStatus().transport, "degraded"); // shard X mất, MI còn
  assert.deepEqual(s.lastStatus().fallback, ["HPG"]);
  shard.opts.onStatus("connected");
  shard.opts.onMessage(s.tick("HPG", 28700));
  assert.deepEqual(s.lastStatus().live, ["HPG"]);
  assert.equal(s.lastStatus().transport, "connected");
  s.hub.shutdown();
});

test("stream: ngoài giờ giao dịch chỉ lấy snapshot một lần, không poll liên tục, trạng thái CLOSED", async () => {
  const s = setup({ start: AFTER_CLOSE, upstream: false });
  s.subscribe(["HPG"]);
  await s.hub.tick();
  assert.equal(s.polls.length, 1);
  s.advance(5 * 60_000);
  await s.hub.tick();
  assert.equal(s.polls.length, 1);
  assert.equal(s.lastStatus().session, "CLOSED");
  assert.deepEqual(s.lastStatus().closed, ["HPG"]);
  assert.equal(s.lastStatus().transport, "disabled");
  s.hub.shutdown();
});

test("stream: bản tin F/B (không có giá) không tạo quote LIVE giả", async () => {
  const s = setup();
  s.subscribe(["HPG"], {});
  const shard = s.xShards()[0];
  shard.opts.onStatus("connected");
  shard.opts.onMessage({ DataType: "F", Content: { Symbol: "HPG", TradingSession: "LO" } });
  assert.deepEqual(s.lastStatus().live, []);
  s.hub.shutdown();
});

test("stream: subscriber kiểu cũ (raw) nhận payload SSI gốc và status { connected }", async () => {
  const s = setup();
  s.subscribe(["HPG"], { raw: true });
  const shard = s.xShards()[0];
  shard.opts.onStatus("connected");
  const msg = s.tick("HPG", 28500);
  shard.opts.onMessage(msg);
  const quotes = s.events.filter((e) => e.event === "quote");
  assert.equal(quotes.at(-1).data, msg);
  assert.deepEqual(Object.keys(s.lastStatus()), ["connected"]);
  s.hub.shutdown();
});

test("stream: từ chối mã không hợp lệ và vượt giới hạn tổng số mã", () => {
  const s = setup();
  assert.throws(() => s.subscribe(["BAD SYMBOL"]), /không hợp lệ/);
  process.env.MARKET_STREAM_MAX_SYMBOLS = "10";
  try {
    assert.throws(() => s.subscribe(symbolsN(11)), (e) => e.statusCode === 429);
  } finally {
    delete process.env.MARKET_STREAM_MAX_SYMBOLS;
    s.hub.shutdown();
  }
});

test("stream: Lee–Ready — phân loại mua/bán chủ động theo bước giá TRƯỚC lệnh, gom theo phút", async () => {
  const s = setup();
  s.subscribe(["HPG"]);
  const shard = s.xShards()[0];
  shard.opts.onStatus("connected");
  const x = (t, last, totalVol, bid, ask) => ({ DataType: "X", Content: { Symbol: "HPG", LastPrice: last, TotalVol: totalVol, BidPrice1: bid, BidVol1: 1000, AskPrice1: ask, AskVol1: 1000, RefPrice: 20000, TradingDate: "01/10/2026", Time: t } });
  shard.opts.onMessage(x("10:00:00", 20000, 10_000, 19950, 20000));
  shard.opts.onMessage(x("10:00:05", 20000, 12_000, 19950, 20000)); // khớp = ask trước đó -> mua 2.000
  shard.opts.onMessage(x("10:00:09", 19950, 15_000, 19950, 20000)); // khớp = bid -> bán 3.000
  shard.opts.onMessage(x("10:01:02", 19975, 15_500, 19950, 20000)); // giữa bid/ask, giá tăng -> mua 500 (tick rule)
  shard.opts.onMessage(x("10:01:03", 19975, 15_500, 19950, 20000)); // không có KL mới -> bỏ qua
  const flow = s.hub.getTickFlow("hpg");
  assert.equal(flow.date, "2026-10-01");
  assert.deepEqual(flow.minutes.map((m) => [m.minute, m.buy, m.sell, m.prints]), [[600, 2000, 3000, 2], [601, 500, 0, 1]]);
  assert.equal(flow.classifiedVolume, 5500);
  assert.equal(s.hub.getTickFlow("FPT"), null);
  s.hub.shutdown();
});

test("stream: drainTickFlow trả các phút đã đổi (bản đầy đủ của phút), lần sau chỉ phút mới; markTickFlowDirty ghi lại", async () => {
  const s = setup();
  s.subscribe(["HPG"]);
  const shard = s.xShards()[0];
  shard.opts.onStatus("connected");
  const x = (t, last, totalVol) => ({ DataType: "X", Content: { Symbol: "HPG", LastPrice: last, TotalVol: totalVol, BidPrice1: 19950, BidVol1: 1000, AskPrice1: 20000, AskVol1: 1000, RefPrice: 20000, TradingDate: "01/10/2026", Time: t } });
  shard.opts.onMessage(x("10:00:00", 20000, 10_000));
  shard.opts.onMessage(x("10:00:05", 20000, 12_000));
  const first = s.hub.drainTickFlow();
  assert.deepEqual(first.map((r) => [r.symbol, r.date, r.minute, r.buy, r.sell, r.prints]), [["HPG", "2026-10-01", 600, 2000, 0, 1]]);
  assert.deepEqual(s.hub.drainTickFlow(), [], "không có thay đổi -> không ghi lại");
  shard.opts.onMessage(x("10:00:30", 19950, 13_000));
  shard.opts.onMessage(x("10:01:00", 20000, 14_000));
  const second = s.hub.drainTickFlow();
  assert.deepEqual(second.map((r) => [r.minute, r.buy, r.sell, r.prints]), [[600, 2000, 1000, 2], [601, 1000, 0, 1]], "phút 600 gửi lại bản cộng dồn");
  s.hub.markTickFlowDirty(second);
  assert.equal(s.hub.drainTickFlow().length, 2);
  s.hub.markTickFlowDirty([{ symbol: "HPG", date: "2026-09-30", minute: 600 }]);
  assert.deepEqual(s.hub.drainTickFlow(), [], "phiên cũ không đánh dấu lại");
  s.hub.shutdown();
});
