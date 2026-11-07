import test from "node:test";
import assert from "node:assert/strict";
import { buildScreener, createDividendScreener, dividendProfile, screenerRow } from "../src/market/events/dividendScreener.js";

const C = (ex, cash, year = null, extra = {}) => ({ cat: "CASH", ex, cash, year, ...extra });
test("BL1 hồ sơ cổ tức: 12 tháng, đợt kế tiếp, năm tài chính, chuỗi năm, tăng trưởng 3 năm, số lần cắt", () => {
  const ev = [C("2022-06-10", 1000, 2021), C("2023-06-10", 1200, 2022), C("2024-06-10", 1500, 2023), C("2025-06-10", 1000, 2024), C("2025-12-10", 800, 2025), C("2026-06-10", 1200, 2025),
    C("2026-12-01", 900, 2026, { pay: "2026-12-20" }), { cat: "BONUS", ex: "2026-03-01", ratio: 20 }, { cat: "AGM", meeting: "2027-04-20" }];
  const p = dividendProfile(ev, "2026-11-07");
  assert.equal(p.ttmCash, 2000); assert.equal(p.payments12m, 2);
  assert.deepEqual([p.nextEx, p.nextCash, p.nextPay, p.agmNext, p.stockPct12m], ["2026-12-01", 900, "2026-12-20", "2027-04-20", 20]);
  assert.deepEqual([p.lastFy, p.lastFyCash, p.streak], [2025, 2000, 5]);
  assert.equal(p.cagr3, Math.round((Math.pow(2000 / 1200, 1 / 3) - 1) * 1e4) / 1e4);
  assert.deepEqual([p.cuts5, p.years5], [1, 4]); // 2024 < 0,9 × 2023
});
test("BL1 một dòng: lợi suất trước/sau thuế, P/E, P/B, chi trả = DPS / EPS 12 tháng, độ phủ dòng tiền tự do; thiếu -> null", () => {
  const div = dividendProfile([C("2026-06-10", 2000, 2025)], "2026-11-07");
  const kq = { quarter: "Q3/2026", tpl: "corp", mcap: 100e12, equity: 25e12, roe: 0.24, kpi: { debtToEquity: 0.4 }, ttm: { eps: 5000, npat: 10e12, cfo: 9e12, capex: -3e12 }, f: 7, ttmGrowth: { value: 0.15 } };
  const r = screenerRow({ t: "AAA", uni: { name: "A", industry: "CNTT" }, scan: { price: 50000, priceTrend: "UP", rsi14: 55 }, kq, div, ex: null });
  assert.deepEqual([r.yieldGross, r.yieldNet, r.fund.pe, r.fund.pb, r.fund.payout], [0.04, 0.038, 10, 4, 0.4]);
  // cổ tức trả = 2.000 × (10e12 / 5.000 = 2 tỷ cp) = 4e12; FCF = 9e12 − 3e12 = 6e12 -> độ phủ 1,5
  assert.equal(r.fund.fcfCover, 1.5);
  const bare = screenerRow({ t: "BBB", uni: {}, scan: null, kq: null, div: dividendProfile([], "2026-11-07"), ex: null });
  assert.deepEqual([bare.price, bare.yieldGross, bare.fund, bare.trend], [null, null, null, null]);
  const loss = screenerRow({ t: "CCC", uni: {}, scan: { price: 10000 }, kq: { ...kq, ttm: { ...kq.ttm, eps: -200 } }, div, ex: null });
  assert.deepEqual([loss.fund.pe, loss.fund.payout], [null, null]); // lỗ: không tính P/E, chi trả
});
test("BL1 dịch vụ: ghép đủ danh mục, độ phủ dữ liệu, đệm theo mốc nguồn (đổi nguồn mới dựng lại)", async () => {
  let gen = "g1"; let builds = 0;
  const s = createDividendScreener({ getKv: async (k) => (k === "scanner:universe" ? { builtAt: "u", tickers: [{ ticker: "AAA" }, { ticker: "BBB" }] } : { generatedAt: gen, items: [{ ticker: "AAA", price: 10000 }] }),
    getKqSummary: async () => { builds += 1; return { builtAt: "k", rows: [] }; }, getEvents: () => ({ fetchedAt: "e", events: [{ t: "AAA", cat: "CASH", ex: "2026-06-01", cash: 500 }] }), getEx: () => null, now: () => Date.parse("2026-11-07T01:00:00Z") });
  const a = await s.get();
  assert.equal(a.count, 2); assert.equal(a.coverage.price, 1); assert.equal(a.rows[0].yieldGross, 0.05);
  assert.equal(await s.get(), a); // cùng mốc -> cùng bản
  gen = "g2"; assert.notEqual(await s.get(), a);
  assert.equal(buildScreener({ universe: [], scanItems: [], kqRows: [], eventsByTicker: new Map(), today: "2026-11-07" }).count, 0);
});
