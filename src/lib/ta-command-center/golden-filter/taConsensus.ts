import type { GoldenFilterStock } from "./goldenFilterEngine";
import type { ConvergenceResult } from "../detectors/convergenceEngine";

export type TAConsensusLabel = "Elite Convergence" | "Golden Intersection" | "Convergence Only" | "Pattern Only";

export interface TAConsensusResult {
  ticker: string;
  sector: string;
  inGoldenFilter: boolean;
  inConvergenceFilter: boolean;
  goldenScore: number | null;
  goldenPatternLabel: string | null;
  convergenceScore: number | null;
  wyckoffPhase: string | null;
  taConsensusScore: number;
  label: TAConsensusLabel;
}

// Giao thoa Golden Filter (Pattern Scanner) x Convergence Filter (Wyckoff+SMC+FVG+Vol).
// Cong thuc cong khai:
//   Ca 2 nguon: golden*0.5 + convergence*0.5 + 15 (bonus dong thuan)
//   Chi 1 nguon: diem nguon do * 0.7 (phat vi thieu xac nhan cheo)
export function computeTAConsensus(
  goldenFilter: GoldenFilterStock[],
  convergenceResults: ConvergenceResult[]
): { results: TAConsensusResult[]; intersectionCount: number } {
  const goldenMap = new Map(goldenFilter.map((g) => [g.ticker, g]));
  const convMap = new Map(convergenceResults.map((c) => [c.ticker, c]));
  const allTickers = new Set([...goldenMap.keys(), ...convMap.keys()]);

  const results: TAConsensusResult[] = Array.from(allTickers).map((ticker) => {
    const golden = goldenMap.get(ticker);
    const conv = convMap.get(ticker);
    const isIntersection = !!golden && !!conv;

    let taConsensusScore = 0;
    if (golden && conv) {
      taConsensusScore = Math.round(Math.min(100, golden.confidenceScore * 0.5 + conv.compositeScore * 0.5 + 15));
    } else if (golden) {
      taConsensusScore = Math.round(golden.confidenceScore * 0.7);
    } else if (conv) {
      taConsensusScore = Math.round(conv.compositeScore * 0.7);
    }

    let label: TAConsensusLabel;
    if (isIntersection) {
      label = taConsensusScore >= 80 ? "Elite Convergence" : "Golden Intersection";
    } else if (conv) {
      label = "Convergence Only";
    } else {
      label = "Pattern Only";
    }

    return {
      ticker, sector: golden?.sector ?? conv?.sector ?? "-",
      inGoldenFilter: !!golden, inConvergenceFilter: !!conv,
      goldenScore: golden?.confidenceScore ?? null,
      goldenPatternLabel: golden?.patternLabel ?? null,
      convergenceScore: conv?.compositeScore ?? null,
      wyckoffPhase: conv?.wyckoffPhase ?? null,
      taConsensusScore, label,
    };
  });

  results.sort((a, b) => b.taConsensusScore - a.taConsensusScore);
  const intersectionCount = results.filter((r) => r.inGoldenFilter && r.inConvergenceFilter).length;
  return { results, intersectionCount };
}
