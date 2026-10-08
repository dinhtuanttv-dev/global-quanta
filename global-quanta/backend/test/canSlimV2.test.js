import test from "node:test";
import assert from "node:assert/strict";
import {
  CS, buildRsTable, detectCupHandle, evaluateCs, fundamentalFactors, marketContextM, prepareCs, quartersAvailable,
} from "../src/market/strategies/canSlimV2.js";

const day = (i) => new Date(Date.UTC(2024, 0, 1) + i * 86_400_000).toISOString().slice(0, 10);

/** Đà tăng 100 phiên (100k→140k), cốc U 120 phiên sâu 25%, tay cầm 10 phiên sâu ~6%, rồi `last` (giá đóng cửa phiên cuối). */
function cupBars(last = 141_000, { lastVolume = 3_000_000 } = {}) {
  const closes = [];
  for (let i = 0; i < 100; i++) closes.push(100_000 + (40_000 * i) / 99);
  for (let i = 1; i <= 120; i++) closes.push(140_000 - 35_000 * Math.sin((Math.PI * i) / 120) - (i === 120 ? 1_000 : 0)); // về 139k
  for (let i = 1; i <= 10; i++) closes.push(139_000 - 8_000 * Math.sin((Math.PI * i) / 11));
  closes.push(last);
  return closes.map((c, i) => ({
    date: day(i), open: c, high: c * 1.002, low: c * 0.998, close: c,
    volume: i === closes.length - 1 ? lastVolume : i > 220 ? 600_000 : 1_000_000,
  }));
}

test("cốc tay cầm O'Neil: nhận BREAKOUT tại phiên vượt pivot, đo đúng hình học", () => {
  const bars = cupBars();
  const S = prepareCs(bars);
  const p = detectCupHandle(S, S.n - 1);
  assert.ok(p, "phải nhận ra mẫu hình");
  assert.equal(p.status, "BREAKOUT");
  assert.ok(p.depthPct > 20 && p.depthPct < 30, `độ sâu ${p.depthPct}`);
  assert.ok(p.cupBars >= CS.cupMin && p.cupBars <= CS.cupMax);
  assert.ok(p.handleBars >= 10 && p.handleBars <= 11, `tay cầm ${p.handleBars}`); // miệng phải = đỉnh cao nhất cuối cốc
  assert.ok(p.handleDepthPct < 15);
  assert.ok(p.uShape, "đáy tròn chữ U");
  assert.ok(p.handleVolDry, "KL tay cầm cạn");
  assert.ok(p.pivot > p.rightLip && p.pivot - p.rightLip <= 100, "pivot = đỉnh tay cầm + 1 bước giá");
});

test("SETUP khi giá còn dưới pivot ≤ 5%; không nhận khi đã kéo quá vùng mua (> pivot + 5%)", () => {
  const setup = detectCupHandle(prepareCs(cupBars(136_000)), 230);
  assert.equal(setup?.status, "SETUP");
  assert.equal(detectCupHandle(prepareCs(cupBars(150_000)), 230), null);
});

test("tay cầm sâu hơn 15% hoặc rơi xuống nửa dưới cốc -> không phải cốc tay cầm", () => {
  const bars = cupBars();
  for (let i = 221; i <= 229; i++) { bars[i].low = 112_000; bars[i].close = 113_000; bars[i].open = 113_000; }
  assert.equal(detectCupHandle(prepareCs(bars), bars.length - 1), null);
});

test("không nhìn trước: evaluateCs trên bars[0..t] = trên toàn chuỗi tại t", () => {
  const bars = [...cupBars(), ...Array.from({ length: 30 }, (_, k) => ({ date: day(231 + k), open: 142_000, high: 143_000, low: 141_000, close: 142_000 + k * 100, volume: 900_000 }))];
  const full = prepareCs(bars);
  for (const t of [225, 230, 245]) {
    const a = evaluateCs(full, t), b = evaluateCs(prepareCs(bars.slice(0, t + 1)), t);
    assert.deepEqual({ s: a.status, sc: a.score }, { s: b.status, sc: b.score });
  }
});

test("BCTC theo ngày công bố ước tính (hết quý + 45 ngày); C/A đo bằng LNST; ROE", () => {
  const q = (year, quarter, netProfit, revenue = netProfit * 10) => ({ year, quarter, periodLabel: `Q${quarter}/${year}`, netProfit, revenue });
  const income = [q(2026, 2, 200), q(2026, 1, 150), q(2025, 4, 120), q(2025, 3, 110), q(2025, 2, 100), q(2025, 1, 100), q(2024, 4, 90), q(2024, 3, 90), q(2024, 2, 80), q(2024, 1, 80), q(2023, 4, 70), q(2023, 3, 70)];
  const balance = income.map((x) => ({ year: x.year, quarter: x.quarter, totalEquity: 2_000 }));
  assert.equal(quartersAvailable(income, "2026-08-13")[0].periodLabel, "Q1/2026", "Q2 chưa công bố trước 14/08");
  assert.equal(quartersAvailable(income, "2026-08-14")[0].periodLabel, "Q2/2026");
  const f = fundamentalFactors({ income: { quarters: income }, balance: { quarters: balance } }, "2026-09-01");
  assert.equal(f.latestQuarter, "Q2/2026");
  assert.ok(Math.abs(f.npGrowthQ - 1) < 1e-9, "200 vs 100 = +100%");
  assert.ok(Math.abs(f.npGrowthPrevQ - 0.5) < 1e-9);
  assert.equal(f.accelerating, true);
  assert.ok(Math.abs(f.npGrowthTtm - (580 / 380 - 1)) < 1e-9);
  assert.equal(f.sustained, true);
  assert.ok(Math.abs(f.roe - 0.29) < 1e-9);
  assert.equal(fundamentalFactors({ income: { quarters: income } }, "2023-01-01"), null, "chưa có quý nào công bố");
});

test("RS O'Neil xếp phần trăm theo ngày; ngành mạnh nhất = 1", () => {
  const mk = (g) => Array.from({ length: 300 }, (_, i) => ({ date: day(i), close: 10_000 * (1 + g) ** i }));
  const m = new Map(Array.from({ length: 30 }, (_, k) => [`S${k}`, { bars: mk(k / 10_000), sector: k >= 20 ? "Mạnh" : "Yếu" }]));
  const t = buildRsTable(m);
  const d = day(299);
  assert.ok(t.rs("S29", d) > 95 && t.rs("S0", d) < 5);
  assert.equal(t.sector("S29", d), 1);
  assert.equal(t.sector("S0", d), 0);
  assert.equal(t.rs("S0", day(100)), null, "chưa đủ 252 phiên");
});

test("M: ngày phân phối = giảm ≥ 0,2% với KL cao hơn phiên trước, đếm trong 25 phiên", () => {
  const idx = Array.from({ length: 40 }, (_, i) => ({ date: day(i), close: 1_000 + (i % 2 ? -5 : 5) + i * 0.1, volume: 1_000 + (i % 2 ? 100 : 0) }));
  const m = marketContextM(idx);
  assert.equal(m.distributionDays(day(10)), null);
  const n = m.distributionDays(day(39));
  assert.ok(n >= 12 && n <= 13, `${n}`);
});
