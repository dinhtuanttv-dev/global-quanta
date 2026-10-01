import { useEffect, useState } from "react";
import { isMarketGatewayEnabled, marketUrl } from "../services/marketDataClient";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "https://tuan-quant-scanner-psi.vercel.app";

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
        const url = isMarketGatewayEnabled() ? marketUrl("/api/market/breadth") : `${API_BASE}/api/market-data/breadth`;
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const json = await res.json();
        if (!cancelled) setData({ advancers: json.advancers ?? 0, decliners: json.decliners ?? 0 });
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
