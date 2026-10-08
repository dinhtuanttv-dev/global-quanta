// @gq/quant-core · Anchored VWAP + dải σ có trọng số khối lượng (TA_VNINDEX_UPGRADE_SPEC §2.2.2 "Anchored").
//   VWAP_t = Σ tp·v / Σ v (từ nến neo tới t), tp = (H+L+C)/3
//   σ_t   = sqrt( Σ tp²·v / Σ v − VWAP_t² )   (phương sai có trọng số khối lượng)
// Chỉ dùng dữ liệu từ nến neo tới t -> không look-ahead.

import type { Bar } from "./math";

export interface VwapPoint { date: string; vwap: number; sigma: number }

export function anchoredVwap(bars: Bar[], anchorIndex: number): VwapPoint[] {
  const out: VwapPoint[] = [];
  if (anchorIndex < 0 || anchorIndex >= bars.length) return out;
  let pv = 0;
  let pv2 = 0;
  let v = 0;
  for (let i = anchorIndex; i < bars.length; i++) {
    const b = bars[i];
    const tp = (b.high + b.low + b.close) / 3;
    const w = Math.max(0, b.volume);
    pv += tp * w;
    pv2 += tp * tp * w;
    v += w;
    if (!(v > 0)) continue;
    const vwap = pv / v;
    out.push({ date: b.date, vwap, sigma: Math.sqrt(Math.max(0, pv2 / v - vwap * vwap)) });
  }
  return out;
}

/** Chỉ số nến neo cho một ngày/thời điểm: nến đầu tiên có date ≥ anchor (khớp cả khung D lẫn intraday). */
export function anchorIndexOf(bars: Bar[], anchorDate: string): number {
  const i = bars.findIndex((b) => b.date >= anchorDate);
  return i;
}
