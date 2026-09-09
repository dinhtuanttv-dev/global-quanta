import type { OhlcvBar } from "../types";

// ĐÃ THÊM 3 tín hiệu VSA kinh điển của Tom Williams còn thiếu:
// - Upthrust: giá chọc thủng đỉnh gần nhất rồi tụt lại, khối lượng cao —
//   bẫy tăng giá giả, tín hiệu GIẢM.
// - Shakeout: giá chọc thủng đáy gần nhất rồi bật lại, khối lượng cao —
//   "rũ hàng" trước khi tăng, tín hiệu TĂNG.
// - Two-Bar Reversal: 2 nến liên tiếp đảo ngược hoàn toàn nhau, khối
//   lượng nến sau lớn hơn nến trước — đảo chiều gấp.
export type VSASignalType =
  | "Stopping Volume" | "Climax" | "No Demand" | "No Supply"
  | "Upthrust" | "Shakeout" | "Two-Bar Reversal";

export interface VSASignal { date: string; type: VSASignalType; volumeRatio: number; spreadRatio: number; }

const TREND_SMA_PERIOD = 5;
const STRUCTURE_LOOKBACK = 10; // cửa sổ tìm đỉnh/đáy gần nhất cho Upthrust/Shakeout

function smaAt(bars: OhlcvBar[], endIndexExclusive: number, period: number): number | null {
  const start = endIndexExclusive - period;
  if (start < 0) return null;
  const slice = bars.slice(start, endIndexExclusive);
  return slice.reduce((s, b) => s + b.close, 0) / slice.length;
}

/** ĐÃ THÊM — bản KHÔNG cắt bớt lịch sử, dùng cho backtest (cần toàn bộ
 * lần xuất hiện trong quá khứ để tính tỷ lệ thắng thật, không chỉ vài lần
 * gần nhất). Bản hiển thị UI (detectVSASignals) gọi hàm này rồi mới cắt
 * bớt cho gọn giao diện. */
export function detectVSASignalsFull(bars: OhlcvBar[], lookback: number = 20): VSASignal[] {
  if (bars.length < lookback + TREND_SMA_PERIOD + 1) return [];
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

    const smaNow = smaAt(bars, i, TREND_SMA_PERIOD);
    const smaPrior = smaAt(bars, i - TREND_SMA_PERIOD, TREND_SMA_PERIOD);
    const wasDowntrend = smaNow !== null && smaPrior !== null && smaNow < smaPrior;
    const wasUptrend = smaNow !== null && smaPrior !== null && smaNow > smaPrior;

    if (volumeRatio >= 1.5 && spreadRatio <= 0.8 && closePosition >= 0.6 && wasDowntrend) {
      signals.push({ date: bar.date, type: "Stopping Volume", volumeRatio, spreadRatio });
      continue;
    }
    if (volumeRatio >= 2 && spreadRatio >= 1.3) {
      signals.push({ date: bar.date, type: "Climax", volumeRatio, spreadRatio });
      continue;
    }
    if (volumeRatio <= 0.6 && spreadRatio <= 0.7 && bar.close > bar.open && wasUptrend) {
      signals.push({ date: bar.date, type: "No Demand", volumeRatio, spreadRatio });
      continue;
    }
    if (volumeRatio <= 0.6 && spreadRatio <= 0.7 && bar.close < bar.open && wasDowntrend) {
      signals.push({ date: bar.date, type: "No Supply", volumeRatio, spreadRatio });
      continue;
    }

    // --- ĐÃ THÊM ---
    if (i >= STRUCTURE_LOOKBACK) {
      const structWindow = bars.slice(i - STRUCTURE_LOOKBACK, i);
      const recentHigh = Math.max(...structWindow.map((b) => b.high));
      const recentLow = Math.min(...structWindow.map((b) => b.low));

      if (bar.high > recentHigh && bar.close < recentHigh && volumeRatio >= 1.3) {
        signals.push({ date: bar.date, type: "Upthrust", volumeRatio, spreadRatio });
        continue;
      }
      if (bar.low < recentLow && bar.close > recentLow && volumeRatio >= 1.3) {
        signals.push({ date: bar.date, type: "Shakeout", volumeRatio, spreadRatio });
        continue;
      }
    }

    if (i >= 1) {
      const prev = bars[i - 1];
      const prevSpread = prev.high - prev.low;
      const prevIsBearish = prev.close < prev.open && prevSpread > 0;
      const prevIsBullish = prev.close > prev.open && prevSpread > 0;
      const bullishReversal = prevIsBearish && bar.close > bar.open && bar.close > prev.open && bar.volume > prev.volume * 1.2;
      const bearishReversal = prevIsBullish && bar.close < bar.open && bar.close < prev.open && bar.volume > prev.volume * 1.2;
      if (bullishReversal || bearishReversal) {
        signals.push({ date: bar.date, type: "Two-Bar Reversal", volumeRatio, spreadRatio });
      }
    }
  }
  return signals;
}

export function detectVSASignals(bars: OhlcvBar[], lookback: number = 20): VSASignal[] {
  return detectVSASignalsFull(bars, lookback).slice(-8);
}
