// Scoring Engine - PORT TRUC TIEP tu scoring.py (Phan A.5, A.1, A.6, D.3,
// D.11 cua tai lieu ban giao v2.0). BO Beneish M-Score (compute_beneish_m
// trong ban goc TU THUA NHAN dung so ngau nhien - khong bia).

export function clamp(x: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, x));
}

export function percentileRank(value: number, universeValues: number[]): number {
  if (universeValues.length === 0) return 50.0;
  const below = universeValues.filter((v) => v <= value).length;
  return Math.round((below / universeValues.length) * 1000) / 10;
}

// A.5 - faScore
export function computeFaScore(
  roe: number, netMargin: number, revenueGrowth: number,
  universeRoe: number[], universeMargin: number[], universeGrowth: number[]
): number {
  return Math.round((
    0.40 * percentileRank(roe, universeRoe)
    + 0.30 * percentileRank(netMargin, universeMargin)
    + 0.30 * percentileRank(revenueGrowth, universeGrowth)
  ) * 10) / 10;
}

const TREND_TAG_SCORE: Record<string, number> = { "Up-Trend": 100, "Accumulation": 60, "Distribution": 30, "Down-Trend": 0 };

// A.5/A.6 - taScore (tan dung lai divergence, truoc day la truong "chet")
export function computeTaScore(
  rsRating: number, trendTag: string, liquidity: number, universeLiquidity: number[],
  divergence: "none" | "bullish" | "bearish"
): number {
  let base = (
    0.40 * clamp(((rsRating - 1) / 98) * 100)
    + 0.35 * (TREND_TAG_SCORE[trendTag] ?? 50)
    + 0.25 * percentileRank(liquidity, universeLiquidity)
  );
  if (divergence === "bearish" && trendTag === "Up-Trend") base -= 15;
  else if (divergence === "bullish" && (trendTag === "Down-Trend" || trendTag === "Accumulation")) base += 15;
  return Math.round(clamp(base) * 10) / 10;
}

function timeDecay(status: "ongoing" | "upcoming" | "resolved" | string, daysRemaining: number | null): number {
  if (status === "ongoing") return 1.0;
  if (status === "upcoming") {
    if (daysRemaining === null) return 0.5;
    return clamp(1 - daysRemaining / 30, 0, 1);
  }
  if (status === "resolved") return 0.2; // da giam manh, coi nhu du am ngan
  return 0.0;
}

export interface ActiveEvent {
  verifiedStatus: string;
  sectors: string[];
  magnitude: "high" | "medium" | "low";
  direction: "positive" | "negative";
  status: "ongoing" | "upcoming" | "resolved" | string;
  daysRemaining: number | null;
}

// A.5 - eventImpactScore (cong thuc truoc day hoan toan thieu o ban v1.0)
function normalizeSectorKey(s: string): string {
  return s.trim().toLowerCase();
}

// FIX QUAN TRONG (phat hien qua du lieu that): so sanh sector truoc day
// dung includes() CHINH XAC TUYET DOI (case-sensitive) - nguoi dung go
// "chung khoan" (thuong) trong form nhap tay trong khi he thong luu
// nganh "Chung khoan" (hoa dau) -> KHONG KHOP, eventImpactScore luon
// = 50 du da co su kien xac nhan dung nganh. Chuan hoa (lowercase+trim)
// truoc khi so sanh.
export function computeEventImpactScore(sector: string, activeEvents: ActiveEvent[]): number {
  const sectorKey = normalizeSectorKey(sector);
  const relevant = activeEvents.filter((e) => e.verifiedStatus === "user_confirmed" && e.sectors.some((s) => normalizeSectorKey(s) === sectorKey));
  if (relevant.length === 0) return 50.0;

  const magnitudeW: Record<string, number> = { high: 1.0, medium: 0.6, low: 0.3 };
  let total = 0;
  for (const e of relevant) {
    const w = magnitudeW[e.magnitude] ?? 0.6;
    const sign = e.direction === "positive" ? 1 : -1;
    const decay = timeDecay(e.status, e.daysRemaining);
    total += sign * w * decay;
  }
  return Math.round(clamp(50 + total * 25) * 10) / 10;
}

// A.1 - smartScore hop nhat (bounded multiplier, KHONG sort rieng theo boost)
export function computeSmartScore(faScore: number, taScore: number, eventImpactScore: number, boost: number): number {
  const baseScore = 0.40 * faScore + 0.35 * taScore + 0.25 * eventImpactScore;
  const multiplier = 1 + 0.12 * boost; // boost in [-1,2] -> multiplier in [0.88, 1.24]
  return Math.round(clamp(baseScore * multiplier) * 10) / 10;
}

// A.6 - Risk/Reward tu supportResistance (truoc day chi de hien thi, khong dung)
export function computeRiskReward(price: number, supportMid: number, resistanceMid: number): number | null {
  const downside = price - supportMid;
  const upside = resistanceMid - price;
  if (downside <= 0) return null;
  return Math.round((upside / downside) * 100) / 100;
}

// D.11 - Risk-adjusted momentum (Sharpe-style), thay vi % tang gia tho
export function computeRiskAdjustedMomentum(closes: number[]): number {
  const window = closes.length >= 64 ? closes.slice(-64) : closes;
  const rets: number[] = [];
  for (let i = 1; i < window.length; i++) rets.push(window[i] / window[i - 1] - 1);
  if (rets.length < 2) return 0.0;
  const meanR = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, b) => a + (b - meanR) * (b - meanR), 0) / rets.length; // pstdev (population)
  const stdR = Math.sqrt(variance) || 1e-6;
  return Math.round((meanR / stdR) * Math.sqrt(252) * 100) / 100;
}

// D.3 - Accounting Quality (TRU Beneish M-Score - xem ghi chu dau file)
export interface FinancialSnapshot {
  roe: number; cfo: number; netIncome: number; leverage: number; currentRatio: number;
  sharesOutstanding: number; grossMargin: number; assetTurnover: number;
  totalAssets: number; workingCapital: number; retainedEarnings: number;
  ebit: number; marketCap: number; totalLiabilities: number; sales: number;
}

export function computePiotroskiFScore(cur: FinancialSnapshot, prior: FinancialSnapshot): number {
  let score = 0;
  score += cur.roe > 0 ? 1 : 0;
  score += cur.cfo > 0 ? 1 : 0;
  score += cur.roe > prior.roe ? 1 : 0;
  score += cur.cfo > cur.netIncome ? 1 : 0;
  score += cur.leverage < prior.leverage ? 1 : 0;
  score += cur.currentRatio > prior.currentRatio ? 1 : 0;
  score += cur.sharesOutstanding <= prior.sharesOutstanding * 1.01 ? 1 : 0;
  score += cur.grossMargin > prior.grossMargin ? 1 : 0;
  score += cur.assetTurnover > prior.assetTurnover ? 1 : 0;
  return score;
}

export function computeAltmanZ(cur: FinancialSnapshot): number {
  const ta = cur.totalAssets || 1;
  const A = cur.workingCapital / ta;
  const B = cur.retainedEarnings / ta;
  const C = cur.ebit / ta;
  const D = cur.marketCap / (cur.totalLiabilities || 1);
  const E = cur.sales / ta;
  return Math.round((1.2 * A + 1.4 * B + 3.3 * C + 0.6 * D + 1.0 * E) * 100) / 100;
}

export function computeSloanAccrual(cur: FinancialSnapshot): number {
  return Math.round(((cur.netIncome - cur.cfo) / (cur.totalAssets || 1)) * 10000) / 10000;
}
