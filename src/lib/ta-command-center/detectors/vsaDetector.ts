import type { OhlcvBar } from "../types";

export type VSASignalType = "Stopping Volume" | "Climax" | "No Demand" | "No Supply";
export interface VSASignal { date: string; type: VSASignalType; volumeRatio: number; spreadRatio: number; }

export function detectVSASignals(bars: OhlcvBar[], lookback: number = 20): VSASignal[] {
  if (bars.length < lookback + 1) return [];
  const signals: VSASignal[] = [];

  for (let i = lookback; i < bars.length; i++) {
    const window = bars.slice(i - lookback, i);
    const avgVolume = window.reduce((s, b) => s + b.volume, 0) / window.length;
    const avgSpread = window.reduce((s, b) => s + (b.high - b.low), 0) / window.length;

    const bar = bars[i];
    const spread = bar.high - bar.low;
    const volumeRatio = avgVolume > 0 ? Math.round((bar.volume / avgVolume) * 100) / 100 : 0;
    const spreadRatio = avgSpread > 0 ? Math.round((spread / avgSpread) * 100) / 100 : 0;
    const closePosition = spread > 0 ? (bar.close - bar.low) / spread : 0.5;

    const wasDowntrend = bars[i - 1].close < window[0].close;
    const wasUptrend = bars[i - 1].close > window[0].close;

    if (volumeRatio >= 1.5 && spreadRatio <= 0.8 && closePosition >= 0.6 && wasDowntrend) {
      signals.push({ date: bar.date, type: "Stopping Volume", volumeRatio, spreadRatio });
    } else if (volumeRatio >= 2 && spreadRatio >= 1.3) {
      signals.push({ date: bar.date, type: "Climax", volumeRatio, spreadRatio });
    } else if (volumeRatio <= 0.6 && spreadRatio <= 0.7 && bar.close > bar.open && wasUptrend) {
      signals.push({ date: bar.date, type: "No Demand", volumeRatio, spreadRatio });
    } else if (volumeRatio <= 0.6 && spreadRatio <= 0.7 && bar.close < bar.open && wasDowntrend) {
      signals.push({ date: bar.date, type: "No Supply", volumeRatio, spreadRatio });
    }
  }
  return signals.slice(-8);
}
