// Yếu tố M của bộ lọc kỹ thuật (CAN SLIM, Base Breakout) — tách riêng để hai chiến lược dùng chung, không vòng import.
/**
 * M: VN-Index đóng cửa trên EMA21 (30/10/2026: bộ MA thống nhất EMA21 · EMA50 · EMA100 · MA200 — thay MA20) + số ngày phân phối
 * (giảm ≥ 0,2% với KL cao hơn phiên trước) trong 25 phiên + trạng thái xếp lớp 4 đường (mô tả). EMA hạt giống SMA như biểu đồ.
 */
export function marketContextM(indexBars) {
  const bars = (indexBars ?? []).filter((b) => b.close > 0);
  const up = new Map(), dist = new Map(), stack = new Map();
  const ema = (p) => {
    const out = new Array(bars.length).fill(NaN), k = 2 / (p + 1);
    if (bars.length < p) return out;
    let e = 0;
    for (let i = 0; i < p; i++) e += bars[i].close;
    e /= p; out[p - 1] = e;
    for (let i = p; i < bars.length; i++) { e = bars[i].close * k + e * (1 - k); out[i] = e; }
    return out;
  };
  const e21 = ema(21), e50 = ema(50), e100 = ema(100);
  const flags = bars.map((b, i) => i > 0 && b.close / bars[i - 1].close - 1 <= -0.002 && (b.volume ?? 0) > (bars[i - 1].volume ?? 0));
  let d = 0, s200 = 0;
  for (let i = 0; i < bars.length; i++) {
    d += flags[i] ? 1 : 0; if (i >= 25) d -= flags[i - 25] ? 1 : 0;
    s200 += bars[i].close; if (i >= 200) s200 -= bars[i - 200].close;
    if (i >= 20) up.set(bars[i].date, bars[i].close > e21[i]);
    if (i >= 24) dist.set(bars[i].date, d);
    if (i >= 99) {
      const m200 = i >= 199 ? s200 / 200 : null, c = bars[i].close;
      const bull = e21[i] > e50[i] && e50[i] > e100[i] && (m200 == null || e100[i] > m200);
      const bear = e21[i] < e50[i] && e50[i] < e100[i] && (m200 == null || e100[i] < m200);
      stack.set(bars[i].date, { state: bull ? "up" : bear ? "down" : "mixed", aboveMa200: m200 == null ? null : c > m200,
        ema21: Math.round(e21[i] * 100) / 100, ema50: Math.round(e50[i] * 100) / 100, ema100: Math.round(e100[i] * 100) / 100, ma200: m200 == null ? null : Math.round(m200 * 100) / 100 });
    }
  }
  return {
    marketUp: (date) => (up.has(date) ? up.get(date) : null),
    distributionDays: (date) => (dist.has(date) ? dist.get(date) : null),
    ribbon: (date) => stack.get(date) ?? null,
    lastDate: bars.at(-1)?.date ?? null,
  };
}
