// @gq/quant-core · MTF — chỉ báo nền + sóng ZigZag theo ATR (như tài liệu gốc) + Dow. Mọi chuỗi POINT-IN-TIME.
import { atrSeries, type Bar } from "../math";
import type { Swing, TfParams } from "./types";

/** SMA; NaN khi chưa đủ `period` nến (không ước lượng bằng dữ liệu tương lai). */
export function smaSeries(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  let s = 0;
  for (let i = 0; i < values.length; i++) {
    s += values[i];
    if (i >= period) s -= values[i - period];
    if (i >= period - 1) out[i] = s / period;
  }
  return out;
}

export interface Indicators {
  maFast: number[]; maSlow: number[]; atr: number[];
  slope: number[];      // độ dốc MA chân trên / nến, đơn vị ATR
  slopeFast: number[];  // độ dốc MA chân dưới / nến, đơn vị ATR
  dev: number[];        // (giá − MA chân trên) / ATR
  spread: number[];     // (MA chân dưới − MA chân trên) / ATR
  volAvg: number[];     // KL trung bình 20 nến
}

export function indicators(bars: Bar[], p: TfParams): Indicators {
  const close = bars.map((b) => b.close);
  const maFast = smaSeries(close, p.maFast);
  const maSlow = smaSeries(close, p.maSlow);
  const atr = atrSeries(bars, p.atr);
  const n = bars.length;
  const slope = new Array<number>(n).fill(NaN);
  const slopeFast = new Array<number>(n).fill(NaN);
  const dev = new Array<number>(n).fill(NaN);
  const spread = new Array<number>(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    const a = atr[i] > 0 ? atr[i] : NaN;
    if (i >= p.slopeLen) {
      slope[i] = (maSlow[i] - maSlow[i - p.slopeLen]) / (p.slopeLen * a);
      slopeFast[i] = (maFast[i] - maFast[i - p.slopeLen]) / (p.slopeLen * a);
    }
    dev[i] = (close[i] - maSlow[i]) / a;
    spread[i] = (maFast[i] - maSlow[i]) / a;
  }
  const volAvg = smaSeries(bars.map((b) => b.volume), 20);
  return { maFast, maSlow, atr, slope, slopeFast, dev, spread, volAvg };
}

/**
 * Sóng ZigZag theo ATR — port của zigzag() trong tài liệu gốc (mtf_market_structure.py): một đỉnh chỉ được XÁC NHẬN khi giá
 * (đáy nến) đảo chiều ≥ k·ATR từ đỉnh (đáy: đỉnh nến vượt đáy ≥ k·ATR). Không vẽ lại: đã xác nhận thì cố định. Khác bản gốc duy nhất:
 * đáy đầu tiên (pha chưa rõ hướng) được ghi xác nhận tại nến phát hiện thay vì nến đỉnh (bản gốc nhìn trước vài nến ở điểm này).
 * Bắt đầu từ nến có đủ ATR (period − 1).
 */
export function zigzagSwings(bars: Bar[], atr: number[], k: number, level: Swing["level"], start = 0): Swing[] {
  const out: Swing[] = [];
  const n = bars.length;
  if (n === 0 || start >= n) return out;
  let dir: 0 | 1 | -1 = 0; // +1 đang tìm đỉnh, −1 đang tìm đáy
  let extI = start, extP = bars[start].high, loI = start, loP = bars[start].low;
  for (let i = start + 1; i < n; i++) {
    const a = Number.isFinite(atr[i]) && atr[i] > 0 ? atr[i] : atr[start];
    const th = k * a, b = bars[i];
    if (dir >= 0) {
      if (b.high > extP) { extI = i; extP = b.high; }
      if (dir === 0 && b.low < loP) { loI = i; loP = b.low; }
      if (extP - b.low >= th && (dir === 1 || extP - loP >= th)) {
        if (dir === 0 && loI < extI) out.push({ kind: "L", index: loI, confirmedIndex: i, price: loP, level });
        out.push({ kind: "H", index: extI, confirmedIndex: i, price: extP, level });
        dir = -1; extI = i; extP = b.low;
        continue;
      }
    }
    if (dir <= 0) {
      if (dir === -1 && b.low < extP) { extI = i; extP = b.low; }
      if (dir === -1 && b.high - extP >= th) {
        out.push({ kind: "L", index: extI, confirmedIndex: i, price: extP, level });
        dir = 1; extI = i; extP = b.high;
      }
    }
  }
  return out;
}

/** Sóng đã xác nhận tại nến t. */
export const swingsAsOf = (sw: Swing[], t: number): Swing[] => sw.filter((s) => s.confirmedIndex <= t);

/**
 * Xu hướng Dow theo từng nến từ sóng trung đã xác nhận: +1 = đỉnh sau cao hơn & đáy sau cao hơn,
 * −1 = đỉnh sau thấp hơn & đáy sau thấp hơn, 0 = lẫn lộn. Đóng cửa thủng đáy gần nhất (xu hướng tăng) /
 * vượt đỉnh gần nhất (xu hướng giảm) => cấu trúc bị phá -> 0 cho tới khi có cặp sóng mới.
 */
export function dowSeries(bars: Bar[], sw: Swing[]): number[] {
  const n = bars.length;
  const out = new Array<number>(n).fill(0);
  const highs: number[] = [];
  const lows: number[] = [];
  let k = 0;
  let state = 0;
  let broken = false;
  for (let i = 0; i < n; i++) {
    let changed = false;
    while (k < sw.length && sw[k].confirmedIndex === i) {
      const s = sw[k++];
      (s.kind === "H" ? highs : lows).push(s.price);
      changed = true;
    }
    if (changed && highs.length >= 2 && lows.length >= 2) {
      const hh = highs[highs.length - 1] > highs[highs.length - 2];
      const hl = lows[lows.length - 1] > lows[lows.length - 2];
      const next = hh && hl ? 1 : !hh && !hl ? -1 : 0;
      if (next !== state || broken) { state = next; broken = false; }
    }
    const c = bars[i].close;
    if (!broken && state === 1 && lows.length && c < lows[lows.length - 1]) broken = true;
    if (!broken && state === -1 && highs.length && c > highs[highs.length - 1]) broken = true;
    out[i] = broken ? 0 : state;
  }
  return out;
}
