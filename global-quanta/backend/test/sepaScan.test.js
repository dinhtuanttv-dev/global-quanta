// SEPA SP2 — tích hợp Gateway: chiến lược `sepa` trong runTechnicalFilters (KV strategies:sepa), dữ liệu VN (VCI, VND).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { createMemoryStore } from "../src/market/store/memoryStore.js";
import { runTechnicalFilters, screenerCriteria, STRATEGY_ENGINE, STRATEGY_IDS } from "../src/market/strategies/technicalFilters.js";
import { isSepaS2, ledgerRows, liveTracking } from "../src/market/strategies/signalTracking.js";
import { analyzeFundamentals, vnQuarterly } from "../src/market/strategies/sepa/index.js";

const O = JSON.parse(gunzipSync(readFileSync(new URL("./fixtures/sepa/oracle_sp2.json.gz", import.meta.url))).toString("utf8"));
const U = O.universes.big;
const K = 1000; // giá mẫu ~20 -> 20.000đ

/** q (lõi) -> bản ghi VCI như kho market_fundamentals. */
function toVci(ticker, q) {
  const rows = q.date.map((d, i) => ({ year: Number(d.slice(0, 4)), quarter: Math.ceil(Number(d.slice(5, 7)) / 3), i }));
  const v = (c, i) => (q.cols[c] ? q.cols[c][i] : null);
  return {
    ticker,
    income: { available: true, quarters: rows.map(({ year, quarter, i }) => ({ year, quarter, periodLabel: `Q${quarter}/${year}`, revenue: v("revenue", i), netProfit: v("net_income", i) ?? v("eps", i), grossProfit: v("gross_profit", i) })).reverse() },
    balance: { available: true, quarters: rows.map(({ year, quarter, i }) => ({ year, quarter, inventory: v("inventory", i), receivables: v("receivables", i), totalEquity: 1000 })).reverse() },
  };
}

async function setup() {
  const store = createMemoryStore();
  const tickers = Object.keys(U.prices);
  await store.setKv("scanner:universe", { tickers: tickers.map((ticker, i) => ({ ticker, name: `${ticker} JSC`, sector: ["Ngân hàng", "Thép", "Bán lẻ", "Bất động sản"][i % 4] })) });
  await store.upsertFundamentals(Object.entries(U.fund).filter(([, q]) => q.cols.revenue).map(([t, q]) => toVci(t, q)));
  const toBars = (s, k = K) => s.date.map((date, i) => ({ date, open: s.open[i] * k, high: s.high[i] * k, low: s.low[i] * k, close: s.close[i] * k, volume: s.volume[i] }));
  const loadSeries = async (symbol) => ({ bars: toBars(U.prices[symbol]), priceBasis: "ADJUSTED_CUMULATIVE" });
  loadSeries.index = async () => toBars(U.index, 1);
  return { service: { store }, loadSeries };
}

test("sepa là một chiến lược của bộ lọc TA (engine sepa/SP6), chạy cùng lần tải dữ liệu", () => {
  assert.ok(STRATEGY_IDS.includes("sepa"));
  assert.equal(STRATEGY_ENGINE.sepa, "sepa/SP6");
});

test("KV strategies:sepa: 4 danh sách, xếp theo danh sách rồi điểm, JSON sạch, kế hoạch lệnh cho mã gần điểm mua", async () => {
  const { service, loadSeries } = await setup();
  const docs = await runTechnicalFilters(service, { loadSeries, criteria: screenerCriteria({}), strategies: ["sepa"] });
  const d = docs.sepa;
  assert.equal(d.engine, "sepa/SP6");
  assert.equal(d.evidence.label, "EXPERIMENTAL");
  assert.equal(d.evidence.validation.hypotheses.find((h) => h.id === "S2").verdict, "PASS");
  assert.deepEqual(d.evidence.validation.hypotheses.filter((h) => ["S1", "S3", "S4"].includes(h.id)).map((h) => h.verdict), ["FAIL", "FAIL", "FAIL"]);
  assert.equal(JSON.stringify(d), JSON.stringify(JSON.parse(JSON.stringify(d))));
  assert.ok(!JSON.stringify(d).includes("NaN"));
  const order = { "SẴN SÀNG MUA": 0, "CẢNH BÁO MUA": 1, "THEO DÕI": 2, "LOẠI": 3 };
  for (let i = 1; i < d.results.length; i++) {
    const a = d.results[i - 1], b = d.results[i];
    assert.ok(order[a.list] < order[b.list] || (order[a.list] === order[b.list] && a.score >= b.score), `${a.ticker} -> ${b.ticker}`);
  }
  assert.equal(Object.values(d.lists).reduce((x, y) => x + y, 0), d.results.length);
  assert.ok(d.lists["SẴN SÀNG MUA"] > 0 && d.lists["LOẠI"] > 0);
  for (const r of d.results) {
    assert.ok(r.liquidity.avgValue20 >= 5e9 && r.liquidity.price >= 5000);
    if (r.list === "SẴN SÀNG MUA") {
      assert.ok(["NEAR_PIVOT", "BREAKOUT"].includes(r.status));
      assert.ok(r.plan && r.plan.stopPct <= 0.1 && !r.plan.stopTooWide && r.plan.shares % 100 === 0);
      assert.ok(r.pattern.details && r.pattern.footprint);
    }
    if (r.list === "LOẠI") assert.ok(r.plan === undefined && r.trend.criteria);
  }
  // Thị trường SEPA + ngành dẫn dắt
  assert.ok(["THUẬN LỢI", "TRUNG TÍNH", "THẬN TRỌNG", "BẤT LỢI"].includes(d.market.sepa.danh_gia));
  assert.match(d.market.sepa.ghi_chu_RS, /phân vị/);
  assert.ok(d.sectors.length === 4 && d.sectors[0].hang_nganh === 1);
  // Cơ bản VN: nguồn và quý gần nhất có nhãn; mã không có BCTC -> cảnh báo thiếu dữ liệu
  const withFa = d.results.find((r) => U.fund[r.ticker]);
  assert.match(withFa.fundamentals.source, /hết quý \+ 45 ngày/);
  const noFa = d.results.find((r) => !U.fund[r.ticker] && r.list !== "LOẠI");
  assert.equal(noFa.fundamentals.score, 0);
  assert.ok(noFa.fundamentals.warnings[0].startsWith("Thiếu dữ liệu cơ bản"));
});

test("sổ theo dõi SEPA (SP5): READY / ALERT theo danh sách + S2; THEO DÕI / LOẠI không ghi; liveTracking 3 nhóm", async () => {
  const { service, loadSeries } = await setup();
  const docs = await runTechnicalFilters(service, { loadSeries, criteria: screenerCriteria({}), strategies: ["sepa"] });
  const rows = ledgerRows(docs);
  const res = docs.sepa.results;
  const count = (l) => res.filter((r) => r.list === l).length;
  assert.equal(rows.filter((r) => r.signal === "SCR_SEPA_READY").length, count("SẴN SÀNG MUA"));
  assert.equal(rows.filter((r) => r.signal === "SCR_SEPA_ALERT").length, count("CẢNH BÁO MUA"));
  assert.equal(rows.filter((r) => r.signal === "SCR_SEPA_S2").length, res.filter(isSepaS2).length);
  assert.ok(rows.every((r) => r.direction === 1 && r.model_version === "sepa/SP6" && r.features.list));
  assert.ok(!rows.some((r) => ["THEO DÕI", "LOẠI"].includes(r.features.list)));
  const live = liveTracking({ generatedAt: "x", rows: [{ regime: "ALL", signal: "SCR_SEPA_READY", horizon: 5, n: 12, hitRate: 0.6, baseline: 0.5, hitLow: 0.4, hitHigh: 0.8, verdict: "none" }] }, "sepa");
  assert.deepEqual(live.groups.map((g) => g.key), ["ready", "alert", "s2"]);
  assert.equal(live.groups[0].h5.n, 12);
});

test("vnQuarterly: chỉ quý đã công bố (hết quý + 45 ngày), quý thiếu = NaN để so cùng kỳ đúng quý", () => {
  const fa = {
    income: { quarters: [
      { year: 2025, quarter: 4, netProfit: 150, revenue: 1500 }, { year: 2025, quarter: 3, netProfit: 120, revenue: 1300 },
      { year: 2025, quarter: 1, netProfit: 100, revenue: 1100 }, // thiếu Q2/2025
      { year: 2024, quarter: 4, netProfit: 100, revenue: 1000 }, { year: 2024, quarter: 3, netProfit: 90, revenue: 950 },
      { year: 2024, quarter: 2, netProfit: 80, revenue: 900 }, { year: 2024, quarter: 1, netProfit: 70, revenue: 850 },
    ] },
    balance: { quarters: [] },
  };
  const before = vnQuarterly(fa, "2026-02-13"); // Q4/2025 kết thúc 31/12 -> công bố ước tính 14/02
  assert.equal(before.latestQuarter, "Q3/2025");
  const q = vnQuarterly(fa, "2026-02-14");
  assert.equal(q.latestQuarter, "Q4/2025");
  assert.deepEqual(q.date, ["2024-03-31", "2024-06-30", "2024-09-30", "2024-12-31", "2025-03-31", "2025-06-30", "2025-09-30", "2025-12-31"]);
  assert.ok(Number.isNaN(q.cols.eps[5]));
  assert.ok(!q.cols.inventory, "cột không có số (ngân hàng / chưa tải) -> vắng, cờ không xét");
  const r = analyzeFundamentals(q);
  assert.ok(Math.abs(r.metrics.EPS_gan_nhat - 0.5) < 1e-12); // LNST Q4/2025 150 vs Q4/2024 100
});
