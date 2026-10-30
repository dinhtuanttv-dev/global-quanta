// @gq/quant-core · MTF v3 · S4 — vùng củng cố (nền giá) và mô hình trên nền (Minervini ch.10 + bộ ảnh; MTF-v3-prereg.md).
// Nền tại nến t = đoạn từ ĐỈNH TRÁI (đỉnh sóng đã xác nhận, cao nhất kể từ đó tới t) tới t. Đo: độ dài, độ sâu, các nhịp co (cặp đỉnh → đáy
// sóng trong nền), VCP (≥ 2 nhịp, mỗi nhịp ≤ 0,75 × nhịp trước), khối lượng cạn bên phải, pivot (đỉnh nhịp co cuối), phá vỡ với KL lớn,
// rũ bỏ (undercut), nén thời gian chữ V, số thứ tự nền trong giai đoạn 2, và mô hình hình học của nền. Mọi thứ chỉ dùng bars[0..t].
import type { Bar } from "../math";
import type { Analysis3, Frame3 } from "./frame";
import { levelsAt } from "./levels";
import type { Swing3 } from "./structure";

export const BASE = {
  minBars: 15, maxBars: 325, minDepth: 0.08, maxDepth: 0.35, maxDepthFirst: 0.5, vcpRatio: 0.75, dryUp: 0.75, breakoutVol: 1.4,
  volAvg: 50, dryWindow: 10, flatDepth: 0.15, vRecover: 0.8, vTimeFrac: 0.25, undercutBars: 3, breakoutLookback: 10,
} as const;

export type BasePattern = "VCP" | "FLAT" | "CUP_HANDLE" | "DOUBLE_BOTTOM" | "TRIANGLE" | "RECTANGLE" | "GENERIC";
export const BASE_PATTERN_LABEL: Record<BasePattern, string> = {
  VCP: "VCP · thu hẹp biến động", FLAT: "Nền phẳng", CUP_HANDLE: "Cốc tay cầm", DOUBLE_BOTTOM: "Đáy đôi (W)", TRIANGLE: "Tam giác hội tụ", RECTANGLE: "Hộp chữ nhật", GENERIC: "Nền giá",
};

export interface Contraction { hiIndex: number; hi: number; loIndex: number; lo: number; depth: number }
export interface Base3 {
  start: number; end: number; bars: number; weeks: number;
  leftHigh: number; low: number; lowIndex: number; depth: number;
  contractions: Contraction[]; vcp: boolean;
  /** "40W 31/3 4T" — dấu chân kỹ thuật kiểu Minervini (tuần · sâu nhất/nhịp cuối % · số nhịp). */
  footprint: string;
  pivot: number; pivotIndex: number;
  dryUp: number | null; dry: boolean;
  undercuts: number[];
  vShape: boolean;
  valid: boolean; reasons: string[];
  pattern: BasePattern;
  /** Số thứ tự nền kể từ khi khung vào giai đoạn 2 (1 = nền đầu tiên) — null nếu không ở S2. */
  baseCount: number | null;
  breakout: { index: number; volRatio: number } | null;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);

function volAvgAt(bars: Bar[], i: number, n: number): number {
  const from = Math.max(0, i - n + 1);
  return avg(bars.slice(from, i + 1).map((b) => b.volume));
}

/** Đỉnh trái của nền tại t: đỉnh sóng đã xác nhận gần nhất có giá ≥ mọi đỉnh nến sau nó tới t. */
function leftHighAt(bars: Bar[], minor: Swing3[], t: number): Swing3 | null {
  let best: Swing3 | null = null, maxAfter = -Infinity;
  const hs = minor.filter((s) => s.kind === "H" && s.confirmedIndex <= t);
  // duyệt lùi theo thời gian, giữ max high của đoạn phía sau; trong các đỉnh chưa bị vượt (ứng viên), đỉnh trái = ứng viên CAO NHẤT
  // (điểm bắt đầu đợt điều chỉnh) trong cửa sổ tối đa của nền
  let k = t;
  for (let h = hs.length - 1; h >= 0; h--) {
    const s = hs[h];
    if (t - s.index + 1 > BASE.maxBars) break;
    for (; k > s.index; k--) maxAfter = Math.max(maxAfter, bars[k].high);
    if (s.price >= maxAfter && (!best || s.price > best.price)) best = s;
  }
  return best;
}

function classify(bars: Bar[], b: Omit<Base3, "pattern" | "baseCount" | "breakout" | "valid" | "reasons">): BasePattern {
  if (b.vcp) return "VCP";
  const seg = bars.slice(b.start, b.end + 1), n = seg.length;
  if (b.depth <= BASE.flatDepth) {
    // hộp chữ nhật: ≥ 2 lần chạm biên trên và biên dưới (trong 1,5% biên)
    const top = b.leftHigh, bot = b.low;
    const nearTop = b.contractions.filter((c) => c.hi >= top * 0.985).length, nearBot = b.contractions.filter((c) => c.lo <= bot * 1.015).length;
    return nearTop >= 2 && nearBot >= 2 ? "RECTANGLE" : "FLAT";
  }
  // cốc tay cầm: đáy ở khoảng giữa nền, vế phải hồi về ≥ 85% đỉnh trái, nhịp cuối (tay cầm) nông ≤ 12% ở nửa trên của nền
  const pos = (b.lowIndex - b.start) / Math.max(1, n - 1);
  const last = b.contractions[b.contractions.length - 1];
  if (pos > 0.25 && pos < 0.75 && last && last.hiIndex > b.lowIndex && last.hi >= b.leftHigh * 0.85 && last.depth <= 0.12 && last.lo > (b.leftHigh + b.low) / 2) return "CUP_HANDLE";
  // đáy đôi: hai đáy nhịp co sâu nhất lệch ≤ 3%, cách nhau ≥ 10 nến
  const lows = [...b.contractions].sort((x, y) => x.lo - y.lo);
  if (lows.length >= 2 && Math.abs(lows[1].lo / lows[0].lo - 1) <= 0.03 && Math.abs(lows[1].loIndex - lows[0].loIndex) >= 10) return "DOUBLE_BOTTOM";
  // tam giác: các đỉnh nhịp co thấp dần VÀ các đáy cao dần (≥ 3 nhịp)
  const cs = b.contractions;
  if (cs.length >= 3 && cs.every((c, i) => i === 0 || (c.hi < cs[i - 1].hi && c.lo > cs[i - 1].lo))) return "TRIANGLE";
  return "GENERIC";
}

/**
 * Nền giá tại nến t của một khung. Khi giá đã vượt đỉnh trái (không còn nền đang hình thành), trả về nền vừa bị PHÁ VỠ trong ≤ 10 phiên
 * gần nhất (kèm sự kiện phá vỡ) để không mất tín hiệu; null nếu không có.
 */
export function baseAt(f: Frame3, t: number): Base3 | null {
  const bars = f.r.bars;
  if (t < BASE.minBars) return null;
  const lh = leftHighAt(bars, f.minor, t);
  if (lh) return baseCore(f, lh, t, t);
  for (let j = t - 1; j >= Math.max(BASE.minBars, t - BASE.breakoutLookback); j--) {
    const lj = leftHighAt(bars, f.minor, j);
    if (!lj) continue;
    const b = baseCore(f, lj, j, t);
    return b.breakout ? b : null;
  }
  return null;
}

/** Đo nền từ đỉnh trái `lh` tới nến `end` (mọi đo đạc tại `end`); tìm phá vỡ pivot trong (pivot, scanTo]. */
function baseCore(f: Frame3, lh: Swing3, end: number, scanTo: number): Base3 {
  const bars = f.r.bars, t = end;
  const start = lh.index, nb = end - start + 1;
  let low = Infinity, lowIndex = start;
  for (let i = start; i <= end; i++) if (bars[i].low < low) { low = bars[i].low; lowIndex = i; }
  const depth = (lh.price - low) / lh.price;
  // nhịp co: cặp H -> L liên tiếp của sóng nhỏ trong nền (đỉnh trái là H đầu tiên), chỉ sóng đã xác nhận tại t
  const sw = f.minor.filter((s) => s.index >= start && s.confirmedIndex <= t);
  const contractions: Contraction[] = [];
  for (let k = 0; k < sw.length - 1; k++) {
    if (sw[k].kind === "H" && sw[k + 1].kind === "L") contractions.push({ hiIndex: sw[k].index, hi: sw[k].price, loIndex: sw[k + 1].index, lo: sw[k + 1].price, depth: (sw[k].price - sw[k + 1].price) / sw[k].price });
  }
  const vcp = contractions.length >= 2 && contractions.every((c, i) => i === 0 || c.depth <= BASE.vcpRatio * contractions[i - 1].depth);
  const lastC = contractions[contractions.length - 1];
  const pivotIdx = lastC ? lastC.hiIndex : start, pivot = lastC ? lastC.hi : lh.price;
  const v50 = volAvgAt(bars, end, BASE.volAvg), v10 = volAvgAt(bars, end, BASE.dryWindow);
  const dryUp = v50 > 0 ? v10 / v50 : null;
  // rũ bỏ: phiên đóng cửa / đáy thủng một đáy sóng trước đó trong nền rồi đóng cửa lại trên nó trong ≤ 3 phiên
  const undercuts: number[] = [];
  const lowsIn = sw.filter((s) => s.kind === "L");
  for (const L of lowsIn) {
    for (let i = L.confirmedIndex + 1; i <= end; i++) {
      if (bars[i].low < L.price) {
        for (let j = i; j <= Math.min(end, i + BASE.undercutBars); j++) if (bars[j].close > L.price) { undercuts.push(i); break; }
        break;
      }
    }
  }
  // nén thời gian chữ V: vế phải hồi > 80% độ sâu trong < 1/4 thời gian nền
  const recovered = (bars[end].close - low) / Math.max(1e-9, lh.price - low);
  const vShape = recovered > BASE.vRecover && (end - lowIndex) < BASE.vTimeFrac * nb;
  const weeks = Math.round(nb / 5);
  const lastDepth = lastC ? lastC.depth : depth;
  const footprint = `${weeks}W ${Math.round(depth * 100)}/${Math.round(lastDepth * 100)} ${contractions.length}T`;
  const core = { start, end, bars: nb, weeks, leftHigh: lh.price, low, lowIndex, depth, contractions, vcp, footprint, pivot, pivotIndex: pivotIdx, dryUp: dryUp == null ? null : Math.round(dryUp * 100) / 100, dry: dryUp != null && dryUp <= BASE.dryUp, undercuts, vShape };
  // số thứ tự nền trong giai đoạn 2: số lần phá vỡ nền kể từ đầu chuỗi S2 hiện tại + 1
  let baseCount: number | null = null;
  if (f.stage.stage[t] === "S2") {
    let s2 = t;
    while (s2 > 0 && f.stage.stage[s2 - 1] === "S2") s2--;
    let n = 0;
    for (const h of f.minor) if (h.kind === "H" && h.confirmedIndex <= t && h.index >= s2 && h.index < start) n++;
    baseCount = Math.min(n, 9) + 1;
  }
  const maxDepth = baseCount === 1 ? BASE.maxDepthFirst : BASE.maxDepth;
  const reasons: string[] = [];
  if (nb < BASE.minBars) reasons.push(`nền mới ${nb} phiên (< ${BASE.minBars})`);
  if (nb > BASE.maxBars) reasons.push("nền quá dài");
  if (depth < BASE.minDepth) reasons.push(`nông ${Math.round(depth * 100)}% (< 8%)`);
  if (depth > maxDepth) reasons.push(`sâu ${Math.round(depth * 100)}% (> ${Math.round(maxDepth * 100)}%)`);
  if (vShape) reasons.push("nén thời gian chữ V");
  // phá vỡ: đóng cửa vượt pivot với KL ≥ 1,4 × TB50 (KL trung bình tính tới phiên trước)
  let breakout: Base3["breakout"] = null;
  for (let i = Math.max(pivotIdx + 1, scanTo - BASE.breakoutLookback); i <= scanTo; i++) {
    const va = volAvgAt(bars, i - 1, BASE.volAvg);
    if (bars[i].close > pivot && bars[i - 1].close <= pivot && va > 0 && bars[i].volume >= BASE.breakoutVol * va) { breakout = { index: i, volRatio: Math.round((bars[i].volume / va) * 100) / 100 }; break; }
  }
  return { ...core, valid: reasons.length === 0, reasons, pattern: classify(bars, core), baseCount, breakout };
}

const px = (x: number) => Math.round(x * 100) / 100;

/** Bản gọn nền giá cho Gateway / giao diện (ngày ghim vào nến có thật). */
export function compactBase(f: Frame3, b: Base3 | null) {
  if (!b) return null;
  const d = (i: number) => f.r.bars[i].date;
  return {
    from: d(b.start), to: d(b.end), bars: b.bars, weeks: b.weeks, leftHigh: px(b.leftHigh), low: px(b.low), lowDate: d(b.lowIndex),
    depthPct: Math.round(b.depth * 1000) / 10, contractions: b.contractions.map((c) => ({ hiDate: d(c.hiIndex), hi: px(c.hi), loDate: d(c.loIndex), lo: px(c.lo), depthPct: Math.round(c.depth * 1000) / 10 })),
    vcp: b.vcp, footprint: b.footprint, pivot: px(b.pivot), pivotDate: d(b.pivotIndex), dryUp: b.dryUp, dry: b.dry,
    undercuts: b.undercuts.map(d), vShape: b.vShape, valid: b.valid, reasons: b.reasons, pattern: b.pattern, patternLabel: BASE_PATTERN_LABEL[b.pattern],
    baseCount: b.baseCount, breakout: b.breakout ? { date: d(b.breakout.index), volRatio: b.breakout.volRatio } : null,
  };
}

/** Nền giá Ngày + Tuần (kỳ đã đóng) và các mức hỗ trợ / kháng cự ba khung tại nến ngày cuối. */
export function compactBases3(a: Analysis3) {
  const t = a.D.r.bars.length - 1, wi = a.ribbon.wIdx[t] ?? -1;
  return {
    D: t >= 0 ? compactBase(a.D, baseAt(a.D, t)) : null,
    W: wi >= 0 ? compactBase(a.W, baseAt(a.W, wi)) : null,
    levels: t >= 0 ? levelsAt(a, t) : [],
  };
}
