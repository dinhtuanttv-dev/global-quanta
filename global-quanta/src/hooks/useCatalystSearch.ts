import { useState } from "react";
import type { CatalystSector, EmergingSourceSummary } from "../types/catalyst";

export function useCatalystSearch(sectors: CatalystSector[], emerging: EmergingSourceSummary[]) {
  const [query, setQuery] = useState("");
  const q = query.trim().toUpperCase();

  const filteredSectors = sectors.filter((s) => {
    if (!q) return true;
    if (s.sector.toUpperCase().includes(q)) return true;
    return [...s.primaryCards, ...s.cascadeCards].some((c) => c.ticker.toUpperCase().includes(q));
  });

  const filteredEmerging = emerging.filter((e) => {
    if (!q) return true;
    return e.title.toUpperCase().includes(q) || e.category.toUpperCase().includes(q);
  });

  return { query, setQuery, filteredSectors, filteredEmerging };
}
