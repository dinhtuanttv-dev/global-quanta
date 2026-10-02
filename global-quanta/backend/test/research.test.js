import test from "node:test";
import assert from "node:assert/strict";

import { classifyRegime, buildRegimeSeries, breadthByDate } from "../src/market/research/regime.js";
import { summarizeSessions, largeThresholdFor, rollingProfile, sessionProfile } from "../src/market/research/flowHistory.js";
import { computeDailyFeatures, FEATURE_NAMES } from "../src/market/research/features.js";
import { evaluateOutcome, summarizePerformance, wilson, stockSignals, adaptiveSignal, impulseSignal } from "../src/market/research/feedback.js";
import { fitLogistic, trainAdaptive, decidePromotion, walkForwardFolds, auc, explain } from "../src/market/research/tuner.js";
import { createResearchJobs, buildSamples } from "../src/market/research/researchJobs.js";
import { getResearchOverview, getResearchSymbol } from "../src/market/research/researchService.js";
import { createMemoryStore, selectMemory } from "../src/market/store/memoryStore.js";
import { postgrestQuery } from "../src/market/store/supabaseStore.js";
import { groupSessions } from "../src/market/scanner/intradayService.js";
import { tradingDatesBack } from "../src/market/scanner/scannerJobs.js";
import { KV } from "../src/market/scanner/scannerJobs.js";

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const CONT = [...Array.from({ length: 134 }, (_, i) => 9 * 60 + 16 + i), ...Array.from({ length: 90 }, (_, i) => 13 * 60 + i)];

/** Nến phút một phiên (giá đi ngẫu nhiên quanh `ref`, có thiên hướng `drift`). */
function minuteBars(r, date, ref, drift = 0) {
  const bars = [{ date: `${date}T09:15:00+07:00`, open: ref, high: ref, low: ref, close: ref, volume: 20_000 }];
  let p = ref;
  for (const m of CONT) {
    const up = r() < 0.5 + drift;
    p *= up ? 1.0008 : 0.9992;
    bars.push({ date: `${date}T${hhmm(m)}:00+07:00`, open: p, high: p * 1.0004, low: p * 0.9996, close: p, volume: Math.round(800 + r() * 2_000 + (up && drift > 0 ? 1_500 : 0)) });
  }
  bars.push({ date: `${date}T14:45:00+07:00`, open: p, high: p, low: p, close: p, volume: 30_000 });
  return bars;
}

function dailyFromBars(symbol, bars, ref) {
  const close = bars.at(-1).close;
  return {
    symbol, date: bars[0].date.slice(0, 10), exchange: "HOSE", open: bars[0].open, high: Math.max(...bars.map((b) => b.high)),
    low: Math.min(...bars.map((b) => b.low)), close, closeAdj: close, refPrice: ref, volume: bars.reduce((s, b) => s + b.volume, 0),
  };
}

// ---------- Regime ----------

test("research: regime — quy tắc Uptrend / Downtrend / Sideway và Impulse dựng lại theo từng ngày", () => {
  assert.equal(classifyRegime(110, 105, 100, 95), "UPTREND");
  assert.equal(classifyRegime(90, 95, 100, 105), "DOWNTREND");
  assert.equal(classifyRegime(101, 99, 100, 98), "SIDEWAY");
  const dates = tradingDatesBack("2026-09-30", 140);
  const up = dates.map((date, i) => ({ date, close: 1000 * 1.004 ** i }));
  const breadth = new Map(dates.map((d) => [d, 70]));
  const series = buildRegimeSeries(up, breadth);
  assert.equal(series.length, 140 - 59);
  assert.equal(series.at(-1).regime, "UPTREND");
  assert.ok(series.at(-1).impulseScore > 50);
  // Không nhìn tương lai: thêm dữ liệu sau không đổi kết quả của ngày trước.
  const down = [...up, ...tradingDatesBack("2026-12-31", 200).filter((d) => d > "2026-09-30").slice(0, 40).map((date, i) => ({ date, close: up.at(-1).close * 0.99 ** (i + 1) }))];
  const series2 = buildRegimeSeries(down, breadth);
  assert.deepEqual(series2.find((r) => r.date === series.at(-1).date), series.at(-1));
  assert.equal(series2.at(-1).regime, "DOWNTREND");
});

test("research: breadth — % mã trên MA20 theo ngày", () => {
  const dates = tradingDatesBack("2026-09-30", 30);
  const mk = (sym, f) => dates.map((date, i) => ({ symbol: sym, date, close: f(i), closeAdj: f(i) }));
  const rows = new Map();
  for (let k = 0; k < 20; k++) rows.set(`U${k}`, mk(`U${k}`, (i) => 100 + i));
  for (let k = 0; k < 5; k++) rows.set(`D${k}`, mk(`D${k}`, (i) => 100 - i));
  const b = breadthByDate(rows);
  assert.equal(b.get(dates.at(-1)), 80);
});

// ---------- Flow history ----------

test("research: cô đặc phiên — ngưỡng tay to chỉ dùng các phiên TRƯỚC; Volume Profile gọn", () => {
  assert.equal(largeThresholdFor([1, 2, 3], 9), 9, "chưa đủ 10 phiên trước -> p95 của chính phiên");
  assert.equal(largeThresholdFor(Array.from({ length: 12 }, (_, i) => i + 1), 99), 6.5);
  const r = rng(3);
  const dates = tradingDatesBack("2026-09-30", 15);
  const bars = dates.flatMap((d) => minuteBars(r, d, 20_000));
  const sessions = groupSessions(bars);
  const { flow, profiles } = summarizeSessions(sessions);
  assert.equal(flow.length, 15);
  assert.equal(profiles.length, 15);
  assert.ok(flow.every((f) => f.method === "BVC" && f.continuousVolume > 0 && f.minuteP95 > 0));
  const p = profiles[0];
  assert.equal(p.bins.v.length, 24);
  assert.ok(p.vaLow <= p.poc && p.poc <= p.vaHigh);
  // Thêm phiên sau không đổi phiên trước (không nhìn tương lai).
  const more = summarizeSessions(groupSessions([...bars, ...minuteBars(r, "2026-10-01", 20_000)]));
  assert.deepEqual(more.flow.slice(0, 15), flow);
  const roll = rollingProfile(profiles, sessions.at(-1).bars.at(-1).close);
  assert.ok(roll.poc > 0 && ["above", "below", "inside"].includes(roll.position));
  assert.equal(sessionProfile([], 1), null);
});

// ---------- Features ----------

function makeSymbolHistory(seed, n = 90, driftFn = () => 0) {
  const r = rng(seed);
  const dates = tradingDatesBack("2026-09-30", n);
  let ref = 20_000;
  const bars = [], daily = [];
  for (const [i, d] of dates.entries()) {
    const b = minuteBars(r, d, ref, driftFn(i));
    bars.push(...b);
    daily.push(dailyFromBars("AAA", b, ref));
    ref = b.at(-1).close;
  }
  return { dates, bars, daily };
}

test("research: đặc trưng ngày đủ 11 trường, hữu hạn, không nhìn tương lai", () => {
  const { bars, daily } = makeSymbolHistory(5, 90);
  const { flow, profiles } = summarizeSessions(groupSessions(bars));
  const f1 = computeDailyFeatures({ flow, daily, profiles });
  assert.ok(f1.size > 50);
  const day = f1.get(flow.at(-1).date);
  assert.deepEqual(Object.keys(day.features), FEATURE_NAMES);
  assert.ok(Object.values(day.features).every((v) => Number.isFinite(v)));
  const cut = flow.at(-20).date;
  const f2 = computeDailyFeatures({ flow: flow.slice(0, -19), daily: daily.slice(0, -19), profiles: profiles.slice(0, -19) });
  assert.deepEqual(f2.get(cut).features, f1.get(cut).features);
});

// ---------- Feedback ----------

test("research: chấm kết quả T+h — lợi suất, vượt chỉ số, MFE/MAE theo chiều, trúng/trượt", () => {
  const rows = Array.from({ length: 30 }, (_, i) => ({ date: `d${String(i).padStart(2, "0")}`, close: 100 + i, closeAdj: 100 + i, high: 101 + i, low: 99 + i }));
  const bench = new Map(rows.map((r) => [r.date, 1000]));
  const o = evaluateOutcome(rows, 20, 1, 5, bench);
  assert.ok(Math.abs(o.ret - 5 / 120) < 1e-12);
  assert.equal(o.benchRet, 0);
  assert.equal(o.hit, true);
  assert.equal(o.barrier, 1);
  assert.ok(o.mfe > 0 && o.mae <= 0);
  const s = evaluateOutcome(rows, 20, -1, 5, bench);
  assert.equal(s.hit, false);
  assert.ok(s.mae < 0, "bán khống khi giá tăng -> biên lỗ âm");
  assert.equal(evaluateOutcome(rows, 26, 1, 5, bench), null, "chưa đủ T+5");
  assert.equal(evaluateOutcome(rows, 20, 0, 5, bench).hit, null);
});

test("research: tổng hợp hiệu suất — Wilson, so với tỷ lệ nền, theo regime", () => {
  const [lo, hi] = wilson(60, 100);
  assert.ok(lo > 0.5 && lo < 0.6 && hi > 0.6);
  const joined = [];
  for (let i = 0; i < 200; i++) joined.push({ signal: "STEALTH_20", direction: 1, regime: i % 2 ? "UPTREND" : "SIDEWAY", horizon: 5, hit: i % 10 < 7, excessRet: i % 10 < 7 ? 0.02 : -0.01 });
  for (let i = 0; i < 200; i++) joined.push({ signal: "IFE_INTENT", direction: -1, regime: "DOWNTREND", horizon: 5, hit: i % 2 === 0, excessRet: i % 2 === 0 ? -0.01 : 0.01 });
  const rows = summarizePerformance(joined, { 5: 0.5 });
  const st = rows.find((r) => r.signal === "STEALTH_20" && r.regime === "ALL");
  assert.equal(st.n, 200);
  assert.equal(st.hitRate, 0.7);
  assert.equal(st.verdict, "edge");
  assert.ok(st.avgSignedExcess > 0 && st.tStat > 2);
  assert.equal(rows.find((r) => r.signal === "STEALTH_20" && r.regime === "UPTREND").n, 100);
  assert.equal(rows.find((r) => r.signal === "IFE_INTENT" && r.regime === "ALL").verdict, "none");
});

test("research: quy tắc phát tín hiệu công khai", () => {
  assert.deepEqual(stockSignals({ stealth5: 1.6, stealth20: -0.4, intent: { id: "NEUTRAL", p: 0.9 } }).map((s) => [s.signal, s.direction]), [["STEALTH_5", 1]]);
  assert.deepEqual(stockSignals({ stealth5: null, stealth20: -2, intent: { id: "DIST_ACTIVE", p: 0.7 } }).map((s) => [s.signal, s.direction]), [["STEALTH_20", -1], ["IFE_INTENT", -1]]);
  assert.equal(adaptiveSignal(5, 0.52), null);
  assert.equal(adaptiveSignal(5, 0.58).direction, 1);
  assert.equal(impulseSignal(39).direction, -1);
  assert.equal(impulseSignal(50), null);
});

// ---------- Tuner ----------

function syntheticSamples(n, seed, signal = 0.8) {
  const r = rng(seed);
  const gauss = () => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
  const out = [];
  const regimes = ["UPTREND", "DOWNTREND", "SIDEWAY"];
  for (let i = 0; i < n; i++) {
    const x = FEATURE_NAMES.map(() => gauss());
    const logit = signal * x[0] - signal * 0.5 * x[6];
    const y = r() < 1 / (1 + Math.exp(-logit)) ? 1 : 0;
    out.push({ date: `2026-${String(1 + Math.floor(i / (n / 9))).padStart(2, "0")}-${String(1 + (i % 28)).padStart(2, "0")}`, symbol: `S${i % 50}`, x, y, excess: (y ? 1 : -1) * 0.01, regime: regimes[i % 3] });
  }
  return out;
}

test("research: logistic L2 — học đúng chiều; λ lớn co về prior", () => {
  const s = syntheticSamples(3000, 7, 1.2);
  const w = fitLogistic(s.map((v) => v.x), s.map((v) => v.y), { lambda: 1 });
  assert.ok(w[1] > 0.8, `w0=${w[1]}`);
  assert.ok(w[7] < -0.3, `w6=${w[7]}`);
  assert.ok(Math.abs(w[3]) < 0.15, "đặc trưng nhiễu ~ 0");
  const prior = Array(FEATURE_NAMES.length + 1).fill(0.5);
  const shrunk = fitLogistic(s.map((v) => v.x), s.map((v) => v.y), { lambda: 1e6, prior });
  assert.ok(Math.abs(shrunk[3] - 0.5) < 0.01);
  assert.equal(auc([0.1, 0.2, 0.8, 0.9], [0, 0, 1, 1]), 1);
});

test("research: walk-forward có purge/embargo — ngày train luôn trước fold test ≥ embargo phiên", () => {
  const s = syntheticSamples(4000, 9);
  const folds = walkForwardFolds(s, { folds: 5, embargo: 5 });
  const dates = [...new Set(s.map((v) => v.date))].sort();
  for (const f of folds) {
    const maxTrain = f.train.reduce((m, v) => (v.date > m ? v.date : m), "");
    assert.ok(dates.indexOf(f.testFrom) - dates.indexOf(maxTrain) > 5);
  }
});

test("research: huấn luyện thích ứng — có tín hiệu thật thì thăng hạng; dữ liệu ngẫu nhiên thì không", () => {
  const good = trainAdaptive(syntheticSamples(8000, 11, 0.8), { horizon: 5 });
  assert.equal(good.ok, true);
  assert.ok(good.metrics.holdout.brierSkill > 0.02 && good.metrics.holdout.auc > 0.6);
  assert.equal(decidePromotion(good, null).promote, true);
  const ex = explain(good.model, FEATURE_NAMES.map((_, j) => (j === 0 ? 2 : 0)), "UPTREND");
  assert.ok(ex.prob > 0.6);
  assert.equal(ex.contributions[0].name, "zEffort");

  const noise = trainAdaptive(syntheticSamples(8000, 12, 0), { horizon: 5 });
  assert.equal(noise.ok, true);
  assert.equal(decidePromotion(noise, null).promote, false, `noise skill ${noise.metrics.holdout.brierSkill}`);
  // Ứng viên kém mô hình đang chạy -> giữ mô hình cũ.
  assert.equal(decidePromotion({ metrics: { holdout: { ...good.metrics.holdout, brierSkill: 0.01 } } }, { metrics: { holdout: { brierSkill: 0.05 } } }).promote, false);
  assert.equal(trainAdaptive(syntheticSamples(500, 1)).ok, false);
});

// ---------- Store helpers ----------

test("research: bộ lọc PostgREST và bản tương đương trong bộ nhớ", () => {
  assert.equal(postgrestQuery({ select: "a,b", eq: { symbol: "HPG" }, gte: { trading_date: "2026-01-01" }, in: { signal: ["X", "Y"] }, order: "trading_date.desc", limit: 5 }),
    "select=a,b&symbol=eq.HPG&trading_date=gte.2026-01-01&signal=in.(X,Y)&order=trading_date.desc&limit=5");
  const rows = [{ s: "A", d: 2 }, { s: "B", d: 1 }, { s: "A", d: 3 }];
  assert.deepEqual(selectMemory(rows, { eq: { s: "A" }, order: "d.desc", limit: 1 }), [{ s: "A", d: 3 }]);
  assert.deepEqual(selectMemory(rows, { in: { s: ["B"] }, lte: { d: 1 } }), [{ s: "B", d: 1 }]);
});

// ---------- Đầu-cuối trên memory store ----------

test("research: chuỗi job đầu-cuối trên memory store (flow -> signals -> evaluate -> train) + API", async () => {
  const store = createMemoryStore();
  const symbols = ["AAA", "BBB", "CCC", "DDD"];
  const allBars = new Map();
  const dates = tradingDatesBack("2026-09-30", 100);
  for (const [k, sym] of symbols.entries()) {
    const { bars, daily } = makeSymbolHistory(20 + k, 100, (i) => (k === 0 && i % 7 < 3 ? 0.08 : 0));
    allBars.set(sym, bars);
    await store.upsertMarketDaily(daily.map((d) => ({ ...d, symbol: sym })));
  }
  await store.setKv(KV.universe, { tickers: symbols.map((t) => ({ ticker: t, avgValue20: 1e10 })) });
  let rangeCalls = 0;
  const provider = {
    isConfigured: () => true,
    getIntradayRange: async (sym, from, to) => { rangeCalls++; return allBars.get(sym).filter((b) => b.date.slice(0, 10) >= from && b.date.slice(0, 10) <= to); },
    getIntradayOhlcv: async (sym, date) => allBars.get(sym).filter((b) => b.date.startsWith(date)),
  };
  const service = {
    store,
    router: { providers: { ssiFcV2: provider } },
    getOhlcv: async () => ({ bars: dates.map((date, i) => ({ date, close: 1200 + i * 2 + (i % 5) * 3 })) }),
  };
  const now = () => Date.UTC(2026, 9, 1, 10, 0); // 17:00 VN 01/10
  const jobs = createResearchJobs(service, { now });

  const flow = await jobs.researchFlow();
  assert.equal(flow.sessionsWritten, 400);
  assert.equal(flow.failed, 0);
  const again = await jobs.researchFlow();
  assert.equal(again.sessionsWritten, 0, "chạy lại: không nạp lại phiên đã có");
  assert.equal(rangeCalls, 4);

  const sig = await jobs.researchSignals();
  assert.ok(sig.regimeDays > 30 && sig.featuresWritten > 200 && sig.signals > 0, JSON.stringify(sig));
  const flowRows = await store.selectRows("market_flow_daily", { eq: { symbol: "AAA" } });
  const withFeat = flowRows.filter((r) => r.features).sort((a, b) => a.trading_date.localeCompare(b.trading_date));
  assert.equal(typeof withFeat.at(-1).features.regime, "string", "phiên gần nhất có nhãn regime");
  const sig2 = await jobs.researchSignals();
  assert.equal(sig2.signals, 0, "gia tăng: không ghi lại tín hiệu cũ");

  const ev = await jobs.researchEvaluate();
  assert.ok(ev.outcomesWritten > 0);
  assert.equal(ev.maintenance.refresh, null, "memory store: bỏ qua hàm SQL");
  const overview = await getResearchOverview(store);
  assert.ok(overview.performance.length > 0);
  assert.ok(overview.currentRegime?.regime);
  assert.ok(overview.baseline[5] > 0 && overview.baseline[5] < 1);

  const tr = await jobs.researchTrain();
  assert.match(tr["T+5"], /insufficient/, "4 mã không đủ 3.000 mẫu -> không thăng hạng mô hình");

  const detail = await getResearchSymbol(store, "aaa");
  assert.equal(detail.symbol, "AAA");
  assert.equal(detail.features.length, FEATURE_NAMES.length);
  assert.ok(detail.profile.poc > 0);
  assert.ok(detail.adaptive.every((a) => a.ready === false));
});

test("research: mẫu huấn luyện — nhãn vượt VN-Index sau h phiên, bỏ phiên chưa đủ kỳ hạn", () => {
  const dates = tradingDatesBack("2026-09-30", 40);
  const rows = dates.map((date, i) => ({ symbol: "AAA", date, close: 100 + i, closeAdj: 100 + i, high: 101 + i, low: 99 + i }));
  const bench = new Map(dates.map((d) => [d, 1000]));
  const features = Object.fromEntries(FEATURE_NAMES.map((n) => [n, 0.1]));
  const flow = dates.map((d) => ({ symbol: "AAA", trading_date: d, features: { ...features, regime: "UPTREND" } }));
  const s = buildSamples(flow, new Map([["AAA", rows]]), bench);
  assert.deepEqual([s.get(3).length, s.get(5).length, s.get(10).length], [37, 35, 30]);
  assert.ok(s.get(5).every((x) => x.y === 1 && x.regime === "UPTREND"));
});
