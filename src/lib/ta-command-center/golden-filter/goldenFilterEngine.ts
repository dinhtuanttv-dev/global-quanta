import type { PatternMatch } from "../types";

export interface GoldenFilterStock {
  ticker: string; sector: string; pattern: string;
  patternLabel: string; tag: string;
  confidenceScore: number; status: "forming" | "confirmed";
}

export function selectGoldenFilter(matches: PatternMatch[], topN: number = 20): GoldenFilterStock[] {
  const bestPerTicker = new Map<string, PatternMatch>();

  matches.forEach((m) => {
    const existing = bestPerTicker.get(m.ticker);
    if (!existing || m.confidenceScore > existing.confidenceScore) {
      bestPerTicker.set(m.ticker, m);
    }
  });

  return Array.from(bestPerTicker.values())
    .sort((a, b) => b.confidenceScore - a.confidenceScore)
    .slice(0, topN)
    .map((m) => ({
      ticker: m.ticker, sector: m.sector, pattern: m.pattern,
      patternLabel: m.patternLabel, tag: m.tag,
      confidenceScore: m.confidenceScore, status: m.status,
    }));
}
