import { useEffect, useState } from "react";

const API_BASE = "https://tuan-quant-scanner-psi.vercel.app";

export interface MacroHistoryData {
  dxy: number[];
  vix: number[];
  treasury10y: number[];
  gold: number[];
}

export function useMacroHistory(refreshMs = 300_000) {
  const [data, setData] = useState<MacroHistoryData | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`${API_BASE}/api/global/macro-history`, { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch (err) {
        console.warn("[useMacroHistory] Failed to fetch:", err);
      }
    }
    load();
    const id = setInterval(load, refreshMs);
    return () => { cancelled = true; clearInterval(id); };
  }, [refreshMs]);

  return data;
}
