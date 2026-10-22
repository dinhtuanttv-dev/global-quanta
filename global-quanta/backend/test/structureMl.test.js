// Cấu trúc đa khung — T2/T3: công cụ học máy thuần JS (logistic, isotonic, purged k-fold, phân vị + CQR, HMM).
import test from "node:test";
import assert from "node:assert/strict";
import { aciStep, auc, brier, cqrOffset, ece, fitHmm, fitIsotonic, fitLogistic, fitQuantile, hmmFilter, purgedFolds, rng, standardizer } from "../src/market/structure/ml.js";

const gauss = (r) => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());

test("logistic L2 khôi phục dấu hệ số; AUC / Brier / ECE hợp lý", () => {
  const r = rng(1), X = [], y = [];
  for (let i = 0; i < 2000; i++) { const a = gauss(r), b = gauss(r); X.push([a, b]); y.push(r() < 1 / (1 + Math.exp(-(1.5 * a - 0.8 * b))) ? 1 : 0); }
  const m = fitLogistic(X, y, { lambda: 1 });
  assert.ok(m.w[1] > 1 && m.w[2] < -0.4, `w=${m.w}`);
  const p = X.map(m.predict);
  assert.ok(auc(p, y) > 0.75);
  assert.ok(brier(p, y) < 0.2);
  assert.ok(ece(p, y) < 0.05);
  assert.equal(auc([0.1, 0.2, 0.8, 0.9], [0, 0, 1, 1]), 1);
  assert.equal(auc([0.5, 0.5], [0, 1]), 0.5);
});

test("isotonic: hàm tăng dần, khớp tần suất từng khối", () => {
  const f = fitIsotonic([0.1, 0.2, 0.3, 0.4, 0.5, 0.6], [0, 1, 0, 1, 1, 1]);
  const v = [0.05, 0.15, 0.25, 0.35, 0.45, 0.65].map(f);
  for (let i = 1; i < v.length; i++) assert.ok(v[i] >= v[i - 1]);
  assert.equal(f(0.7), 1);
  assert.equal(f(0.1), 0);
});

test("purged k-fold: không mẫu huấn luyện nào có nhãn chồng lên khoảng kiểm tra (kể cả embargo)", () => {
  const ti = Array.from({ length: 300 }, (_, i) => i), te = ti.map((t) => t + 20);
  for (const { train, test: ts } of purgedFolds(ti, te, 5, { embargo: 10 })) {
    const lo = Math.min(...ts.map((i) => ti[i])), hi = Math.max(...ts.map((i) => te[i]));
    for (const i of train) assert.ok(te[i] < lo || ti[i] > hi + 10);
    assert.ok(train.length > 0);
  }
});

test("hồi quy phân vị + CQR: độ phủ 80% trên tập mới", () => {
  const r = rng(4), mk = (n) => { const X = [], y = []; for (let i = 0; i < n; i++) { const a = gauss(r); X.push([a]); y.push(0.5 * a + (1 + 0.5 * Math.abs(a)) * gauss(r)); } return { X, y }; };
  const tr = mk(3000), cal = mk(1000), te = mk(2000);
  const st = standardizer(tr.X), Z = (X) => X.map(st.apply);
  const lo = fitQuantile(Z(tr.X), tr.y, 0.1), hi = fitQuantile(Z(tr.X), tr.y, 0.9);
  const off = cqrOffset(Z(cal.X).map(lo.predict), Z(cal.X).map(hi.predict), cal.y, 0.2);
  const zt = Z(te.X);
  const cov = te.y.filter((v, i) => v >= lo.predict(zt[i]) - off && v <= hi.predict(zt[i]) + off).length / te.y.length;
  assert.ok(cov > 0.76 && cov < 0.85, `coverage ${cov}`);
  assert.ok(aciStep(0.2, 0.2, true) < 0.2 && aciStep(0.2, 0.2, false) > 0.2);
});

test("HMM Gauss tách hai chế độ biến động; lọc tiến chỉ dùng quá khứ", () => {
  const r = rng(9), seqs = [];
  for (let s = 0; s < 4; s++) {
    const x = [];
    for (let t = 0; t < 400; t++) { const hiVol = Math.floor(t / 100) % 2 === 1; x.push([gauss(r) * (hiVol ? 3 : 0.5)]); }
    seqs.push(x);
  }
  const m = fitHmm(seqs, 2, { iters: 40 });
  const vols = m.va.map((v) => v[0]).sort((a, b) => a - b);
  assert.ok(vols[0] < 1 && vols[1] > 4, `va=${vols}`);
  const f = hmmFilter(m, seqs[0]);
  const f50 = hmmFilter(m, seqs[0].slice(0, 151));
  assert.deepEqual(f50[150], f[150]);
  for (const p of f) assert.ok(Math.abs(p.reduce((a, b) => a + b, 0) - 1) < 1e-9);
});
