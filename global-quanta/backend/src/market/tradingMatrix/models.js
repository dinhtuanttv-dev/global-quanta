// Trading Matrix M5 — mô hình thích ứng champion / challenger (M5-prereg.md). Hàm thuần.
//   B0-breadth (champion): tần suất VN-Index tăng sau 10 phiên theo nhóm độ rộng
//   B1-base: tỷ lệ nền   ·   C1-logit (challenger): logistic L2 + purged k-fold + isotonic
// Cổng thăng hạng chấm MỘT lần trên holdout chưa dùng: Brier skill so champion (KTC block bootstrap) + ECE + AUC.
import { applyIsotonic, auc, brier, ece, fitIsotonic, fitLogistic, logisticAt, purgedFolds, rng, standardizer } from "../structure/ml.js";

export const FEATURE_SET = "F1";
export const FEATURES = ["b", "db5", "ddb", "med5", "idx5", "idx1", "rv", "rvPct", "rg_UP", "rg_DOWN", "rg_SIDE"];
export const HORIZON = 10;
export const GATE = Object.freeze({ maxEce: 0.05, boot: 1000, block: 10, seed: 7, lambdas: [0.1, 1, 10, 100], folds: 5, purge: HORIZON, embargo: HORIZON });

const r4 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 1e4) / 1e4);
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Hàng huấn luyện / dự báo từ chuỗi trạng thái M3 (y = null khi chưa đủ 10 phiên). */
export function featureRows(states, indexBars) {
  const c = new Map(indexBars.map((b, i) => [b.date, { i, close: b.close }]));
  const closes = indexBars.map((b) => b.close);
  const out = [];
  for (const s of states) {
    const vals = [s.b, s.db5, s.ddb, s.med5, s.idx5, s.idx1, s.rv, s.rvPct];
    if (vals.some((v) => v == null || !Number.isFinite(v)) || !s.regime) continue;
    const at = c.get(s.date);
    if (!at) continue;
    const x = [...vals, s.regime === "UPTREND" ? 1 : 0, s.regime === "DOWNTREND" ? 1 : 0, s.regime === "SIDEWAY" ? 1 : 0];
    const y = at.i + HORIZON < closes.length ? (closes[at.i + HORIZON] > at.close ? 1 : 0) : null;
    out.push({ date: s.date, ti: at.i, x, b: s.b, y });
  }
  return out;
}

const bucket = (b) => (b < 40 ? "lo" : b < 60 ? "mid" : "hi");
export function trainB0(rows) {
  const base = mean(rows.map((r) => r.y));
  const buckets = {};
  for (const k of ["lo", "mid", "hi"]) { const g = rows.filter((r) => bucket(r.b) === k); buckets[k] = { n: g.length, rate: g.length ? r4(mean(g.map((r) => r.y))) : r4(base) }; }
  return { id: "B0-breadth", kind: "B0", features: ["b"], buckets, base: r4(base), n: rows.length };
}
export function trainB1(rows) { return { id: "B1-base", kind: "B1", base: r4(mean(rows.map((r) => r.y))), n: rows.length }; }

export function trainC1(rows) {
  const ti = rows.map((r) => r.ti), te = rows.map((r) => r.ti + HORIZON);
  const folds = purgedFolds(ti, te, GATE.folds, { embargo: GATE.embargo });
  const st = standardizer(rows.map((r) => r.x)), Z = (r) => st.apply(r.x);
  const ll = (p, y) => -mean(p.map((v, i) => (y[i] ? Math.log(Math.max(v, 1e-9)) : Math.log(Math.max(1 - v, 1e-9)))));
  const cv = GATE.lambdas.map((lambda) => ({ lambda, logloss: r4(mean(folds.map(({ train, test }) => {
    const m = fitLogistic(train.map((i) => Z(rows[i])), train.map((i) => rows[i].y), { lambda });
    return ll(test.map((i) => m.predict(Z(rows[i]))), test.map((i) => rows[i].y));
  }))) }));
  const best = cv.reduce((a, b) => (b.logloss < a.logloss ? b : a));
  const last = folds[folds.length - 1];
  const m = fitLogistic(last.train.map((i) => Z(rows[i])), last.train.map((i) => rows[i].y), { lambda: best.lambda });
  const iso = fitIsotonic(last.test.map((i) => m.predict(Z(rows[i]))), last.test.map((i) => rows[i].y));
  return { id: "C1-logit", kind: "C1", featureSet: FEATURE_SET, features: FEATURES, lambda: best.lambda, cv, w: m.w.map(r4), mu: st.mu.map(r4), sd: st.sd.map(r4), iso: iso.steps, n: rows.length, trainedTo: rows.at(-1)?.date ?? null };
}

export function predict(model, row) {
  if (model.kind === "B0") return model.buckets[bucket(row.b)]?.rate ?? model.base;
  if (model.kind === "B1") return model.base;
  const z = row.x.map((v, j) => (v - model.mu[j]) / (model.sd[j] || 1));
  return applyIsotonic(model.iso, logisticAt(model.w, z));
}

/** Block bootstrap (khối theo thời gian) cho chênh lệch Brier và AUC. */
function blockBoot(n, fn, { boot = GATE.boot, block = GATE.block, seed = GATE.seed } = {}) {
  const r = rng(seed), starts = []; for (let i = 0; i < n; i += block) starts.push(i);
  const vals = [];
  for (let k = 0; k < boot; k++) {
    const idx = [];
    for (let j = 0; j < starts.length; j++) { const s = starts[Math.floor(r() * starts.length)]; for (let t = s; t < Math.min(n, s + block); t++) idx.push(t); }
    const v = fn(idx); if (v != null && Number.isFinite(v)) vals.push(v);
  }
  vals.sort((a, b) => a - b);
  return vals.length ? [r4(vals[Math.floor(0.025 * vals.length)]), r4(vals[Math.floor(0.975 * vals.length)])] : null;
}

/** Chấm cổng thăng hạng trên holdout (một lần). */
export function promotionGate(holdout, champion, challenger, others = []) {
  const y = holdout.map((r) => r.y);
  const pC = holdout.map((r) => predict(champion, r)), pX = holdout.map((r) => predict(challenger, r));
  const bC = brier(pC, y), bX = brier(pX, y);
  const skill = 1 - bX / bC;
  const skillCi = blockBoot(holdout.length, (idx) => { const yy = idx.map((i) => y[i]); const c = brier(idx.map((i) => pC[i]), yy); return c > 0 ? 1 - brier(idx.map((i) => pX[i]), yy) / c : null; });
  const A = auc(pX, y), aCi = blockBoot(holdout.length, (idx) => auc(idx.map((i) => pX[i]), idx.map((i) => y[i])));
  const E = ece(pX, y);
  const pass = skill > 0 && skillCi && skillCi[0] > 0 && E <= GATE.maxEce && aCi && aCi[0] > 0.5;
  return {
    n: holdout.length, from: holdout[0]?.date, to: holdout.at(-1)?.date, baseRate: r4(mean(y)),
    champion: { id: champion.id, brier: r4(bC), ece: r4(ece(pC, y)), auc: r4(auc(pC, y)) },
    challenger: { id: challenger.id, brier: r4(bX), ece: r4(E), auc: r4(A), aucCi: aCi, brierSkill: r4(skill), brierSkillCi: skillCi },
    others: others.map((m) => { const p = holdout.map((r) => predict(m, r)); return { id: m.id, brier: r4(brier(p, y)), ece: r4(ece(p, y)) }; }),
    verdict: pass ? "PROMOTE" : "KEEP_CHAMPION",
  };
}

/** Toàn bộ quy trình M5 trên chuỗi trạng thái + VN-Index (mốc theo prereg). */
export function runModelSelection(states, indexBars, { isTo = "2024-12-31", holdoutFrom = "2025-01-02" } = {}) {
  const rows = featureRows(states, indexBars).filter((r) => r.y != null);
  const train = rows.filter((r) => r.date <= isTo), hold = rows.filter((r) => r.date >= holdoutFrom);
  const B0 = trainB0(train), B1 = trainB1(train), C1 = trainC1(train);
  const gate = promotionGate(hold, B0, C1, [B1]);
  return { trainN: train.length, holdoutN: hold.length, models: { B0, B1, C1 }, gate, active: gate.verdict === "PROMOTE" ? "C1-logit" : "B0-breadth" };
}
