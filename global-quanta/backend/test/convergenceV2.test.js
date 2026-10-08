import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryStore } from "../src/market/store/memoryStore.js";
import { runTechnicalFilters, screenerCriteria, STRATEGY_ENGINE } from "../src/market/strategies/technicalFilters.js";
import { backtestConvergence, CONVERGENCE_EVIDENCE_KV, CONVERGENCE_VERSION, convergenceEvidenceFresh, scanConvergenceV2 } from "../src/market/strategies/convergenceV2.js";
import { createStrategyJobs } from "../src/market/strategies/strategyJobs.js";
import { ledgerRows } from "../src/market/strategies/signalTracking.js";

const day = (i) => new Date(Date.UTC(2024, 0, 1) + i * 86_400_000).toISOString().slice(0, 10);
const wave = (i, amp, per) => amp * Math.sin((2 * Math.PI * i) / per);

/**
 * Giống fixture staleSpringSeries(0) của quant-core (giảm -> range 100–108 -> SOW -> Spring quay lại range), thêm 150 nến
 * lịch sử phía trước (đủ 260 nến) và GTGD 10 tỷ/phiên.
 */
function springSeries() {
  const out = [];
  const push = (len, path, vol, spread = 0.006) => {
    for (let k = 0; k < len; k++) {
      const c = path(k), prev = out.length ? out[out.length - 1].close : c;
      const o = prev, hi = Math.max(o, c) * (1 + spread), lo = Math.min(o, c) * (1 - spread);
      out.push({ date: day(out.length), open: o, high: hi, low: lo, close: c, volume: vol(k), value: 1e10 });
    }
  };
  push(150, (k) => 140 + wave(k, 6, 30), () => 1_000_000);
  push(60, (k) => 140 - k * 0.6, () => 1_000_000);
  push(60, (k) => 104 + wave(k, 3.5, 15), () => 800_000, 0.004);
  push(6, (k) => 100 - (k + 1) * 1.6, (k) => (k === 0 ? 3_000_000 : 1_400_000));
  push(8, (k) => 91 + (k + 1) * 1.6, () => 1_200_000);
  push(12, (k) => 103 + wave(k, 2, 12), () => 700_000, 0.004);
  push(3, (k) => [99.2, 98.5, 102.5][k], () => 650_000);
  push(10, (k) => 103 + wave(k, 1.5, 10), () => 700_000, 0.004);
  return out.map((b) => ({ ...b, close: b.close * 1000, open: b.open * 1000, high: b.high * 1000, low: b.low * 1000 }));
}

test("scanConvergenceV2: cấu trúc Wyckoff đang hoạt động -> phía mua, 6 thành phần (tổng 100), kế hoạch cắt lỗ < vào < mục tiêu", () => {
  const r = scanConvergenceV2(springSeries());
  assert.ok(r, "có kết quả");
  assert.equal(r.side, "buy");
  assert.equal(r.version, CONVERGENCE_VERSION);
  assert.deepEqual(r.components.map((c) => c.key), ["wyckoff", "zone", "effort", "rs", "tests", "liquidity"]);
  assert.equal(r.components.reduce((s, c) => s + c.max, 0), 100);
  assert.ok(["READY", "WATCH"].includes(r.status));
  assert.ok(r.plan && r.plan.stop < r.plan.entry && r.plan.entry < r.plan.target, JSON.stringify(r.plan));
  for (const l of r.levels.filter((x) => x.kind === "ob" || x.kind === "fvg")) assert.match(l.label, /tăng/, "phía mua chỉ dùng OB/FVG tăng");
});

test("runTechnicalFilters: có doc Hợp lưu v2; bằng chứng chờ job đêm khi KV trống, đọc KV khi còn hiệu lực", async () => {
  const store = createMemoryStore();
  await store.setKv("scanner:universe", { tickers: [{ ticker: "AAA", sector: "Test", name: "AAA Corp" }] });
  const loadSeries = async () => ({ bars: springSeries(), priceBasis: "ADJUSTED_CUMULATIVE" });
  const criteria = screenerCriteria({});
  let docs = await runTechnicalFilters({ store }, { loadSeries, criteria, strategies: ["convergence"] });
  const d = docs.convergence;
  assert.equal(d.engine, STRATEGY_ENGINE.convergence);
  assert.equal(d.results.length, 1);
  assert.equal(d.results[0].ticker, "AAA");
  assert.equal(d.evidence.label, "PENDING");
  await store.setKv(CONVERGENCE_EVIDENCE_KV, { engine: CONVERGENCE_VERSION, computedAt: new Date().toISOString(), evidence: { label: "EXPERIMENTAL", all: { n: 3 } } });
  docs = await runTechnicalFilters({ store }, { loadSeries, criteria, strategies: ["convergence"] });
  assert.equal(docs.convergence.evidence.label, "EXPERIMENTAL");
  assert.equal(docs.convergence.evidence.all.n, 3);
});

test("bằng chứng hết hiệu lực khi khác engine hoặc cũ hơn 7 ngày", () => {
  const now = Date.parse("2026-10-09T00:00:00Z");
  assert.equal(convergenceEvidenceFresh({ engine: CONVERGENCE_VERSION, computedAt: "2026-10-05T00:00:00Z" }, now), true);
  assert.equal(convergenceEvidenceFresh({ engine: CONVERGENCE_VERSION, computedAt: "2026-09-30T00:00:00Z" }, now), false);
  assert.equal(convergenceEvidenceFresh({ engine: "convergence-v2/H0", computedAt: "2026-10-08T00:00:00Z" }, now), false);
  assert.equal(convergenceEvidenceFresh(null, now), false);
});

test("KHÔNG ghi sổ cái tín hiệu cho Hợp lưu v2 (ghi DB là bước H4, cần duyệt riêng)", () => {
  const docs = { convergence: { strategy: "convergence", dataAsOf: "2026-10-09", results: [{ ticker: "AAA", status: "READY", grade: "A", metrics: { score: 80, close: 1 } }] } };
  assert.deepEqual(ledgerRows(docs), []);
});

test("backtest: vào lệnh T+1 sau tín hiệu, không chồng lệnh cùng mã", () => {
  const bars = [...springSeries(), ...Array.from({ length: 60 }, (_, k) => ({ date: day(309 + k), open: 104_000 + k * 50, high: 104_600 + k * 50, low: 103_400 + k * 50, close: 104_200 + k * 50, volume: 900_000, value: 1e10 }))];
  const { trades } = backtestConvergence(bars, { startIndex: 280 });
  for (let i = 0; i < trades.length; i++) {
    assert.ok(trades[i].entryIdx >= 281);
    if (i) assert.ok(trades[i].entryIdx > trades[i - 1].exitIdx, "không chồng lệnh");
  }
});

test("job buildConvergenceEvidence: worker thread không chặn event loop; một lượt tại một thời điểm; bỏ qua khi còn hiệu lực", async () => {
  const store = createMemoryStore();
  const tickers = ["AAA", "BBB", "CCC", "DDD"];
  await store.setKv("scanner:universe", { tickers: tickers.map((ticker) => ({ ticker })) });
  const bars = springSeries();
  for (const t of tickers) {
    await store.upsertBars(t, bars, "SSI");
    await store.upsertMarketDaily(bars.slice(-5).map((b) => ({ symbol: t, ...b })));
  }
  const corporateActions = { get: async () => ({ covered: true, events: [] }) };
  const jobs = createStrategyJobs({ service: { store }, corporateActions });
  // Mặc định không chờ: trả về ngay; lượt thứ hai trong lúc đang chạy -> RUNNING.
  const started = await jobs.buildConvergenceEvidence({ force: true });
  assert.equal(started.started, true);
  assert.equal((await jobs.buildConvergenceEvidence({ force: true })).skipped, "RUNNING");
  // Event loop vẫn chạy trong lúc worker tính.
  let ticks = 0;
  const timer = setInterval(() => { ticks++; }, 20);
  const deadline = Date.now() + 120_000;
  while (!(await store.getKv(CONVERGENCE_EVIDENCE_KV)) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
  clearInterval(timer);
  const stored = (await store.getKv(CONVERGENCE_EVIDENCE_KV)).value;
  assert.equal(stored.engine, CONVERGENCE_VERSION);
  assert.equal(stored.symbols, 4);
  assert.ok(stored.evidence.label);
  assert.ok(ticks >= Math.floor(stored.ms / 20) * 0.5, `event loop bị chặn: ${ticks} tick trong ${stored.ms} ms`);
  await new Promise((r) => setTimeout(r, 20));
  assert.equal((await jobs.buildConvergenceEvidence()).skipped, "FRESH");
});
