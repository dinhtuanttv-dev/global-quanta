// Mức giá then chốt và máy tính khối lượng cho Action Center (hàm thuần).

export interface Bar { date: string; high: number; low: number; close: number; partial?: boolean }

export interface KeyLevels {
  price: number; ma20: number | null; ma50: number | null; atr14: number | null; atrPct: number | null;
  high20: number | null; low20: number | null;
  /** Dừng lỗ gợi ý = giá − 2×ATR14 (không thấp hơn đáy 20 phiên − 1×ATR). */
  stop: number | null;
  closes: number[];
}

const sma = (xs: number[], n: number) => (xs.length >= n ? xs.slice(-n).reduce((a, b) => a + b, 0) / n : null);

export function keyLevels(barsIn: Bar[], livePrice?: number | null): KeyLevels | null {
  const bars = barsIn.filter((b) => b.close > 0);
  if (bars.length < 15) return null;
  const closes = bars.map((b) => b.close);
  const price = livePrice && livePrice > 0 ? livePrice : closes[closes.length - 1];
  const tr: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const b = bars[i], prev = bars[i - 1].close;
    tr.push(Math.max(b.high - b.low, Math.abs(b.high - prev), Math.abs(b.low - prev)));
  }
  const atr14 = tr.length >= 14 ? tr.slice(-14).reduce((a, b) => a + b, 0) / 14 : null;
  const last20 = bars.slice(-20);
  const high20 = Math.max(...last20.map((b) => b.high));
  const low20 = Math.min(...last20.map((b) => b.low));
  const stop = atr14 ? Math.max(price - 2 * atr14, low20 - atr14) : null;
  return {
    price, ma20: sma(closes, 20), ma50: sma(closes, 50), atr14, atrPct: atr14 ? (atr14 / price) * 100 : null,
    high20, low20, stop: stop && stop < price ? stop : null, closes: closes.slice(-60),
  };
}

/** Bước giá HOSE theo vùng giá (đồng). */
export function tickSize(price: number): number {
  return price < 10_000 ? 10 : price < 50_000 ? 50 : 100;
}

export interface PositionSize { shares: number; value: number; riskVnd: number; pctOfCapital: number; riskPerShare: number }

/**
 * Số cổ phiếu sao cho nếu chạm dừng lỗ thì lỗ đúng `riskPct`% vốn; làm tròn xuống lô 100,
 * không vượt quá vốn.
 */
export function positionSize(capital: number, riskPct: number, entry: number, stop: number): PositionSize | null {
  if (!(capital > 0) || !(riskPct > 0) || !(entry > 0) || !(stop > 0) || stop >= entry) return null;
  const riskVnd = capital * riskPct / 100;
  const riskPerShare = entry - stop;
  const byRisk = Math.floor(riskVnd / riskPerShare / 100) * 100;
  const byCapital = Math.floor(capital / entry / 100) * 100;
  const shares = Math.max(0, Math.min(byRisk, byCapital));
  return { shares, value: shares * entry, riskVnd: shares * riskPerShare, pctOfCapital: (shares * entry / capital) * 100, riskPerShare };
}
