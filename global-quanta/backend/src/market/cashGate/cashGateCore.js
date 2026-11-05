// CG-r1 (05/11/2026) — Cổng tiền mặt linh hoạt: đúng CG-prereg.md (ghi trước khi chạy). Hàm thuần, không I/O.
//   H1  (chính) DOWNTREND ∧ VIX > 25 -> 30% · H1b cùng điều kiện -> 50%
//   H2  nhắm mục tiêu biến động EWMA (λ 0,94), σ* = trung vị σ̂ 504 phiên, w ∈ [0,3; 1], chỉ đổi khi |Δw| ≥ 0,10
//   H3  VolSlope VIX/VIX3M − 1 > −0,05 -> 50%
// Tín hiệu tới đóng cửa d -> giao dịch đóng cửa d+1; phí 0,20%/chiều × |Δw|; tiền mặt 4%/năm; mốc B = luôn 100%, không phí.
import { classifyRegime } from "../research/regime.js";

export const CG_VERSION = "CG-r1 (prereg 2026-11-05)";
export const CG = Object.freeze({
  vixHigh: 25, h1Low: 0.3, h1bLow: 0.5, h3Low: 0.5, volSlope: -0.05,
  ewmaLambda: 0.94, volWindow: 504, minVolHistory: 60, wMin: 0.3, band: 0.1,
  costPerSide: 0.002, cashYield: 0.04, warmup: 60,
  bootstrap: { reps: 10000, meanBlock: 20, seed: 20261105 },
  criteria: { alpha: 0.05, minDdGainPp: 5, maxCagrLossPp: 1 },
});
export const RULES = ["H1", "H1b", "H2", "H3"];

const sma = (a, i, n) => { if (i < n - 1) return null; let s = 0; for (let k = i - n + 1; k <= i; k++) s += a[k]; return s / n; };

/** Trạng thái thị trường từng phiên trên chính chuỗi giá (đúng regime.js). */
export function regimeSeries(closes) {
  return closes.map((c, i) => classifyRegime(c, sma(closes, i, 20), sma(closes, i, 50), i >= 10 ? sma(closes, i - 10, 50) : null));
}

/** Giá trị chuỗi Mỹ dùng được tại phiên VN ngày d: phiên Mỹ gần nhất TRƯỚC d (không nhìn trước). us: [date, value][] tăng dần. */
export function alignPrev(dates, us) {
  const out = []; let j = -1;
  for (const d of dates) { while (j + 1 < us.length && us[j + 1][0] < d) j++; out.push(j >= 0 && Number.isFinite(us[j][1]) ? us[j][1] : null); }
  return out;
}

/** σ̂ EWMA của lợi suất log ngày (khởi tạo bằng phương sai 20 lợi suất đầu). */
export function ewmaVol(closes, lambda = CG.ewmaLambda) {
  const out = closes.map(() => null);
  const r = closes.map((c, i) => (i ? Math.log(c / closes[i - 1]) : null));
  if (r.length < 22) return out;
  let v = r.slice(1, 21).reduce((s, x) => s + x * x, 0) / 20;
  for (let i = 21; i < r.length; i++) { v = lambda * v + (1 - lambda) * r[i] * r[i]; out[i] = Math.sqrt(v); }
  return out;
}
const median = (a) => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n % 2 ? s[n >> 1] : (s[n / 2 - 1] + s[n / 2]) / 2; };

/** Tỷ lệ cổ phiếu MỤC TIÊU quyết định tại đóng cửa từng phiên, cho từng quy tắc. */
export function targets({ closes, vix, vix3m }) {
  const reg = regimeSeries(closes), vol = ewmaVol(closes);
  const n = closes.length;
  const gate = (i) => reg[i] === "DOWNTREND" && vix[i] != null && vix[i] > CG.vixHigh;
  const H1 = [], H1b = [], H2 = [], H3 = [];
  let w2 = 1;
  for (let i = 0; i < n; i++) {
    H1.push(gate(i) ? CG.h1Low : 1);
    H1b.push(gate(i) ? CG.h1bLow : 1);
    const slope = vix[i] != null && vix3m[i] > 0 ? vix[i] / vix3m[i] - 1 : null;
    H3.push(slope != null && slope > CG.volSlope ? CG.h3Low : 1);
    if (vol[i] != null) {
      const hist = vol.slice(Math.max(0, i - CG.volWindow + 1), i + 1).filter((x) => x != null);
      if (hist.length >= CG.minVolHistory) {
        const raw = Math.min(1, Math.max(CG.wMin, median(hist) / vol[i]));
        if (Math.abs(raw - w2) >= CG.band - 1e-12) w2 = raw;
      }
    }
    H2.push(w2);
  }
  return { H1, H1b, H2, H3, regime: reg, vol };
}

/**
 * Mô phỏng lợi suất ngày của một chuỗi mục tiêu: vị thế trong (t, t+1] = mục tiêu quyết định tại t−1 (giao dịch đóng cửa t).
 * Trả { rets, weights, switches } cho các phiên from..to (chỉ số trong closes), lợi suất của phiên i = từ i−1 tới i.
 */
export function simulate(closes, target, { from, to, cost = CG.costPerSide, cashYield = CG.cashYield } = {}) {
  const rets = [], weights = [];
  let w = 1, switches = 0;
  for (let i = from; i <= to; i++) {
    // Tại đóng cửa i−1 khớp lệnh theo mục tiêu quyết định ở i−2.
    const want = i - 2 >= 0 ? target[i - 2] : 1;
    let c = 0;
    if (want !== w) { c = Math.abs(want - w) * cost; w = want; switches++; }
    const r = w * (closes[i] / closes[i - 1] - 1) + (1 - w) * (cashYield / 252);
    rets.push((1 - c) * (1 + r) - 1);
    weights.push(w);
  }
  return { rets, weights, switches };
}

export function metrics(rets) {
  let eq = 1, peak = 1, mdd = 0;
  for (const r of rets) { eq *= 1 + r; peak = Math.max(peak, eq); mdd = Math.min(mdd, eq / peak - 1); }
  const n = rets.length, m = rets.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(rets.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1));
  const cagr = eq ** (252 / n) - 1;
  return { n, cagr, mdd, sharpe: sd > 0 ? (m / sd) * Math.sqrt(252) : null, calmar: mdd < 0 ? cagr / -mdd : null, total: eq - 1 };
}
const sharpe = (r) => { const n = r.length, m = r.reduce((a, b) => a + b, 0) / n; const sd = Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1)); return sd > 0 ? (m / sd) * Math.sqrt(252) : 0; };

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/**
 * p một phía cho H0: ΔSharpe ≤ 0, bootstrap khối dừng (Politis & Romano 1994) trên cặp lợi suất ngày, phân phối được QUY TÂM
 * (ΔS* − ΔŜ) như Ledoit & Wolf (2008): p = (1 + #{ΔS* − ΔŜ ≥ ΔŜ}) / (B + 1).
 */
export function bootstrapSharpeP(a, b, { reps = CG.bootstrap.reps, meanBlock = CG.bootstrap.meanBlock, seed = CG.bootstrap.seed } = {}) {
  const n = a.length, rnd = mulberry32(seed), pStart = 1 / meanBlock;
  const d0 = sharpe(a) - sharpe(b);
  let exceed = 0;
  const xa = new Array(n), xb = new Array(n);
  for (let k = 0; k < reps; k++) {
    let j = Math.floor(rnd() * n);
    for (let i = 0; i < n; i++) {
      if (i > 0 && rnd() < pStart) j = Math.floor(rnd() * n); else if (i > 0) j = (j + 1) % n;
      xa[i] = a[j]; xb[i] = b[j];
    }
    if (sharpe(xa) - sharpe(xb) - d0 >= d0) exceed++;
  }
  return { delta: d0, p: (1 + exceed) / (reps + 1) };
}

/** Holm–Bonferroni: p đã hiệu chỉnh, giữ thứ tự đầu vào. */
export function holm(ps) {
  const idx = ps.map((p, i) => [p, i]).sort((x, y) => x[0] - y[0]);
  const out = new Array(ps.length); let run = 0;
  idx.forEach(([p, i], k) => { run = Math.max(run, Math.min(1, (ps.length - k) * p)); out[i] = run; });
  return out;
}

/** Các đợt kích hoạt (tỷ lệ < 1) liên tiếp: [{ from, to, sessions, minW }]. */
export function episodes(dates, weights) {
  const out = []; let cur = null;
  weights.forEach((w, i) => {
    if (w < 1) { if (!cur) cur = { from: dates[i], to: dates[i], sessions: 0, minW: w }; cur.to = dates[i]; cur.sessions++; cur.minW = Math.min(cur.minW, w); }
    else if (cur) { out.push(cur); cur = null; }
  });
  if (cur) out.push(cur);
  return out;
}

/**
 * Chạy đầy đủ CG-r1 trên một chuỗi. series: { dates[], closes[] }, vix/vix3m: [date, value][] Mỹ. end: ngày cuối (bao gồm).
 * Trả kết quả từng quy tắc + mốc B. bootstrap = false để bỏ tính p (dùng cho chuỗi độ bền chỉ cần dấu ΔSharpe).
 */
export function runSeries({ dates, closes }, { vix, vix3m, end, bootstrap = true, cashYield = CG.cashYield }) {
  const last = dates.findLastIndex((d) => d <= end);
  const v = alignPrev(dates, vix), v3 = alignPrev(dates, vix3m);
  const t = targets({ closes, vix: v, vix3m: v3 });
  const from = CG.warmup + 1;
  const base = simulate(closes, closes.map(() => 1), { from, to: last, cost: 0, cashYield });
  const baseM = metrics(base.rets);
  const evalDates = dates.slice(from, last + 1);
  const rules = {};
  for (const id of RULES) {
    const s = simulate(closes, t[id], { from, to: last, cashYield });
    const m = metrics(s.rets);
    const bs = bootstrap ? bootstrapSharpeP(s.rets, base.rets) : { delta: (m.sharpe ?? 0) - (baseM.sharpe ?? 0), p: null };
    const eps = episodes(evalDates, s.weights);
    rules[id] = {
      ...m, deltaSharpe: bs.delta, p: bs.p, switches: s.switches, pctReduced: s.weights.filter((w) => w < 1).length / s.weights.length,
      meanWeight: s.weights.reduce((a, b) => a + b, 0) / s.weights.length, episodes: eps.length, longestEpisodes: [...eps].sort((a, b) => b.sessions - a.sessions).slice(0, 8),
    };
  }
  return { period: { from: evalDates[0], to: evalDates.at(-1), sessions: evalDates.length }, base: baseM, rules };
}

/** Áp tiêu chí đã đăng ký: C1 (Holm), C2, C3 trên chuỗi chính, C4 dấu ΔSharpe trên chuỗi độ bền. */
export function verdict(main, robust) {
  const padj = holm(RULES.map((id) => main.rules[id].p ?? 1));
  const out = {};
  RULES.forEach((id, k) => {
    const r = main.rules[id];
    const c = {
      C1: r.deltaSharpe > 0 && padj[k] <= CG.criteria.alpha,
      C2: (r.mdd - main.base.mdd) * 100 >= CG.criteria.minDdGainPp,
      C3: (main.base.cagr - r.cagr) * 100 <= CG.criteria.maxCagrLossPp,
      C4: (robust?.rules?.[id]?.deltaSharpe ?? -1) > 0,
    };
    out[id] = { pHolm: padj[k], ...c, pass: c.C1 && c.C2 && c.C3 && c.C4 };
  });
  return out;
}
