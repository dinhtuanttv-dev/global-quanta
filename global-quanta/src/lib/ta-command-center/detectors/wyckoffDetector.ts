import type { OhlcvBar } from "../types";

export type WyckoffPhase = "accumulation" | "spring" | "test" | "markup" | "undetermined";

export interface WyckoffResult {
  phase: WyckoffPhase;
  rangeHigh: number | null;
  rangeLow: number | null;
  rangeStartDate: string | null;
  springDate: string | null;
  testDate: string | null;
  markupDate: string | null;
  dataQuality: "ESTIMATED";
}

const RANGE_LOOKBACK = 40;
const RANGE_MAX_WIDTH_PCT = 0.12;
const RANGE_MIN_BARS = 30;

function findTradingRange(bars: OhlcvBar[]): { high: number; low: number; startIdx: number } | null {
  if (bars.length < RANGE_MIN_BARS) return null;
  const window = bars.slice(-RANGE_LOOKBACK);
  const rangeHigh = Math.max(...window.map((b) => b.high));
  const rangeLow = Math.min(...window.map((b) => b.low));
  const width = (rangeHigh - rangeLow) / rangeLow;
  if (width > RANGE_MAX_WIDTH_PCT) return null;
  return { high: rangeHigh, low: rangeLow, startIdx: bars.length - window.length };
}

function avgVolume(bars: OhlcvBar[], n: number): number {
  const recent = bars.slice(-n);
  if (recent.length === 0) return 0;
  return recent.reduce((s, b) => s + b.volume, 0) / recent.length;
}

// Suy luan chu ky Wyckoff tu hinh mau gia/khoi luong.
// KHONG phai phan tich dong tien to chuc thuc te - luon gan nhan ESTIMATED.
export function classifyWyckoffPhase(bars: OhlcvBar[]): WyckoffResult {
  const base: WyckoffResult = {
    phase: "undetermined", rangeHigh: null, rangeLow: null, rangeStartDate: null,
    springDate: null, testDate: null, markupDate: null, dataQuality: "ESTIMATED",
  };

  const range = findTradingRange(bars);
  if (!range) return base;

  base.rangeHigh = range.high;
  base.rangeLow = range.low;
  base.rangeStartDate = bars[range.startIdx].date;

  const rangeBars = bars.slice(range.startIdx);
  const ma20Vol = avgVolume(bars, 20);

  let springIdx = -1;
  for (let i = 0; i < rangeBars.length; i++) {
    const b = rangeBars[i];
    if (b.low < range.low * 0.99 && b.close > range.low) { springIdx = i; break; }
  }
  if (springIdx === -1) return { ...base, phase: "accumulation" };
  base.springDate = rangeBars[springIdx].date;

  const springLow = rangeBars[springIdx].low;
  const springVol = rangeBars[springIdx].volume;
  let testIdx = -1;
  for (let i = springIdx + 1; i < Math.min(springIdx + 11, rangeBars.length); i++) {
    const b = rangeBars[i];
    if (Math.abs(b.low - springLow) / springLow <= 0.02 && b.volume < springVol) { testIdx = i; break; }
  }

  let markupIdx = -1;
  for (let i = springIdx + 1; i < rangeBars.length; i++) {
    const b = rangeBars[i];
    if (b.close > range.high && b.volume > ma20Vol * 1.5) { markupIdx = i; break; }
  }

  if (markupIdx !== -1) {
    base.markupDate = rangeBars[markupIdx].date;
    if (testIdx !== -1 && testIdx < markupIdx) base.testDate = rangeBars[testIdx].date;
    return { ...base, phase: "markup" };
  }
  if (testIdx !== -1) {
    base.testDate = rangeBars[testIdx].date;
    return { ...base, phase: "test" };
  }
  return { ...base, phase: "spring" };
}

export function scoreWyckoffPhase(phase: WyckoffPhase): number {
  switch (phase) {
    case "markup": return 1.0;
    case "spring":
    case "test": return 0.6;
    case "accumulation": return 0.3;
    default: return 0;
  }
}
