// SEPA — Chương 12–13: quản trị rủi ro (chuyển 1:1 từ sepa_screener/risk.py).

import { SEPA } from "./config.js";
import { fmtPct, pyRound } from "./indicators.js";

/** Dừng lỗ = 1/2 mức lãi trung bình, tối đa 10% [s.355–356]; thị trường khó 5–6% [s.370]. */
export function stopLossPct(avgGain, maxStop = 0.1, hardMarket = false, hardMarketStop = 0.06) {
  let s = Math.min(avgGain / 2, maxStop);
  if (hardMarket) s = Math.min(s, hardMarketStop);
  return s;
}

/**
 * Kế hoạch lệnh:
 *  - stop % theo mức lãi TB; nếu hỗ trợ cấu trúc (đáy lần thu hẹp cuối) gần hơn thì dùng nó (× 0,995);
 *  - cần stop > 10% => "định sai thời điểm mua" [s.356] -> stopTooWide;
 *  - quy mô: rủi ro mỗi lệnh = riskPerTrade × vốn, trần 25%/vị thế [s.371], lô 100 cp (VN);
 *  - lãi đạt 3R => dời stop về hòa vốn [s.366].
 */
export function planTrade(entry, structuralStop, equity, cfg = SEPA.risk, hardMarket = false) {
  const lot = cfg.lot ?? 100, notes = [];
  const pct = stopLossPct(cfg.avgGain, cfg.maxStop, hardMarket, cfg.hardMarketStop);
  let stop = entry * (1 - pct), tooWide = false;
  if (structuralStop != null && structuralStop < entry) {
    const sPct = 1 - structuralStop / entry;
    if (sPct <= pct) { stop = structuralStop * 0.995; notes.push(`Dùng hỗ trợ cấu trúc (${fmtPct(sPct, 1)}) – chặt hơn stop % (${fmtPct(pct, 1)})`); }
    else {
      notes.push(`Hỗ trợ cấu trúc cách ${fmtPct(sPct, 1)} > stop tối đa ${fmtPct(pct, 1)}: dùng stop %`);
      if (sPct > cfg.maxStop) { tooWide = true; notes.push("Điểm mua cần stop > 10% – sách coi là định sai thời điểm mua [s.356]"); }
    }
  }
  const r = entry - stop, riskAmt = equity * cfg.riskPerTrade;
  let shares = r > 0 ? Math.trunc(riskAmt / r) : 0;
  const cap = Math.trunc((equity * cfg.maxPositionPct) / entry);
  if (shares > cap) { shares = cap; notes.push(`Giới hạn vị thế ${fmtPct(cfg.maxPositionPct)} vốn [s.371]`); }
  shares = Math.floor(shares / lot) * lot;
  const val = shares * entry;
  return {
    entry, stop: pyRound(stop, 4), stopPct: pyRound(1 - stop / entry, 4), structuralStop: structuralStop ?? null, stopTooWide: tooWide,
    target2r: entry + 2 * r, target3r: entry + 3 * r, breakevenTrigger: entry + cfg.breakevenRMultiple * r,
    shares, positionValue: val, positionPct: val / equity, riskAmount: shares * r, riskPctEquity: (shares * r) / equity, notes,
  };
}

/** Chia vốn giải ngân khi giá tăng (scale in), ví dụ 2% + 2% + 1% [s.365–366]. Không bình quân giá xuống. */
export const scaleInPlan = (totalPositionPct = 0.05, tranches = [0.4, 0.4, 0.2]) => tranches.map((x) => totalPositionPct * x);
export const expectancy = (winRate, avgWin, avgLoss) => winRate * avgWin - (1 - winRate) * avgLoss;
/** W = 1/(1+P): 2:1 cần 33%, 3:1 cần 25% [s.357]. */
export const requiredWinRate = (rewardRisk) => 1 / (1 + rewardRisk);
/** Tỷ suất sinh lợi kép sau N giao dịch (Hình 13.1 [s.368]). */
export function compoundRoi(winRate, gain, loss, trades = 10) {
  const w = winRate * trades;
  return (1 + gain) ** w * (1 - loss) ** (trades - w) - 1;
}
/** Tái tạo Hình 13.1: cùng tỷ lệ lãi/lỗ 2:1, nới rộng stop làm ROI giảm khi tỷ lệ thắng thấp. */
export function optimalGainLossTable(winRates = [0.3, 0.4, 0.5], ratio = 2, trades = 10) {
  const gains = [0.04, 0.06, 0.08, 0.12, 0.14, 0.16, 0.2, 0.24, 0.3, 0.36, 0.42, 0.48, 0.54, 0.6, 0.7, 0.8, 0.9, 1.0];
  return gains.map((g) => {
    const l = g / ratio, row = { lai: g, lo: l };
    for (const w of winRates) row[`ROI_thang_${Math.trunc(w * 100)}%`] = compoundRoi(w, g, l, trades);
    return row;
  });
}
/** Lãi ≥ 3R thì stop tối thiểu = giá vốn; không bao giờ để lãi lớn thành lỗ [s.351, s.366]. */
export function trailingStopUpdate(entry, stop, price, cfg = SEPA.risk) {
  const r = entry - stop;
  return r > 0 && price >= entry + cfg.breakevenRMultiple * r ? Math.max(stop, entry) : stop;
}
/** Chuỗi thua -> giảm quy mô (5.000 -> 2.000 -> 1.000 cp); thắng -> tăng dần [s.361–362]. */
export function losingStreakSizeFactor(recent = []) {
  let losses = 0; for (let i = recent.length - 1; i >= 0 && recent[i] < 0; i--) losses++;
  return recent.length ? Math.min(1, Math.max(0.2, 1 - 0.3 * losses)) : 1;
}
