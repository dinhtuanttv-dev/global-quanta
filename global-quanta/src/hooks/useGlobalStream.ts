import { useEffect, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

export interface MacroTrendRow {
  id: string;
  dxy: number;
  vix: number;
  treasury_10y: number;
  gold: number | null;
  oil_brent: number | null;
  oil_wti: number | null;
  baltic_dry_index: number | null;
  risk_on_score: number;
  risk_status: "RISK_ON" | "NEUTRAL" | "RISK_OFF";
  breakdown: { dxyScore: number; vixScore: number; treasuryScore: number };
  fetched_at: string;
}

export interface MarketPulseRow {
  id: string;
  symbol: string;
  name: string;
  market: string;
  value: number;
  change_percent: number;
  fetched_at: string;
}

interface StreamPayload {
  macro: MacroTrendRow | null;
  markets: MarketPulseRow[] | null;
  timestamp: string;
}

export function useGlobalStream() {
  const [data, setData] = useState<StreamPayload | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    // FIX (tich hop Project B, 2026-08-26): ban goc trong zip dung path
    // tuong doi "/api/global/stream" - chi dung khi FE/API cung origin
    // (Next.js full-stack goc). Project B (Vite) va Project A (Next.js) la
    // 2 origin khac nhau -> BAT BUOC dung API_BASE, giong moi hook khac
    // trong du an (useGoldenFilter, useEarningsData...). EventSource ho tro
    // URL tuyet doi khac origin binh thuong; CORS wildcard "*" da co san o
    // Project A (next.config.ts) nen khong can cau hinh them.
    const es = new EventSource(`${API_BASE}/api/global/stream`);
    es.onopen = () => setConnected(true);
    es.onmessage = (e) => {
      try {
        setData(JSON.parse(e.data));
      } catch {
        // Frame loi (hiem, VD JSON bi cat giua chung) - bo qua, cho frame
        // tiep theo sau 5s thay vi crash toan bo stream.
      }
    };
    es.onerror = () => setConnected(false);
    return () => es.close();
  }, []);

  return { data, connected };
}
