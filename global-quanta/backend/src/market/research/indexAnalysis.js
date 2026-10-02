// Phân tích AI cấp VN-Index (hàm thuần) từ market_regime_daily:
//   - trạng thái hiện tại + số phiên liên tiếp, lịch sử 60 phiên
//   - VN-Index sau T+3/T+5/T+10 theo TRẠNG THÁI và theo VÙNG IMPULSE: xác suất tăng, lợi suất TB
// Cửa sổ T+h của các ngày liền nhau chồng lấn -> khoảng tin cậy dùng n hiệu dụng ≈ n / h.

import { HORIZONS, wilson } from "./feedback.js";

export const IMPULSE_ZONES = [
  { id: "LOW", label: "Impulse < 40", test: (s) => s < 40 },
  { id: "MID", label: "Impulse 40–60", test: (s) => s >= 40 && s < 60 },
  { id: "HIGH", label: "Impulse ≥ 60", test: (s) => s >= 60 },
];
const REGIMES = ["UPTREND", "SIDEWAY", "DOWNTREND"];
const r4 = (v) => (v === null || v === undefined || !Number.isFinite(v) ? null : Math.round(v * 1e4) / 1e4);

function forwardStats(rows, idx, h) {
  const rets = [];
  for (const i of idx) if (i + h < rows.length && rows[i].close > 0) rets.push(rows[i + h].close / rows[i].close - 1);
  const n = rets.length;
  if (!n) return { n: 0, nEff: 0, pUp: null, lo: null, hi: null, meanRet: null };
  const up = rets.filter((r) => r > 0).length;
  const nEff = Math.max(1, Math.round(n / h));
  const [lo, hi] = wilson(Math.round((up / n) * nEff), nEff);
  return { n, nEff, pUp: r4(up / n), lo: r4(lo), hi: r4(hi), meanRet: r4(rets.reduce((a, b) => a + b, 0) / n) };
}

/** @param {{ date, close, regime, impulseScore, breadthPct, ma20?, ma50?, ma200? }[]} rows cũ -> mới */
export function analyzeIndex(rows) {
  if (!rows.length) return null;
  const all = rows.map((_, i) => i);
  const last = rows.at(-1);
  let streak = 0;
  for (let i = rows.length - 1; i >= 0 && rows[i].regime === last.regime; i--) streak++;

  // Độ dài trung bình mỗi đợt của từng trạng thái.
  const runs = {};
  for (let i = 0; i < rows.length;) {
    let j = i;
    while (j < rows.length && rows[j].regime === rows[i].regime) j++;
    (runs[rows[i].regime] ??= []).push(j - i);
    i = j;
  }

  const group = (idx) => Object.fromEntries(HORIZONS.map((h) => [h, forwardStats(rows, idx, h)]));
  const byRegime = Object.fromEntries(REGIMES.map((reg) => {
    const idx = all.filter((i) => rows[i].regime === reg);
    const r = runs[reg] ?? [];
    return [reg, {
      sessions: idx.length, share: r4(idx.length / rows.length),
      avgRun: r.length ? Math.round((r.reduce((a, b) => a + b, 0) / r.length) * 10) / 10 : null,
      horizons: group(idx),
    }];
  }));
  const byImpulse = Object.fromEntries(IMPULSE_ZONES.map((z) => {
    const idx = all.filter((i) => rows[i].impulseScore !== null && rows[i].impulseScore !== undefined && z.test(rows[i].impulseScore));
    return [z.id, { label: z.label, sessions: idx.length, horizons: group(idx) }];
  }));
  const zone = last.impulseScore === null || last.impulseScore === undefined ? null : IMPULSE_ZONES.find((z) => z.test(last.impulseScore))?.id ?? null;

  return {
    from: rows[0].date, to: last.date,
    current: {
      date: last.date, close: last.close, regime: last.regime, streak,
      impulseScore: last.impulseScore ?? null, impulseZone: zone, breadthPct: last.breadthPct ?? null,
      ma20: last.ma20 ?? null, ma50: last.ma50 ?? null, ma200: last.ma200 ?? null,
    },
    history: rows.slice(-60).map((r) => ({ date: r.date, regime: r.regime, impulseScore: r.impulseScore ?? null, breadthPct: r.breadthPct ?? null, close: r.close })),
    base: group(all),
    byRegime,
    byImpulse,
    note: "Cửa sổ T+h chồng lấn: khoảng tin cậy 95% dùng n hiệu dụng ≈ n / h. Thống kê quá khứ, không phải dự báo chắc chắn.",
  };
}
