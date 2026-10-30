import { useMemo } from "react";
import type { CatalystSector, TickerImpactResult } from "../types/catalyst";

export interface TopBeneficiaryRow {
  rank: number;
  ticker: string;
  compositeScore: number;
  catalystCount: number;
  topDriver: string;
}

// Dung tickerImpacts (da tong hop san toan bo nguon anh huong len tung ma
// trong stockUniverse) de xep hang - khong tinh lai o FE, tranh lech so
// voi logic BE nhu tai lieu da canh bao.
export function useTopBeneficiaries(
  tickerImpacts: Record<string, TickerImpactResult> | undefined,
  sectors: CatalystSector[],
  limit = 10
): TopBeneficiaryRow[] {
  return useMemo(() => {
    if (!tickerImpacts) return [];

    const allCards = sectors.flatMap((s) => [...s.primaryCards, ...s.cascadeCards]);

    const rows = Object.entries(tickerImpacts)
      .filter(([, v]) => v.direction === "benefit" && v.compositeScore > 0)
      .map(([ticker, v]) => {
        const matchingCards = allCards.filter((c) => c.ticker === ticker);
        const topCard = matchingCards.sort((a, b) => b.compositeScore - a.compositeScore)[0];
        return {
          ticker,
          compositeScore: v.compositeScore,
          catalystCount: matchingCards.length,
          topDriver: topCard?.sourceTitle ?? "",
        };
      })
      .sort((a, b) => b.compositeScore - a.compositeScore)
      .slice(0, limit)
      .map((r, i) => ({ ...r, rank: i + 1 }));

    return rows;
  }, [tickerImpacts, sectors, limit]);
}
