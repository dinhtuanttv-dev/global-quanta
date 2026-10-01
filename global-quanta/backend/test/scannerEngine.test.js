process.env.MARKET_ALERTS_ENABLED = "false";

import test from "node:test";
import assert from "node:assert/strict";
import { runScan, sortScannerItems, topForeignNetBuy, toActiveEvents } from "../src/market/scanner/scanEngine.js";
import { rankByLiquidity, buildUniverse, mergeSectors } from "../src/market/scanner/universe.js";
import { normalizeDailyRow } from "../src/market/scanner/marketDaily.js";
import { createScannerJobs, tradingDatesBack, KV } from "../src/market/scanner/scannerJobs.js";
import { createMemoryStore } from "../src/market/store/memoryStore.js";
import { addDays } from "../src/market/util.js";
// Bản gốc Project A — dùng để dựng lại đúng vòng lặp của cron làm tham chiếu.
import * as ti from "./fixtures/projectA/technical-indicators.ts";
import * as ce from "./fixtures/projectA/confluence-engine.ts";
import * as se from "./fixtures/projectA/scoring-engine.ts";
import * as mt from "./fixtures/projectA/market-tags.ts";
import * as dq from "./fixtures/projectA/dividend-quality-score.ts";

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

function makeBars(r, n, start = "2025-06-02") {
  const bars = [];
  let close = 10_000 + r() * 80_000;
  let date = start;
  for (let i = 0; i < n; i++) {
    const open = close * (1 + (r() - 0.5) * 0.03);
    close = Math.max(500, open * (1 + (r() - 0.48) * 0.05));
    bars.push({ date, open, high: Math.max(open, close) * (1 + r() * 0.015), low: Math.min(open, close) * (1 - r() * 0.015), close, closeAdj: close * 0.97, volume: Math.round(r() * 3e6) });
    date = addDays(date, 1);
  }
  return bars;
}

function makeQuarter(r) {
  return {
    revenue: r() * 5e12, netProfit: (r() - 0.2) * 8e11, grossProfit: r() * 1e12,
    totalAssets: r() * 2e13, totalLiabilities: r() * 1e13, totalEquity: r() * 1e13,
    currentAssets: r() * 6e12, currentLiabilities: r() * 5e12, longTermDebt: r() * 3e12,
  };
}

function makeInput(seed = 7, nTickers = 60) {
  const r = rng(seed);
  const sectors = ["Ngân hàng", "Chứng khoán", "Thép", "Bất động sản", "Khac"];
  const universe = Array.from({ length: nTickers }, (_, i) => ({ ticker: `T${String(i).padStart(2, "0")}`, sector: sectors[i % sectors.length], name: `Cty ${i}` }));
  const barsByTicker = new Map();
  const fundamentals = new Map();
  universe.forEach((u, i) => {
    barsByTicker.set(u.ticker, makeBars(r, i % 13 === 0 ? 40 : 120 + Math.floor(r() * 140))); // vài mã < 50 nến
    if (i % 7 !== 0) {
      const quarters = Array.from({ length: 6 }, () => makeQuarter(r));
      fundamentals.set(u.ticker, { income: { available: true, quarters }, balance: { available: true, quarters } });
    }
  });
  const indexBars = makeBars(r, 250).map(({ closeAdj, ...b }) => b);
  const now = new Date("2026-10-01T09:00:00Z");
  const events = [
    { verifiedStatus: "user_confirmed", sectors: ["chứng khoán"], magnitude: "medium", direction: "positive", expectedDurationDays: null, createdAt: "2026-09-25T00:00:00Z" },
    { verifiedStatus: "user_confirmed", sectors: ["Thép"], magnitude: "high", direction: "negative", expectedDurationDays: 30, createdAt: "2026-09-30T20:00:00Z" },
  ];
  return { universe, barsByTicker, fundamentals, indexBars, events, foreignNetBuySet: new Set(["T03", "T10"]), now };
}

// Vòng lặp cron gốc (app/api/cron/sieu-quet-scan/route.ts) dựng lại bằng hàm gốc của Project A,
// thay nguồn dữ liệu (Yahoo/VCI/Prisma) bằng chính dữ liệu đầu vào của test.
function referenceScan({ universe, barsByTicker, fundamentals, indexBars, events, foreignNetBuySet, now }) {
  const sectorOf = new Map(universe.map((u) => [u.ticker, u.sector]));
  const tickerData = [];
  for (const { ticker } of universe) {
    const bars = barsByTicker.get(ticker).map((b) => ({ ...b, adjClose: b.closeAdj }));
    const closes = bars.map((b) => b.adjClose);
    if (closes.length < 50) continue;
    const ma20 = ti.calculateSMA(closes, 20), ma50 = ti.calculateSMA(closes, 50);
    const ma200 = closes.length >= 200 ? ti.calculateSMA(closes, 200) : null;
    const rsi = ti.calculateRSI(closes) ?? 50;
    const atrSeries = ti.calculateAtrSeries(bars, 14);
    const atrPct = atrSeries.length > 0 ? (atrSeries.filter((v) => v <= atrSeries[atrSeries.length - 1]).length / atrSeries.length) * 100 : 50;
    const fa = fundamentals.get(ticker);
    const incomeQ0 = fa?.income?.available ? fa.income.quarters[0] : null;
    const balanceQ0 = fa?.balance?.available ? fa.balance.quarters[0] : null;
    const incomeQ4Ago = fa?.income?.available ? fa.income.quarters[3] : null;
    const roe = incomeQ0?.netProfit && balanceQ0?.totalEquity ? incomeQ0.netProfit / balanceQ0.totalEquity : 0;
    const netMargin = incomeQ0?.netProfit && incomeQ0?.revenue ? incomeQ0.netProfit / incomeQ0.revenue : 0;
    const revenueGrowth = incomeQ0?.revenue && incomeQ4Ago?.revenue ? incomeQ0.revenue / incomeQ4Ago.revenue - 1 : 0;
    const leverage = balanceQ0?.totalLiabilities && balanceQ0?.totalEquity ? balanceQ0.totalLiabilities / balanceQ0.totalEquity : 1;
    const price = bars[bars.length - 1].close; // bản gốc: quote Yahoo = giá phiên cuối
    const changePct = closes.length >= 2 ? Math.round((price / closes[closes.length - 2] - 1) * 10000) / 100 : 0;
    tickerData.push({
      ticker, closes, ma20: ma20 ?? price, ma50: ma50 ?? price, ma200, rsi, atrPct, roe, netMargin, revenueGrowth, leverage,
      liquidity: bars.slice(-20).reduce((s, b) => s + b.volume, 0) / Math.min(20, bars.length), price, changePct,
      return64d: mt.computeReturnOverPeriod(closes, 64),
    });
  }
  const idxCloses = indexBars.map((b) => b.close);
  const idxMa20 = ti.calculateSMA(idxCloses, 20) ?? idxCloses.at(-1);
  const idxMa50 = ti.calculateSMA(idxCloses, 50) ?? idxCloses.at(-1);
  const idxMa200 = idxCloses.length >= 200 ? ti.calculateSMA(idxCloses, 200) ?? idxMa50 : idxMa50;
  const idxRsi = ti.calculateRSI(idxCloses) ?? 50;
  const breadthPct = Math.round((tickerData.filter((t) => t.closes.at(-1) > t.ma20).length / tickerData.length) * 1000) / 10;
  const b5 = tickerData.filter((t) => { const c = t.closes.slice(0, -5); const m = ti.calculateSMA(c, 20); return m !== null && c.at(-1) > m; }).length;
  const breadthDrop5d = Math.max(0, Math.round((b5 / tickerData.length) * 1000) / 10 - breadthPct);
  const deathCross = idxMa50 < idxMa200 * 1.01 && idxCloses.at(-1) < idxMa50;
  const { bias, label } = ce.computeTrendBias(idxCloses.at(-1), idxMa20, idxMa50, idxMa200, breadthPct, deathCross, breadthDrop5d);
  const maAlign = ce.computeMaAlignmentScore(idxMa20, idxMa50, idxMa200);
  const idxAtr = ti.calculateAtrSeries(indexBars.map((b) => ({ ...b, adjClose: b.close })), 14);
  const idxAtrPct = (idxAtr.filter((v) => v <= idxAtr.at(-1)).length / idxAtr.length) * 100;
  const impulseScore = ce.computeImpulseScore(idxRsi, breadthPct, maAlign, idxAtrPct);
  const breakoutProbability = Math.max(0, 100 - idxAtrPct - Math.abs(50 - breadthPct));
  const faU = { roe: tickerData.map((t) => t.roe), margin: tickerData.map((t) => t.netMargin), growth: tickerData.map((t) => t.revenueGrowth), liq: tickerData.map((t) => t.liquidity) };
  const rets = tickerData.map((t) => t.return64d);
  const activeEvents = events.map((e) => {
    const durationDays = e.expectedDurationDays ?? 14;
    const daysSinceCreated = Math.floor((now.getTime() - new Date(e.createdAt).getTime()) / 86_400_000);
    const daysRemaining = durationDays - daysSinceCreated;
    return { verifiedStatus: e.verifiedStatus, sectors: e.sectors, magnitude: e.magnitude, direction: e.direction,
      status: daysRemaining < 0 ? "resolved" : daysSinceCreated <= 1 ? "upcoming" : "ongoing", daysRemaining: daysRemaining >= 0 ? daysRemaining : null };
  });
  const items = tickerData.map((t) => {
    const trendTag = mt.computeTrendTag(t.price, t.ma20, t.ma50);
    const qualityTag = mt.computeQualityTag(t.leverage, t.netMargin);
    const rsRating = mt.computeRsRating(t.return64d, rets);
    const divergence = t.rsi < 45 && t.price > t.closes[Math.max(0, t.closes.length - 10)] ? "bearish" : "none";
    const faScore = se.computeFaScore(t.roe, t.netMargin, t.revenueGrowth, faU.roe, faU.margin, faU.growth);
    const taScore = se.computeTaScore(rsRating, trendTag, t.liquidity, faU.liq, divergence);
    const eventScore = se.computeEventImpactScore(sectorOf.get(t.ticker) ?? "Khac", activeEvents);
    const confl = ce.computeConfluence(bias, trendTag, rsRating, qualityTag, breakoutProbability);
    const fa = fundamentals.get(t.ticker);
    const iq = (k) => (fa?.income?.available ? fa.income.quarters[k] : null);
    const bq = (k) => (fa?.balance?.available ? fa.balance.quarters[k] : null);
    const f = dq.calculateFScoreLite(
      { netProfit: iq(0)?.netProfit ?? null, totalAssets: bq(0)?.totalAssets ?? null, longTermDebt: bq(0)?.longTermDebt ?? null,
        currentAssets: bq(0)?.currentAssets ?? null, currentLiabilities: bq(0)?.currentLiabilities ?? null, revenue: iq(0)?.revenue ?? null, grossProfit: iq(0)?.grossProfit ?? null },
      iq(4) && bq(4) ? { netProfit: iq(4).netProfit, totalAssets: bq(4).totalAssets, longTermDebt: bq(4).longTermDebt, currentAssets: bq(4).currentAssets,
        currentLiabilities: bq(4).currentLiabilities, revenue: iq(4).revenue, grossProfit: iq(4).grossProfit } : null);
    return {
      ticker: t.ticker, price: t.price, changePct: t.changePct, faScore, taScore, eventImpactScore: eventScore,
      smartScore: se.computeSmartScore(faScore, taScore, eventScore, confl.boost), rsRating,
      riskAdjustedMomentum: se.computeRiskAdjustedMomentum(t.closes), riskRewardRatio: se.computeRiskReward(t.price, t.ma50 * 0.97, t.ma50 * 1.03),
      trendTag, qualityTag, confluenceStatusCode: confl.statusCode, confluenceStatusLabel: confl.statusLabel, confluenceBoost: confl.boost,
      confluenceReasonCodes: confl.reasonCodes, breakoutBoostBadge: confl.breakoutBoostBadge, piotroskiFScore: f.score, fScoreMax: f.maxScore,
      foreignNetBuyFlag: foreignNetBuySet.has(t.ticker),
    };
  });
  return { indexState: { trendBias: bias, trendLabel: label, marketBreadthPct: breadthPct, impulseScore, breakoutProbability, rsi14: idxRsi, maAlignmentScore: maAlign }, items };
}

const pick = (o, keys) => Object.fromEntries(keys.map((k) => [k, o[k]]));

test("engine: quy trình quét khớp vòng lặp cron gốc của Project A (60 mã giả lập)", () => {
  for (const seed of [7, 11, 23]) {
    const input = makeInput(seed);
    const ours = runScan(input);
    const ref = referenceScan(input);
    assert.deepEqual(pick(ours.indexState, Object.keys(ref.indexState)), ref.indexState);
    const keys = Object.keys(ref.items[0]);
    const oursByTicker = new Map(ours.items.map((i) => [i.ticker, pick(i, keys)]));
    assert.equal(ours.items.length, ref.items.length);
    for (const item of ref.items) assert.deepEqual(oursByTicker.get(item.ticker), item, `lệch ở mã ${item.ticker}`);
    assert.ok(ours.skipped.every((s) => s.reason === "INSUFFICIENT_BARS"));
  }
});

test("engine: sắp xếp giống route Project A — F-Score thấp xuống cuối, còn lại theo Smart Score", () => {
  const sorted = sortScannerItems([
    { ticker: "A", smartScore: 90, piotroskiFScore: 1, fScoreMax: 6 },
    { ticker: "B", smartScore: 50, piotroskiFScore: 5, fScoreMax: 6 },
    { ticker: "C", smartScore: 70, piotroskiFScore: null, fScoreMax: 6 },
  ]);
  assert.deepEqual(sorted.map((i) => i.ticker), ["C", "B", "A"]);
});

test("engine: cờ NN mua ròng = top 5 HOSE theo giá trị mua ròng", () => {
  const rows = [
    ...["A", "B", "C", "D", "E", "F"].map((s, i) => ({ symbol: s, exchange: "HOSE", foreignBuyVal: 100 + i * 10, foreignSellVal: 0 })),
    { symbol: "X", exchange: "HNX", foreignBuyVal: 1e9, foreignSellVal: 0 },
    { symbol: "Y", exchange: "HOSE", foreignBuyVal: 0, foreignSellVal: 50 },
  ];
  assert.deepEqual([...topForeignNetBuy(rows)].sort(), ["B", "C", "D", "E", "F"]);
});

test("engine: trạng thái sự kiện (upcoming/ongoing/resolved) đúng bản gốc", () => {
  const now = new Date("2026-10-01T00:00:00Z");
  const ev = toActiveEvents([
    { createdAt: "2026-09-30T12:00:00Z", expectedDurationDays: null },
    { createdAt: "2026-09-20T00:00:00Z", expectedDurationDays: 14 },
    { createdAt: "2026-09-01T00:00:00Z", expectedDurationDays: 14 },
  ], now);
  assert.deepEqual(ev.map((e) => [e.status, e.daysRemaining]), [["upcoming", 14], ["ongoing", 3], ["resolved", null]]);
});

// ---------- Universe ----------

test("universe: top N theo GT bình quân, ngưỡng tối thiểu, mã ghim luôn có, ngành ưu tiên DIVIDEND_STOCKS", () => {
  const rows = [];
  ["AAA", "BBB", "CCC", "DDD"].forEach((s, i) => {
    for (let d = 0; d < 20; d++) rows.push({ symbol: s, exchange: "HOSE", value: (4 - i) * 1e9, date: `d${d}` });
  });
  rows.push({ symbol: "VNM", exchange: "HOSE", value: 1e8, date: "d0" });
  const ranked = rankByLiquidity(rows, 20);
  assert.deepEqual(ranked.map((r) => [r.symbol, r.avgValue]), [["AAA", 4e9], ["BBB", 3e9], ["CCC", 2e9], ["DDD", 1e9], ["VNM", 5e6]]);
  const sectors = mergeSectors({ tradingView: new Map([["VNM", "Consumer"], ["AAA", "Finance"]]), scanner: new Map([["AAA", "Ngân hàng"]]) });
  const u = buildUniverse({ ranked, pinned: ["VNM"], sectors, size: 2, minValue: 1e9 });
  assert.deepEqual(u.map((x) => [x.ticker, x.pinned, x.sector]), [["AAA", false, "Ngân hàng"], ["BBB", false, "Khac"], ["VNM", true, "Thực phẩm"]]);
  const u2 = buildUniverse({ ranked, pinned: [], sectors, size: 10, minValue: 2e9 });
  assert.deepEqual(u2.map((x) => x.ticker), ["AAA", "BBB", "CCC"], "dừng ở ngưỡng tối thiểu dù chưa đủ N");
});

test("marketDaily: chỉ giữ cổ phiếu 3 ký tự hợp lệ, loại bản ghi rác của SSI", () => {
  const base = { TradingDate: "01/10/2026", CeilingPrice: "67400", FloorPrice: "58600", RefPrice: "63000", ClosePrice: "62700", ClosePriceAdjusted: "62700", OpenPrice: "63000", HighestPrice: "63100", LowestPrice: "62600", TotalMatchVol: "3413000", TotalMatchVal: "214485140000", ForeignBuyValTotal: "61788249600", ForeignSellValTotal: "26132985200" };
  const ok = normalizeDailyRow({ ...base, Symbol: "FPT" }, "HOSE");
  assert.equal(ok.symbol, "FPT");
  assert.equal(ok.value, 214485140000);
  assert.equal(normalizeDailyRow({ ...base, Symbol: "0.8536:" }, "HOSE"), null);
  assert.equal(normalizeDailyRow({ ...base, Symbol: "CFPT2601" }, "HOSE"), null);
  assert.equal(normalizeDailyRow({ ...base, Symbol: "ABC", CeilingPrice: "0" }, "HOSE"), null);
});

// ---------- Job ----------

function fakeDayFactory(closeAdjByDate) {
  const calls = [];
  const fetchDay = async (date) => {
    calls.push(date);
    if (date === "2026-09-02") return { date, rows: [], requests: 1 }; // ngày nghỉ lễ
    const adj = closeAdjByDate(date);
    return { date, requests: 3, rows: [
      { symbol: "FPT", date, exchange: "HOSE", open: 100, high: 101, low: 99, close: 100, closeAdj: adj, volume: 1, value: 5e9, foreignBuyVal: 0, foreignSellVal: 0 },
      { symbol: "HPG", date, exchange: "HOSE", open: 50, high: 51, low: 49, close: 50, closeAdj: 50, volume: 1, value: 3e9, foreignBuyVal: 0, foreignSellVal: 0 },
    ] };
  };
  return { fetchDay, calls };
}

test("jobs: phát hiện sự kiện quyền -> nhân lại giá điều chỉnh của toàn bộ lịch sử", async () => {
  const store = createMemoryStore();
  let exRight = false;
  const { fetchDay } = fakeDayFactory(() => (exRight ? 80 : 100));
  const jobs = createScannerJobs({ store }, { now: () => Date.parse("2026-10-01T09:00:00Z"), fetchDay, pauseMs: 0 });
  await store.upsertMarketDaily((await fetchDay("2026-09-29")).rows);
  await store.upsertMarketDaily((await fetchDay("2026-09-30")).rows);
  exRight = true; // SSI điều chỉnh lại lịch sử FPT: 100 -> 80
  const r = await jobs.syncMarketDaily();
  assert.equal(r.adjustedSymbols, 1);
  const fpt = (await store.getMarketDailyRange({ from: "2026-09-01", to: "2026-10-01", symbols: ["FPT"] })).map((x) => x.closeAdj);
  assert.deepEqual(fpt, [80, 80, 80]);
  const hpg = (await store.getMarketDailyRange({ from: "2026-09-01", to: "2026-10-01", symbols: ["HPG"] })).map((x) => x.closeAdj);
  assert.deepEqual(hpg, [50, 50, 50]);
});

test("jobs: backfill bỏ qua phiên đã có, ghi nhớ ngày nghỉ, chạy tiếp được", async () => {
  const store = createMemoryStore();
  const { fetchDay, calls } = fakeDayFactory(() => 100);
  const jobs = createScannerJobs({ store }, { now: () => Date.parse("2026-10-01T09:00:00Z"), fetchDay, pauseMs: 0 });
  const first = await jobs.backfillMarketDaily({ sessions: 30, maxDays: 10 });
  assert.equal(first.sessionsLoaded, 10);
  assert.ok(first.pending > 0);
  const second = await jobs.backfillMarketDaily({ sessions: 30, maxDays: 100 });
  assert.equal(second.pending, 0);
  assert.deepEqual(second.emptyDates.concat(first.emptyDates).includes("2026-09-02"), true);
  const before = calls.length;
  await jobs.backfillMarketDaily({ sessions: 30, maxDays: 100 });
  assert.equal(calls.length, before, "lần chạy thứ ba không gọi lại SSI");
  assert.equal(tradingDatesBack("2026-10-01", 5).at(-1), "2026-10-01");
});

test("jobs: buildUniverse + scanUniverse chạy trọn với kho memory", async () => {
  const store = createMemoryStore();
  const r = rng(99);
  const dates = tradingDatesBack("2026-10-01", 120);
  const symbols = Array.from({ length: 30 }, (_, i) => `S${String(i).padStart(2, "0")}`).concat(["FPT", "VNM"]);
  for (const date of dates) {
    await store.upsertMarketDaily(symbols.map((symbol, i) => {
      const close = 20_000 + r() * 1_000;
      return { symbol, date, exchange: "HOSE", open: close, high: close * 1.01, low: close * 0.99, close, closeAdj: close, volume: 1e5, value: (32 - i) * 2e8, foreignBuyVal: r() * 1e9, foreignSellVal: r() * 1e9 };
    }));
  }
  const indexBars = dates.map((date, i) => ({ date, open: 1700 + i, high: 1710 + i, low: 1690 + i, close: 1700 + i, volume: 1 }));
  const service = { store, getOhlcv: async () => ({ bars: indexBars, provenance: { source: "SSI_FC_V2" } }) };
  const fakeFetch = async (url) => {
    const json = (body) => ({ ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => body });
    if (String(url).includes("/api/sieu-quet-ai/scanner")) return json({ items: [{ ticker: "S01", sector: "Ngân hàng" }] });
    if (String(url).includes("/api/universe")) return json({ tickers: [{ ticker: "VNM", sector: "Thực phẩm" }] });
    if (String(url).includes("/api/sieu-quet-ai/events")) return json({ events: [] });
    if (String(url).includes("tradingview")) return json({ data: [{ s: "HOSE:S02", d: ["S02", "Finance", "Cty S02"] }] });
    if (String(url).includes("vietcap")) return json({ successful: false, msg: "test" });
    throw new Error(`unexpected ${url}`);
  };
  process.env.SCANNER_UNIVERSE_SIZE = "10";
  process.env.SCANNER_MIN_AVG_VALUE = String(3e9);
  try {
    const jobs = createScannerJobs(service, { now: () => Date.parse("2026-10-01T09:00:00Z"), fetchImpl: fakeFetch, pauseMs: 0 });
    const ub = await jobs.buildUniverse();
    const universe = (await store.getKv(KV.universe)).value;
    assert.ok(universe.tickers.some((t) => t.ticker === "VNM" && t.pinned && t.sector === "Thực phẩm"));
    assert.equal(universe.tickers.find((t) => t.ticker === "S01").sector, "Ngân hàng");
    assert.equal(universe.tickers.find((t) => t.ticker === "S02").sector, "Finance");
    assert.ok(ub.total >= 10);
    const fa = await jobs.refreshFundamentals();
    assert.equal(fa.ok, 0);
    const scan = await jobs.scanUniverse();
    // Mã ghim không có dữ liệu giá (14 mã cổ tức không có trong dữ liệu giả lập) bị bỏ qua, không làm hỏng lượt quét.
    assert.equal(scan.scanned + scan.skipped, universe.tickers.length);
    assert.equal(scan.scanned, universe.tickers.filter((t) => symbols.includes(t.ticker)).length);
    const doc = (await store.getKv(KV.latest)).value;
    assert.equal(doc.dataAsOf, "2026-10-01");
    assert.equal(doc.totalCount, doc.items.length);
    assert.ok(doc.indexState.narrative.startsWith("VN-Index đang ở trạng thái"));
  } finally {
    delete process.env.SCANNER_UNIVERSE_SIZE;
    delete process.env.SCANNER_MIN_AVG_VALUE;
  }
});
