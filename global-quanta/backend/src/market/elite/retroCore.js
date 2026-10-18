// Elite 10 E7 (2026-10-17) — kiểm định hồi cứu WALK-FORWARD của Điểm Elite (E7-prereg.md, ghi trước khi viết mã và chạy).
// Mỗi phiên D chỉ dùng IC đã chín (d+1+h ≤ D); bậc mang từ phiên trước, áp luật E2; danh mục dựng bằng ĐÚNG buildDecision (E3-v2);
// chấm bằng ĐÚNG evaluateEntry / summarizeLedger. Không có quy tắc nào được viết lại ở đây.
import { bhQ, dailyIc, decideTier, HORIZONS, MIN_DAYS_FDR, summarize } from "./icCore.js";
import { blockBootstrapCi, buildDecision, evaluateEntry, LEDGER_HORIZONS, summarizeLedger } from "./decisionCore.js";

export const E7_VERSION = "E7-v2 (prereg 2026-10-17, sửa đổi 2026-10-18)";
export const RETRO_SIGNALS = { stealth5: "stealth5", stealth20: "stealth20", net_intent: "netIntent", mom5_atr: "mom5Atr", log_rvol: "logRvol" };
export const RETRO_PRIOR_TIER = { stealth5: "A", stealth20: "A", net_intent: "C", mom5_atr: "C", log_rvol: "C" };
const LABEL = { stealth5: "Stealth 5", stealth20: "Stealth 20", net_intent: "Ý đồ dòng tiền IFE", mom5_atr: "Động lượng 5 phiên / ATR", log_rvol: "Khối lượng tương đối (log)" };
const MIN_PRICE_SESSIONS = 60;

/**
 * @param {{ cal: string[], flow: Map<string, Map<string, Record<string, number>>>, prices: Map<string, {date:string, closeAdj:number, value:number|null}[]>,
 *   sectors: Map<string, string|null>, vnIndex: Map<string, number> }} p
 *   flow: ngày -> (mã -> features); prices: chuỗi tăng dần theo ngày; sectors: mã -> ICB cấp 2.
 */
export function runRetro({ cal, flow, prices, sectors, vnIndex }) {
  const pos = new Map(cal.map((d, i) => [d, i]));
  const px = new Map();
  for (const [t, rows] of prices) for (const r of rows) px.set(`${t}|${r.date}`, r.closeAdj);
  const sigIds = Object.keys(RETRO_SIGNALS);

  // 1) IC(d, h) cho mọi ngày có đặc trưng (chỉ dùng lợi suất thực hiện; được LỌC theo độ chín ở bước walk-forward).
  const ic = Object.fromEntries(sigIds.map((s) => [s, Object.fromEntries(HORIZONS.map((h) => [h, new Map()]))]));
  const flowDates = [...flow.keys()].filter((d) => pos.has(d)).sort();
  for (const d of flowDates) {
    const i = pos.get(d);
    const day = flow.get(d);
    for (const h of HORIZONS) {
      if (i + 1 + h >= cal.length) continue;
      const a = cal[i + 1], b = cal[i + 1 + h];
      for (const s of sigIds) {
        const pairs = [];
        for (const [t, f] of day) {
          const v = Number(f?.[RETRO_SIGNALS[s]]);
          const x = px.get(`${t}|${a}`), y = px.get(`${t}|${b}`);
          if (Number.isFinite(v) && x > 0 && y > 0) pairs.push([v, y / x - 1]);
        }
        const r = dailyIc(pairs);
        if (r) ic[s][h].set(d, r.ic);
      }
    }
  }

  // 2) Walk-forward.
  const tiers = { ...RETRO_PRIOR_TIER };
  const tierDays = Object.fromEntries(sigIds.map((s) => [s, { A: 0, B: 0, C: 0 }]));
  const entries = [];
  const pricesUpTo = (D) => new Map([...prices].map(([t, rows]) => [t, rows.filter((r) => r.date <= D)]));
  const firstPriceIdx = MIN_PRICE_SESSIONS;
  for (const D of flowDates) {
    const iD = pos.get(D);
    if (iD < firstPriceIdx) continue;
    const byS = {};
    const tests = [];
    for (const s of sigIds) {
      byS[s] = {};
      for (const h of HORIZONS) {
        const series = [...ic[s][h]].filter(([d]) => pos.get(d) + 1 + h <= iD).sort((x, y) => x[0].localeCompare(y[0])).map(([, v]) => v);
        byS[s][h] = summarize(series, h);
        if (byS[s][h].n >= MIN_DAYS_FDR && byS[s][h].pPos != null) tests.push([s, h]);
      }
    }
    const q = bhQ(tests.map(([s, h]) => byS[s][h].pPos));
    tests.forEach(([s, h], k) => { byS[s][h].q = q[k]; });
    for (const s of sigIds) { tiers[s] = decideTier(tiers[s], byS[s], 5).tier; tierDays[s][tiers[s]]++; }
    const evidence = { signals: sigIds.map((s) => ({ id: s, labelVi: LABEL[s], tab: "Siêu quét AI", tier: tiers[s], mainH: 5, byH: Object.fromEntries(HORIZONS.map((h) => [h, { n: byS[s][h].n, mean: byS[s][h].mean }])) })) };
    const day = flow.get(D);
    const rows = [...day].map(([t, f]) => ({ ticker: t, icb: { l2: sectors.get(t) ?? null }, values: Object.fromEntries(sigIds.map((s) => [s, Number.isFinite(Number(f?.[RETRO_SIGNALS[s]])) ? Number(f[RETRO_SIGNALS[s]]) : null])) }));
    // E7-v2: truyền danh mục phiên walk-forward liền trước làm vùng đệm giữ mã (E3-v3).
    const dec = buildDecision({ panel: { date: D, rows }, evidence, prices: pricesUpTo(D), cal: cal.slice(0, iD + 1), prevHoldings: entries[entries.length - 1]?.holdings ?? [] });
    if (!dec.portfolio.length) continue;
    const eligible = dec.scores.filter((x) => x.eligible);
    entries.push({
      construction: dec.construction,
      date: D, holdings: dec.portfolio.map((p) => ({ ticker: p.ticker, weight: p.weight })), universe: eligible.map((x) => x.ticker),
      z: Object.fromEntries(eligible.map((x) => [x.ticker, x.Z])), weights: dec.weights.map((w) => ({ id: w.id, tier: w.tier, w: w.w, icPost: w.icPost })),
    });
  }

  // 3) Chấm bằng đúng hàm của sổ theo dõi E3.
  for (const e of entries) {
    e.results = {};
    for (const h of LEDGER_HORIZONS) { const r = evaluateEntry(e, h, px, cal, vnIndex); if (r) e.results[h] = r; }
  }
  const summary = summarizeLedger(entries);

  // 4) Báo cáo mô tả thêm (không là tiêu chí).
  const nonOverlap = entries.filter((_, k) => k % 10 === 0).map((e) => e.results[10]?.excess).filter((v) => v != null);
  let turnover = null;
  if (entries.length > 1) {
    const tv = [];
    for (let k = 1; k < entries.length; k++) {
      const a = new Map(entries[k - 1].holdings.map((h) => [h.ticker, h.weight]));
      const b = new Map(entries[k].holdings.map((h) => [h.ticker, h.weight]));
      const keys = new Set([...a.keys(), ...b.keys()]);
      let s = 0;
      for (const t of keys) s += Math.abs((b.get(t) ?? 0) - (a.get(t) ?? 0));
      tv.push(s / 2);
    }
    turnover = tv.reduce((x, y) => x + y, 0) / tv.length;
  }
  const ex10 = summary.horizons[10];
  return {
    version: E7_VERSION, prereg: "backend/src/market/elite/E7-prereg.md",
    period: { from: entries[0]?.date ?? null, to: entries[entries.length - 1]?.date ?? null, sessions: entries.length },
    criteria: summary.criteria, label: summary.label,
    verdictVi: summary.criteria.icPass && summary.criteria.excessPass
      ? "ĐẠT cả hai tiêu chí đăng ký trước (phiên bản thu gọn 5 tín hiệu dòng tiền)."
      : `KHÔNG ĐẠT: ${summary.criteria.icPass ? "" : "IC của Z ở 5 phiên chưa đạt t ≥ 2; "}${summary.criteria.excessPass ? "" : "lợi suất vượt 10 phiên sau phí chưa có cận dưới KTC 95% > 0."}`.trim(),
    horizons: summary.horizons,
    descriptive: {
      nonOverlapping10: { n: nonOverlap.length, mean: nonOverlap.length ? nonOverlap.reduce((a, b) => a + b, 0) / nonOverlap.length : null, ci95: blockBootstrapCi(nonOverlap, 2) },
      annualisedExcess: ex10?.meanExcess != null ? (1 + ex10.meanExcess) ** (252 / 10) - 1 : null,
      dailyTurnover: turnover,
      ercShare: entries.length ? entries.filter((e) => e.construction?.method === "erc").length / entries.length : null,
      tierDays,
    },
    lastWeights: entries[entries.length - 1]?.weights ?? [],
    recent: entries.slice(-20).map((e) => ({ date: e.date, holdings: e.holdings.map((h) => h.ticker), r5: e.results[5]?.excess ?? null, r10: e.results[10]?.excess ?? null })),
  };
}
