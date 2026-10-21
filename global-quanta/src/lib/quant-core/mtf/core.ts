// @gq/quant-core · MTF — chỉ báo nền + sóng Directional Change + Dow. Mọi chuỗi POINT-IN-TIME.
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
 * Sóng Directional Change (thời gian nội tại): một đỉnh/đáy chỉ được XÁC NHẬN khi giá ĐÓNG CỬA đảo chiều
 * ≥ θ·ATR(tại nến xác nhận) tính từ cực trị. Cực trị đo bằng high/low. Không vẽ lại: đã xác nhận thì cố định.
 */
export function dcSwings(bars: Bar[], atr: number[], theta: number, level: Swing["level"]): Swing[] {
  const out: Swing[] = [];
  if (bars.length === 0) return out;
  let mode: 0 | 1 | -1 = 0; // 0 = chưa rõ, 1 = đang đi lên (tìm đỉnh), -1 = đang đi xuống (tìm đáy)
  let hiP = bars[0].high, hiI = 0, loP = bars[0].low, loI = 0;
  for (let i = 1; i < bars.length; i++) {
    const b = bars[i];
    const th = theta * Math.max(atr[i], 1e-9);
    if (mode >= 0 && b.high > hiP) { hiP = b.high; hiI = i; }
    if (mode <= 0 && b.low < loP) { loP = b.low; loI = i; }
    if (mode === 1) {
      if (hiP - b.close >= th) {
        out.push({ kind: "H", index: hiI, confirmedIndex: i, price: hiP, level });
        mode = -1; loP = b.low; loI = i;
        for (let j = hiI + 1; j <= i; j++) if (bars[j].low < loP) { loP = bars[j].low; loI = j; }
      }
    } else if (mode === -1) {
      if (b.close - loP >= th) {
        out.push({ kind: "L", index: loI, confirmedIndex: i, price: loP, level });
        mode = 1; hiP = b.high; hiI = i;
        for (let j = loI + 1; j <= i; j++) if (bars[j].high > hiP) { hiP = bars[j].high; hiI = j; }
      }
    } else {
      // Chưa có hướng: chiều nào đảo chiều đủ ngưỡng trước sẽ xác nhận cực trị đầu tiên.
      if (hiP - b.close >= th && hiI < i) {
        out.push({ kind: "H", index: hiI, confirmedIndex: i, price: hiP, level });
        mode = -1; loP = b.low; loI = i;
        for (let j = hiI + 1; j <= i; j++) if (bars[j].low < loP) { loP = bars[j].low; loI = j; }
      } else if (b.close - loP >= th && loI < i) {
        out.push({ kind: "L", index: loI, confirmedIndex: i, price: loP, level });
        mode = 1; hiP = b.high; hiI = i;
        for (let j = loI + 1; j <= i; j++) if (bars[j].high > hiP) { hiP = bars[j].high; hiI = j; }
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
