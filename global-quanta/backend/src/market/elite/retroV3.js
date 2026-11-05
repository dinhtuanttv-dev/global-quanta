// Elite 10 E7-v3 (2026-11-06) — kiểm định hồi cứu walk-forward có hiệu chỉnh quá khớp, đúng E7-prereg.md (sửa đổi E7-v3, ghi trước
// khi chạy): khoảng đệm 5 phiên cho IC, lợi nhuận theo ngày, lưới 12 cấu hình, Deflated Sharpe (N = 12), PBO bằng CSCV.
// Không viết lại quy tắc: bậc theo đúng luật E2 (decideTier), điểm theo đúng buildDecision, danh mục theo đúng constructPortfolio.
import { bhQ, dailyIc, decideTier, HORIZONS, MIN_DAYS_FDR, summarize } from "./icCore.js";
import { buildDecision, constructPortfolio, evaluateEntry, LEDGER_HORIZONS, summarizeLedger } from "./decisionCore.js";
import { RETRO_PRIOR_TIER, RETRO_SIGNALS } from "./retroCore.js";
import { deflatedSharpe, pboCscv, sharpe } from "./overfit.js";

export const E7V3_VERSION = "E7-v3 (prereg 2026-11-06)";
export const E7V3 = Object.freeze({
  embargo: 5, buyCost: 0.0015, sellCost: 0.0025, pboBlocks: 10, dsrMin: 0.95, pboMax: 0.5, minPriceSessions: 60,
  nSensitivity: 24,
});
/** Lưới 12 cấu hình cố định; cấu hình chính đứng đầu (10 mã, vùng đệm 20, ERC = lõi E3-v3). */
export const GRID = (() => {
  const out = [];
  for (const size of [10, 5, 20]) for (const buffer of [true, false]) for (const weighting of ["erc", "inverse-vol"]) {
    out.push({ id: `${size}-${buffer ? "b" : "n"}-${weighting === "erc" ? "erc" : "iv"}`, size, bufferRank: buffer ? size * 2 : 0, weighting });
  }
  return out;
})();
export const PRIMARY = "10-b-erc";

/** Lợi suất danh mục giữ từ đóng cửa a tới b; mã thiếu giá -> 0 (hiếm). */
const holdReturn = (weights, px, a, b) => {
  let r = 0;
  for (const [t, w] of weights) { const x = px.get(`${t}|${a}`), y = px.get(`${t}|${b}`); if (x > 0 && y > 0) r += w * (y / x - 1); }
  return r;
};

/**
 * @param {{ cal: string[], flow: Map<string, Map<string, Record<string, number>>>, prices: Map<string, any[]>, sectors: Map<string, string|null>,
 *   vnIndex: Map<string, number>, grid?: typeof GRID }} p
 */
export function runRetroV3({ cal, flow, prices, sectors, vnIndex, grid = GRID }) {
  const pos = new Map(cal.map((d, i) => [d, i]));
  const px = new Map();
  for (const [t, rows] of prices) for (const r of rows) px.set(`${t}|${r.date}`, r.closeAdj);
  const sigIds = Object.keys(RETRO_SIGNALS);

  // 1) IC(d, h) mọi ngày có đặc trưng — dùng ở bước 2 chỉ khi đã chín + khoảng đệm.
  const ic = Object.fromEntries(sigIds.map((s) => [s, Object.fromEntries(HORIZONS.map((h) => [h, new Map()]))]));
  const flowDates = [...flow.keys()].filter((d) => pos.has(d)).sort();
  for (const d of flowDates) {
    const i = pos.get(d), day = flow.get(d);
    for (const h of HORIZONS) {
      if (i + 1 + h >= cal.length) continue;
      const a = cal[i + 1], b = cal[i + 1 + h];
      for (const s of sigIds) {
        const pairs = [];
        for (const [t, f] of day) { const v = Number(f?.[RETRO_SIGNALS[s]]); const x = px.get(`${t}|${a}`), y = px.get(`${t}|${b}`); if (Number.isFinite(v) && x > 0 && y > 0) pairs.push([v, y / x - 1]); }
        const r = dailyIc(pairs);
        if (r) ic[s][h].set(d, r.ic);
      }
    }
  }

  // 2) Walk-forward: một bảng điểm mỗi phiên, 12 danh mục (mỗi cấu hình có vùng đệm riêng theo danh mục phiên trước của nó).
  const tiers = { ...RETRO_PRIOR_TIER };
  const pricesUpTo = (D) => new Map([...prices].map(([t, rows]) => [t, rows.filter((r) => r.date <= D)]));
  const prev = Object.fromEntries(grid.map((g) => [g.id, []]));
  const days = []; // { date, universe, byConfig: { id -> holdings } , primaryEntry }
  for (const D of flowDates) {
    const iD = pos.get(D);
    if (iD < E7V3.minPriceSessions) continue;
    const byS = {}, tests = [];
    for (const s of sigIds) {
      byS[s] = {};
      for (const h of HORIZONS) {
        const series = [...ic[s][h]].filter(([d]) => pos.get(d) + 1 + h + E7V3.embargo <= iD).sort((x, y) => x[0].localeCompare(y[0])).map(([, v]) => v);
        byS[s][h] = summarize(series, h);
        if (byS[s][h].n >= MIN_DAYS_FDR && byS[s][h].pPos != null) tests.push([s, h]);
      }
    }
    const q = bhQ(tests.map(([s, h]) => byS[s][h].pPos));
    tests.forEach(([s, h], k) => { byS[s][h].q = q[k]; });
    for (const s of sigIds) tiers[s] = decideTier(tiers[s], byS[s], 5).tier;
    const evidence = { signals: sigIds.map((s) => ({ id: s, tier: tiers[s], mainH: 5, byH: Object.fromEntries(HORIZONS.map((h) => [h, { n: byS[s][h].n, mean: byS[s][h].mean }])) })) };
    const day = flow.get(D);
    const rows = [...day].map(([t, f]) => ({ ticker: t, icb: { l2: sectors.get(t) ?? null }, values: Object.fromEntries(sigIds.map((s) => [s, Number.isFinite(Number(f?.[RETRO_SIGNALS[s]])) ? Number(f[RETRO_SIGNALS[s]]) : null])) }));
    const pUp = pricesUpTo(D);
    const dec = buildDecision({ panel: { date: D, rows }, evidence, prices: pUp, cal: cal.slice(0, iD + 1), prevHoldings: prev[PRIMARY] });
    if (!dec.portfolio.length) continue;
    const eligible = dec.scores.filter((x) => x.eligible);
    const byConfig = {};
    for (const g of grid) {
      const { portfolio } = g.id === PRIMARY ? dec : constructPortfolio({ scores: dec.scores, prices: pUp, date: D, prevHoldings: prev[g.id], config: g });
      byConfig[g.id] = portfolio.map((p) => [p.ticker, p.weight]);
      prev[g.id] = portfolio.map((p) => ({ ticker: p.ticker, weight: p.weight }));
    }
    days.push({
      date: D, universe: eligible.map((x) => x.ticker), byConfig,
      primaryEntry: { date: D, holdings: dec.portfolio.map((p) => ({ ticker: p.ticker, weight: p.weight })), universe: eligible.map((x) => x.ticker), z: Object.fromEntries(eligible.map((x) => [x.ticker, x.Z])) },
    });
  }

  // 3) Tiêu chí 1–2 của E7 trên cấu hình chính (đúng hàm chấm của sổ E3).
  const entries = days.map((d) => d.primaryEntry);
  for (const e of entries) { e.results = {}; for (const h of LEDGER_HORIZONS) { const r = evaluateEntry(e, h, px, cal, vnIndex); if (r) e.results[h] = r; } }
  const ledger = summarizeLedger(entries);

  // 4) Lợi nhuận vượt theo ngày cho từng cấu hình: danh mục dựng tại D giữ (D+1, D+2]; phí theo vòng quay lúc khớp ở đóng cửa D+1.
  const daily = Object.fromEntries(grid.map((g) => [g.id, []]));
  const dates = [];
  for (let k = 0; k < days.length; k++) {
    const iD = pos.get(days[k].date);
    if (iD + 2 >= cal.length) break;
    const a = cal[iD + 1], b = cal[iD + 2];
    const uni = days[k].universe.map((t) => [t, 1 / days[k].universe.length]);
    const bench = holdReturn(uni, px, a, b);
    dates.push(b);
    for (const g of grid) {
      const w = new Map(days[k].byConfig[g.id]);
      const was = new Map(k ? days[k - 1].byConfig[g.id] : []);
      let buy = 0, sell = 0;
      for (const t of new Set([...w.keys(), ...was.keys()])) { const dw = (w.get(t) ?? 0) - (was.get(t) ?? 0); if (dw > 0) buy += dw; else sell -= dw; }
      const cost = buy * E7V3.buyCost + sell * E7V3.sellCost;
      daily[g.id].push(holdReturn([...w], px, a, b) - cost - bench);
    }
  }

  // 5) Deflated Sharpe (N = 12 và độ nhạy N = 24) + PBO.
  const trialSr = grid.map((g) => sharpe(daily[g.id]));
  const dsr = deflatedSharpe(daily[PRIMARY], trialSr, grid.length);
  const dsr24 = deflatedSharpe(daily[PRIMARY], trialSr, E7V3.nSensitivity);
  const pbo = pboCscv(grid.map((g) => daily[g.id]), E7V3.pboBlocks);
  const c = { icPass: ledger.criteria.icPass, excessPass: ledger.criteria.excessPass, dsrPass: dsr.dsr >= E7V3.dsrMin, pboPass: pbo.pbo < E7V3.pboMax };
  const pass = c.icPass && c.excessPass && c.dsrPass && c.pboPass;
  const fails = [!c.icPass && "IC của Z ở 5 phiên chưa đạt t ≥ 2", !c.excessPass && "lợi suất vượt 10 phiên sau phí chưa có cận dưới KTC 95% > 0", !c.dsrPass && `DSR ${dsr.dsr.toFixed(3).replace(".", ",")} < 0,95`, !c.pboPass && `PBO ${pbo.pbo.toFixed(2).replace(".", ",")} ≥ 0,5`].filter(Boolean);
  return {
    version: E7V3_VERSION, prereg: "backend/src/market/elite/E7-prereg.md (sửa đổi E7-v3)",
    period: { from: days[0]?.date ?? null, to: days.at(-1)?.date ?? null, sessions: days.length, dailyFrom: dates[0] ?? null, dailyTo: dates.at(-1) ?? null, dailyN: dates.length },
    criteria: c, pass, label: pass ? "EVIDENCE_RETRO" : "EXPERIMENTAL",
    verdictVi: pass ? "ĐẠT cả bốn tiêu chí E7-v3 (bằng chứng hồi cứu cho phần mô hình; không thay sổ tiến)." : `KHÔNG ĐẠT: ${fails.join("; ")}.`,
    horizons: ledger.horizons,
    deflatedSharpe: { ...dsr, sensitivityN24: dsr24.dsr },
    pbo,
    grid: grid.map((g, k) => {
      const r = daily[g.id], n = r.length, mean = r.reduce((x, y) => x + y, 0) / n;
      return { ...g, primary: g.id === PRIMARY, sharpeDaily: trialSr[k], sharpeAnnual: trialSr[k] * Math.sqrt(252), meanDailyExcess: mean, annualExcess: (1 + mean) ** 252 - 1 };
    }),
    tiersLast: tiers,
  };
}
