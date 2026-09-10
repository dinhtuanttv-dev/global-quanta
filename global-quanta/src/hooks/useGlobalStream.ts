import { useEffect, useRef, useState } from "react";

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
  robusta_coffee: number | null;
  iron_ore_proxy_change_percent: number | null;
  // MOI (2026-09-10): Cao su + Phan bon - nguon World Bank Pink Sheet, tan
  // suat THANG (khong phai real-time nhu DXY/VIX). Optional/nullable de
  // khong pha vo hop dong du lieu cu khi backend chua bo sung.
  rubber_price: number | null; // USD/kg, nguon World Bank Pink Sheet
  rubber_change_percent: number | null; // % so voi ky bao cao thang truoc
  fertilizer_urea_price: number | null; // USD/tan, nguon World Bank Pink Sheet
  fertilizer_urea_change_percent: number | null;
  // MOI (2026-09-10): Cuoc container - PROXY (trung binh % thay doi ro co
  // phieu hang tau container lon: ZIM, Maersk B, COSCO Shipping Holdings),
  // KHONG PHAI gia cuoc container that (khac voi baltic_dry_index von la
  // chi so hang roi/dry bulk, khong dai dien cho container).
  container_freight_proxy_change_percent: number | null;
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

// MOI (2026-09-10): cac truong hang hoa (gold, oil_brent, oil_wti,
// baltic_dry_index, robusta_coffee) chi la GIA TRI TUYET DOI, chua co san
// %-thay doi tu backend (khac voi iron_ore_proxy_change_percent va
// container_freight_proxy_change_percent, ca 2 da la % san). Tinh %-delta
// CLIENT-SIDE bang cach so sanh voi frame SSE lien truoc - dung cho Bang
// Tong Hop Co Phieu Huong Loi (tinh nang 2). KHONG ap dung cho
// rubber_price/fertilizer_urea_price vi 2 truong nay da co san
// *_change_percent rieng tu backend (tinh theo thang, khong phai theo
// frame SSE 5s).
export interface MacroCommodityDeltas {
  goldChangePercent: number | null;
  oilBrentChangePercent: number | null;
  oilWtiChangePercent: number | null;
  balticDryChangePercent: number | null;
  robustaCoffeeChangePercent: number | null;
}

function calcPct(prev: number | null | undefined, curr: number | null | undefined): number | null {
  if (typeof prev !== "number" || typeof curr !== "number" || prev === 0) return null;
  return ((curr - prev) / prev) * 100;
}

export function useGlobalStream() {
  const [data, setData] = useState<StreamPayload | null>(null);
  const [connected, setConnected] = useState(false);
  const [commodityDeltas, setCommodityDeltas] = useState<MacroCommodityDeltas | null>(null);
  const prevMacroRef = useRef<MacroTrendRow | null>(null);

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
        const parsed: StreamPayload = JSON.parse(e.data);
        if (parsed.macro) {
          const prev = prevMacroRef.current;
          setCommodityDeltas({
            goldChangePercent: calcPct(prev?.gold, parsed.macro.gold),
            oilBrentChangePercent: calcPct(prev?.oil_brent, parsed.macro.oil_brent),
            oilWtiChangePercent: calcPct(prev?.oil_wti, parsed.macro.oil_wti),
            balticDryChangePercent: calcPct(prev?.baltic_dry_index, parsed.macro.baltic_dry_index),
            robustaCoffeeChangePercent: calcPct(prev?.robusta_coffee, parsed.macro.robusta_coffee),
          });
          prevMacroRef.current = parsed.macro;
        }
        setData(parsed);
      } catch {
        // Frame loi (hiem, VD JSON bi cat giua chung) - bo qua, cho frame
        // tiep theo sau 5s thay vi crash toan bo stream.
      }
    };
    es.onerror = () => setConnected(false);
    return () => es.close();
  }, []);

  return { data, connected, commodityDeltas };
}
