// R6 — kiểm định tín hiệu chart: kiểm tra "ống dẫn" trên dữ liệu TỔNG HỢP (không phải dữ liệu kiểm định):
// tín hiệu cài sẵn lợi thế -> ĐẠT; tín hiệu ngẫu nhiên -> KHÔNG ĐẠT; mốc tuần -> phiên cuối tuần; giao cắt đúng định nghĩa.
import test from "node:test";
import assert from "node:assert/strict";
import { oscillatorSignals, runChartSignalValidation, weekEndIndex } from "../src/market/chartSignals/validate.js";

const day = (i) => new Date(Date.UTC(2021, 9, 1) + Math.floor(i * 1.45) * 86400000).toISOString().slice(0, 10); // ~1260 phiên ≈ 5 năm
function series(n, seed, drift = 0) {
  let a = seed >>> 0, px = 50_000;
  const rnd = () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
  const out = [];
  for (let i = 0; i < n; i++) {
    const o = px; px = Math.max(5_500, px * (1 + (rnd() - 0.5) * 0.03 + drift));
    out.push({ date: day(i), open: o, high: Math.max(o, px) * 1.005, low: Math.min(o, px) * 0.995, close: px, volume: 1_000_000, value: 60e9 });
  }
  return out;
}

test("giao cắt: RSI lên 30 / xuống 70, MACD hist qua 0, ADX ≥ 25 + DI cắt", () => {
  const lib = {
    calculateRSI: () => ({ series: [null, 25, 35, 75, 65] }),
    calculateMACD: () => ({ histogram: [null, -1, 0.5, 0.2, -0.1] }),
    calculateADX: () => ({ series: [null, 20, 30, 30, 30], plusDI: [null, 10, 20, 15, 30], minusDI: [null, 15, 12, 20, 10] }),
  };
  assert.deepEqual(oscillatorSignals(lib, new Array(5).fill({})), { RSI_UP: [2], RSI_DN: [4], MACD_UP: [2], ADX_DI: [2, 4] });
});

test("nến tuần -> phiên CUỐI tuần trong chuỗi ngày", () => {
  const d = ["2026-01-05", "2026-01-06", "2026-01-09", "2026-01-12", "2026-01-14"].map((date) => ({ date }));
  assert.deepEqual(weekEndIndex(d, [{ date: "2026-01-05" }, { date: "2026-01-12" }]), [2, 4]);
});

function stubLib(plant) {
  // Tín hiệu C1 ở mọi nến mà `plant(sym, t)` chọn; các tín hiệu khác không có.
  return {
    calculateRSI: (bars) => ({ series: bars.map(() => null) }), calculateMACD: (bars) => ({ histogram: bars.map(() => null) }),
    calculateADX: (bars) => ({ series: bars.map(() => null), plusDI: bars.map(() => null), minusDI: bars.map(() => null) }),
    computeStructure: () => ({ events: [], pivots: [] }), buildFlowBars: () => [], detectCvdDivergence: () => [],
    aggregateToWeekly: (bars) => bars.filter((_, i) => i % 5 === 0), plant,
  };
}

test("ống dẫn: lợi thế cài sẵn -> C1 ĐẠT; ngẫu nhiên -> C1 KHÔNG ĐẠT; tín hiệu không có -> THIẾU MẪU", () => {
  const daily = {};
  for (let k = 0; k < 40; k++) daily[`S${String(k).padStart(2, "0")}`] = series(1260, 1000 + k);
  // Cài lợi thế: sau mỗi nến cài, giá tăng 6% trong 10 phiên (sửa trực tiếp chuỗi giá).
  const planted = new Set();
  // Lệch ngày cài giữa các mã — nếu cài cùng ngày, chuẩn (TB toàn tập cùng ngày) cũng tăng và lợi suất VƯỢT TRỘI về 0.
  Object.entries(daily).forEach(([s, bars], k) => {
    for (let t = 280 + ((k * 11) % 37); t < bars.length - 40; t += 37) {
      planted.add(`${s}|${t}`);
      for (let j = t + 1; j <= t + 10; j++) for (const f of ["open", "high", "low", "close"]) bars[j][f] *= 1 + 0.006 * (j - t);
      for (let j = t + 11; j < bars.length; j++) for (const f of ["open", "high", "low", "close"]) bars[j][f] *= 1.06;
    }
  });
  const lib = { ...stubLib(), calculateRSI: (bars) => ({ series: bars.map((b, t) => (t === 0 ? null : 0)) }) };
  // RSI giả: 25 trước nến cài, 35 tại nến cài -> giao cắt lên 30 đúng ở nến cài.
  const sym = new Map(Object.entries(daily).map(([s, b]) => [b, s]));
  lib.calculateRSI = (bars) => { const s = sym.get(bars); return { series: bars.map((_, t) => (s && planted.has(`${s}|${t}`) ? 35 : 25)) }; };
  const good = runChartSignalValidation({ daily, lib });
  assert.equal(good.results.C1.verdict, "PASS", good.results.C1.reason);
  assert.equal(good.results.C3.verdict, "INSUFFICIENT");

  const noise = runChartSignalValidation({ daily: Object.fromEntries(Object.keys(daily).map((s, k) => [s, series(1260, 5000 + k)])),
    lib: { ...stubLib(), calculateRSI: (bars) => ({ series: bars.map((_, t) => (t % 41 === 0 ? 35 : 25)) }) } });
  assert.notEqual(noise.results.C1.verdict, "PASS");
});
