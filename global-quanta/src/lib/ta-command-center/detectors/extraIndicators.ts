// TA-T4 (28/11/2026, docs/ta-tradingview — Q6 của chủ dự án) — 6 chỉ báo mới theo ĐÚNG công thức + tham số mặc định của
// chỉ báo dựng sẵn TradingView. Tệp MỚI: không sửa công thức chỉ báo cũ. Mọi giá trị tại nến t chỉ dùng bars[0..t] (không nhìn trước).
//   Stochastic (14, 1, 3) · Stoch RSI (3, 3, 14, 14) · ATR (14, RMA) · OBV · MFI (14) · Parabolic SAR (0,02 · 0,02 · 0,2)
import type { OhlcvBar } from "../types";
import { calculateRSI } from "./technicalOscillators";

type S = (number | null)[];

/** SMA trên chuỗi có thể có null ở đầu: null tới khi đủ `n` giá trị liên tiếp. */
function smaOf(xs: S, n: number): S {
  const out: S = new Array(xs.length).fill(null);
  if (n <= 1) return xs.slice();
  // Cộng trực tiếp trong cửa sổ (n nhỏ) — tổng trượt cộng/trừ dồn sai số dấu phẩy động (VD −8,7e-15 thay vì 0).
  for (let i = n - 1; i < xs.length; i++) {
    let sum = 0, ok = true;
    for (let j = i - n + 1; j <= i; j++) { const v = xs[j]; if (v == null) { ok = false; break; } sum += v; }
    if (ok) out[i] = sum / n;
  }
  return out;
}

/** %K thô = 100 · (giá − thấp nhất N) / (cao nhất N − thấp nhất N); biên độ 0 -> 50 (không chia 0). */
function stochRaw(src: S, hi: S, lo: S, n: number): S {
  const out: S = new Array(src.length).fill(null);
  for (let i = n - 1; i < src.length; i++) {
    let h = -Infinity, l = Infinity, ok = true;
    for (let j = i - n + 1; j <= i; j++) { const a = hi[j], b = lo[j]; if (a == null || b == null) { ok = false; break; } if (a > h) h = a; if (b < l) l = b; }
    const v = src[i];
    if (!ok || v == null) continue;
    out[i] = h === l ? 50 : (100 * (v - l)) / (h - l);
  }
  return out;
}

export interface StochResult { k: S; d: S }
/** Stochastic (TradingView "Stoch"): %K độ dài 14, làm mượt %K 1, %D 3. */
export function stochastic(bars: OhlcvBar[], { length = 14, smoothK = 1, smoothD = 3 } = {}): StochResult {
  const raw = stochRaw(bars.map((b) => b.close), bars.map((b) => b.high), bars.map((b) => b.low), length);
  const k = smaOf(raw, smoothK);
  return { k, d: smaOf(k, smoothD) };
}

/** Stoch RSI (TradingView): RSI 14 (Wilder) -> Stochastic 14 của RSI -> %K = SMA 3, %D = SMA 3 của %K. */
export function stochRsi(bars: OhlcvBar[], { rsiLength = 14, stochLength = 14, smoothK = 3, smoothD = 3 } = {}): StochResult {
  const rsi = calculateRSI(bars, rsiLength, "wilder").series;
  const k = smaOf(stochRaw(rsi, rsi, rsi, stochLength), smoothK);
  return { k, d: smaOf(k, smoothD) };
}

/** True Range: max(H − L, |H − C trước|, |L − C trước|); nến đầu = H − L. */
export function trueRange(bars: OhlcvBar[]): number[] {
  return bars.map((b, i) => (i === 0 ? b.high - b.low : Math.max(b.high - b.low, Math.abs(b.high - bars[i - 1].close), Math.abs(b.low - bars[i - 1].close))));
}

/** ATR (TradingView, làm mượt RMA = Wilder): giá trị đầu = trung bình TR của `length` nến đầu, sau đó RMA. */
export function atr(bars: OhlcvBar[], length = 14): S {
  const tr = trueRange(bars), out: S = new Array(bars.length).fill(null);
  if (bars.length < length) return out;
  let v = tr.slice(0, length).reduce((a, x) => a + x, 0) / length;
  out[length - 1] = v;
  for (let i = length; i < bars.length; i++) { v = (v * (length - 1) + tr[i]) / length; out[i] = v; }
  return out;
}

/** OBV (TradingView): cộng KL khi đóng cửa tăng, trừ khi giảm, giữ nguyên khi bằng; nến đầu = 0. */
export function obv(bars: OhlcvBar[]): number[] {
  const out: number[] = [];
  let v = 0;
  for (let i = 0; i < bars.length; i++) {
    if (i > 0) { const c = bars[i].close, p = bars[i - 1].close; v += c > p ? bars[i].volume : c < p ? -bars[i].volume : 0; }
    out.push(v);
  }
  return out;
}

/** MFI 14 (TradingView): giá điển hình hlc3; dòng tiền = hlc3 · KL; dương khi hlc3 tăng, âm khi giảm.
 *  MFI = 100 − 100 / (1 + dương / âm); không có dòng tiền âm -> 100; không có cả hai -> 50. */
export function mfi(bars: OhlcvBar[], length = 14): S {
  const out: S = new Array(bars.length).fill(null);
  const tp = bars.map((b) => (b.high + b.low + b.close) / 3);
  for (let i = length; i < bars.length; i++) {
    let pos = 0, neg = 0;
    for (let j = i - length + 1; j <= i; j++) {
      const flow = tp[j] * bars[j].volume;
      if (tp[j] > tp[j - 1]) pos += flow; else if (tp[j] < tp[j - 1]) neg += flow;
    }
    out[i] = neg === 0 ? (pos === 0 ? 50 : 100) : 100 - 100 / (1 + pos / neg);
  }
  return out;
}

export interface PsarResult { sar: S; up: boolean[] }
/** Parabolic SAR (Wilder; TradingView start 0,02 · bước 0,02 · tối đa 0,2). Không vượt vào vùng giá của 2 nến trước. */
export function parabolicSar(bars: OhlcvBar[], { start = 0.02, increment = 0.02, maximum = 0.2 } = {}): PsarResult {
  const n = bars.length, sar: S = new Array(n).fill(null), up: boolean[] = new Array(n).fill(true);
  if (n < 2) return { sar, up };
  let long = bars[1].close >= bars[0].close;
  let af = start, ep = long ? Math.max(bars[0].high, bars[1].high) : Math.min(bars[0].low, bars[1].low);
  let s = long ? Math.min(bars[0].low, bars[1].low) : Math.max(bars[0].high, bars[1].high);
  sar[1] = s; up[1] = long;
  for (let i = 2; i < n; i++) {
    const b = bars[i];
    let next = s + af * (ep - s);
    if (long) {
      next = Math.min(next, bars[i - 1].low, bars[i - 2].low);
      if (b.low < next) { long = false; next = ep; ep = b.low; af = start; }
      else if (b.high > ep) { ep = b.high; af = Math.min(maximum, af + increment); }
    } else {
      next = Math.max(next, bars[i - 1].high, bars[i - 2].high);
      if (b.high > next) { long = true; next = ep; ep = b.high; af = start; }
      else if (b.low < ep) { ep = b.low; af = Math.min(maximum, af + increment); }
    }
    s = next; sar[i] = s; up[i] = long;
  }
  return { sar, up };
}
