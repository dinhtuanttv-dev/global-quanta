import { useEffect, useState } from "react";

const API_BASE = "https://tuan-quant-scanner-psi.vercel.app";

export interface IndexCompareItem {
  index: string;
  value: number;
  changePct: number;
}

export function useIndicesCompare(refreshMs = 60_000) {
  const [compare, setCompare] = useState<IndexCompareItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`${API_BASE}/api/market-data/indices-compare`, { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const json = await res.json();
        if (!cancelled) setCompare(json.compare ?? []);
      } catch (err) {
        console.warn("[useIndicesCompare] Failed to fetch:", err);
      }
    }
    load();
    const id = setInterval(load, refreshMs);
    return () => { cancelled = true; clearInterval(id); };
  }, [refreshMs]);

  return compare;
}
