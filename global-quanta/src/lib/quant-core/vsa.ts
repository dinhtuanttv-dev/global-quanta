// @gq/quant-core · VSA Engine — Effort vs Result (TA_VNINDEX_UPGRADE_SPEC §2.1.4).
// zV = z(log V, 30), zS = z(spread, 30) so với cửa sổ TRƯỚC nến; bối cảnh = độ dốc EMA20 đến nến TRƯỚC (không nhìn trước).

import { clv, emaSeries, logVolumes, spreads, trailingZ, atrSeries, type Bar, type Dir } from "./math";

export type VsaType =
  | "Selling Climax" | "Buying Climax" | "Stopping Volume" | "Upthrust" | "Shakeout"
  | "No Supply" | "No Demand" | "Absorption";

export interface VsaSignal {
  type: VsaType; dir: Dir | null; index: number; date: string;
  zV: number; zS: number; clv: number;
  volumeRatio: number; spreadRatio: number; // giữ cho giao diện cũ: bội số so với TB 20 phiên
  confirmedIndex: number;
}

export const VSA_DIRECTION: Record<VsaType, Dir | null> = {
  "Selling Climax": "bullish", "Stopping Volume": "bullish", Shakeout: "bullish", "No Supply": "bullish",
  "Buying Climax": "bearish", Upthrust: "bearish", "No Demand": "bearish", Absorption: null,
};

const W = 30;
const SWING_LOOKBACK = 10;

export function detectVsa(bars: Bar[]): VsaSignal[] {
  const lv = logVolumes(bars);
  const sp = spreads(bars);
  const ema = emaSeries(bars.map((b) => b.close), 20);
  const atr = atrSeries(bars, 14);
  const out: VsaSignal[] = [];
  for (let i = W; i < bars.length; i++) {
    const zV = trailingZ(lv, i, W);
    const zS = trailingZ(sp, i, W);
    if (zV === null || zS === null) continue;
    const b = bars[i];
    const prev = bars[i - 1];
    const c = clv(b);
    const slope = i >= 6 ? ema[i - 1] / ema[i - 6] - 1 : 0;
    const up = slope > 0;
    const down = slope < 0;
    const isUpBar = b.close > prev.close;
    const isDownBar = b.close < prev.close;
    let swingHigh = -Infinity;
    let swingLow = Infinity;
    for (let j = Math.max(0, i - SWING_LOOKBACK); j < i; j++) { swingHigh = Math.max(swingHigh, bars[j].high); swingLow = Math.min(swingLow, bars[j].low); }
    const lowEffort = b.volume < Math.min(bars[i - 1].volume, bars[i - 2].volume);

    let type: VsaType | null = null;
    if (down && zV >= 2 && zS >= 1.5 && c >= 0.4) type = "Selling Climax";
    else if (up && zV >= 2 && zS >= 1.5 && c <= 0.6) type = "Buying Climax";
    else if (down && zV >= 1.5 && c >= 0.6 && zS >= 0) type = "Stopping Volume";
    else if (b.high > swingHigh && b.close < swingHigh && c <= 0.35 && zV >= 1) type = "Upthrust";
    else if (b.low < swingLow && b.close > swingLow && c >= 0.65 && zV >= 1) type = "Shakeout";
    else if (isDownBar && zS <= -0.5 && lowEffort && up) type = "No Supply";
    else if (isUpBar && zS <= -0.5 && lowEffort && down) type = "No Demand";
    else if (zV >= 1.5 && Math.abs(b.close - prev.close) <= 0.3 * (atr[i] || Infinity)) type = "Absorption";
    if (!type) continue;

    let v20 = 0;
    let s20 = 0;
    for (let j = i - 20; j < i; j++) { v20 += bars[j].volume; s20 += sp[j]; }
    out.push({
      type, dir: VSA_DIRECTION[type], index: i, date: b.date,
      zV: Math.round(zV * 100) / 100, zS: Math.round(zS * 100) / 100, clv: Math.round(c * 100) / 100,
      volumeRatio: v20 > 0 ? Math.round((b.volume / (v20 / 20)) * 100) / 100 : 0,
      spreadRatio: s20 > 0 ? Math.round((sp[i] / (s20 / 20)) * 100) / 100 : 0,
      confirmedIndex: i,
    });
  }
  return out;
}
