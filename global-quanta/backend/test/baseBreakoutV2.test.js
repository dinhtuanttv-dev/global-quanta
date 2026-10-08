import test from "node:test";
import assert from "node:assert/strict";
import { VN_RULES } from "../src/market/strategies/vnBacktest.js";
import { V2, backtestV2, dailyVolumeProfile, evaluateV2, marketContext, prepareV2, summarizeTrades } from "../src/market/strategies/baseBreakoutV2.js";

const T = 280; // phiên tín hiệu trong các ca dựng sẵn

/** Xu hướng tăng đều 0,2%/phiên (mỗi phiên đều vượt nền 10 phiên), rồi nối các nến `tail` (giá tương đối với close[T]). */
function series(tail = [], n = T + 1) {
  const bars = [];
  for (let i = 0; i < n; i++) {
    const c = 10_000 * 1.002 ** i;
    bars.push({ date: day(i), open: c * 0.999, high: c * 1.003, low: c * 0.997, close: c, volume: 1_000_000 });
  }
  const base = bars[T].close;
  tail.forEach(([o, h, l, c], k) => bars.push({ date: day(n + k), open: o * base, high: h * base, low: l * base, close: c * base, volume: 1_000_000 }));
  return bars;
}
function day(i) {
  return new Date(Date.UTC(2024, 0, 1) + i * 86_400_000).toISOString().slice(0, 10);
}
const onlyAt = (t0) => (sig, t) => t === t0;
const flat = (k) => Array.from({ length: k }, () => [1.0, 1.001, 0.999, 1.0]);

test("chuỗi tăng đều tạo BREAKOUT có kế hoạch stop < entry", () => {
  const S = prepareV2(series());
  const r = evaluateV2(S, T);
  assert.equal(r.status, "BREAKOUT");
  assert.ok(r.plan.stop < r.plan.entry && r.plan.target > r.plan.entry);
  assert.equal(r.plan.rr, V2.rr);
  assert.equal(r.components.reduce((a, x) => a + x.max, 0), 100, "tổng trọng số 100");
});

test("T+2,5: thủng stop ở T và T+1 nhưng chỉ bán được chiều T+2, giá = min(stop, đóng cửa)", () => {
  const bars = series([[1.001, 1.002, 0.9, 0.92], [0.92, 0.93, 0.89, 0.9], [0.9, 0.95, 0.9, 0.93], ...flat(5)]);
  const { trades } = backtestV2(bars, { accept: onlyAt(T) });
  assert.equal(trades.length, 1);
  const x = trades[0];
  assert.equal(x.entryIdx, T + 1);
  assert.equal(x.exitIdx, T + 3, "không bán ở T (entry) và T+1");
  assert.equal(x.reason, "STOP");
  const entry = bars[T + 1].open * (1 + VN_RULES.slipPct);
  const exitPx = Math.min(x.stop, bars[T + 3].close);
  const expected = ((exitPx * (1 - VN_RULES.slipPct) * (1 - VN_RULES.feePct - VN_RULES.sellTaxPct)) / (entry * (1 + VN_RULES.feePct)) - 1) * 100;
  assert.ok(Math.abs(x.netPct - expected) < 1e-9, `${x.netPct} vs ${expected}`);
});

test("phiên vào lệnh khoá trần (H=L, +7%) -> bỏ lệnh mua", () => {
  const bars = series([[1.07, 1.07, 1.07, 1.07], ...flat(10)]);
  const r = backtestV2(bars, { accept: onlyAt(T) });
  assert.equal(r.trades.length, 0);
  assert.equal(r.skippedLimitUp, 1);
});

test("khoá sàn (H=L, −7%) -> không bán được, thoát phiên kế tiếp", () => {
  // bán được từ T+3 (= entry+2); T+3 khoá sàn -> thoát T+4
  const bars = series([[1.0, 1.001, 0.999, 1.0], [1.0, 1.001, 0.999, 1.0], [0.93, 0.93, 0.93, 0.93], [0.92, 0.95, 0.9, 0.94], ...flat(5)]);
  const { trades } = backtestV2(bars, { accept: onlyAt(T) });
  assert.equal(trades[0].exitIdx, T + 4);
  assert.equal(trades[0].reason, "STOP");
});

test("chi phí: đi ngang tới hết thời gian giữ -> lỗ đúng bằng phí 2 chiều + trượt giá + thuế bán 0,1%", () => {
  const bars = series(flat(12));
  const { trades } = backtestV2(bars, { accept: onlyAt(T), trailMA: 0, maxHold: 5 });
  assert.equal(trades[0].reason, "TIME");
  const expected = (((1 - VN_RULES.slipPct) * (1 - VN_RULES.feePct - VN_RULES.sellTaxPct)) / ((1 + VN_RULES.slipPct) * (1 + VN_RULES.feePct)) - 1) * 100;
  assert.ok(Math.abs(trades[0].netPct - expected) < 1e-9, `${trades[0].netPct} vs ${expected}`);
  assert.ok(trades[0].netPct < -0.5 && trades[0].netPct > -0.6, `${trades[0].netPct}`);
});

test("không nhìn trước: evaluateV2 trên bars[0..t] = trên toàn chuỗi tại t", () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const bars = [];
  let c = 20_000;
  for (let i = 0; i < 420; i++) {
    c *= 1 + (rnd() - 0.47) * 0.04;
    const o = c * (1 + (rnd() - 0.5) * 0.01);
    bars.push({ date: day(i), open: o, high: Math.max(o, c) * (1 + rnd() * 0.01), low: Math.min(o, c) * (1 - rnd() * 0.01), close: c, volume: 5e5 + rnd() * 1e6, foreignNet: (rnd() - 0.5) * 1e9 });
  }
  const ctx = marketContext(bars.map((b) => ({ date: b.date, close: b.close })));
  const full = prepareV2(bars);
  for (const t of [300, 350, 419]) {
    const a = evaluateV2(full, t, ctx), b = evaluateV2(prepareV2(bars.slice(0, t + 1)), t, ctx);
    assert.deepEqual({ s: a.status, sc: a.score, g: a.grade }, { s: b.status, sc: b.score, g: b.grade });
  }
});

test("Volume Profile: POC ở vùng giá giao dịch nhiều nhất, VAL ≤ POC ≤ VAH", () => {
  const H = new Float64Array([110, 110, 110, 130]), L = new Float64Array([100, 100, 100, 120]), V = new Float64Array([1e6, 1e6, 1e6, 1e5]);
  const vp = dailyVolumeProfile(H, L, V, 0, 3);
  assert.ok(vp.poc >= 100 && vp.poc <= 110);
  assert.ok(vp.val <= vp.poc && vp.poc <= vp.vah);
});

test("yếu tố M: VN-Index trên MA20, chỉ dùng dữ liệu đến ngày đó; tổng hợp lệnh", () => {
  const idx = Array.from({ length: 30 }, (_, i) => ({ date: day(i), close: i < 25 ? 1000 + i : 900 }));
  const m = marketContext(idx);
  assert.equal(m.marketUp(day(10)), null, "chưa đủ 20 phiên");
  assert.equal(m.marketUp(day(24)), true);
  assert.equal(m.marketUp(day(29)), false);
  const s = summarizeTrades([{ netPct: 4, R: 1, bars: 5, reason: "TARGET" }, { netPct: -2, R: -0.5, bars: 3, reason: "STOP" }]);
  assert.deepEqual([s.n, s.winRate, s.profitFactor, s.expectancyR], [2, 50, 2, 0.25]);
});
