// @gq/quant-core · MTF v3 · S1 — dải EMA21 · EMA50 · EMA100 · MA200 cho từng khung (D / W / M).
// Ý tưởng nguồn (docs/mtf-v3/01_SOURCE_SYNTHESIS.md): K4 vùng giằng co giữa hai MA, K5 hội tụ → mở rộng lồng khung, K6 lệch xa MA thì
// có xu hướng lấp khoảng lệch. Đo bằng số, chuẩn hoá theo ATR của chính khung, so với lịch sử 120 nến trước (không nhìn trước).
import type { Bar } from "../math";
import { aggregate, atr as atrSeries, closedIndex, ema, sma, trailingPct, type Tf3 } from "./series";

export const RIBBON = { periods: [21, 50, 100] as const, ma: 200, atr: 14, slopeLen: 5, pctWindow: 120, squeezePct: 20, extendedPct: 90, overAtr: 3, expandBars: 3, squeezeLookback: 10, minExpandWidth: 0.5 } as const;

export type RibbonPhase = "squeeze" | "expanding" | "extended" | "normal" | "na";

export interface RibbonSeries {
  tf: Tf3;
  bars: Bar[];
  ema21: number[]; ema50: number[]; ema100: number[]; ma200: number[]; atr: number[];
  /** Hệ số thứ tự (Kendall τ) của các đường có giá trị theo thứ tự 21 > 50 > 100 > 200: +1 xếp lớp tăng hoàn hảo, −1 giảm. */
  order: number[];
  /** Số nến liên tiếp |order| = 1 cùng dấu (0 nếu chưa xếp lớp hoàn hảo). */
  orderAge: number[];
  /** Độ rộng dải EMA21/50/100 theo ATR và phân vị trong 120 nến trước. */
  width: number[]; widthPct: (number | null)[];
  /** (close − EMA50)/ATR và (EMA21 − EMA100)/ATR. */
  dev50: number[]; gap: number[];
  /** Độ dốc mỗi đường / nến theo ATR (5 nến). */
  slope: { e21: number[]; e50: number[]; e100: number[]; ma200: number[] };
  phase: RibbonPhase[];
  /** Sự kiện nén → mở rộng: +1 tăng / −1 giảm tại nến xác nhận, 0 không có. */
  expand: number[];
  /** Cờ quá đà theo chiều dải: +1 lệch trên ≥ 3 ATR khỏi EMA50, −1 dưới. */
  over: number[];
}

/** Kendall τ của dãy giá trị có thứ tự kỳ vọng giảm dần (21 > 50 > 100 > 200); null nếu < 2 giá trị. */
export function orderTau(vals: number[]): number | null {
  const v = vals.filter((x) => Number.isFinite(x));
  if (v.length < 2) return null;
  let c = 0, d = 0;
  for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) { if (v[i] > v[j]) c++; else if (v[i] < v[j]) d++; }
  return (c - d) / ((v.length * (v.length - 1)) / 2);
}

export function ribbonSeries(bars: Bar[], tf: Tf3): RibbonSeries {
  const n = bars.length, C = bars.map((b) => b.close);
  const e21 = ema(C, 21), e50 = ema(C, 50), e100 = ema(C, 100), m200 = sma(C, RIBBON.ma), a = atrSeries(bars, RIBBON.atr);
  const order = new Array<number>(n).fill(NaN), orderAge = new Array<number>(n).fill(0);
  const width = new Array<number>(n).fill(NaN), dev50 = new Array<number>(n).fill(NaN), gap = new Array<number>(n).fill(NaN);
  const L = RIBBON.slopeLen, mk = () => new Array<number>(n).fill(NaN);
  const slope = { e21: mk(), e50: mk(), e100: mk(), ma200: mk() };
  for (let i = 0; i < n; i++) {
    const at = a[i] > 0 ? a[i] : NaN;
    const tau = orderTau([e21[i], e50[i], e100[i], m200[i]]);
    // chỉ coi là có thứ tự khi ít nhất 3 đường (21/50/100) đã có giá trị
    order[i] = Number.isFinite(e100[i]) && tau != null ? tau : NaN;
    orderAge[i] = Math.abs(order[i]) === 1 ? (i > 0 && order[i - 1] === order[i] ? orderAge[i - 1] + 1 : 1) : 0;
    if (Number.isFinite(e100[i])) width[i] = (Math.max(e21[i], e50[i], e100[i]) - Math.min(e21[i], e50[i], e100[i])) / at;
    dev50[i] = (C[i] - e50[i]) / at;
    gap[i] = (e21[i] - e100[i]) / at;
    if (i >= L) {
      slope.e21[i] = (e21[i] - e21[i - L]) / (L * at);
      slope.e50[i] = (e50[i] - e50[i - L]) / (L * at);
      slope.e100[i] = (e100[i] - e100[i - L]) / (L * at);
      slope.ma200[i] = (m200[i] - m200[i - L]) / (L * at);
    }
  }
  const widthPct = width.map((_, i) => trailingPct(width, i, RIBBON.pctWindow));
  const phase = new Array<RibbonPhase>(n).fill("na"), expand = new Array<number>(n).fill(0), over = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    const p = widthPct[i];
    if (p == null) continue;
    let squeezedRecently = false;
    for (let j = Math.max(0, i - RIBBON.squeezeLookback); j < i; j++) if ((widthPct[j] ?? 101) <= RIBBON.squeezePct) { squeezedRecently = true; break; }
    let rising = i >= RIBBON.expandBars;
    for (let k = 0; k < RIBBON.expandBars && rising; k++) rising = width[i - k] > width[i - k - 1];
    const opening = squeezedRecently && rising && p > RIBBON.squeezePct;
    phase[i] = p <= RIBBON.squeezePct ? "squeeze" : opening ? "expanding" : p >= RIBBON.extendedPct ? "extended" : "normal";
    // sự kiện chỉ ở nến ĐẦU TIÊN đủ điều kiện, và dải phải mở đủ rộng (≥ 0,5 ATR) để không bắt nhiễu khi các đường gần trùng nhau
    if (opening && width[i] >= RIBBON.minExpandWidth) {
      const dir = order[i] === 1 && C[i] > e21[i] ? 1 : order[i] === -1 && C[i] < e21[i] ? -1 : 0;
      let fresh = true;
      for (let j = Math.max(0, i - RIBBON.squeezeLookback); j < i && fresh; j++) if (expand[j] === dir) fresh = false;
      if (dir !== 0 && fresh) expand[i] = dir;
    }
    over[i] = dev50[i] >= RIBBON.overAtr && order[i] > 0 ? 1 : dev50[i] <= -RIBBON.overAtr && order[i] < 0 ? -1 : 0;
  }
  return { tf, bars, ema21: e21, ema50: e50, ema100: e100, ma200: m200, atr: a, order, orderAge, width, widthPct, dev50, gap, slope, phase, expand, over };
}

const fin = (x: number) => (Number.isFinite(x) ? Math.round(x * 1000) / 1000 : null);
const px = (x: number) => (Number.isFinite(x) ? Math.round(x * 100) / 100 : null);

export interface RibbonSnapshot {
  tf: Tf3; date: string | null; bars: number;
  close: number | null; ema21: number | null; ema50: number | null; ema100: number | null; ma200: number | null;
  order: number | null; orderAge: number; width: number | null; widthPct: number | null; dev50: number | null; gap: number | null;
  slope: { e21: number | null; e50: number | null; e100: number | null; ma200: number | null };
  phase: RibbonPhase; over: number;
  /** Số nến từ sự kiện nén → mở rộng gần nhất (null nếu chưa có trong 60 nến) và chiều của nó. */
  lastExpand: { ago: number; dir: number } | null;
  /** Giá nằm trong dải EMA21–EMA50 ("vùng giằng co", K4). */
  inBand: boolean | null;
}

export function snapshotAt(s: RibbonSeries, i: number): RibbonSnapshot {
  const empty = { e21: null, e50: null, e100: null, ma200: null };
  if (i < 0 || i >= s.bars.length) {
    return { tf: s.tf, date: null, bars: 0, close: null, ema21: null, ema50: null, ema100: null, ma200: null, order: null, orderAge: 0, width: null, widthPct: null, dev50: null, gap: null, slope: empty, phase: "na", over: 0, lastExpand: null, inBand: null };
  }
  let lastExpand: RibbonSnapshot["lastExpand"] = null;
  for (let j = i; j >= Math.max(0, i - 60); j--) if (s.expand[j] !== 0) { lastExpand = { ago: i - j, dir: s.expand[j] }; break; }
  const c = s.bars[i].close, lo = Math.min(s.ema21[i], s.ema50[i]), hi = Math.max(s.ema21[i], s.ema50[i]);
  return {
    tf: s.tf, date: s.bars[i].date, bars: i + 1, close: px(c),
    ema21: px(s.ema21[i]), ema50: px(s.ema50[i]), ema100: px(s.ema100[i]), ma200: px(s.ma200[i]),
    order: fin(s.order[i]), orderAge: s.orderAge[i], width: fin(s.width[i]), widthPct: s.widthPct[i] == null ? null : Math.round(s.widthPct[i]!),
    dev50: fin(s.dev50[i]), gap: fin(s.gap[i]),
    slope: { e21: fin(s.slope.e21[i]), e50: fin(s.slope.e50[i]), e100: fin(s.slope.e100[i]), ma200: fin(s.slope.ma200[i]) },
    phase: s.phase[i], over: s.over[i], lastExpand,
    inBand: Number.isFinite(lo) && Number.isFinite(hi) ? c >= lo && c <= hi : null,
  };
}

export interface Ribbon3 {
  D: RibbonSeries; W: RibbonSeries; M: RibbonSeries;
  /** Với mỗi nến ngày: chỉ số nến tuần / tháng ĐÃ ĐÓNG. */
  wIdx: number[]; mIdx: number[];
}

/** Dải MA của cả ba khung từ một chuỗi nến ngày (tuần / tháng gộp từ ngày; khung lớn chỉ dùng kỳ đã đóng khi ghép với ngày). */
export function ribbon3(daily: Bar[]): Ribbon3 {
  const wBars = aggregate(daily, "W"), mBars = aggregate(daily, "M");
  return { D: ribbonSeries(daily, "D"), W: ribbonSeries(wBars, "W"), M: ribbonSeries(mBars, "M"), wIdx: closedIndex(daily, wBars, "W"), mIdx: closedIndex(daily, mBars, "M") };
}

export interface RibbonContext {
  D: RibbonSnapshot; W: RibbonSnapshot; M: RibbonSnapshot;
  /** Đồng thuận xếp lớp ba khung (−3…+3, cộng dấu order mỗi khung có giá trị) và mức "mở rộng lồng khung" (K5). */
  align: number;
  nested: "up" | "down" | null;
}

/** Ảnh chụp ba khung tại nến ngày t (W / M = kỳ đã đóng gần nhất). */
export function contextAt(r: Ribbon3, t: number): RibbonContext {
  const D = snapshotAt(r.D, t), W = snapshotAt(r.W, r.wIdx[t] ?? -1), M = snapshotAt(r.M, r.mIdx[t] ?? -1);
  const sg = (x: number | null) => (x == null ? 0 : x > 0 ? 1 : x < 0 ? -1 : 0);
  const align = sg(D.order) + sg(W.order) + sg(M.order);
  const dExp = D.lastExpand && D.lastExpand.ago <= 5 ? D.lastExpand.dir : 0;
  const wOpen = (dir: number) => W.order === dir && (W.phase === "expanding" || W.phase === "normal" || W.phase === "extended");
  const nested = dExp > 0 && wOpen(1) ? "up" : dExp < 0 && wOpen(-1) ? "down" : null;
  return { D, W, M, align, nested };
}

/** Bản gọn ba khung cho Gateway / giao diện: ảnh chụp hiện tại + chuỗi 4 đường của cửa sổ vẽ (mặc định 260 nến mỗi khung). */
export function compactRibbon3(r: Ribbon3, opts: { window?: number } = {}) {
  const t = r.D.bars.length - 1, win = opts.window ?? 260;
  const lines = (s: RibbonSeries) => {
    const from = Math.max(0, s.bars.length - win);
    const pick = (x: number[]) => x.slice(from).map(px);
    return { dates: s.bars.slice(from).map((b) => b.date), ema21: pick(s.ema21), ema50: pick(s.ema50), ema100: pick(s.ema100), ma200: pick(s.ma200) };
  };
  return { context: t >= 0 ? contextAt(r, t) : null, lines: { D: lines(r.D), W: lines(r.W), M: lines(r.M) } };
}
