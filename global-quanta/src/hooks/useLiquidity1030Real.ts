import { useEffect, useState } from "react";

const API_BASE = "https://tuan-quant-scanner-psi.vercel.app";

export interface Liquidity1030Data {
  today: { date: string; cumulativeVolumeAt1030: number };
  history: { date: string; cumulativeVolumeAt1030: number }[];
  stats: { mean: number; stdev: number; zScore: number; deviationPct: number; signal: "extreme" | "elevated" | "normal" };
}

export function useLiquidity1030Real(refreshMs = 300_000) {
  const [data, setData] = useState<Liquidity1030Data | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`${API_BASE}/api/market-data/liquidity-1030`, { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const json = await res.json();
        if (!cancelled) { setData(json); setLoading(false); }
      } catch (err) {
        console.warn("[useLiquidity1030Real] Failed to fetch:", err);
        if (!cancelled) setLoading(false);
      }
    }
    load();
    const id = setInterval(load, refreshMs);
    return () => { cancelled = true; clearInterval(id); };
  }, [refreshMs]);

  return { data, loading };
}
