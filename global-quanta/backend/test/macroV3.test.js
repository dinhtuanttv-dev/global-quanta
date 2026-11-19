// V3 (19/11/2026) — vận hành: báo cáo nạp bền, sao lưu kho vĩ mô, IP thật cho giới hạn tần suất, nến chỉ số close 0.
process.env.MARKET_ALERTS_ENABLED = "false";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createMacroService, MACRO_REFRESH_KV_KEY } from "../src/market/macro/macroService.js";
import { clientIp, createRateLimiter } from "../src/routes/macro.js";
import { LEDGER_BACKUP_PREFIXES } from "../src/market/ledgerBackup.js";
import { createMemoryStore } from "../src/market/store/memoryStore.js";
import { createMarketDataService } from "../src/market/marketDataService.js";

const T = Date.parse("2026-11-19T03:00:00Z");

test("báo cáo lần nạp gần nhất: lưu bền vào kho, đọc lại sau khởi động, có nguồn lỗi; không gọi lại nguồn ngoài khi còn mới", async () => {
  const store = createMemoryStore();
  let calls = 0;
  const globalFeeds = async () => { calls++; return { observations: [{ seriesId: "FED", period: "2026-10", value: 3.88, asOf: "2026-11-01", source: "FRED:FEDFUNDS" }], report: { FED: { months: 1, last: "2026-10" }, OIL: { error: "HTTP 503" } } }; };
  const a = createMacroService({ store, history: null, globalFeeds, inline: true, now: () => T, log: { warn() {} } });
  await a.refreshAutoFeeds({ force: true });
  const saved = (await store.getKv(MACRO_REFRESH_KV_KEY)).value;
  assert.equal(saved.at, new Date(T).toISOString());
  assert.deepEqual(saved.failed, ["OIL"]);
  assert.deepEqual(saved.feeds.FED, { months: 1, last: "2026-10" });
  assert.equal((await a.source()).lastRefresh.added, 1);
  a.close();
  // khởi động lại 2 giờ sau: đọc báo cáo cũ, KHÔNG nạp lại (còn mới < 12 giờ)
  const b = createMacroService({ store, history: null, globalFeeds, inline: true, now: () => T + 2 * 3600_000, log: { warn() {} } });
  assert.deepEqual(await b.refreshAutoFeeds(), { skipped: "fresh" });
  assert.equal(calls, 1);
  assert.equal((await b.source()).lastRefresh.at, saved.at);
  b.close();
});

test("sao lưu ra ngoài Railway có kho vĩ mô (số nạp CSV + vintage không tải lại được)", () => {
  assert.ok(LEDGER_BACKUP_PREFIXES.includes("macro:"));
});

test("giới hạn tần suất theo X-Real-IP (Railway đặt lại): đổi X-Forwarded-For không vượt được; hai người dùng khác nhau không chung hạn mức", () => {
  assert.equal(clientIp({ headers: { "x-real-ip": "14.180.11.5", "x-forwarded-for": "6.6.6.6, 79.127.228.3" } }), "14.180.11.5");
  assert.equal(clientIp({ headers: {}, ip: "10.0.0.1" }), "10.0.0.1");
  const rl = createRateLimiter({ limit: 2, now: () => T });
  const statuses = [];
  for (const fake of ["1.1.1.1", "2.2.2.2", "3.3.3.3"]) {
    const req = { headers: { "x-real-ip": "14.180.11.5", "x-forwarded-for": `${fake}, 79.127.228.3` }, get: () => "" };
    const res = { set() { return res; }, status(c) { statuses.push(c); return res; }, json() { return res; } };
    let passed = false;
    rl(req, res, () => { passed = true; });
    if (passed) statuses.push(200);
  }
  assert.deepEqual(statuses, [200, 200, 429]);
  // người dùng khác, cùng máy biên Railway -> hạn mức riêng
  let other = false;
  rl({ headers: { "x-real-ip": "113.161.2.7", "x-forwarded-for": "113.161.2.7, 79.127.228.3" } }, { set() { return this; }, status() { return this; }, json() { return this; } }, () => { other = true; });
  assert.equal(other, true);
});

test("nến chỉ số close <= 0 (SSI trả phiên đang diễn ra với giá 0) bị bỏ và ghi provenance.droppedInvalid; cổ phiếu không bị lọc", async () => {
  const NOW = Date.UTC(2026, 9, 1, 9, 0);
  const days = ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01"];
  const ssi = { source: "SSI_FC_V2", isConfigured: () => true, getIndexDaily: async () => days.map((date, i) => ({ date, open: 0, high: 0, low: 0, close: i === 3 ? 0 : 1700 + i, volume: 1 })) };
  const service = createMarketDataService({ providers: { ssiFcV2: ssi }, store: createMemoryStore(), now: () => NOW });
  const r = await service.getOhlcv({ symbol: "VNSI", range: "1mo" });
  assert.deepEqual(r.bars.map((b) => b.close), [1700, 1701, 1702]);
  assert.equal(r.provenance.droppedInvalid, 1);
});
