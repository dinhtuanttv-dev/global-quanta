// Top 20 v2 (T1–T3) — kho yếu tố theo thời điểm, chuẩn hoá cắt ngang, LambdaMART, chọn Top 20, Deflated Sharpe, M1 không nhìn trước.
import test from "node:test";
import assert from "node:assert/strict";
import { availDate, factorRows, FACTORS, fundamentalFactors, invNorm, K, normalizeRows, prepareAlpha } from "../src/market/alpha/factors.js";
import { ndcgAt, predict, trainLambdaMart } from "../src/market/alpha/gbrank.js";
import { deflatedSharpe, hashConfig, m1Weights, pickTop } from "../src/market/alpha/validate.js";

const DATES = (() => { const out = []; const d = new Date(Date.UTC(2022, 0, 3)); while (out.length < 420) { const w = d.getUTCDay(); if (w >= 1 && w <= 5) out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); } return out; })();
function walk(seed, drift = 0) { let a = seed >>> 0; const r = () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 2 ** 32 - 0.5; }; let p = 100; return DATES.map((date) => { p *= Math.exp(drift + 0.02 * r()); return { date, open: p, high: p * 1.01, low: p * 0.99, close: p, volume: 1e6, value: 2e10 }; }); }

test("18 yếu tố đúng danh sách đã duyệt (6 giá, 5 dòng tiền, 6 cơ bản, 1 ngành)", () => {
  assert.equal(K, 18);
  const g = (x) => FACTORS.filter((f) => f.group === x).length;
  assert.deepEqual([g("price"), g("flow"), g("fund"), g("sector")], [6, 5, 6, 1]);
});

test("BCTC theo thời điểm: quý chưa công bố (createdDate ≥ ngày) KHÔNG được dùng; thiếu createdDate -> +45 ngày (Q4 +90)", () => {
  const fund = [
    { fiscal: "2023-03-31", created: "2023-04-25", npat: 100, revenue: 1000, equity: 1000 },
    { fiscal: "2024-03-31", created: "2024-04-26", npat: 150, revenue: 1200, equity: 1100 },
  ].map((q) => ({ ...q, avail: availDate(q) }));
  assert.ok(Number.isNaN(fundamentalFactors(fund, "2024-04-26", 1e4).npYoY)); // đúng ngày công bố -> chưa dùng
  assert.ok(Math.abs(fundamentalFactors(fund, "2024-04-27", 1e4).npYoY - 0.5) < 1e-9);
  assert.equal(availDate({ fiscal: "2023-06-30" }), "2023-08-14");
  assert.equal(availDate({ fiscal: "2023-12-31" }), "2024-03-30");
});

test("chuẩn hoá Gaussian rank: hạng giữ thứ tự, thiếu = 0, trung hoà ngành -> TB ngành ≈ 0", () => {
  assert.ok(Math.abs(invNorm(0.5)) < 1e-9 && invNorm(0.975) > 1.95 && invNorm(0.975) < 1.97);
  const rows = Array.from({ length: 40 }, (_, i) => ({ ticker: `T${i}`, sector: i % 2 ? "A" : "B", raw: Float64Array.from({ length: K }, (_, k) => (k === 3 && i === 5 ? NaN : i + (i % 2) * 100)) }));
  normalizeRows(rows, { sectorNeutral: false });
  assert.ok(rows[10].z[0] < rows[20].z[0]);
  assert.equal(rows[5].z[3], 0);
  normalizeRows(rows);
  for (const s of ["A", "B"]) { const m = rows.filter((r) => r.sector === s).reduce((a, r) => a + r.z[0], 0); assert.ok(Math.abs(m) < 1e-9); }
});

test("factorRows: chỉ mã đủ thanh khoản & ≥ 252 phiên; RS phần dư, khối ngoại, E/P tính được; kết quả tương lai vào đóng cửa t+1", () => {
  const seriesOf = new Map(), sectorOf = new Map(), foreignOf = new Map(), mcapOf = new Map();
  for (let k = 0; k < 8; k++) { const t = `S${k}`; seriesOf.set(t, walk(k + 1, k * 1e-4)); sectorOf.set(t, k % 2 ? "X" : "Y"); foreignOf.set(t, new Map(DATES.map((d) => [d, (k - 4) * 1e8]))); mcapOf.set(t, [[DATES[0], 1e12]]); }
  seriesOf.set("THIN", walk(99).map((b) => ({ ...b, value: 1e8 })));
  const data = prepareAlpha({ seriesOf, benchBars: walk(777), sectorOf, foreignOf, mcapOf });
  const rows = factorRows(data, 300);
  assert.equal(rows.length, 8);
  assert.ok(rows.every((r) => Number.isFinite(r.raw[2]) && Number.isFinite(r.raw[6]) && Number.isFinite(r.raw[9])));
  assert.ok(rows.find((r) => r.ticker === "S7").raw[6] > rows.find((r) => r.ticker === "S0").raw[6]);
  const s = data.items.find((x) => x.ticker === "S1"), e = rows.find((r) => r.ticker === "S1").e;
  const expect20 = Math.log(s.c[e + 21] / s.c[e + 1]) - Math.log(data.cal.closes[s.cal[e + 21]] / data.cal.closes[s.cal[e + 1]]);
  assert.ok(Math.abs(rows.find((r) => r.ticker === "S1").y.h20 - expect20) < 1e-12);
});

test("LambdaMART học được thứ tự đơn giản (nhãn tăng theo đặc trưng 0) -> NDCG@20 cao hơn ngẫu nhiên", () => {
  const groups = Array.from({ length: 30 }, (_, g) => {
    const X = Array.from({ length: 60 }, (_, i) => Float64Array.from([((i * 37 + g * 11) % 60) / 60, ((i * 13 + g) % 7) / 7]));
    return { X, labels: X.map((x) => Math.min(4, Math.floor(x[0] * 5))) };
  });
  const model = trainLambdaMart(groups, { trees: 20, depth: 2, lr: 0.3, minLeaf: 10, bins: 16, reg: 1, k: 20, sigma: 1 });
  const g = groups[3];
  const nd = ndcgAt(g.labels, g.X.map((x) => predict(model, x)));
  const ndRand = ndcgAt(g.labels, g.X.map((x) => x[1]));
  assert.ok(nd > 0.95 && nd > ndRand, `${nd} vs ${ndRand}`);
});

test("Top 20: tối đa 4 mã / ngành, đúng 20 mã khi đủ", () => {
  const rows = Array.from({ length: 60 }, (_, i) => ({ ticker: `R${i}`, sector: `S${i % 5}`, s: 60 - i }));
  const top = pickTop(rows, (r) => r.s);
  assert.equal(top.length, 20);
  const per = new Map(); for (const r of top) per.set(r.sector, (per.get(r.sector) ?? 0) + 1);
  assert.ok([...per.values()].every((v) => v <= 4));
});

test("M1 không nhìn trước: chỉ dùng IC của ngày có kết quả đã kết thúc (ce_j + 21 < ce); thiếu lịch sử -> trọng số đều", () => {
  const ic = new Map(Array.from({ length: 40 }, (_, j) => [j * 5, Array.from({ length: K }, (_, k) => (k === 0 ? 0.1 : 0))]));
  const early = m1Weights(ic, 50);
  assert.ok(early.every((w) => Math.abs(w - 1 / K) < 1e-12));
  ic.set(10000, Array.from({ length: K }, () => -1)); // tương lai — không được ảnh hưởng
  const w = m1Weights(ic, 200);
  assert.ok(w[0] > w[1]);
  assert.ok(Math.abs(w.reduce((a, b) => a + Math.abs(b), 0) - 1) < 1e-9);
});

test("Deflated Sharpe: SR0 tăng theo phương sai SR giữa các thử nghiệm; hash phát hiện sửa cấu hình", () => {
  const xs = Array.from({ length: 60 }, (_, i) => 0.002 + 0.01 * Math.sin(i));
  const a = deflatedSharpe(xs, { nTrials: 2, srVariance: 0 }), b = deflatedSharpe(xs, { nTrials: 2, srVariance: 0.04 });
  assert.equal(a.sr0, 0); assert.ok(b.sr0 > 0 && b.deflated < a.deflated);
  const cfg = { x: 1 }; cfg.sha256 = hashConfig(cfg);
  assert.notEqual(hashConfig({ ...cfg, x: 2 }), cfg.sha256);
});
