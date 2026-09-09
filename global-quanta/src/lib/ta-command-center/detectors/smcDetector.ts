import type { OhlcvBar } from "../types";

export interface OrderBlock {
  date: string;
  type: "bullish" | "bearish";
  top: number;
  bottom: number;
  mitigated: boolean;
  // ĐÃ THÊM (v2): ngày cụ thể OB bị mitigated — để rendering vẽ đúng độ
  // dài thật của vùng (từ lúc hình thành tới lúc bị lấp/test), thay vì
  // chiều rộng pixel cố định như trước ("rán lên" biểu đồ, không theo
  // zoom, không có ý nghĩa thời gian thật).
  mitigatedAt: string | null;
}
export interface FairValueGap {
  startDate: string;
  endDate: string;
  type: "bullish" | "bearish";
  top: number;
  bottom: number;
  filled: boolean;
  // ĐÃ THÊM (v2): tương tự OrderBlock.mitigatedAt
  filledAt: string | null;
}
export interface BreakOfStructure { date: string; type: "bullish" | "bearish"; brokenLevel: number; }

const ATR_PERIOD = 14;
const STRONG_MOVE_ATR_MULTIPLIER = 1.2;
const MIN_FVG_ATR_RATIO = 0.15;
const SWING_LOOKBACK = 5;

function calcATRSeries(bars: OhlcvBar[], period = ATR_PERIOD): number[] {
  const tr: number[] = [0];
  for (let i = 1; i < bars.length; i++) {
    const cur = bars[i];
    const prev = bars[i - 1];
    tr.push(Math.max(cur.high - cur.low, Math.abs(cur.high - prev.close), Math.abs(cur.low - prev.close)));
  }
  const atr: number[] = new Array(bars.length).fill(0);
  let sum = 0;
  for (let i = 0; i < bars.length; i++) {
    sum += tr[i];
    if (i >= period) sum -= tr[i - period];
    atr[i] = i >= period - 1 ? sum / period : tr.slice(0, i + 1).reduce((a, b) => a + b, 0) / (i + 1);
  }
  return atr;
}

export function detectOrderBlocks(bars: OhlcvBar[]): OrderBlock[] {
  const atr = calcATRSeries(bars);
  const obs: OrderBlock[] = [];
  for (let i = 0; i < bars.length - 3; i++) {
    const bar = bars[i];
    const future = bars[i + 3];
    const move = future.close - bar.close;
    const threshold = atr[i] * STRONG_MOVE_ATR_MULTIPLIER;
    if (threshold <= 0) continue;
    if (bar.close < bar.open && move >= threshold) {
      obs.push({ date: bar.date, type: "bullish", top: bar.high, bottom: bar.low, mitigated: false, mitigatedAt: null });
    } else if (bar.close > bar.open && -move >= threshold) {
      obs.push({ date: bar.date, type: "bearish", top: bar.high, bottom: bar.low, mitigated: false, mitigatedAt: null });
    }
  }
  const recent = obs.slice(-10);
  for (const ob of recent) {
    const obIndex = bars.findIndex((b) => b.date === ob.date);
    if (obIndex === -1) continue;
    for (let j = obIndex + 4; j < bars.length; j++) {
      const b = bars[j];
      if (b.low <= ob.top && b.high >= ob.bottom) {
        ob.mitigated = true;
        ob.mitigatedAt = b.date;
        break;
      }
    }
  }
  return recent;
}

export function detectFVG(bars: OhlcvBar[]): FairValueGap[] {
  const atr = calcATRSeries(bars);
  const gaps: FairValueGap[] = [];
  for (let i = 0; i < bars.length - 2; i++) {
    const c1 = bars[i];
    const c3 = bars[i + 2];
    const minGap = atr[i] * MIN_FVG_ATR_RATIO;
    if (c1.high < c3.low && c3.low - c1.high >= minGap) {
      gaps.push({ startDate: c1.date, endDate: c3.date, type: "bullish", top: c3.low, bottom: c1.high, filled: false, filledAt: null });
    } else if (c1.low > c3.high && c1.low - c3.high >= minGap) {
      gaps.push({ startDate: c1.date, endDate: c3.date, type: "bearish", top: c1.low, bottom: c3.high, filled: false, filledAt: null });
    }
  }
  const recent = gaps.slice(-10);
  for (const gap of recent) {
    const gapIndex = bars.findIndex((b) => b.date === gap.endDate);
    if (gapIndex === -1) continue;
    for (let j = gapIndex + 1; j < bars.length; j++) {
      const b = bars[j];
      if (b.low <= gap.bottom && b.high >= gap.top) {
        gap.filled = true;
        gap.filledAt = b.date;
        break;
      }
    }
  }
  return recent;
}

export function detectBOS(bars: OhlcvBar[]): BreakOfStructure[] {
  const results: BreakOfStructure[] = [];
  const swingHighs: { index: number; price: number }[] = [];
  const swingLows: { index: number; price: number }[] = [];

  for (let i = SWING_LOOKBACK; i < bars.length - SWING_LOOKBACK; i++) {
    const window = bars.slice(i - SWING_LOOKBACK, i + SWING_LOOKBACK + 1);
    if (window.every((b) => bars[i].high >= b.high)) swingHighs.push({ index: i, price: bars[i].high });
    if (window.every((b) => bars[i].low <= b.low)) swingLows.push({ index: i, price: bars[i].low });
  }

  for (let i = SWING_LOOKBACK; i < bars.length; i++) {
    const priorHigh = [...swingHighs].reverse().find((s) => s.index < i);
    const priorLow = [...swingLows].reverse().find((s) => s.index < i);
    if (priorHigh && bars[i].close > priorHigh.price) results.push({ date: bars[i].date, type: "bullish", brokenLevel: priorHigh.price });
    if (priorLow && bars[i].close < priorLow.price) results.push({ date: bars[i].date, type: "bearish", brokenLevel: priorLow.price });
  }
  return results.slice(-6);
}
