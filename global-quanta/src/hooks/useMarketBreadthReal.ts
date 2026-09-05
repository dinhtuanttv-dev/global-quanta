import { useEffect, useState } from "react";

const API_BASE = "https://tuan-quant-scanner-psi.vercel.app";

export interface BreadthReal {
  advancers: number;
  decliners: number;
}

export function useMarketBreadthReal(refreshMs = 120_000) {
  const [data, setData] = useState<BreadthReal>({ advancers: 0, decliners: 0 });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`${API_BASE}/api/market-data/breadth`, { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const json = await res.json();
        if (!cancelled) setData({ advancers: json.advancers, decliners: json.decliners });
      } catch (err) {
        console.warn("[useMarketBreadthReal] Failed to fetch:", err);
      }
    }
    load();
    const id = setInterval(load, refreshMs);
    return () => { cancelled = true; clearInterval(id); };
  }, [refreshMs]);

  return data;
}
