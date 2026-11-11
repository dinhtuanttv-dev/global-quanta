// LS-r1 H4 (LS-r1-prereg.md) — CỔNG WALK-FORWARD E3-v4 vs E3-v5 trên bộ máy E7-v2. Hàm thuần: nhận dữ liệu E7 + chuỗi LS đã dựng.
// Chạy MỘT lần khi mã đã đóng băng. Tiêu chí ĐẠT (đồng thời):
//   G1 IC trung bình ngày của Z (5 phiên): v5 > v4.
//   G2 Δ = lợi suất vượt 10 phiên v5 − v4 (cùng phiên D): trung bình > 0 và cận dưới bootstrap khối (khối 10, 2.000 lần) một phía 90% > 0.
//   G3 trung bình Δ > 0 ở cả hai nửa thời gian.
//   G4 Deflated Sharpe của Δ (N = 16 phép thử; phương sai Sharpe ước từ 8 cấu hình) ≥ 0,80.
//   G5 sụt giảm lớn nhất (đường lợi suất vượt tích luỹ, các phiên cách 10) v5 không xấu hơn v4 quá max(20% tương đối, 2 điểm %).
import { runRetro } from "./retroCore.js";
import { deflatedSharpe, sharpe } from "./overfit.js";

export const LS_GATE_VERSION = "LS-r1 H4 (prereg 2026-11-11)";
export const GATE = Object.freeze({ block: 10, reps: 2000, seed: 7, oneSidedQ: 0.10, dsrMin: 0.80, nTrials: 16, ddRel: 1.2, ddAbs: 0.02 });

/** 8 cấu hình: v5 + 5 thành phần đơn lẻ + không chốt chặn + không theo trạng thái. */
export const GATE_CONFIGS = Object.freeze([
  { name: "v5", variant: "ls_v1", useRegime: true, useGuard: true },
  { name: "c_rs64", variant: "c_rs64", useRegime: true, useGuard: true },
  { name: "c_resMom", variant: "c_resMom", useRegime: true, useGuard: true },
  { name: "c_hi52", variant: "c_hi52", useRegime: true, useGuard: true },
  { name: "c_resil", variant: "c_resil", useRegime: true, useGuard: true },
  { name: "c_stage", variant: "c_stage", useRegime: true, useGuard: true },
  { name: "noGuard", variant: "ls_v1", useRegime: true, useGuard: false },
  { name: "noRegime", variant: "ls_v1", useRegime: false, useGuard: true },
]);

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

/** Phân vị q của trung bình theo bootstrap khối (cùng bộ sinh số với blockBootstrapCi). */
export function bootstrapQuantile(x, q, block = GATE.block, reps = GATE.reps, seed = GATE.seed) {
  if (x.length < block * 2) return null;
  let st = seed;
  const rnd = () => { st = (st * 1103515245 + 12345) % 2147483648; return st / 2147483648; };
  const means = [], nb = Math.ceil(x.length / block);
  for (let r = 0; r < reps; r++) {
    const s = [];
    for (let b = 0; b < nb; b++) { const start = Math.floor(rnd() * (x.length - block + 1)); for (let k = 0; k < block; k++) s.push(x[start + k]); }
    means.push(mean(s.slice(0, x.length)));
  }
  means.sort((a, b) => a - b);
  return means[Math.floor(q * reps)];
}

/** Sụt giảm lớn nhất của đường tích luỹ (1 + r) trên các phiên cách `step`. */
export function maxDrawdown(rets, step = 10) {
  let cum = 1, peak = 1, dd = 0;
  for (let k = 0; k < rets.length; k += step) { cum *= 1 + rets[k]; peak = Math.max(peak, cum); dd = Math.min(dd, cum / peak - 1); }
  return dd;
}

/** Δ theo phiên D (chỉ phiên cả hai đều có kết quả 10 phiên). */
export function deltaSeries(base, alt, key = "ex10") {
  const a = new Map(base.map((r) => [r.date, r[key]]));
  return alt.filter((r) => r[key] != null && a.get(r.date) != null).map((r) => ({ date: r.date, d: r[key] - a.get(r.date), alt: r[key], base: a.get(r.date) }));
}

/** Chấm 5 tiêu chí từ chuỗi kết quả của v4, v5 và các biến thể. */
export function evaluateGate(results) {
  const v4 = results.v4.series, v5 = results.v5.series;
  const ic = (s) => mean(s.map((r) => r.ic5).filter((v) => v != null));
  const ic4 = ic(v4), ic5 = ic(v5);
  const D = deltaSeries(v4, v5), d = D.map((x) => x.d);
  const mD = mean(d), lo90 = bootstrapQuantile(d, GATE.oneSidedQ);
  const h = Math.floor(d.length / 2), m1 = mean(d.slice(0, h)), m2 = mean(d.slice(h));
  const trialSharpes = GATE_CONFIGS.map((c) => sharpe(deltaSeries(v4, results[c.name].series).map((x) => x.d)));
  const dsr = d.length > 2 ? deflatedSharpe(d, trialSharpes, GATE.nTrials) : null;
  const dd4 = maxDrawdown(D.map((x) => x.base)), dd5 = maxDrawdown(D.map((x) => x.alt));
  const ddLimit = Math.max(GATE.ddRel * Math.abs(dd4), Math.abs(dd4) + GATE.ddAbs);
  const g = {
    G1: { pass: ic4 != null && ic5 != null && ic5 > ic4, v4: ic4, v5: ic5 },
    G2: { pass: mD != null && mD > 0 && lo90 != null && lo90 > 0, mean: mD, lower90: lo90, n: d.length },
    G3: { pass: m1 != null && m2 != null && m1 > 0 && m2 > 0, halves: [m1, m2] },
    G4: { pass: dsr != null && dsr.dsr >= GATE.dsrMin, dsr: dsr?.dsr ?? null, sr: dsr?.sr ?? null, sr0: dsr?.sr0 ?? null, N: GATE.nTrials },
    G5: { pass: Math.abs(dd5) <= ddLimit, dd4, dd5, limit: -ddLimit },
  };
  const pass = Object.values(g).every((x) => x.pass);
  return { pass, criteria: g };
}

/**
 * Chạy cổng: v4 (E7-v2 nguyên bản) + 8 cấu hình có tín hiệu dẫn dắt.
 * @param {{ inputs: object, ls: { ic: object, values: object, regime: object, guard: object }, cal: string[] }} p
 *   inputs: dữ liệu E7 (cal, flow, prices, sectors, vnIndex, exchangeOf); ls: kết quả lsIcSeries (mọi biến thể, values từ kỳ dòng tiền).
 */
export function runLsGate({ inputs, ls, cal }) {
  const results = { v4: runRetro(inputs) };
  for (const c of GATE_CONFIGS) {
    results[c.name] = runRetro({ ...inputs, extra: {
      id: "ls_v1", ic: ls.ic[c.variant], valuesOf: (D) => ls.values[c.variant]?.[D] ?? null,
      regimeOf: ls.regime, guardOf: ls.guard, cal, useRegime: c.useRegime, useGuard: c.useGuard,
    } });
  }
  const ev = evaluateGate(results);
  const brief = (r) => ({ period: r.period, verdictVi: r.verdictVi, horizons: { 5: { ic: r.horizons?.[5]?.ic, meanExcess: r.horizons?.[5]?.meanExcess }, 10: { ic: r.horizons?.[10]?.ic, meanExcess: r.horizons?.[10]?.meanExcess, excessCi95: r.horizons?.[10]?.excessCi95 } }, tierDays: r.descriptive?.tierDays?.ls_v1 ?? null });
  return {
    version: LS_GATE_VERSION, prereg: "backend/src/market/elite/LS-r1-prereg.md", pass: ev.pass, criteria: ev.criteria,
    verdictVi: ev.pass ? "ĐẠT cổng H4 — E3-v5 (có điểm dẫn dắt LS-v1) thay E3-v4 làm Điểm Elite chính thức."
      : `KHÔNG ĐẠT cổng H4 (${Object.entries(ev.criteria).filter(([, x]) => !x.pass).map(([k]) => k).join(", ")}) — LS-v1 chỉ hiển thị trong Hồ sơ 360°, trọng số trong Điểm Elite = 0.`,
    configs: Object.fromEntries(Object.entries(results).map(([k, r]) => [k, brief(r)])),
  };
}
