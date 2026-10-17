// Elite 10 E3 — lõi thuần của engine quyết định, đúng E3-prereg.md (ghi trước khi tính bất kỳ điểm nào).
import { averageRanks, dailyIc, normCdf, summarize } from "./icCore.js";

export const E3_VERSION = "E3-v2 (prereg 2026-10-17, sửa đổi cùng ngày)";
export const N0 = 60;
export const PRIOR_IC = { A: 0.02, B: 0.01 };
export const ELIGIBILITY = { minBars: 60, minValueVnd: 10e9, minPrice: 5000, minSigma20: 0.005 };
/** E3-v2: sàn biến động cho tỷ trọng và dải rủi ro. */
export const SIGMA_FLOOR = 0.01;
export const PORTFOLIO = { size: 10, maxPerSector: 3, weightCap: 0.2, stopK: 2, targetK: 3, holdSessions: 10 };
export const COST_ROUND_TRIP = 0.004;
export const LEDGER_HORIZONS = [5, 10];

/** Φ⁻¹ (Acklam). */
export function normInv(p) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  if (p < pl) { const q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p > 1 - pl) { const q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  const q = p - 0.5, r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/** Điểm chuẩn theo hạng: z = Φ⁻¹((hạng − 0,5)/n), hạng trung bình cho giá trị trùng. Map ticker -> z. */
export function normalScores(entries) {
  const list = entries.filter(([, v]) => Number.isFinite(v));
  const n = list.length;
  const out = new Map();
  if (n < 2) return out;
  const ranks = averageRanks(list.map(([, v]) => v));
  list.forEach(([t], i) => out.set(t, normInv((ranks[i] - 0.5) / n)));
  return out;
}

/** Trọng số theo IC hậu nghiệm từ tài liệu bằng chứng E2 (chỉ bậc A/B). */
export function signalWeights(evidence) {
  const rows = [];
  for (const s of evidence?.signals ?? []) {
    if (s.tier !== "A" && s.tier !== "B") continue;
    const main = s.byH?.[s.mainH] ?? s.byH?.[String(s.mainH)] ?? {};
    const n = main.n ?? 0;
    const icMeas = main.mean ?? 0;
    const icPrior = PRIOR_IC[s.tier];
    const icPost = (n * icMeas + N0 * icPrior) / (n + N0);
    rows.push({ id: s.id, labelVi: s.labelVi, tab: s.tab, tier: s.tier, mainH: s.mainH, n, icMeas, icPrior, icPost });
  }
  const pos = rows.reduce((a, r) => a + Math.max(0, r.icPost), 0);
  for (const r of rows) r.w = pos > 0 ? Math.max(0, r.icPost) / pos : 0;
  const icComb = rows.reduce((a, r) => a + r.w * r.icPost, 0);
  return { weights: rows, icComb };
}

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const std = (a) => { if (a.length < 2) return null; const m = mean(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1)); };
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const k = Math.floor(s.length / 2); return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2; };

/**
 * Thống kê giá cho mỗi mã tại phiên d: đủ điều kiện, σ20, giá, GTGD TB20.
 * @param {Map<string, {date:string, closeAdj:number, value:number|null}[]>} prices chuỗi tăng dần theo ngày (≤ d)
 */
export function priceStats(prices, date) {
  const out = new Map();
  for (const [t, rows] of prices) {
    const upto = rows.filter((r) => r.date <= date && r.closeAdj > 0);
    if (!upto.length || upto[upto.length - 1].date !== date) { out.set(t, { eligible: false, reason: "không có giá phiên này" }); continue; }
    const last = upto[upto.length - 1];
    const r20 = [];
    for (let i = Math.max(1, upto.length - 20); i < upto.length; i++) r20.push(upto[i].closeAdj / upto[i - 1].closeAdj - 1);
    const v20 = upto.slice(-20).map((r) => r.value).filter((v) => Number.isFinite(v));
    const adv = v20.length ? mean(v20) : null;
    const sigma20 = std(r20);
    const reason = upto.length < ELIGIBILITY.minBars ? `chỉ có ${upto.length} phiên giá`
      : adv == null || adv < ELIGIBILITY.minValueVnd ? "GTGD TB20 < 10 tỷ"
        : last.closeAdj < ELIGIBILITY.minPrice ? "giá < 5.000đ"
          : sigma20 == null || sigma20 < ELIGIBILITY.minSigma20 ? "giá bị neo (σ20 < 0,5%/ngày)" : null;
    out.set(t, { eligible: !reason, reason, close: last.closeAdj, adv, sigma20 });
  }
  return out;
}

/** σ5: trung vị theo ngày (60 phiên gần nhất) của độ lệch chuẩn chéo lợi suất 5 phiên trên vũ trụ `names`. */
export function sigma5(prices, names, cal, date) {
  const i = cal.indexOf(date);
  if (i < 5) return null;
  const byDate = new Map([...prices].map(([t, rows]) => [t, new Map(rows.map((r) => [r.date, r.closeAdj]))]));
  const vals = [];
  for (let k = Math.max(0, i - 65); k + 5 <= i; k++) {
    const a = cal[k], b = cal[k + 5];
    const rs = [];
    for (const t of names) { const m = byDate.get(t); const x = m?.get(a), y = m?.get(b); if (x > 0 && y > 0) rs.push(y / x - 1); }
    if (rs.length >= 30) vals.push(std(rs));
  }
  return median(vals.slice(-60));
}

/**
 * Dựng quyết định của phiên d.
 * @param {{ panel: any, evidence: any, prices: Map<string, any[]>, cal: string[] }} p
 */
export function buildDecision({ panel, evidence, prices, cal }) {
  const date = panel.date;
  const { weights, icComb } = signalWeights(evidence);
  const tickers = panel.rows.map((r) => r.ticker);
  const zBy = new Map(weights.map((w) => [w.id, normalScores(panel.rows.map((r) => [r.ticker, r.values[w.id]]))]));
  const raw = new Map(tickers.map((t) => [t, weights.reduce((a, w) => a + w.w * (zBy.get(w.id).get(t) ?? 0), 0)]));
  const rv = [...raw.values()];
  const m = rv.length ? mean(rv) : 0, s = std(rv) || 1;
  const stats = priceStats(prices, date);
  const eligibleNames = tickers.filter((t) => stats.get(t)?.eligible);
  const sig5 = sigma5(prices, eligibleNames, cal, date);
  const rowBy = new Map(panel.rows.map((r) => [r.ticker, r]));
  const scores = tickers.map((t) => {
    const Z = (raw.get(t) - m) / s;
    const st = stats.get(t) ?? { eligible: false, reason: "không có giá" };
    const alpha5 = sig5 != null ? icComb * sig5 * Z : null;
    const pOut = normCdf((icComb * Z) / Math.sqrt(Math.max(1e-9, 1 - icComb * icComb)));
    const contributions = weights.map((w) => ({ id: w.id, z: zBy.get(w.id).get(t) ?? null, contribution: w.w * (zBy.get(w.id).get(t) ?? 0) }));
    return {
      ticker: t, Z, alpha5Pct: alpha5 == null ? null : alpha5 * 100, pOutperform: pOut, eligible: st.eligible, reason: st.reason ?? null,
      close: st.close ?? null, advBn: st.adv != null ? st.adv / 1e9 : null, sigma20: st.sigma20 ?? null,
      sectorKey: rowBy.get(t)?.icb?.l2 ?? rowBy.get(t)?.sector ?? null, contributions,
    };
  }).sort((a, b) => b.Z - a.Z);
  scores.forEach((x, i) => { x.rank = i + 1; });

  // Danh mục: Z giảm dần, trần 3 mã / ngành ICB cấp 2, tỷ trọng ∝ 1/σ20, trần 20%.
  const picks = [];
  const perSector = new Map();
  for (const x of scores) {
    if (picks.length >= PORTFOLIO.size) break;
    if (!x.eligible || !(x.sigma20 > 0)) continue;
    const key = x.sectorKey ?? `?${x.ticker}`;
    if ((perSector.get(key) ?? 0) >= PORTFOLIO.maxPerSector) continue;
    perSector.set(key, (perSector.get(key) ?? 0) + 1);
    picks.push(x);
  }
  const w = capWeights(picks.map((x) => 1 / Math.max(x.sigma20, SIGMA_FLOOR)), PORTFOLIO.weightCap);
  const portfolio = picks.map((x, i) => {
    const band = Math.max(x.sigma20, SIGMA_FLOOR) * Math.sqrt(5);
    return {
      ticker: x.ticker, weight: w[i], Z: x.Z, rank: x.rank, alpha5Pct: x.alpha5Pct, pOutperform: x.pOutperform, sectorKey: x.sectorKey,
      close: x.close, stop: x.close * (1 - PORTFOLIO.stopK * band), target: x.close * (1 + PORTFOLIO.targetK * band), holdSessions: PORTFOLIO.holdSessions,
    };
  });
  return {
    version: E3_VERSION, date, icComb, sigma5: sig5, weights,
    universe: { panel: tickers.length, eligible: eligibleNames.length },
    portfolio, scores,
  };
}

/** Chuẩn hoá tỷ trọng về 100% với trần mỗi mã (trần hiệu dụng ≥ 1/n để luôn khả thi), phân bổ lại phần vượt trần. */
export function capWeights(raw, cap) {
  const n = raw.length;
  if (!n) return [];
  const c = Math.max(cap, 1 / n);
  let w = raw.map((v) => v / raw.reduce((a, b) => a + b, 0));
  const fixed = new Array(n).fill(false);
  for (let it = 0; it < n; it++) {
    const over = w.map((v, i) => !fixed[i] && v > c + 1e-12);
    if (!over.some(Boolean)) break;
    over.forEach((o, i) => { if (o) { fixed[i] = true; w[i] = c; } });
    const room = 1 - w.reduce((a, v, i) => a + (fixed[i] ? v : 0), 0);
    const free = w.reduce((a, v, i) => a + (fixed[i] ? 0 : v), 0);
    w = w.map((v, i) => (fixed[i] ? v : free > 0 ? (v / free) * room : v));
  }
  return w;
}

/** Kết quả một bản ghi sổ theo dõi tại kỳ hạn h (giá đóng cửa d+1 -> d+1+h). null nếu thiếu giá. */
export function evaluateEntry(entry, h, px, cal, vnIndex) {
  const i = cal.indexOf(entry.date);
  if (i < 0 || i + 1 + h >= cal.length) return null;
  const a = cal[i + 1], b = cal[i + 1 + h];
  const ret = (t) => { const x = px.get(`${t}|${a}`), y = px.get(`${t}|${b}`); return x > 0 && y > 0 ? y / x - 1 : null; };
  let port = 0, wsum = 0;
  for (const hl of entry.holdings) { const r = ret(hl.ticker); if (r != null) { port += hl.weight * r; wsum += hl.weight; } }
  if (wsum < 0.5) return null;
  port /= wsum;
  const ur = entry.universe.map(ret).filter((r) => r != null);
  if (ur.length < 30) return null;
  const univ = mean(ur);
  const va = vnIndex.get(a), vb = vnIndex.get(b);
  const ic = entry.z ? dailyIc(Object.entries(entry.z).map(([t, z]) => [z, ret(t)])) : null;
  return {
    from: a, to: b, portfolioNet: port - COST_ROUND_TRIP, universeNet: univ - COST_ROUND_TRIP, excess: port - univ,
    vnIndex: va > 0 && vb > 0 ? vb / va - 1 : null, ic: ic?.ic ?? null, names: ur.length,
  };
}

/** Bootstrap khối (khối cố định, seed cố định) cho trung bình. */
export function blockBootstrapCi(x, block = 10, reps = 2000, seed = 7) {
  if (x.length < block * 2) return null;
  let st = seed;
  const rnd = () => { st = (st * 1103515245 + 12345) % 2147483648; return st / 2147483648; };
  const means = [];
  const nb = Math.ceil(x.length / block);
  for (let r = 0; r < reps; r++) {
    const s = [];
    for (let b = 0; b < nb; b++) { const start = Math.floor(rnd() * (x.length - block + 1)); for (let k = 0; k < block; k++) s.push(x[start + k]); }
    means.push(mean(s.slice(0, x.length)));
  }
  means.sort((a, b) => a - b);
  return [means[Math.floor(0.025 * reps)], means[Math.floor(0.975 * reps)]];
}

/** Tổng kết sổ theo dõi theo tiêu chí E3-prereg. */
export function summarizeLedger(entries) {
  const out = {};
  for (const h of LEDGER_HORIZONS) {
    const ev = entries.map((e) => e.results?.[h]).filter(Boolean).sort((a, b) => a.from.localeCompare(b.from));
    const ex = ev.map((r) => r.excess);
    const ics = ev.map((r) => r.ic).filter((v) => v != null);
    const icS = summarize(ics, h);
    let cum = 1;
    const curve = ev.map((r) => { cum *= 1 + r.excess / h; return [r.from, Math.round((cum - 1) * 1e4) / 1e4]; });
    out[h] = {
      n: ev.length, meanExcess: ex.length ? mean(ex) : null, hitRate: ex.length ? ex.filter((v) => v > 0).length / ex.length : null,
      excessCi95: blockBootstrapCi(ex, h), meanPortfolioNet: ev.length ? mean(ev.map((r) => r.portfolioNet)) : null,
      meanVnIndex: ev.filter((r) => r.vnIndex != null).length ? mean(ev.filter((r) => r.vnIndex != null).map((r) => r.vnIndex)) : null,
      ic: { n: icS.n, mean: icS.mean, t: icS.t }, curve,
    };
  }
  const c1 = out[5].ic.n >= 60 && out[5].ic.mean > 0 && (out[5].ic.t ?? 0) >= 2;
  const c2 = out[10].n >= 60 && out[10].meanExcess > 0 && (out[10].excessCi95?.[0] ?? -1) > 0;
  return {
    horizons: out,
    criteria: { icPass: c1, excessPass: c2, sessions: entries.length },
    label: c1 && c2 ? "EVIDENCE" : "EXPERIMENTAL",
    labelVi: c1 && c2 ? "ĐẠT tiêu chí đăng ký trước" : `THĂM DÒ — cần ≥ 60 phiên tiến và đạt cả hai tiêu chí (hiện ${entries.length} phiên)`,
  };
}
