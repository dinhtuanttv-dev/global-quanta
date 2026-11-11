// LS-v1 (LS-r1-prereg.md, 11/11/2026) — ĐIỂM DẪN DẮT của Siêu quét đưa vào Hồ sơ 360° và Điểm Elite (E3-v5). Hàm thuần, đúng prereg.
//   5 thành phần (trọng số đều, không tinh chỉnh): RS64 · động lượng riêng (Blitz–Huij–Martens 2011) · gần đỉnh 52 tuần (George–Hwang
//   2004) · chống chịu ngày VN-Index giảm · giai đoạn xu hướng. Mỗi thành phần -> điểm chuẩn theo hạng; LS = điểm chuẩn của trung bình
//   (cần ≥ 4/5). Trạng thái thị trường đúng computeTrendBias; chốt chặn sụp động lượng (Daniel–Moskowitz 2016).
//   Trọng số trong E3-v5: IC giảm dần theo thời gian (bán rã 250 phiên) + co theo trạng thái thị trường + co về tiên nghiệm (N0 = 60).
import { normalScores } from "./decisionCore.js";
import { dailyIc, HORIZONS } from "./icCore.js";

export const LS_VERSION = "LS-v1 (LS-r1 prereg 2026-11-11)";
export const LS_ID = "ls_v1";
export const LS_PARAMS = Object.freeze({
  rsWin: 64, resWin: 120, resMin: 100, resSum: 64, hiWin: 250, hiMin: 200, resilWin: 60, resilMin: 10, minComponents: 4,
  halfLife: 250, regimeShrink: 120, n0: 60, prior: { A: 0.02, B: 0.01 }, guardRet20: 0.05,
});
export const COMPONENTS = ["rs64", "resMom", "hi52", "resil", "stage"];
export const COMPONENT_VI = { rs64: "RS 64 phiên", resMom: "Động lượng riêng (trừ VN-Index)", hi52: "Gần đỉnh 52 tuần", resil: "Chống chịu ngày VN-Index giảm", stage: "Giai đoạn xu hướng (0–3)" };
export const REGIME_VI = { UP: "Thị trường tăng", ACC: "Tích luỹ", WEAK: "Thị trường yếu" };

const fin = (x) => typeof x === "number" && Number.isFinite(x);

/**
 * Ma trận giá căn theo lịch VN-Index.
 * @param {Map<string, [string, number, number|null][]>} series mã -> [[ngày, giá điều chỉnh, giá trị GD]] (bất kỳ thứ tự)
 * @param {[string, number][]} index [[ngày, VN-Index]]
 */
export function buildMatrix(series, index) {
  const idxRows = [...index].filter((r) => fin(r[1]) && r[1] > 0).sort((a, b) => a[0].localeCompare(b[0]));
  const dates = idxRows.map((r) => r[0]), pos = new Map(dates.map((d, i) => [d, i]));
  const idx = Float64Array.from(idxRows, (r) => r[1]);
  const px = new Map(), val = new Map();
  for (const [t, rows] of series) {
    const p = new Float64Array(dates.length).fill(NaN), v = new Float64Array(dates.length).fill(NaN);
    let any = false;
    for (const r of rows ?? []) { const i = pos.get(r[0]); if (i != null && fin(r[1]) && r[1] > 0) { p[i] = r[1]; v[i] = fin(r[2]) ? r[2] : NaN; any = true; } }
    if (any) { px.set(t, p); val.set(t, v); }
  }
  return { dates, pos, idx, px, val };
}

const sma = (a, i, n) => { if (i < n - 1) return NaN; let s = 0; for (let k = i - n + 1; k <= i; k++) { if (!(a[k] > 0)) return NaN; s += a[k]; } return s / n; };
const ret = (a, k) => (a[k] > 0 && a[k - 1] > 0 ? a[k] / a[k - 1] - 1 : NaN);

/** Năm thành phần của một mã tại chỉ số phiên i (null nếu thiếu dữ liệu). */
export function components(M, t, i, P = LS_PARAMS) {
  const p = M.px.get(t); const out = { rs64: null, resMom: null, hi52: null, resil: null, stage: null };
  if (!p || !(p[i] > 0)) return out;
  if (i >= P.rsWin && p[i - P.rsWin] > 0) out.rs64 = p[i] / p[i - P.rsWin] - 1;
  // Động lượng riêng: OLS 120 phiên, tổng phần dư 64 phiên / (sd phần dư · √64).
  if (i >= P.resWin) {
    const xs = [], ys = [], ks = [];
    for (let k = i - P.resWin + 1; k <= i; k++) { const y = ret(p, k), x = ret(M.idx, k); if (fin(y) && fin(x)) { xs.push(x); ys.push(y); ks.push(k); } }
    if (xs.length >= P.resMin) {
      const n = xs.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
      let sxy = 0, sxx = 0; for (let j = 0; j < n; j++) { sxy += (xs[j] - mx) * (ys[j] - my); sxx += (xs[j] - mx) ** 2; }
      const b = sxx > 0 ? sxy / sxx : 0, a = my - b * mx;
      const e = ys.map((y, j) => y - a - b * xs[j]);
      const me = e.reduce((s, v) => s + v, 0) / n, sd = Math.sqrt(e.reduce((s, v) => s + (v - me) ** 2, 0) / (n - 1));
      let sum = 0; e.forEach((v, j) => { if (ks[j] > i - P.resSum) sum += v; });
      if (sd > 0) out.resMom = sum / (sd * Math.sqrt(P.resSum));
    }
  }
  { let mx = -Infinity, c = 0; for (let k = Math.max(0, i - P.hiWin + 1); k <= i; k++) if (p[k] > 0) { c++; if (p[k] > mx) mx = p[k]; } if (c >= P.hiMin) out.hi52 = p[i] / mx; }
  if (i >= P.resilWin) {
    const d = []; for (let k = i - P.resilWin + 1; k <= i; k++) { const m = ret(M.idx, k), y = ret(p, k); if (fin(m) && m < 0 && fin(y)) d.push(y - m); }
    if (d.length >= P.resilMin) out.resil = d.reduce((a, b) => a + b, 0) / d.length;
  }
  const m20 = sma(p, i, 20), m50 = sma(p, i, 50), m200 = sma(p, i, 200);
  if (fin(m20) && fin(m50) && fin(m200)) out.stage = (p[i] > m20 ? 1 : 0) + (m20 > m50 ? 1 : 0) + (m50 > m200 ? 1 : 0);
  return out;
}

/** LS-v1 của mọi mã có giá phiên i. Trả Map(mã -> { ls, comp, z }). `only`: Set mã giới hạn vũ trụ (tuỳ chọn). */
export function lsDay(M, i, { only = null, P = LS_PARAMS } = {}) {
  const tick = [...M.px.keys()].filter((t) => (!only || only.has(t)) && M.px.get(t)[i] > 0);
  const comp = new Map(tick.map((t) => [t, components(M, t, i, P)]));
  const zBy = Object.fromEntries(COMPONENTS.map((c) => [c, normalScores(tick.map((t) => [t, comp.get(t)[c] ?? NaN]))]));
  const raw = [];
  for (const t of tick) {
    const zs = COMPONENTS.map((c) => zBy[c].get(t)).filter(fin);
    if (zs.length >= P.minComponents) raw.push([t, zs.reduce((a, b) => a + b, 0) / zs.length]);
  }
  const ls = normalScores(raw);
  const out = new Map();
  for (const t of tick) out.set(t, { ls: ls.get(t) ?? null, comp: comp.get(t), z: Object.fromEntries(COMPONENTS.map((c) => [c, zBy[c].get(t) ?? null])) });
  return out;
}

/** % mã có giá > MA20 tại phiên i. */
export function breadthAt(M, i) {
  let n = 0, up = 0;
  for (const p of M.px.values()) { const m = sma(p, i, 20); if (p[i] > 0 && fin(m)) { n++; if (p[i] > m) up++; } }
  return n ? (up / n) * 100 : null;
}

/** Trạng thái thị trường đúng computeTrendBias của Siêu quét -> nhóm UP / ACC / WEAK. */
export function regimeAt(M, i) {
  const c = M.idx[i], m20 = sma(M.idx, i, 20), m50 = sma(M.idx, i, 50), m200 = i >= 199 ? sma(M.idx, i, 200) : sma(M.idx, i, 50);
  const br = breadthAt(M, i), br5 = i >= 5 ? breadthAt(M, i - 5) : br;
  if (![c, m20, m50, m200].every(fin) || br == null) return { bias: null, group: null, breadth: br };
  const gap = (Math.abs(m50 - m200) / m200) * 100, drop5 = Math.max(0, (br5 ?? br) - br), death = m50 < m200 * 1.01 && c < m50;
  let bias = "accumulation";
  if (c > m20 && m20 > m50 && m50 > m200 && br > 65) bias = "uptrend";
  else if (c < m20 && m20 < m50 && m50 < m200 && br < 35) bias = "downtrend";
  else if ((death || drop5 > 15) && c < m50) bias = "distribution";
  else if (gap < 3 && br >= 40 && br <= 65) bias = "defensive";
  const group = bias === "uptrend" ? "UP" : bias === "accumulation" ? "ACC" : "WEAK";
  return { bias, group, breadth: Math.round(br * 10) / 10 };
}

/** Chốt chặn sụp động lượng: VN-Index dưới MA200 và tăng ≥ 5% trong 20 phiên. */
export function crashGuard(M, i, P = LS_PARAMS) {
  const m200 = sma(M.idx, i, 200);
  return fin(m200) && i >= 20 && M.idx[i] < m200 && M.idx[i] / M.idx[i - 20] - 1 >= P.guardRet20;
}

/**
 * Chuỗi IC của LS-v1 (đúng dailyIc của E2): phiên d -> lợi suất d+1 → d+1+h. Kèm trạng thái + chốt chặn mỗi phiên.
 * @returns {{ ic: Record<number, Record<string, [number|null, number, string|null]>>, regime: Record<string,string|null>, guard: Record<string, boolean>, from: string|null, to: string|null }}
 *   ic[h][ngày] = [IC, số mã, ngày ra (đã chín khi ngày ra ≤ phiên đánh giá)]
 */
export const VARIANT_VALUE = Object.freeze({ ls_v1: (r) => r.ls, ...Object.fromEntries(COMPONENTS.map((c) => [`c_${c}`, (r) => r.z[c]])) });
export function lsIcSeries(M, { start = LS_PARAMS.hiWin, only = null, variants = { ls_v1: VARIANT_VALUE.ls_v1 }, valuesFrom = null } = {}) {
  const names = Object.keys(variants);
  const ic = Object.fromEntries(names.map((v) => [v, Object.fromEntries(HORIZONS.map((h) => [h, {}]))])), values = Object.fromEntries(names.map((v) => [v, {}]));
  const regime = {}, guard = {};
  let from = null, to = null;
  for (let i = start; i < M.dates.length; i++) {
    const d = M.dates[i];
    const day = lsDay(M, i, { only });
    const lsCount = [...day.values()].filter((r) => fin(r.ls)).length;
    if (lsCount < 30) continue;
    from ??= d; to = d;
    regime[d] = regimeAt(M, i).group; guard[d] = crashGuard(M, i);
    for (const name of names) {
      const vals = new Map([...day].map(([t, r]) => [t, variants[name](r)]).filter(([, v]) => fin(v)));
      if (!valuesFrom || d >= valuesFrom) values[name][d] = Object.fromEntries([...vals].map(([t, v]) => [t, Math.round(v * 1e4) / 1e4]));
      for (const h of HORIZONS) {
        if (i + 1 + h >= M.dates.length) continue;
        const pairs = [];
        for (const [t, v] of vals) { const p = M.px.get(t), a = p[i + 1], b = p[i + 1 + h]; if (a > 0 && b > 0) pairs.push([v, b / a - 1]); }
        const r = dailyIc(pairs);
        ic[name][h][d] = [r ? Math.round(r.ic * 1e5) / 1e5 : null, pairs.length, M.dates[i + 1 + h]];
      }
    }
  }
  return { ic, regime, guard, values, from, to };
}

/**
 * Trọng số E3-v5 của LS-v1 tại phiên `asOf` (chỉ IC đã chín: ngày ra ≤ asOf), kỳ hạn chính 5.
 * @param {Record<string, [number|null, number, string]>} ic5  ic[5] từ lsIcSeries
 * @param {Record<string, string|null>} regimes ngày -> nhóm trạng thái
 * @param {string|null} regimeNow trạng thái phiên asOf
 * @param {string[]} cal lịch phiên (để tính tuổi theo phiên)
 */
export function lsWeighting(ic5, regimes, regimeNow, asOf, cal, P = LS_PARAMS) {
  const pos = new Map(cal.map((d, i) => [d, i]));
  const iNow = pos.get(asOf) ?? cal.filter((d) => d <= asOf).length - 1;
  let sw = 0, sw2 = 0, swi = 0, rw = 0, rw2 = 0, rwi = 0, n = 0;
  for (const [d, v] of Object.entries(ic5 ?? {})) {
    if (!v || v[0] == null || !(v[2] <= asOf) || !pos.has(d)) continue;
    const w = 0.5 ** ((iNow - pos.get(d)) / P.halfLife);
    sw += w; sw2 += w * w; swi += w * v[0]; n++;
    if (regimeNow && regimes?.[d] === regimeNow) { rw += w; rw2 += w * w; rwi += w * v[0]; }
  }
  if (!sw) return { n: 0, icDec: null, neff: 0, icRegime: null, neffRegime: 0, icRegPost: null };
  const icDec = swi / sw, neff = (sw * sw) / sw2;
  const icR = rw ? rwi / rw : null, neffR = rw ? (rw * rw) / rw2 : 0;
  const icRegPost = icR == null ? icDec : (neffR * icR + P.regimeShrink * icDec) / (neffR + P.regimeShrink);
  const r6 = (x) => (x == null ? null : Math.round(x * 1e6) / 1e6);
  return { n, icDec: r6(icDec), neff: Math.round(neff * 10) / 10, icRegime: r6(icR), neffRegime: Math.round(neffR * 10) / 10, icRegPost: r6(icRegPost) };
}

/** IC hậu nghiệm dùng trong E3-v5 (bậc C hoặc chốt chặn -> null = không trọng số). */
export function lsIcPost({ tier, weighting, guard }, P = LS_PARAMS) {
  if (guard || (tier !== "A" && tier !== "B") || !weighting || weighting.icRegPost == null) return null;
  return (weighting.neff * weighting.icRegPost + P.n0 * P.prior[tier]) / (weighting.neff + P.n0);
}

/** Nhãn hiển thị Hồ sơ: Leader / Up-Trend RS ≥ 90 (theo Siêu quét), mức LS. */
export function lsBand(ls) {
  if (!fin(ls)) return null;
  return ls >= 1.28 ? "Dẫn dắt mạnh (top 10%)" : ls >= 0.84 ? "Dẫn dắt (top 20%)" : ls >= 0 ? "Trên trung vị" : ls >= -0.84 ? "Dưới trung vị" : "Yếu (đáy 20%)";
}
