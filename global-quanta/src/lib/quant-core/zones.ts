// @gq/quant-core · Vùng giá SMC (TA_VNINDEX_UPGRADE_SPEC §2.1.2 c–f): Order Block, FVG, Liquidity Pool/Sweep, Dealing Range.
// Mỗi vùng có confirmedIndex (thời điểm đầu tiên biết được vùng) + trạng thái tiến hoá theo thời gian (status*Index).

import { isLimitLocked, logVolumes, tickSize, trailingZ, type Bar, type Dir } from "./math";
import type { Pivot, StructureEvent } from "./structure";

// ---------------- Order Block ----------------
export type ObStatus = "ACTIVE" | "MITIGATED" | "BREAKER" | "EXPIRED";
export interface OrderBlockZone {
  dir: Dir; index: number; date: string; top: number; bottom: number;
  createdByIndex: number;   // nến phá cấu trúc tạo ra OB (= confirmedIndex)
  confirmedIndex: number;
  kind: "BOS" | "CHoCH";
  status: ObStatus; statusIndex: number | null; statusDate: string | null;
  tests: number;            // số lần giá quay lại chạm vùng
  quality: number;          // 0–1: displacement · volume · độ "mới"
}
export const OB_EXPIRY_BARS = 120;

export function detectOrderBlocks(bars: Bar[], events: StructureEvent[], atr: number[]): OrderBlockZone[] {
  const seen = new Set<number>();
  const out: OrderBlockZone[] = [];
  for (const ev of events) {
    // Nến ngược màu CUỐI CÙNG trước chân displacement (tính từ điểm xuất phát của chân giá, lùi tối đa 5 nến).
    let j = -1;
    for (let k = ev.legStartIndex; k >= Math.max(0, ev.legStartIndex - 5); k--) {
      const down = bars[k].close < bars[k].open;
      if (ev.dir === "bullish" ? down : !down && bars[k].close !== bars[k].open) { j = k; break; }
    }
    if (j < 0) j = ev.legStartIndex;
    if (seen.has(j)) continue;
    seen.add(j);
    const c = bars[j];
    const a = atr[ev.index] > 0 ? atr[ev.index] : 1;
    let top = Math.max(c.open, c.close);
    let bottom = Math.min(c.open, c.close);
    if (top - bottom < 0.1 * a) { top = c.high; bottom = c.low; } // thân quá mỏng -> dùng cả râu
    const zone: OrderBlockZone = {
      dir: ev.dir, index: j, date: c.date, top, bottom, createdByIndex: ev.index, confirmedIndex: ev.index, kind: ev.kind,
      status: "ACTIVE", statusIndex: null, statusDate: null, tests: 0,
      quality: Math.round(Math.min(1, 0.4 * Math.min(1, ev.displacementATR / 2) + 0.3 * Math.min(1, Math.max(0, ev.volZ ?? 0) / 2) + 0.3) * 100) / 100,
    };
    const mid = (top + bottom) / 2;
    let inside = false;
    for (let k = ev.index + 1; k < bars.length; k++) {
      const b = bars[k];
      const touching = b.low <= top && b.high >= bottom;
      if (touching && !inside) zone.tests++;
      inside = touching;
      const brokeThrough = ev.dir === "bullish" ? b.close < bottom : b.close > top;
      if (brokeThrough) { zone.status = "BREAKER"; zone.statusIndex = k; break; }
      const meanThreshold = ev.dir === "bullish" ? b.low <= mid : b.high >= mid;
      if (meanThreshold && zone.status === "ACTIVE") { zone.status = "MITIGATED"; zone.statusIndex = k; continue; }
      if (zone.status === "ACTIVE" && k - ev.index > OB_EXPIRY_BARS) { zone.status = "EXPIRED"; zone.statusIndex = k; break; }
    }
    zone.statusDate = zone.statusIndex !== null ? bars[zone.statusIndex].date : null;
    out.push(zone);
  }
  return out.sort((a, b) => a.confirmedIndex - b.confirmedIndex);
}

// ---------------- Fair Value Gap ----------------
export type FvgState = "OPEN" | "PARTIAL" | "CE" | "FILLED" | "INVERTED";
export interface FairValueGapZone {
  dir: Dir; index: number; startDate: string; endDate: string; top: number; bottom: number; sizeATR: number;
  confirmedIndex: number;
  state: FvgState; filledPct: number; stateIndex: number | null; stateDate: string | null;
}
export interface FvgParams { minATR: number; minTicks: number; limitPct: number | null; isIndex: boolean }

export function detectFVG(bars: Bar[], atr: number[], params: Partial<FvgParams> = {}): FairValueGapZone[] {
  const p: FvgParams = { minATR: 0.25, minTicks: 2, limitPct: 0.07, isIndex: false, ...params };
  const out: FairValueGapZone[] = [];
  for (let i = 2; i < bars.length; i++) {
    const c1 = bars[i - 2];
    const c3 = bars[i];
    const a = atr[i] > 0 ? atr[i] : 0;
    const minGap = Math.max(p.minATR * a, p.minTicks * tickSize(c3.close, p.isIndex));
    let dir: Dir | null = null;
    let top = 0;
    let bottom = 0;
    if (c3.low > c1.high && c3.low - c1.high >= minGap) { dir = "bullish"; top = c3.low; bottom = c1.high; }
    else if (c3.high < c1.low && c1.low - c3.high >= minGap) { dir = "bearish"; top = c1.low; bottom = c3.high; }
    if (!dir) continue;
    if (!p.isIndex && [i - 2, i - 1, i].some((k) => isLimitLocked(bars, k, p.limitPct))) continue; // gap do khoá trần/sàn
    const zone: FairValueGapZone = {
      dir, index: i - 1, startDate: c1.date, endDate: c3.date, top, bottom, sizeATR: a > 0 ? Math.round(((top - bottom) / a) * 100) / 100 : 0,
      confirmedIndex: i, state: "OPEN", filledPct: 0, stateIndex: null, stateDate: null,
    };
    const h = top - bottom;
    for (let k = i + 1; k < bars.length; k++) {
      const b = bars[k];
      if (dir === "bullish" ? b.close < bottom : b.close > top) {
        zone.state = "INVERTED"; zone.filledPct = 1; zone.stateIndex = k; break;
      }
      const pen = dir === "bullish" ? (top - b.low) / h : (b.high - bottom) / h;
      if (pen > zone.filledPct) {
        zone.filledPct = Math.min(1, Math.max(0, pen));
        const st: FvgState = zone.filledPct >= 1 ? "FILLED" : zone.filledPct >= 0.5 ? "CE" : zone.filledPct > 0 ? "PARTIAL" : "OPEN";
        if (st !== zone.state) { zone.state = st; zone.stateIndex = k; }
        if (st === "FILLED") break;
      }
    }
    zone.filledPct = Math.round(zone.filledPct * 100) / 100;
    zone.stateDate = zone.stateIndex !== null ? bars[zone.stateIndex].date : null;
    out.push(zone);
  }
  return out;
}

// ---------------- Liquidity Pools & Sweeps ----------------
export type PoolState = "RESTING" | "SWEPT" | "RUN";
export interface LiquidityPoolZone {
  side: "BSL" | "SSL";       // BSL = trên các đỉnh bằng nhau (EQH), SSL = dưới các đáy bằng nhau (EQL)
  level: number; touches: number; pivotIndexes: number[];
  date: string; confirmedIndex: number;
  state: PoolState; stateIndex: number | null; stateDate: string | null; sweepVolZ: number | null;
}

export function detectLiquidity(bars: Bar[], pivots: Pivot[], atr: number[], { isIndex = false, minSpacing = 5, lookback = 120 } = {}): LiquidityPoolZone[] {
  const lv = logVolumes(bars);
  const pools: LiquidityPoolZone[] = [];
  const byKind = { high: [] as Pivot[], low: [] as Pivot[] };
  // Mỗi vùng BẤT BIẾN kể từ lúc xác nhận (không gộp ngược pivot mới vào vùng cũ — tránh vẽ lại quá khứ).
  for (const pv of pivots) {
    const list = byKind[pv.kind];
    const tol = Math.max(0.1 * (atr[pv.confirmedIndex] ?? 0), 2 * tickSize(pv.price, isIndex));
    const matches = list.filter((q) => pv.index - q.index >= minSpacing && pv.index - q.index <= lookback && Math.abs(q.price - pv.price) <= tol);
    list.push(pv);
    if (!matches.length) continue;
    const side = pv.kind === "high" ? "BSL" : "SSL";
    const prices = [...matches.map((q) => q.price), pv.price];
    pools.push({
      side, level: side === "BSL" ? Math.max(...prices) : Math.min(...prices), touches: prices.length,
      pivotIndexes: [...matches.map((q) => q.index), pv.index], date: pv.date, confirmedIndex: pv.confirmedIndex,
      state: "RESTING", stateIndex: null, stateDate: null, sweepVolZ: null,
    });
  }
  for (const z of pools) {
    for (let k = z.confirmedIndex + 1; k < bars.length; k++) {
      const b = bars[k];
      const pierced = z.side === "BSL" ? b.high > z.level : b.low < z.level;
      if (!pierced) continue;
      const closedBeyond = z.side === "BSL" ? b.close > z.level : b.close < z.level;
      z.state = closedBeyond ? "RUN" : "SWEPT";
      z.stateIndex = k;
      z.stateDate = b.date;
      z.sweepVolZ = trailingZ(lv, k, 20);
      break;
    }
  }
  return pools.sort((a, b) => a.confirmedIndex - b.confirmedIndex);
}

// ---------------- Dealing Range · Premium/Discount · OTE ----------------
export interface DealingRange {
  high: number; low: number; highIndex: number; lowIndex: number; highDate: string; lowDate: string; legDir: Dir;
  eq: number; eqLow: number; eqHigh: number;
  oteLow: number; oteHigh: number; ote705: number;
  zone: "premium" | "discount" | "equilibrium";
}

/** Dải giao dịch = swing high & swing low ĐÃ XÁC NHẬN gần nhất (tính tại nến cuối). */
export function computeDealingRange(bars: Bar[], pivots: Pivot[]): DealingRange | null {
  const last = bars.length - 1;
  const confirmed = pivots.filter((p) => p.confirmedIndex <= last);
  const hi = [...confirmed].reverse().find((p) => p.kind === "high");
  const lo = [...confirmed].reverse().find((p) => p.kind === "low");
  if (!hi || !lo || hi.price <= lo.price) return null;
  const r = hi.price - lo.price;
  const legDir: Dir = hi.index > lo.index ? "bullish" : "bearish";
  const eq = (hi.price + lo.price) / 2;
  const band = 0.05 * r;
  const ote = legDir === "bullish"
    ? { oteLow: hi.price - 0.786 * r, oteHigh: hi.price - 0.618 * r, ote705: hi.price - 0.705 * r }
    : { oteLow: lo.price + 0.618 * r, oteHigh: lo.price + 0.786 * r, ote705: lo.price + 0.705 * r };
  const c = bars[last].close;
  return {
    high: hi.price, low: lo.price, highIndex: hi.index, lowIndex: lo.index, highDate: hi.date, lowDate: lo.date, legDir, eq, eqLow: eq - band, eqHigh: eq + band, ...ote,
    zone: c > eq + band ? "premium" : c < eq - band ? "discount" : "equilibrium",
  };
}
