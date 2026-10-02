process.env.MARKET_ALERTS_ENABLED = "false";

import test from "node:test";
import assert from "node:assert/strict";
import {
  betaInv, betaPosterior, buildMarketIntel, distributionDays, divergencesAt, fitGaussianHmm, fitLogistic, footprintByDate,
  forwardFilter, ibeta, intelSignals, pastPercentile, pastZ, rng, walkForwardLogistic,
} from "../src/market/research/marketIntel.js";

function gauss(r) { return Math.sqrt(-2 * Math.log(r() || 1e-12)) * Math.cos(2 * Math.PI * r()); }
const day = (i) => new Date(Date.UTC(2024, 0, 1) + i * 86_400_000).toISOString().slice(0, 10);

test("pastZ / pastPercentile chỉ dùng quá khứ: đổi giá trị tương lai không đổi kết quả hôm nay", () => {
  const r = rng(3);
  const a = Array.from({ length: 120 }, () => gauss(r));
  const b = [...a.slice(0, 80), ...a.slice(80).map((v) => v * 50 + 9)];
  assert.deepEqual(pastZ(a).slice(0, 80), pastZ(b).slice(0, 80));
  assert.deepEqual(pastPercentile(a, 250, 20).slice(0, 80), pastPercentile(b, 250, 20).slice(0, 80));
  assert.equal(pastZ(a)[10], null, "chưa đủ 20 phiên quá khứ");
});

test("ngày phân phối / tích luỹ: giảm ≥ 0,2% với KL cao hơn phiên trước, đếm 25 phiên", () => {
  const bars = [
    { date: "d0", close: 100, volume: 10 },
    { date: "d1", close: 99.7, volume: 12 }, // −0,3%, KL tăng -> phân phối
    { date: "d2", close: 99.6, volume: 13 }, // −0,1% -> không
    { date: "d3", close: 99.0, volume: 11 }, // KL giảm -> không
    { date: "d4", close: 99.5, volume: 15 }, // +0,5%, KL tăng -> tích luỹ
  ];
  const dd = distributionDays(bars);
  assert.deepEqual(dd.map((d) => d.isDist), [false, true, false, false, false]);
  assert.equal(dd.at(-1).dist, 1);
  assert.equal(dd.at(-1).acc, 1);
});

test("HMM Gauss: nhận ra 3 chế độ trên dữ liệu mô phỏng, sắp Giảm < Đi ngang < Tăng; lọc thuận ra đúng chế độ", () => {
  const r = rng(9);
  const X = [];
  const truth = [];
  for (let seg = 0; seg < 9; seg++) {
    const k = seg % 3; // 0 giảm, 1 ngang, 2 tăng
    const mu = [-2, 0, 2][k];
    for (let t = 0; t < 40; t++) { X.push([mu + 0.5 * gauss(r), (k === 1 ? 0.6 : 1.4) + 0.2 * gauss(r)]); truth.push(k); }
  }
  const m = fitGaussianHmm(X, 3);
  assert.ok(m.mu[0][0] < -1 && Math.abs(m.mu[1][0]) < 0.7 && m.mu[2][0] > 1, JSON.stringify(m.mu));
  const p = forwardFilter(m, X);
  const acc = p.filter((row, t) => row.indexOf(Math.max(...row)) === truth[t]).length / X.length;
  assert.ok(acc > 0.9, `độ chính xác ${acc}`);
});

test("Beta: ibeta/betaInv đúng các mốc; hậu nghiệm co về mức nền và dùng n hiệu dụng", () => {
  assert.ok(Math.abs(betaInv(0.3, 1, 1) - 0.3) < 1e-6);
  assert.ok(Math.abs(betaInv(0.5, 2, 2) - 0.5) < 1e-6);
  assert.ok(Math.abs(ibeta(0.5, 3, 7) - 0.910156) < 1e-5);
  const small = betaPosterior(9, 10, 1, 0.5); // 9/10 nhưng ít mẫu -> co mạnh về 0,5
  assert.ok(small.mean < 0.75 && small.mean > 0.6, String(small.mean));
  const overlap = betaPosterior(90, 100, 10, 0.5); // T+10: n hiệu dụng ≈ 10
  assert.equal(overlap.nEff, 10);
  assert.ok(overlap.hi - overlap.lo > betaPosterior(90, 100, 1, 0.5).hi - betaPosterior(90, 100, 1, 0.5).lo, "chồng lấn -> KTC rộng hơn");
});

test("logistic Bayes: khôi phục dấu hệ số; walk-forward trên nhiễu thuần KHÔNG đạt kiểm định", () => {
  const r = rng(21);
  const X = [], y = [];
  for (let i = 0; i < 600; i++) { const x = [gauss(r), gauss(r)]; X.push(x); y.push(r() < 1 / (1 + Math.exp(-(1.5 * x[0])) ) ? 1 : 0); }
  const w = fitLogistic(X, y, { lambda: 1 });
  assert.ok(w[1] > 0.8 && Math.abs(w[2]) < 0.4, JSON.stringify(w));
  const noise = Array.from({ length: 300 }, (_, i) => ({ i, x: [gauss(r), gauss(r)], y: r() < 0.55 ? 1 : 0 }));
  const wf = walkForwardLogistic(noise, 5, { bootstrap: 150 });
  assert.equal(wf.passed, false, `skill ${wf.skill} [${wf.lo}, ${wf.hi}]`);
  // Purge: dự báo tại ngày t chỉ học từ mẫu i ≤ t − h (t − h + 1 mẫu) -> dự báo đầu tiên ở t = minTrain − 1 + h.
  assert.equal(wf.preds[0].i, 120 - 1 + 5);
});

test("phân kỳ đa khung: giá đỉnh 20 phiên nhưng độ rộng đáy -> phân kỳ âm", () => {
  const closes = Array.from({ length: 30 }, (_, i) => 100 + i);
  const breadth = Array.from({ length: 30 }, (_, i) => 80 - i);
  const d = divergencesAt(closes, { breadth }, 29, [20]);
  assert.equal(d[0].type, "bearish");
});

test("buildMarketIntel: KHÔNG nhìn tương lai — cắt dữ liệu sau ngày k không đổi giá trị ngày k; tín hiệu theo quy tắc", () => {
  const r = rng(5);
  const N = 420;
  let c = 1000;
  const index = [], regimes = [], flowBy = new Map(), dailyBy = new Map();
  const syms = Array.from({ length: 25 }, (_, k) => `S${String(k).padStart(2, "0")}`);
  for (const s of syms) { flowBy.set(s, []); dailyBy.set(s, []); }
  for (let i = 0; i < N; i++) {
    const regime = Math.floor(i / 70) % 3;
    c *= 1 + [-0.004, 0, 0.004][regime] + 0.008 * gauss(r);
    const date = day(i);
    index.push({ date, close: c, volume: 1e8 * (1 + 0.3 * Math.abs(gauss(r))) });
    regimes.push({ date, regime: ["DOWNTREND", "SIDEWAY", "UPTREND"][regime], impulseScore: 50 + 15 * gauss(r), breadthPct: 50 + 20 * gauss(r) });
    for (const s of syms) {
      flowBy.get(s).push({ date, close: 20, delta: 1000 * gauss(r), largeDelta: 500 * gauss(r) + (regime - 1) * 150, continuousVolume: 1e5 });
      dailyBy.get(s).push({ date, value: 1e9, foreignBuyVal: 1e8 * Math.abs(gauss(r)), foreignSellVal: 1e8 * Math.abs(gauss(r)) });
    }
  }
  const opts = { hmm: { minTrain: 250, refit: 20, iters: 25 }, model: { bootstrap: 60, minTrain: 80 } };
  const full = buildMarketIntel({ index, regimes, footprint: footprintByDate(flowBy, dailyBy) }, opts);
  const k = 380;
  const cut = (arr) => arr.filter((x) => x.date <= day(k));
  const cutFlow = new Map([...flowBy].map(([s, rows]) => [s, cut(rows)]));
  const cutDaily = new Map([...dailyBy].map(([s, rows]) => [s, cut(rows)]));
  const part = buildMarketIntel({ index: cut(index), regimes: cut(regimes), footprint: footprintByDate(cutFlow, cutDaily) }, opts);
  const a = full.allDays[k], b = part.allDays[k];
  for (const key of ["zLd5", "zFr5", "dist25", "distPct", "impulse2", "pBull", "pBear", "div", "risk"]) {
    assert.deepEqual(a[key], b[key], `${key}: ${a[key]} vs ${b[key]}`);
  }
  assert.ok(full.current.pBull !== null && full.hmm.states.length === 3);
  assert.ok([3, 5, 10].every((h) => full.bayes[h].rows.length >= 3 && full.models[h].weights.length === 7));
  assert.equal(full.series.length, 120);

  const sig = intelSignals({ zLd5: 1.4, impulse2: 65, pBull: 0.7, pBear: 0.1, div: -2, distPct: 0.9, dist25: 9 });
  assert.deepEqual(sig.map((s) => `${s.signal}:${s.direction}`), ["FOOTPRINT:1", "IMPULSE2:1", "HMM_REGIME:1", "DIVERGENCE:-1", "DIST_DAYS:-1"]);
  assert.deepEqual(intelSignals({ zLd5: 0.3, impulse2: 50, pBull: 0.4, pBear: 0.3, div: 1, distPct: 0.5, dist25: 3 }), []);
});
