import { useMemo } from "react";
import type { CatalystSector } from "../types/catalyst";

export interface HeatmapCell {
  sector: string;
  group: "Truc tiep" | "Lan toa";
  avgImpact: number; // trung binh netSignedImpact - co the am/duong
  cardCount: number;
}

// Tinh ma tran that tu du lieu da co san (primaryCards/cascadeCards) -
// khong bia them so lieu, khong can sua backend.
export function useCatalystHeatmap(sectors: CatalystSector[]): HeatmapCell[] {
  return useMemo(() => {
    const cells: HeatmapCell[] = [];
    sectors.forEach((s) => {
      const groups: { key: "Truc tiep" | "Lan toa"; cards: typeof s.primaryCards }[] = [
        { key: "Truc tiep", cards: s.primaryCards },
        { key: "Lan toa", cards: s.cascadeCards },
      ];
      groups.forEach(({ key, cards }) => {
        if (cards.length === 0) {
          cells.push({ sector: s.sector, group: key, avgImpact: 0, cardCount: 0 });
          return;
        }
        const avg = cards.reduce((sum, c) => sum + c.netSignedImpact, 0) / cards.length;
        cells.push({ sector: s.sector, group: key, avgImpact: avg, cardCount: cards.length });
      });
    });
    return cells;
  }, [sectors]);
}
