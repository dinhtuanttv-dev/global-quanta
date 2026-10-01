// Cac ham phan loai tag (trend_tag/quality_tag) + RS Rating - PORT TRUC
// TIEP tu logic trong main.py (_compute_all), giu nguyen dieu kien.

export type TrendTag = "Up-Trend" | "Down-Trend" | "Accumulation" | "Distribution";
export type QualityTag = "Low Debt" | "High Margin" | "Core Cash Flow";

export function computeTrendTag(price: number, ma20: number, ma50: number): TrendTag {
  if (price > ma20 && ma20 > ma50) return "Up-Trend";
  if (price < ma20 && ma20 < ma50) return "Down-Trend";
  if (ma20 > ma50) return "Accumulation";
  return "Distribution";
}

export function computeQualityTag(leverage: number, netMargin: number): QualityTag {
  if (leverage < 0.5) return "Low Debt";
  if (netMargin > 0.15) return "High Margin";
  return "Core Cash Flow";
}

/**
 * RS Rating kieu IBD (don gian hoa, giong ban goc): percentile rank cua
 * % thay doi gia ~64 phien (3 thang) SO VOI TOAN BO universe, co ve
 * thang 1-99. Can it nhat 64 phien du lieu.
 */
export function computeRsRating(currentReturn64d: number, universeReturns64d: number[]): number {
  if (universeReturns64d.length === 0) return 50.0;
  const below = universeReturns64d.filter((v) => v <= currentReturn64d).length;
  const percentile = (below / universeReturns64d.length) * 100;
  return Math.round((1 + (percentile / 100) * 98) * 10) / 10; // co ve thang 1-99
}

/** % thay doi gia qua N phien (mac dinh 64 ~ 3 thang), dung cho RS Rating. */
export function computeReturnOverPeriod(closes: number[], period = 64): number {
  if (closes.length < period + 1) return 0;
  const idx = closes.length - 1 - period;
  return closes[closes.length - 1] / closes[idx] - 1;
}
