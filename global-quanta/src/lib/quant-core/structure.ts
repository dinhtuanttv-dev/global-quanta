// @gq/quant-core · Market Structure (TA_VNINDEX_UPGRADE_SPEC §2.1.2 a–b).
// Pivot chỉ TỒN TẠI từ nến i+R (confirmedIndex). BOS/CHoCH chỉ dùng pivot ĐÃ xác nhận -> không look-ahead, không vẽ lại.

import { atrSeries, logVolumes, trailingZ, type Bar, type Dir } from "./math";

export interface Pivot { index: number; date: string; kind: "high" | "low"; price: number; confirmedIndex: number }

export interface StructureEvent {
  kind: "BOS" | "CHoCH";
  dir: Dir;
  index: number;          // nến đóng cửa phá cấu trúc (= confirmedIndex)
  date: string;
  level: number;          // mức swing bị phá
  pivotIndex: number;
  legStartIndex: number;  // đáy/đỉnh xuất phát của chân giá phá cấu trúc
  displacementATR: number;
  displaced: boolean;     // thân ≥ 1×ATR hoặc ≤3 nến cùng chiều có tổng biên độ ≥ 1.5×ATR
  volZ: number | null;    // z(log V, 20) của nến phá
  confirmedIndex: number;
}

export interface StructureParams { left: number; right: number; atrPeriod: number; volWindow: number }
export const DEFAULT_STRUCTURE: StructureParams = { left: 5, right: 5, atrPeriod: 14, volWindow: 20 };

/** Fractal pivot: đỉnh cao hơn L nến trái (chặt) và không thấp hơn R nến phải. */
export function detectPivots(bars: Bar[], left = 5, right = 5): Pivot[] {
  const out: Pivot[] = [];
  for (let i = left; i + right < bars.length; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - left; j < i && (isHigh || isLow); j++) {
      if (bars[j].high >= bars[i].high) isHigh = false;
      if (bars[j].low <= bars[i].low) isLow = false;
    }
    for (let j = i + 1; j <= i + right && (isHigh || isLow); j++) {
      if (bars[j].high > bars[i].high) isHigh = false;
      if (bars[j].low < bars[i].low) isLow = false;
    }
    if (isHigh) out.push({ index: i, date: bars[i].date, kind: "high", price: bars[i].high, confirmedIndex: i + right });
    if (isLow) out.push({ index: i, date: bars[i].date, kind: "low", price: bars[i].low, confirmedIndex: i + right });
  }
  return out.sort((a, b) => a.confirmedIndex - b.confirmedIndex || a.index - b.index);
}

export interface StructureResult { pivots: Pivot[]; events: StructureEvent[]; trend: Dir | null; atr: number[] }

export function computeStructure(bars: Bar[], params: Partial<StructureParams> = {}): StructureResult {
  const p = { ...DEFAULT_STRUCTURE, ...params };
  const atr = atrSeries(bars, p.atrPeriod);
  const lv = logVolumes(bars);
  const pivots = detectPivots(bars, p.left, p.right);
  const events: StructureEvent[] = [];
  let next = 0;
  let activeHigh: Pivot | null = null;
  let activeLow: Pivot | null = null;
  let trend: Dir | null = null;

  for (let i = 0; i < bars.length; i++) {
    while (next < pivots.length && pivots[next].confirmedIndex === i) {
      const pv = pivots[next++];
      if (pv.kind === "high") activeHigh = pv; else activeLow = pv;
    }
    const b = bars[i];
    const breaks: { dir: Dir; pv: Pivot }[] = [];
    if (activeHigh && b.close > activeHigh.price) breaks.push({ dir: "bullish", pv: activeHigh });
    if (activeLow && b.close < activeLow.price) breaks.push({ dir: "bearish", pv: activeLow });
    for (const { dir, pv } of breaks) {
      // Chân giá: điểm cực trị ngược hướng thấp/cao nhất từ pivot tới nến phá.
      let legStart = pv.index;
      for (let j = pv.index; j <= i; j++) {
        if (dir === "bullish" ? bars[j].low < bars[legStart].low : bars[j].high > bars[legStart].high) legStart = j;
      }
      const a = atr[i] > 0 ? atr[i] : 1;
      const body = Math.abs(b.close - b.open) / a;
      let run = 0;
      for (let j = i; j >= Math.max(0, i - 2); j--) {
        const up = bars[j].close > bars[j].open;
        if ((dir === "bullish") !== up) break;
        run += (bars[j].high - bars[j].low) / a;
      }
      const displacementATR = Math.round(Math.max(body, run / 1.5) * 100) / 100;
      events.push({
        kind: trend !== null && trend !== dir ? "CHoCH" : "BOS",
        dir, index: i, date: b.date, level: pv.price, pivotIndex: pv.index, legStartIndex: legStart,
        displacementATR, displaced: body >= 1.0 || run >= 1.5,
        volZ: trailingZ(lv, i, p.volWindow), confirmedIndex: i,
      });
      trend = dir;
      if (dir === "bullish") activeHigh = null; else activeLow = null;
    }
  }
  return { pivots, events, trend, atr };
}
