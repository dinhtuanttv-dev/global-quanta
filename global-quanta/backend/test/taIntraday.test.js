process.env.MARKET_ALERTS_ENABLED = "false";

import test from "node:test";
import assert from "node:assert/strict";
import { createTaIntraday, factorForDate, prepareIntradayBars } from "../src/market/adjusted/taIntraday.js";
import { TtlCache } from "../src/market/util.js";

const m = (date, close, volume = 1000) => ({ date, open: close, high: close + 100, low: close - 100, close, volume });

test("factorForDate: tích hệ số các đợt GDKHQ SAU ngày đó", () => {
  const actions = [{ date: "2026-09-21", factor: 0.9 }, { date: "2026-09-25", factor: 0.98 }];
  assert.equal(factorForDate("2026-09-18", actions), 0.9 * 0.98);
  assert.equal(factorForDate("2026-09-21", actions), 0.98);
  assert.equal(factorForDate("2026-09-25", actions), 1);
});

test("prepareIntradayBars: điều chỉnh trước ngày GDKHQ, gắn cờ ATO (nến 09:15 đầu phiên) và ATC (14:45)", () => {
  const bars = [
    m("2026-09-18T09:15:40+07:00", 100_000), m("2026-09-18T09:16:40+07:00", 100_500), m("2026-09-18T14:45:00+07:00", 101_000),
    m("2026-09-21T09:15:40+07:00", 91_000), m("2026-09-21T14:45:00+07:00", 91_500),
  ];
  const out = prepareIntradayBars(bars, [{ date: "2026-09-21", factor: 0.9 }]);
  assert.equal(out[0].close, 90_000, "phiên trước GDKHQ nhân 0,9");
  assert.equal(out[3].close, 91_000, "từ ngày GDKHQ giữ nguyên");
  assert.deepEqual(out.map((b) => b.auction ?? null), ["ATO", null, "ATC", "ATO", "ATC"]);
  const idx = prepareIntradayBars(bars, [{ date: "2026-09-21", factor: 0.9 }], { isIndex: true });
  assert.equal(idx[0].close, 100_000, "chỉ số không điều chỉnh");
  assert.equal(idx[0].auction, undefined, "chỉ số không có ATO riêng");
});

test("createTaIntraday: lấy N phiên, ghép sự kiện quyền từ chuỗi TA, trả danh sách phiên", async () => {
  const calls = [];
  const provider = {
    isConfigured: () => true,
    getIntradayRange: async (s, from, to) => { calls.push([s, from, to]); return [m(`${from}T09:20:00+07:00`, 50_000), m(`${to}T10:00:00+07:00`, 51_000)]; },
    getIntradayOhlcv: async () => [],
  };
  const service = { router: { providers: { ssiFcV2: provider } }, cache: new TtlCache({ now: () => 0 }) };
  const taSeries = { get: async () => ({ priceBasis: "ADJUSTED_CUMULATIVE", corporateActions: [] }) };
  // Thứ Bảy 03/10/2026 -> phiên gần nhất 02/10
  const ti = createTaIntraday({ service, taSeries, now: () => Date.parse("2026-10-03T03:00:00Z") });
  const r = await ti.get({ symbol: "fpt", days: 5 });
  assert.equal(r.symbol, "FPT");
  assert.equal(r.priceBasis, "ADJUSTED_CUMULATIVE");
  assert.equal(calls[0][2], "2026-10-02");
  assert.equal(r.sessions.length, 2);
  await assert.rejects(() => ti.get({ symbol: "??" }), /không hợp lệ/);
});
