// R0 (05/11/2026): job đêm researchBackfill lấp lỗ hổng dòng tiền của mã đã có dữ liệu, thử mỗi mã một lần, đánh dấu tính lại đặc trưng.
import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryStore } from "../src/market/store/memoryStore.js";
import { createResearchJobs, RESEARCH_KV, T } from "../src/market/research/researchJobs.js";
import { KV } from "../src/market/scanner/scannerJobs.js";

const minutes = [9 * 60 + 15, ...Array.from({ length: 60 }, (_, i) => 9 * 60 + 16 + i), ...Array.from({ length: 60 }, (_, i) => 13 * 60 + i), 14 * 60 + 45];
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const session = (date, ref) => minutes.map((m, i) => {
  const p = ref * (1 + 0.0004 * Math.sin(i));
  return { date: `${date}T${hhmm(m)}:00+07:00`, open: p, high: p * 1.001, low: p * 0.999, close: p, volume: m === 555 || m === 885 ? 50_000 : 2_000 + (i % 7) * 100 };
});

function setup() {
  const store = createMemoryStore();
  const dates = [];
  for (let d = Date.UTC(2026, 8, 1); dates.length < 40; d += 86_400_000) {
    const wd = new Date(d).getUTCDay();
    if (wd !== 0 && wd !== 6) dates.push(new Date(d).toISOString().slice(0, 10));
  }
  const calls = [];
  const provider = {
    isConfigured: () => true,
    async getIntradayRange(symbol, from, to) { calls.push([symbol, from, to]); return dates.filter((d) => d >= from && d <= to).flatMap((d) => session(d, 20_000)); },
    async getIntradayOhlcv(symbol, date) { calls.push([symbol, date, date]); return session(date, 20_000); },
  };
  const service = { store, router: { providers: { ssiFcV2: provider } } };
  return { store, dates, calls, service };
}

test("R0 lấp lỗ hổng: chỉ phiên thiếu trước phiên cuối, mỗi mã một lần, đánh dấu tính lại đặc trưng", async () => {
  const { store, dates, calls, service } = setup();
  await store.setKv(KV.universe, { tickers: [{ ticker: "AAA", avgValue20: 2 }, { ticker: "BBB", avgValue20: 1 }] });
  await store.upsertMarketDaily(["AAA", "BBB"].flatMap((s) => dates.map((date) => ({ symbol: s, date, close: 20_000, closeAdj: 20_000, refPrice: 20_000, value: 1e9 }))));
  // AAA: chỉ có 8 phiên cuối (lịch sử mất); BBB: đủ.
  const row = (symbol, d) => ({ symbol, trading_date: d, method: "MINUTE", minute_p95: 3000, features: { stealth20: 0 } });
  await store.upsertRows(T.flow, [...dates.slice(-8).map((d) => row("AAA", d)), ...dates.map((d) => row("BBB", d))], "symbol,trading_date");
  const jobs = createResearchJobs(service, { now: () => Date.parse(`${dates.at(-1)}T12:00:00Z`) });

  const r = await jobs.researchBackfill();
  assert.equal(r.gapFilled, 1, "chỉ AAA có lỗ hổng");
  assert.equal(r.gapSessionsWritten, 32);
  assert.equal(r.gapRemaining, 0);
  assert.deepEqual(calls.filter((c) => c[0] === "AAA").map((c) => [c[1], c[2]]), [[dates[0], dates[31]]], "một lần gọi cho đúng khoảng thiếu");
  const aaa = (await store.selectRows(T.flow, { eq: { symbol: "AAA" } }));
  assert.equal(aaa.length, 40);
  assert.ok((await store.getKv(RESEARCH_KV.flowGapsTried)).value.AAA.filled === 32);
  assert.ok((await store.getKv(RESEARCH_KV.featuresRecompute)).value.at, "yêu cầu tính lại đặc trưng cuộn");

  calls.length = 0;
  const r2 = await jobs.researchBackfill();
  assert.equal(r2.gapFilled, 0, "không thử lại mã đã thử");
  assert.equal(calls.filter((c) => c[0] === "AAA" && c[1] < dates.at(-8)).length, 0);
});

test("R0 lấp lỗ hổng: job ban ngày researchFlow không lấp (chỉ chạy đêm)", async () => {
  const { store, dates, service } = setup();
  await store.setKv(KV.universe, { tickers: [{ ticker: "AAA", avgValue20: 2 }] });
  await store.upsertMarketDaily(dates.map((date) => ({ symbol: "AAA", date, close: 20_000, closeAdj: 20_000, refPrice: 20_000, value: 1e9 })));
  await store.upsertRows(T.flow, dates.slice(-8).map((d) => ({ symbol: "AAA", trading_date: d, method: "MINUTE", minute_p95: 3000 })), "symbol,trading_date");
  const jobs = createResearchJobs(service, { now: () => Date.parse(`${dates.at(-1)}T12:00:00Z`) });
  const r = await jobs.researchFlow();
  assert.equal(r.gapFilled, 0);
  assert.equal((await store.selectRows(T.flow, { eq: { symbol: "AAA" } })).length, 8);
});
