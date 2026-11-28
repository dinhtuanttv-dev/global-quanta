// TA-T3 (28/11/2026) — nến Heikin Ashi CHỈ ĐỂ VẼ (kiểu biểu đồ như TradingView). Mọi chỉ báo, phân tích, chú giải OHLC vẫn dùng giá THẬT.
//   HA close = (O + H + L + C) / 4 · HA open = (HA open trước + HA close trước) / 2 (nến đầu: (O + C) / 2)
//   HA high = max(H, HA open, HA close) · HA low = min(L, HA open, HA close)
export interface HaBar { open: number; high: number; low: number; close: number }

export function heikinAshi(bars: readonly { open: number; high: number; low: number; close: number }[]): HaBar[] {
  const out: HaBar[] = [];
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const close = (b.open + b.high + b.low + b.close) / 4;
    const open = i === 0 ? (b.open + b.close) / 2 : (out[i - 1].open + out[i - 1].close) / 2;
    out.push({ open, close, high: Math.max(b.high, open, close), low: Math.min(b.low, open, close) });
  }
  return out;
}
