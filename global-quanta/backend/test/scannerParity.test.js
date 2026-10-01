// Golden test: công thức đã chuyển (src/market/scanner/formulas.js) phải cho kết quả
// GIỐNG HỆT bản gốc của Project A (test/fixtures/projectA, commit 9306bc3) trên cùng
// dữ liệu đầu vào. Node 24 chạy trực tiếp file .ts (type stripping).

import test from "node:test";
import assert from "node:assert/strict";
import * as ported from "../src/market/scanner/formulas.js";
import * as tiA from "./fixtures/projectA/technical-indicators.ts";
import * as ceA from "./fixtures/projectA/confluence-engine.ts";
import * as seA from "./fixtures/projectA/scoring-engine.ts";
import * as mtA from "./fixtures/projectA/market-tags.ts";
import * as dqA from "./fixtures/projectA/dividend-quality-score.ts";

// Bộ sinh số ngẫu nhiên có seed để test lặp lại được.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function randomBars(r, n) {
  const bars = [];
  let close = 10_000 + r() * 90_000;
  for (let i = 0; i < n; i++) {
    const open = close * (1 + (r() - 0.5) * 0.04);
    close = Math.max(100, open * (1 + (r() - 0.5) * 0.07));
    const high = Math.max(open, close) * (1 + r() * 0.02);
    const low = Math.min(open, close) * (1 - r() * 0.02);
    bars.push({ date: `d${i}`, open, high, low, close, adjClose: close * (0.9 + r() * 0.1), volume: Math.round(r() * 5e6) });
  }
  return bars;
}

const ITER = 2000;

test("parity: SMA, RSI, MACD histogram, ATR khớp bản gốc", () => {
  const r = rng(1);
  for (let k = 0; k < ITER; k++) {
    const n = Math.floor(r() * 260);
    const bars = randomBars(r, n);
    const closes = bars.map((b) => b.close);
    for (const p of [14, 20, 50, 200]) assert.deepEqual(ported.calculateSMA(closes, p), tiA.calculateSMA(closes, p));
    assert.deepEqual(ported.calculateRSI(closes), tiA.calculateRSI(closes));
    assert.deepEqual(ported.calculateMACDHistogram(closes), tiA.calculateMACDHistogram(closes));
    assert.deepEqual(ported.calculateAtrSeries(bars, 14), tiA.calculateAtrSeries(bars, 14));
  }
  // Chuỗi đi ngang (avgLoss = 0) và quá ngắn.
  assert.equal(ported.calculateRSI(Array(30).fill(5)), tiA.calculateRSI(Array(30).fill(5)));
  assert.equal(ported.calculateRSI([1, 2]), tiA.calculateRSI([1, 2]));
});

test("parity: confluence engine (trend bias, MA alignment, impulse, ma trận confluence)", () => {
  const r = rng(2);
  const biases = ["uptrend", "accumulation", "distribution", "defensive", "downtrend"];
  const tags = ["Up-Trend", "Down-Trend", "Accumulation", "Distribution"];
  const qualities = ["Low Debt", "High Margin", "Core Cash Flow"];
  for (let k = 0; k < ITER * 5; k++) {
    const base = 1000 + r() * 1000;
    const [p, m20, m50, m200] = [0, 1, 2, 3].map(() => base * (0.9 + r() * 0.2));
    const breadth = r() * 100;
    const death = r() > 0.5;
    const drop = r() * 30;
    assert.deepEqual(ported.computeTrendBias(p, m20, m50, m200, breadth, death, drop), ceA.computeTrendBias(p, m20, m50, m200, breadth, death, drop));
    assert.equal(ported.computeMaAlignmentScore(m20, m50, m200), ceA.computeMaAlignmentScore(m20, m50, m200));
    assert.equal(ported.computeMaAlignmentScore(m20, m50, 0), ceA.computeMaAlignmentScore(m20, m50, 0));
    const rsi = r() * 120 - 10;
    const atrPct = r() * 120 - 10;
    const maAlign = r() * 100;
    assert.equal(ported.computeImpulseScore(rsi, breadth, maAlign, atrPct), ceA.computeImpulseScore(rsi, breadth, maAlign, atrPct));
    const bias = biases[Math.floor(r() * biases.length)];
    const tag = tags[Math.floor(r() * tags.length)];
    const q = qualities[Math.floor(r() * qualities.length)];
    const rs = 1 + r() * 98;
    const bp = r() * 100;
    assert.deepEqual(ported.computeConfluence(bias, tag, rs, q, bp), ceA.computeConfluence(bias, tag, rs, q, bp));
  }
});

test("parity: scoring engine (FA, TA, event impact, smart score, R/R, momentum)", () => {
  const r = rng(3);
  const tags = ["Up-Trend", "Down-Trend", "Accumulation", "Distribution", "Khác"];
  const divs = ["none", "bullish", "bearish"];
  for (let k = 0; k < ITER; k++) {
    const u = Array.from({ length: Math.floor(r() * 300) }, () => r() * 2 - 0.5);
    const v = r() * 2 - 0.5;
    assert.equal(ported.percentileRank(v, u), seA.percentileRank(v, u));
    const [roe, margin, growth] = [r() - 0.3, r() - 0.3, r() * 2 - 1];
    const u2 = u.map((x) => x * 0.8);
    const u3 = u.map((x) => x * 1.3);
    assert.equal(ported.computeFaScore(roe, margin, growth, u, u2, u3), seA.computeFaScore(roe, margin, growth, u, u2, u3));
    const tag = tags[Math.floor(r() * tags.length)];
    const div = divs[Math.floor(r() * divs.length)];
    const rs = 1 + r() * 98;
    const liq = r() * 1e7;
    const uLiq = u.map((x) => Math.abs(x) * 1e7);
    assert.equal(ported.computeTaScore(rs, tag, liq, uLiq, div), seA.computeTaScore(rs, tag, liq, uLiq, div));
    const fa = r() * 100, ta = r() * 100, ev = r() * 100, boost = [-1, 0, 1, 2][Math.floor(r() * 4)];
    assert.equal(ported.computeSmartScore(fa, ta, ev, boost), seA.computeSmartScore(fa, ta, ev, boost));
    const price = 10_000 + r() * 50_000;
    const ma50 = price * (0.85 + r() * 0.3);
    assert.deepEqual(ported.computeRiskReward(price, ma50 * 0.97, ma50 * 1.03), seA.computeRiskReward(price, ma50 * 0.97, ma50 * 1.03));
    const closes = randomBars(r, Math.floor(r() * 120)).map((b) => b.adjClose);
    assert.equal(ported.computeRiskAdjustedMomentum(closes), seA.computeRiskAdjustedMomentum(closes));
  }
  const events = [
    { verifiedStatus: "user_confirmed", sectors: ["Chứng khoán "], magnitude: "medium", direction: "positive", status: "ongoing", daysRemaining: 5 },
    { verifiedStatus: "user_confirmed", sectors: ["ngân hàng"], magnitude: "high", direction: "negative", status: "upcoming", daysRemaining: 12 },
    { verifiedStatus: "user_confirmed", sectors: ["ngân hàng"], magnitude: "low", direction: "positive", status: "upcoming", daysRemaining: null },
    { verifiedStatus: "pending", sectors: ["Thép"], magnitude: "high", direction: "positive", status: "ongoing", daysRemaining: 3 },
    { verifiedStatus: "user_confirmed", sectors: ["Thép"], magnitude: "weird", direction: "positive", status: "resolved", daysRemaining: null },
  ];
  for (const sector of ["chứng khoán", "Ngân hàng", "Thép", "Khac", "  NGÂN HÀNG "]) {
    assert.equal(ported.computeEventImpactScore(sector, events), seA.computeEventImpactScore(sector, events));
  }
});

test("parity: market tags (trend, quality, RS rating, return 64 phiên)", () => {
  const r = rng(4);
  for (let k = 0; k < ITER; k++) {
    const p = 1000 + r() * 100, m20 = 1000 + r() * 100, m50 = 1000 + r() * 100;
    assert.equal(ported.computeTrendTag(p, m20, m50), mtA.computeTrendTag(p, m20, m50));
    const lev = r() * 2, nm = r() * 0.4 - 0.1;
    assert.equal(ported.computeQualityTag(lev, nm), mtA.computeQualityTag(lev, nm));
    const u = Array.from({ length: Math.floor(r() * 300) }, () => r() - 0.5);
    const cur = r() - 0.5;
    assert.equal(ported.computeRsRating(cur, u), mtA.computeRsRating(cur, u));
    const closes = randomBars(r, Math.floor(r() * 120)).map((b) => b.adjClose);
    assert.equal(ported.computeReturnOverPeriod(closes, 64), mtA.computeReturnOverPeriod(closes, 64));
  }
});

test("parity: F-Score Lite (6/9), kể cả thiếu dữ liệu", () => {
  const r = rng(5);
  const maybe = (v) => (r() < 0.15 ? null : v);
  const q = () => ({
    netProfit: maybe((r() - 0.3) * 1e12), totalAssets: maybe(r() < 0.05 ? 0 : r() * 1e13),
    longTermDebt: maybe(r() * 1e12), currentAssets: maybe(r() * 5e12), currentLiabilities: maybe(r() < 0.05 ? 0 : r() * 5e12),
    revenue: maybe(r() * 3e12), grossProfit: maybe(r() * 1e12),
  });
  for (let k = 0; k < ITER; k++) {
    const cur = q();
    const prev = r() < 0.2 ? null : q();
    assert.deepEqual(ported.calculateFScoreLite(cur, prev), dqA.calculateFScoreLite(cur, prev));
  }
});
