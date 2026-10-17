// Elite 10 E0 (2026-10-17) — chỉ báo kỹ thuật tính trên trình duyệt từ chuỗi giá điều chỉnh của Gateway (/api/market/ta-series).
// Thay cho route mô phỏng ta-vn-index/analyze của Project A (giá vnstock + phần phân tích là hằng số giống nhau cho mọi mã).
// Công thức chuẩn: SMA/EMA (EMA khởi tạo bằng SMA n nến đầu), RSI và DMI/ADX theo Wilder (14), Bollinger 20 / 2σ (độ lệch
// chuẩn tổng thể), MACD 12/26/9. Giá trị null cho tới khi đủ nến — không bao giờ điền số giả.
import type { ComputedIndicatorBar, OhlcBar } from "../../types/taVnIndex";

type Num = number | null;

export function smaSeries(values: number[], n: number): Num[] {
  const out: Num[] = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= n) sum -= values[i - n];
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
}

/** EMA khởi tạo bằng SMA của n giá trị hợp lệ đầu tiên; bỏ qua null ở đầu chuỗi. */
export function emaSeriesNullable(values: Num[], n: number): Num[] {
  const out: Num[] = new Array(values.length).fill(null);
  const k = 2 / (n + 1);
  let seed: number[] = [];
  let prev: number | null = null;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null || !Number.isFinite(v)) { if (prev != null) out[i] = null; continue; }
    if (prev == null) {
      seed.push(v);
      if (seed.length === n) { prev = seed.reduce((a, b) => a + b, 0) / n; out[i] = prev; seed = []; }
      continue;
    }
    prev = v * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function rsiWilder(closes: number[], n = 14): Num[] {
  const out: Num[] = new Array(closes.length).fill(null);
  if (closes.length <= n) return out;
  let gain = 0, loss = 0;
  for (let i = 1; i <= n; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  let ag = gain / n, al = loss / n;
  const rsi = (g: number, l: number) => (l === 0 ? (g === 0 ? 50 : 100) : 100 - 100 / (1 + g / l));
  out[n] = rsi(ag, al);
  for (let i = n + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    ag = (ag * (n - 1) + Math.max(d, 0)) / n;
    al = (al * (n - 1) + Math.max(-d, 0)) / n;
    out[i] = rsi(ag, al);
  }
  return out;
}

export function bollinger(closes: number[], n = 20, k = 2): { upper: Num[]; mid: Num[]; lower: Num[] } {
  const mid = smaSeries(closes, n);
  const upper: Num[] = new Array(closes.length).fill(null);
  const lower: Num[] = new Array(closes.length).fill(null);
  for (let i = n - 1; i < closes.length; i++) {
    const m = mid[i]!;
    let s = 0;
    for (let j = i - n + 1; j <= i; j++) s += (closes[j] - m) ** 2;
    const sd = Math.sqrt(s / n);
    upper[i] = m + k * sd;
    lower[i] = m - k * sd;
  }
  return { upper, mid, lower };
}

/** DMI/ADX Wilder: +DI, −DI từ TR/+DM/−DM làm mượt Wilder n; ADX = Wilder n của DX. */
export function dmiWilder(bars: OhlcBar[], n = 14): { adx: Num[]; plusDi: Num[]; minusDi: Num[] } {
  const len = bars.length;
  const adx: Num[] = new Array(len).fill(null), plusDi: Num[] = new Array(len).fill(null), minusDi: Num[] = new Array(len).fill(null);
  if (len <= n * 2) return { adx, plusDi, minusDi };
  let tr = 0, pdm = 0, mdm = 0;
  const dx: number[] = [];
  for (let i = 1; i < len; i++) {
    const h = bars[i].high, l = bars[i].low, pc = bars[i - 1].close;
    const t = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
    const up = h - bars[i - 1].high, down = bars[i - 1].low - l;
    const p = up > down && up > 0 ? up : 0;
    const m = down > up && down > 0 ? down : 0;
    if (i <= n) { tr += t; pdm += p; mdm += m; if (i < n) continue; }
    else { tr = tr - tr / n + t; pdm = pdm - pdm / n + p; mdm = mdm - mdm / n + m; }
    const pdi = tr === 0 ? 0 : (100 * pdm) / tr;
    const mdi = tr === 0 ? 0 : (100 * mdm) / tr;
    plusDi[i] = pdi; minusDi[i] = mdi;
    const sum = pdi + mdi;
    dx.push(sum === 0 ? 0 : (100 * Math.abs(pdi - mdi)) / sum);
    if (dx.length === n) adx[i] = dx.reduce((a, b) => a + b, 0) / n;
    else if (dx.length > n) adx[i] = ((adx[i - 1] as number) * (n - 1) + dx[dx.length - 1]) / n;
  }
  return { adx, plusDi, minusDi };
}

export function computeIndicatorBars(bars: OhlcBar[]): ComputedIndicatorBar[] {
  const c = bars.map((b) => b.close);
  const sma20 = smaSeries(c, 20), sma200 = smaSeries(c, 200);
  const ema12 = emaSeriesNullable(c, 12), ema26 = emaSeriesNullable(c, 26);
  const ema21 = emaSeriesNullable(c, 21), ema50 = emaSeriesNullable(c, 50), ema100 = emaSeriesNullable(c, 100);
  const rsi = rsiWilder(c, 14);
  const bb = bollinger(c, 20, 2);
  const dmi = dmiWilder(bars, 14);
  const macdLine: Num[] = c.map((_, i) => (ema12[i] != null && ema26[i] != null ? (ema12[i] as number) - (ema26[i] as number) : null));
  const macdSignal = emaSeriesNullable(macdLine, 9);
  const r = (v: Num, d = 4) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);
  return bars.map((b, i) => ({
    time: b.time,
    sma20: r(sma20[i]), ema12: r(ema12[i]), ema26: r(ema26[i]), sma200: r(sma200[i]), ema100: r(ema100[i]), ema50: r(ema50[i]), ema21: r(ema21[i]),
    rsi14: r(rsi[i], 2), bbUpper: r(bb.upper[i]), bbMid: r(bb.mid[i]), bbLower: r(bb.lower[i]),
    adx: r(dmi.adx[i], 2), plusDi: r(dmi.plusDi[i], 2), minusDi: r(dmi.minusDi[i], 2),
    macdLine: r(macdLine[i]), macdSignal: r(macdSignal[i]),
    macdHistogram: macdLine[i] != null && macdSignal[i] != null ? r((macdLine[i] as number) - (macdSignal[i] as number)) : null,
  }));
}
