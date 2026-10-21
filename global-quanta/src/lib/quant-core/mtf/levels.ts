// @gq/quant-core · MTF — vùng hỗ trợ/kháng cự (KDE + mean-shift) và nền giá. Tính TẠI nến t, chỉ dùng dữ liệu ≤ t.
// Ba tầng hỗ trợ theo bộ ảnh: Dow (đỉnh/đáy sóng), Đường (viền cổ / đường xu hướng), MA; bổ sung tập trung khối lượng.
import type { Bar } from "../math";
import type { Indicators } from "./core";
import { neckAt } from "./patterns";
import type { Base, Pattern, Swing, TfParams, Zone } from "./types";

interface Cand { price: number; w: number; src: Zone["sources"][number]; kind?: "H" | "L" }

const LEVEL_W: Record<Swing["level"], number> = { small: 1, mid: 2, large: 3 };

/** Điểm tập trung khối lượng (POC) trong cửa sổ: chia giá thành bin ~0,25·ATR, cộng KL theo giá đóng cửa điển hình. */
function volumePoc(bars: Bar[], from: number, t: number, step: number): number | null {
  if (!(step > 0) || t < from) return null;
  const m = new Map<number, number>();
  for (let j = from; j <= t; j++) {
    const b = bars[j];
    const k = Math.round((b.high + b.low + b.close) / 3 / step);
    m.set(k, (m.get(k) ?? 0) + b.volume);
  }
  let best: number | null = null, bv = -1;
  for (const [k, v] of m) if (v > bv) { bv = v; best = k; }
  return best == null ? null : best * step;
}

export function zonesAt(
  bars: Bar[], ind: Indicators, swings: { small: Swing[]; mid: Swing[]; large: Swing[] },
  patterns: Pattern[], t: number, p: TfParams, maxZones = 8,
): Zone[] {
  if (t < 1) return [];
  const atr = Math.max(ind.atr[t], 1e-9);
  const from = Math.max(0, t - p.levelLookback);
  const close = bars[t].close;
  const cands: Cand[] = [];
  const recency = (idx: number) => Math.exp(-((t - idx) / Math.max(1, p.levelLookback)) * 2);
  const vol = (idx: number) => {
    const va = ind.volAvg[idx];
    return Number.isFinite(va) && va > 0 ? Math.min(2, Math.max(0.5, bars[idx].volume / va)) : 1;
  };
  for (const lv of ["small", "mid", "large"] as const) {
    for (const s of swings[lv]) {
      if (s.confirmedIndex > t || s.index < from) continue;
      cands.push({ price: s.price, w: LEVEL_W[lv] * recency(s.index) * vol(s.index), src: "Dow", kind: s.kind });
    }
  }
  for (const pt of patterns) {
    if (pt.confirmedIndex > t || pt.start < from) continue;
    cands.push({ price: neckAt(pt.neck, t), w: 2.5 * recency(pt.confirmedIndex), src: "Đường" });
  }
  if (Number.isFinite(ind.maFast[t])) cands.push({ price: ind.maFast[t], w: 1.5, src: "MA" });
  if (Number.isFinite(ind.maSlow[t])) cands.push({ price: ind.maSlow[t], w: 2.5, src: "MA" });
  const poc = volumePoc(bars, from, t, 0.25 * atr);
  if (poc != null) cands.push({ price: poc, w: 2, src: "Khối lượng" });
  if (cands.length === 0) return [];

  // KDE Gauss, băng thông h = 0,5·ATR; cực đại cục bộ của mật độ = tâm vùng (tương đương điểm hội tụ mean-shift).
  const h = 0.5 * atr;
  const lo = Math.min(...cands.map((c) => c.price)) - 2 * h;
  const hi = Math.max(...cands.map((c) => c.price)) + 2 * h;
  const step = h / 4;
  const steps = Math.min(4000, Math.ceil((hi - lo) / step) + 1);
  const dens = new Float64Array(steps);
  for (let g = 0; g < steps; g++) {
    const x = lo + g * step;
    let s = 0;
    for (const c of cands) { const z = (x - c.price) / h; if (z > -4 && z < 4) s += c.w * Math.exp(-0.5 * z * z); }
    dens[g] = s;
  }
  const peaks: { x: number; d: number }[] = [];
  for (let g = 1; g < steps - 1; g++) if (dens[g] > dens[g - 1] && dens[g] >= dens[g + 1]) peaks.push({ x: lo + g * step, d: dens[g] });
  if (!peaks.length) return [];
  const dMax = Math.max(...peaks.map((q) => q.d));
  peaks.sort((a, b) => b.d - a.d);

  const out: Zone[] = [];
  for (const pk of peaks) {
    if (out.length >= maxZones) break;
    if (pk.d < 0.15 * dMax) break;
    if (out.some((z) => Math.abs(z.mid - pk.x) < 1.2 * h)) continue;
    const zlo = pk.x - 0.6 * h, zhi = pk.x + 0.6 * h;
    const near = cands.filter((c) => Math.abs(c.price - pk.x) <= 1.5 * h);
    const sources = [...new Set(near.map((c) => c.src))];
    let touches = 0;
    for (let j = from; j <= t; j++) if (bars[j].low <= zhi && bars[j].high >= zlo && (j === from || !(bars[j - 1].low <= zhi && bars[j - 1].high >= zlo))) touches++;
    const role: Zone["role"] = pk.x <= close ? "support" : "resistance";
    const hs = near.filter((c) => c.kind === "H").length, ls = near.filter((c) => c.kind === "L").length;
    const flipped = role === "support" ? hs > ls : ls > hs;
    out.push({ lo: zlo, hi: zhi, mid: pk.x, strength: Math.min(1, pk.d / dMax), sources, touches, role, flipped });
  }
  return out.sort((a, b) => a.mid - b.mid);
}

/** Phân vị độ rộng Bollinger(20, 2σ) hiện tại trong 250 nến trước đó (0 = co hẹp nhất). */
export function bbwPercentile(bars: Bar[], t: number, look = 250): number | null {
  const bbw = (i: number) => {
    if (i < 19) return NaN;
    let s = 0, s2 = 0;
    for (let j = i - 19; j <= i; j++) { s += bars[j].close; s2 += bars[j].close * bars[j].close; }
    const m = s / 20; const v = Math.max(0, s2 / 20 - m * m);
    return m > 0 ? (4 * Math.sqrt(v)) / m : NaN;
  };
  const cur = bbw(t);
  if (!Number.isFinite(cur) || t < 60) return null;
  let below = 0, cnt = 0;
  for (let i = Math.max(19, t - look); i < t; i++) { const v = bbw(i); if (Number.isFinite(v)) { cnt++; if (v < cur) below++; } }
  return cnt ? Math.round((below / cnt) * 100) : null;
}

/**
 * Nền giá tại nến t: cửa sổ DÀI NHẤT (15–120 nến) kết thúc tại t có biên độ ≤ maxRangeAtr·ATR.
 * Số lần co hẹp (VCP) = số nhịp điều chỉnh liên tiếp có độ sâu giảm dần trong nền (sóng nhỏ).
 */
export function baseAt(bars: Bar[], ind: Indicators, small: Swing[], t: number, p: TfParams, maxRangeAtr = 6): Base | null {
  const atr = Math.max(ind.atr[t], 1e-9);
  let best: { s: number; lo: number; hi: number } | null = null;
  let lo = Infinity, hi = -Infinity;
  for (let s = t; s >= Math.max(0, t - 120); s--) {
    lo = Math.min(lo, bars[s].low); hi = Math.max(hi, bars[s].high);
    if ((hi - lo) / atr > maxRangeAtr) break;
    if (t - s + 1 >= 15) best = { s, lo, hi };
  }
  if (!best) return null;
  const sw = small.filter((x) => x.confirmedIndex <= t && x.index >= best!.s);
  const depths: number[] = [];
  for (let k = 1; k < sw.length; k++) if (sw[k - 1].kind === "H" && sw[k].kind === "L") depths.push(sw[k - 1].price - sw[k].price);
  let contractions = 0;
  for (let k = 1; k < depths.length; k++) if (depths[k] < depths[k - 1]) contractions++; else contractions = 0;
  let tlo = Infinity, thi = -Infinity;
  for (let j = Math.max(0, t - 9); j <= t; j++) { tlo = Math.min(tlo, bars[j].low); thi = Math.max(thi, bars[j].high); }
  const sp = ind.spread[t];
  return {
    start: best.s, end: t, lo: best.lo, hi: best.hi, bars: t - best.s + 1,
    rangeAtr: (best.hi - best.lo) / atr, contractions, tight: (thi - tlo) / atr <= 1.5,
    positionPct: best.hi > best.lo ? Math.round(((bars[t].close - best.lo) / (best.hi - best.lo)) * 100) : 50,
    bbwPct: bbwPercentile(bars, t), maConverged: Number.isFinite(sp) && Math.abs(sp) <= p.warAtr,
  };
}
