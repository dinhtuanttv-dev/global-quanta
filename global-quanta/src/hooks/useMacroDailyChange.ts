import { useEffect, useState } from "react";

const API_BASE = "https://tuan-quant-scanner-psi.vercel.app";

export interface MacroDailyChange {
  fetchedAt: string;
  dxy: { value: number; changePct: number | null };
  vix: { value: number; changePct: number | null };
  treasury10y: { value: number; changePct: number | null };
  gold: { value: number; changePct: number | null };
  riskStatus: "RISK_ON" | "NEUTRAL" | "RISK_OFF";
  riskOnScore: number;
}

export function useMacroDailyChange(refreshMs = 60_000) {
  const [data, setData] = useState<MacroDailyChange | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`${API_BASE}/api/global/macro-daily-change`, { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch (err) {
        console.warn("[useMacroDailyChange] Failed to fetch:", err);
      }
    }
    load();
    const id = setInterval(load, refreshMs);
    return () => { cancelled = true; clearInterval(id); };
  }, [refreshMs]);

  return data;
}
