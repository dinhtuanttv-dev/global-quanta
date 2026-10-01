import test from "node:test";
import assert from "node:assert/strict";
import {
  buildVolumeAnalysis, computeTrend, computeForeign, computeProfile, computeIntraday,
} from "../src/market/scanner/volumeAnalysis.js";
import { addDays } from "../src/market/util.js";

function series(n, { close = (i) => 100 + i, volume = () => 1000, high, low, foreign = () => [0, 0] } = {}) {
  let date = "2026-07-01";
  return Array.from({ length: n }, (_, i) => {
    const c = close(i);
    const [fb, fs] = foreign(i);
    const row = { symbol: "AAA", date, open: c, high: high ? high(i) : c + 1, low: low ? low(i) : c - 1, close: c, closeAdj: c,
      volume: volume(i), value: volume(i) * c, dealVolume: 0, dealValue: 0,
      foreignBuyVol: fb / c, foreignSellVol: fs / c, foreignBuyVal: fb, foreignSellVal: fs, foreignRoom: 1e6 };
    date = addDays(date, 1);
    return row;
  });
}

test("volume: RVOL20 so với 20 phiên TRƯỚC đó, không tính phiên hiện tại", () => {
  const daily = series(30, { volume: (i) => (i === 29 ? 3000 : 1000) });
  const a = buildVolumeAnalysis({ symbol: "AAA", daily });
  assert.equal(a.today.avgVolume20, 1000);
  assert.equal(a.today.rvol20, 3);
  assert.ok(a.insights.some((s) => s.includes("đột biến 3×")));
});

test("volume: tỷ lệ KL phiên tăng/giảm, hướng OBV và CMF", () => {
  // Xen kẽ tăng (KL 2000) / giảm (KL 1000) -> tỷ lệ 2, OBV đi lên.
  const daily = series(40, { close: (i) => 100 + (i % 2 === 0 ? 2 : 0) + i * 0.01, volume: (i) => (i % 2 === 0 ? 2000 : 1000), high: (i) => 103 + i * 0.01, low: (i) => 99 + i * 0.01 });
  const t = computeTrend(daily);
  assert.equal(t.upDownVolumeRatio20, 2);
  assert.equal(t.obvDirection, "up");
  assert.ok(t.cmf20 !== null && t.cmf20 >= -1 && t.cmf20 <= 1);
  assert.equal(t.bars30.length, 30);
});

test("volume: phân kỳ giá tăng nhưng khối lượng giảm", () => {
  const daily = series(30, { close: (i) => 100 + i, volume: (i) => (i < 20 ? 2000 : 1000) });
  const t = computeTrend(daily);
  assert.equal(t.divergence.code, "PRICE_UP_VOLUME_DOWN");
});

test("volume: khối ngoại — chuỗi phiên mua ròng liên tiếp, lũy kế 5/20 phiên", () => {
  const daily = series(25, { foreign: (i) => (i >= 21 ? [5e9, 1e9] : [1e9, 2e9]) });
  const f = computeForeign(daily);
  assert.deepEqual(f.streak, { direction: "buy", sessions: 4 });
  assert.equal(f.net5Val, 4 * 4e9 - 1e9);
  assert.equal(f.netSeries20.length, 20);
});

test("volume: profile — POC ở vùng giá có KL lớn nhất, vùng giá trị bao ≥70% KL", () => {
  const bars = [];
  for (let p = 90; p <= 110; p++) bars.push({ date: "2026-10-01T10:00:00+07:00", high: p + 0.5, low: p - 0.5, close: p, volume: p === 100 ? 10_000 : 500 });
  const prof = computeProfile([bars], 105);
  assert.ok(Math.abs(prof.poc - 100) <= 1, `POC=${prof.poc}`);
  const inVa = prof.bins.filter((b) => b.priceLow >= prof.valueAreaLow && b.priceHigh <= prof.valueAreaHigh).reduce((s, b) => s + b.volume, 0);
  const total = prof.bins.reduce((s, b) => s + b.volume, 0);
  assert.ok(inVa / total >= 0.7);
  assert.equal(computeProfile([[]], 100), null);
});

test("volume: trong phiên — gom 15 phút, tỷ trọng ATO/ATC, so cùng thời điểm phiên trước", () => {
  const mk = (time, volume) => ({ date: `2026-10-01T${time}:00+07:00`, open: 1, high: 1, low: 1, close: 1, volume });
  const today = [mk("09:15", 1000), mk("09:20", 500), mk("10:02", 500)];
  const past = [[mk("09:15", 300), mk("09:40", 200), mk("13:30", 5000)], [mk("09:15", 500), mk("10:00", 0)]];
  const i = computeIntraday(today, past);
  assert.deepEqual(i.buckets15m.map((b) => [b.time, b.volume]), [["09:15", 1500], ["10:00", 500]]);
  assert.equal(i.atoSharePct, 50);
  assert.equal(i.sameTime.asOfTime, "10:02");
  assert.equal(i.sameTime.ratio, 4); // 2000 / bình quân(500, 500)
  // ATO (09:15) lớn theo cơ chế khớp định kỳ -> KHÔNG được coi là "đột biến"; chỉ xét khớp liên tục.
  assert.equal(i.peak.time, "09:20");
  const withAtc = computeIntraday([...today, mk("14:45", 9_999_999)], past);
  assert.notEqual(withAtc.peak.time, "14:45");
});
