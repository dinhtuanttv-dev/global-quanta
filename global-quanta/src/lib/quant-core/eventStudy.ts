// @gq/quant-core · Event study cho tín hiệu (bước đệm trước khung kiểm định đầy đủ P6 — §3.1).
//   - Vào lệnh = giá MỞ CỬA phiên sau tín hiệu (T+1), không phải giá đóng cửa phiên tín hiệu.
//   - Giữ `horizon` phiên (≥ 3 để tôn trọng T+2.5), thoát = giá đóng cửa phiên thứ horizon tính từ phiên vào lệnh.
//   - Long trừ phí mua 0,15% + phí bán 0,15% + thuế bán 0,1%.
//   - So với TỶ LỆ NỀN: mọi phiên có cùng cách vào/ra (không điều kiện) trong cùng giai đoạn.
// Tín hiệu bearish: thị trường cơ sở không bán khống -> đo "tránh được giảm" (lợi suất thô < 0), không trừ phí.

import type { Bar, Dir } from "./math";

export interface EventStudyResult {
  label: string; dir: Dir; horizon: number;
  n: number; hitRate: number | null; baseRate: number | null; edgePp: number | null;
  meanRetPct: number | null; baseMeanRetPct: number | null; tStat: number | null;
  lowSample: boolean;
}

export const COSTS = { buy: 0.0015, sell: 0.0015 + 0.001 };
const MIN_SAMPLE = 30;

function tradeReturn(bars: Bar[], signalIndex: number, horizon: number, dir: Dir): number | null {
  const entryIdx = signalIndex + 1;
  const exitIdx = signalIndex + horizon;
  if (exitIdx >= bars.length || entryIdx >= bars.length) return null;
  const entry = bars[entryIdx].open;
  const exit = bars[exitIdx].close;
  if (!(entry > 0) || !(exit > 0)) return null;
  if (dir === "bullish") return (exit * (1 - COSTS.sell)) / (entry * (1 + COSTS.buy)) - 1;
  return -(exit / entry - 1); // dương = tránh được mức giảm
}

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
const r1 = (x: number) => Math.round(x * 10) / 10;
const r2 = (x: number) => Math.round(x * 100) / 100;

export function eventStudy(bars: Bar[], signalIndexes: number[], dir: Dir, label: string, horizon = 10): EventStudyResult {
  const h = Math.max(3, horizon);
  const rets = signalIndexes.map((i) => tradeReturn(bars, i, h, dir)).filter((r): r is number => r !== null);
  const base: number[] = [];
  const first = signalIndexes.length ? Math.min(...signalIndexes) : 0;
  for (let i = Math.max(0, first - 250); i < bars.length; i++) {
    const r = tradeReturn(bars, i, h, dir);
    if (r !== null) base.push(r);
  }
  if (!rets.length || !base.length) {
    return { label, dir, horizon: h, n: rets.length, hitRate: null, baseRate: null, edgePp: null, meanRetPct: null, baseMeanRetPct: null, tStat: null, lowSample: true };
  }
  const hit = rets.filter((r) => r > 0).length / rets.length;
  const baseHit = base.filter((r) => r > 0).length / base.length;
  const m = mean(rets);
  const bm = mean(base);
  const sd = Math.sqrt(rets.reduce((s, r) => s + (r - m) ** 2, 0) / Math.max(1, rets.length - 1));
  return {
    label, dir, horizon: h, n: rets.length,
    hitRate: r1(hit * 100), baseRate: r1(baseHit * 100), edgePp: r1((hit - baseHit) * 100),
    meanRetPct: r2(m * 100), baseMeanRetPct: r2(bm * 100),
    tStat: sd > 0 && rets.length > 1 ? r2((m - bm) / (sd / Math.sqrt(rets.length))) : null,
    lowSample: rets.length < MIN_SAMPLE,
  };
}
