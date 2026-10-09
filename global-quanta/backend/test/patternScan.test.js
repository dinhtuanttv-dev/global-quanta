// Pattern Scanner v2 (Pring) — P2: chiến lược `patterns` trong runTechnicalFilters (khung ngày + tuần), KV, chi tiết bảng phụ.
import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryStore } from "../src/market/store/memoryStore.js";
import { runTechnicalFilters, screenerCriteria, STRATEGY_ENGINE, STRATEGY_IDS } from "../src/market/strategies/technicalFilters.js";
import { analyzePatterns, isPartialWeek, patternDetail, PATTERNS_ENGINE, weeklyBars } from "../src/market/strategies/patternScan.js";
import { ledgerRows } from "../src/market/strategies/signalTracking.js";
import { preparePattern, scanPatterns } from "../src/market/strategies/pring/index.js";

const day = (i) => new Date(Date.UTC(2023, 0, 2) + i * 86_400_000).toISOString().slice(0, 10);
/** Như pringPatterns.test.js: mốc [phiên, giá] nội suy + nhiễu nhỏ; giá theo VND (×1.000). */
function series(legs, { vol = () => 1_000_000, noise = 0.004 } = {}) {
  const n = legs[legs.length - 1][0] + 1, out = [];
  for (let i = 0; i < n; i++) {
    let j = 1; while (legs[j][0] < i) j++;
    const [i0, p0] = legs[j - 1], [i1, p1] = legs[j];
    const c = (p0 + ((p1 - p0) * (i - i0)) / (i1 - i0 || 1)) * (1 + noise * Math.sin(i * 1.7)) * 1000;
    const o = i ? out[i - 1].close : c;
    out.push({ date: day(i), open: o, high: Math.max(o, c) * 1.006, low: Math.min(o, c) * 0.994, close: c, volume: vol(i) });
  }
  return out;
}
// 200 phiên đi ngang-tăng nhẹ rồi đáy đôi của pringPatterns.test.js (dời 200 phiên), phá vỡ với KL lớn.
const DB = [[0, 95], [200, 100], [240, 120], [300, 80], [315, 92], [330, 80.5], [340, 91], [343, 95], [350, 99]];
const dbBars = () => series(DB, { vol: (i) => (i === 341 || i === 342 ? 3_000_000 : i > 320 && i < 340 ? 700_000 : 1_000_000) });

async function makeService(tickers) {
  const store = createMemoryStore();
  await store.setKv("scanner:universe", { tickers: tickers.map((ticker) => ({ ticker, sector: "Test", name: `${ticker} Corp` })) });
  return { store };
}

test("chiến lược patterns đăng ký đủ: id, engine pring/P4", () => {
  assert.ok(STRATEGY_IDS.includes("patterns"));
  assert.equal(STRATEGY_ENGINE.patterns, PATTERNS_ENGINE);
  assert.equal(PATTERNS_ENGINE, "pring/P4");
});

test("runTechnicalFilters(patterns): tóm tắt khung ngày + tuần, mô hình chính, đếm, EXPERIMENTAL, gọn", async () => {
  const bars = dbBars();
  const service = await makeService(["DBL", "FLT"]);
  const flat = series([[0, 50], [350, 50.5]], { noise: 0.0005 });
  const loadSeries = async (s) => ({ bars: s === "DBL" ? bars : flat, priceBasis: "ADJUSTED_CUMULATIVE" });
  const { patterns: doc } = await runTechnicalFilters(service, { loadSeries, strategies: ["patterns"], criteria: screenerCriteria({}) });
  assert.equal(doc.strategy, "patterns");
  assert.equal(doc.engine, "pring/P4");
  assert.equal(doc.evidence.label, "EXPERIMENTAL");
  assert.deepEqual(doc.timeframes, ["D", "W"]);
  assert.equal(doc.dataAsOf, bars.at(-1).date);
  const r = doc.results.find((x) => x.ticker === "DBL");
  assert.ok(r, `không có DBL: ${doc.results.map((x) => x.ticker)}`);
  const p = r.patterns.find((x) => x.type === "DOUBLE_BOTTOM" && x.timeframe === "D");
  assert.ok(p, r.patterns.map((x) => `${x.timeframe}:${x.type}`).join(","));
  assert.equal(p.dir, "bull");
  assert.ok(p.breakoutDate && p.plan && p.plan.stop < p.plan.entry && p.targets.length === 3);
  assert.ok(p.checksTotal > 0 && p.checksOk <= p.checksTotal);
  assert.deepEqual([r.type, r.timeframe, r.status, r.dir], [r.patterns[0].type, r.patterns[0].timeframe, r.patterns[0].state, r.patterns[0].dir], "mô hình chính = hạng cao nhất");
  // bản tóm tắt không mang hình học nặng (points/lines/events/checks) — chi tiết ở bảng phụ
  for (const k of ["points", "lines", "events", "checks"]) assert.equal(p[k], undefined, k);
  assert.ok(JSON.stringify(r).length < 6_000, `${JSON.stringify(r).length} byte / mã`);
  const sum = Object.values(doc.counts.byState).reduce((a, b) => a + b, 0);
  assert.equal(sum, doc.results.reduce((a, x) => a + x.patterns.length, 0));
  assert.equal(doc.counts.byTimeframe.D + doc.counts.byTimeframe.W, sum);
});

test("nến tuần: W-FRI, date = phiên cuối tuần, tuần dở dang được đánh dấu", () => {
  const bars = dbBars();
  const w = weeklyBars(bars);
  assert.ok(w.length > 45 && w.length < 55, String(w.length));
  for (let k = 1; k < w.length; k++) assert.ok(w[k].weekStart > w[k - 1].date);
  assert.equal(w.at(-1).date, bars.at(-1).date);
  assert.equal(w.at(-1).close, bars.at(-1).close);
  assert.equal(isPartialWeek("2026-10-09"), false, "thứ Sáu");
  assert.equal(isPartialWeek("2026-10-07"), true, "thứ Tư");
  // khung tuần không nhìn trước: chuỗi ngày cắt tại một thứ Sáu -> kết quả tuần = scanPatterns trên nến tuần đầy đủ tại tuần đó
  const sig = (r) => JSON.stringify(r.map((x) => [x.type, x.state, x.startDate, x.endDate, x.breakout?.date ?? null, x.score]));
  let checked = 0;
  for (let k = 300; k < bars.length; k++) {
    if (isPartialWeek(bars[k].date)) continue;
    const wi = w.findIndex((x) => x.date === bars[k].date);
    const cut = analyzePatterns(bars.slice(0, k + 1)).weekly.map(({ timeframe, ...x }) => x);
    assert.equal(sig(cut), sig(scanPatterns(preparePattern(w), wi)), bars[k].date);
    checked++;
  }
  assert.ok(checked >= 5);
});

test("patternDetail: mô hình đầy đủ để vẽ + nến ngày/tuần gọn; mã không có dữ liệu -> null", () => {
  const d = patternDetail("DBL", { bars: dbBars(), priceBasis: "ADJUSTED_CUMULATIVE" });
  assert.equal(d.engine, "pring/P4");
  const p = d.daily.find((x) => x.type === "DOUBLE_BOTTOM");
  assert.ok(p && p.points.length >= 3 && p.lines.length >= 1 && p.checks.length > 0 && p.timeframe === "D");
  assert.equal(d.bars.daily.length, 320);
  assert.equal(d.bars.daily.at(-1)[0], d.dataAsOf);
  assert.equal(d.bars.daily[0].length, 6);
  assert.equal(d.bars.weekly[0].length, 7);
  // mọi ngày của điểm mô hình phải nằm trong nến trả về (vẽ được, ghim theo nến)
  const dates = new Set(d.bars.daily.map((b) => b[0]));
  for (const pt of p.points) assert.ok(dates.has(pt.date), pt.date);
  assert.equal(patternDetail("X", { bars: [] }), null);
});

test("P4 sổ tín hiệu SCR_PAT_*: chỉ mô hình xác nhận đúng phiên quét; tuần dở dang không ghi; 1 dòng / mã / hướng / khung", () => {
  const doc = { engine: "pring/P4", dataAsOf: "2026-10-09", market: { up: true }, results: [
    { ticker: "AAA", partialWeek: false, patterns: [
      { timeframe: "D", dir: "bull", state: "CONFIRMED", confirmDate: "2026-10-09", type: "DOUBLE_BOTTOM", family: "double", score: 70, checksOk: 8, checksTotal: 10, plan: { entry: 10, stop: 9, target: 13, rr: 3 } },
      { timeframe: "D", dir: "bull", state: "CONFIRMED", confirmDate: "2026-10-09", type: "ASC_TRIANGLE", family: "triangle", score: 60 },
      { timeframe: "D", dir: "bear", state: "CONFIRMED", confirmDate: "2026-10-08", type: "RISING_WEDGE", family: "wedge" },
      { timeframe: "W", dir: "bear", state: "CONFIRMED", confirmDate: "2026-10-09", type: "HS_TOP", family: "hs" },
    ] },
    { ticker: "BBB", partialWeek: true, patterns: [{ timeframe: "W", dir: "bull", state: "CONFIRMED", confirmDate: "2026-10-09", type: "FLAG", family: "flag" }] },
  ] };
  const rows = ledgerRows({ patterns: doc });
  assert.deepEqual(rows.map((r) => [r.symbol, r.signal, r.direction]), [["AAA", "SCR_PAT_BUY", 1], ["AAA", "SCR_PAT_W_SELL", -1]]);
  assert.equal(rows[0].features.type, "DOUBLE_BOTTOM", "mô hình hạng cao nhất");
  assert.equal(rows[0].features.group, "G1");
  assert.equal(rows[0].model_version, "pring/P4");
});
