import { useState } from "react";
import type { CatalystSector } from "../types/catalyst";

export function useCatalystSearch(sectors: CatalystSector[], emerging: CatalystSector[]) {
  const [query, setQuery] = useState("");
  const q = query.trim().toUpperCase();
  const filterFn = (s: CatalystSector) => {
    if (!q) return true;
    if (s.sector.toUpperCase().includes(q)) return true;
    return [...s.primaryCards, ...s.cascadeCards].some((c) => c.ticker.toUpperCase().includes(q));
  };
  return {
    query, setQuery,
    filteredSectors: sectors.filter(filterFn),
    filteredEmerging: emerging.filter(filterFn),
  };
}

