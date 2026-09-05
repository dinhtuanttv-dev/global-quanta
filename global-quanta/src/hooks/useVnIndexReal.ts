import { useEffect, useState } from "react";

const API_BASE = "https://tuan-quant-scanner-psi.vercel.app";

export interface VnIndexRealData {
  value: number;
  changeAbs: number;
  changePct: number;
  sparkline: number[];
  volumeShares: string;
}

export function useVnIndexReal(refreshMs = 60_000) {
  const [data, setData] = useState<VnIndexRealData | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`${API_BASE}/api/ohlcv?ticker=VNINDEX&range=1mo&limit=30`, { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        const bars = json?.bars ?? [];
        if (bars.length < 2 || cancelled) return;

        const last = bars[bars.length - 1];
        const prev = bars[bars.length - 2];
        const changeAbs = last.close - prev.close;
        const changePct = prev.close !== 0 ? (changeAbs / prev.close) * 100 : 0;
        const sparkline = bars.slice(-10).map((b: any) => b.close);
        const volumeShares = last.volume
          ? `${(last.volume / 1_000_000).toFixed(0)}tr CP`
          : "--";

        setData({ value: last.close, changeAbs, changePct, sparkline, volumeShares });
      } catch (err) {
        console.warn("[useVnIndexReal] Failed to fetch:", err);
      }
    }

    load();
    const id = setInterval(load, refreshMs);
    return () => { cancelled = true; clearInterval(id); };
  }, [refreshMs]);

  return data;
}
