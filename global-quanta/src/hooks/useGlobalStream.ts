import { useEffect, useMemo, useState } from "react";
import { fetchMarketJson } from "../services/marketDataClient";

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
  // MOI (2026-09-10): staleness + xu huong - danh cho du lieu tan suat
  // THANG (khac han real-time). optional vi backend co the chua ho tro.
  rubber_price_updated_at?: string | null; // ISO date - ky bao cao gan nhat
  rubber_price_history?: number[] | null; // toi da ~6 diem gan nhat, cu (theo thoi gian)
  fertilizer_urea_price: number | null; // USD/tan, nguon World Bank Pink Sheet
  fertilizer_urea_change_percent: number | null;
  fertilizer_urea_price_updated_at?: string | null;
  fertilizer_urea_price_history?: number[] | null;
  // MOI (2026-09-10): Cuoc container - PROXY (trung binh % thay doi ro co
  // phieu hang tau container lon: ZIM, Maersk B, COSCO Shipping Holdings),
  // KHONG PHAI gia cuoc container that (khac voi baltic_dry_index von la
  // chi so hang roi/dry bulk, khong dai dien cho container).
  container_freight_proxy_change_percent: number | null;
  // MOI (2026-09-10): "excess return" - % thay doi co phieu hang tau DA TRU
  // di % thay doi index thi truong tuong ung (market-neutral proxy) - phan
  // anh yeu to nganh thuan tuy hon so voi container_freight_proxy_change_percent
  // (von con lan ca bien dong thi truong chung). Optional, uu tien dung
  // truong nay khi co, fallback ve truong tren khi backend chua ho tro.
  container_freight_proxy_excess_return_percent?: number | null;
  risk_on_score: number;
  risk_status: "RISK_ON" | "NEUTRAL" | "RISK_OFF";
  breakdown: { dxyScore: number; vixScore: number; treasuryScore: number };
  fetched_at: string;
  /** W6: ngày phiên + nguồn của từng giá ngày (chỉ có khi lấy từ Gateway /api/world/pulse) */
  quotes?: Partial<Record<PulseQuoteKey, PulseQuote>>;
  /** W1: Risk-On đã kiểm định đặt trước và không đạt */
  risk_on_evidence?: "HEURISTIC_FAILED";
}

export type PulseQuoteKey = "dxy" | "vix" | "treasury_10y" | "gold" | "oil_brent" | "oil_wti";
export interface PulseQuote { value: number; prevClose: number | null; changePct: number | null; date: string; time: string; symbol: string; nameVi: string; source: string }

export interface MarketPulseRow {
  id: string;
  symbol: string;
  name: string;
  market: string;
  value: number;
  change_percent: number;
  fetched_at: string;
  date?: string;
  source?: string;
}

interface StreamPayload {
  macro: MacroTrendRow | null;
  markets: MarketPulseRow[] | null;
  timestamp: string;
}

/** Gateway /api/world/pulse — một nguồn (Yahoo) cho giá ngày, mỗi số kèm ngày phiên. */
interface GatewayPulse {
  source: "gateway";
  macro: Pick<MacroTrendRow, "dxy" | "vix" | "treasury_10y" | "gold" | "oil_brent" | "oil_wti" | "risk_on_score" | "risk_status" | "breakdown" | "fetched_at" | "quotes" | "risk_on_evidence"> | null;
  markets: MarketPulseRow[];
  timestamp: string;
  missing: string[];
}

/** Nguồn của giá ngày đang hiển thị. "gateway" = Yahoo qua Gateway (ưu tiên); "project-a" = luồng SSE cũ (dự phòng). */
export type PulseSource = "gateway" | "project-a" | null;

const MONTHLY_DEFAULTS = {
  id: "gateway", baltic_dry_index: null, robusta_coffee: null, iron_ore_proxy_change_percent: null, rubber_price: null, rubber_change_percent: null,
  fertilizer_urea_price: null, fertilizer_urea_change_percent: null, container_freight_proxy_change_percent: null,
} satisfies Partial<MacroTrendRow>;
const GATEWAY_POLL_MS = 60_000;

/**
 * W6 (2026-10-16) — hợp nhất nguồn: DXY/VIX/US10Y/vàng/Brent/WTI, Risk-On và các chỉ số lấy từ Gateway (Yahoo, kèm ngày);
 * luồng Project A chỉ còn cấp các trường THÁNG / proxy (cao su, urê, BDI, cước container, quặng sắt). Gateway lỗi -> dùng
 * nguyên bản Project A (dự phòng). Không trộn hai nguồn cho cùng một con số.
 */
export function mergePulse(sse: StreamPayload | null, gw: GatewayPulse | null): { payload: StreamPayload | null; source: PulseSource } {
  if (gw?.macro) {
    const macro: MacroTrendRow = { ...MONTHLY_DEFAULTS, ...(sse?.macro ?? {}), ...gw.macro } as MacroTrendRow;
    return { payload: { macro, markets: gw.markets.length ? gw.markets : sse?.markets ?? [], timestamp: gw.timestamp }, source: "gateway" };
  }
  if (sse) return { payload: sse, source: "project-a" };
  return { payload: null, source: null };
}

export function useGlobalStream() {
  const [data, setData] = useState<StreamPayload | null>(null);
  const [gw, setGw] = useState<GatewayPulse | null>(null);
  const [gwOk, setGwOk] = useState(false);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    // FIX (tich hop Project B, 2026-08-26): ban goc trong zip dung path
    // tuong doi "/api/global/stream" - chi dung khi FE/API cung origin
    // (Next.js full-stack goc). Project B (Vite) va Project A (Next.js) la
    // 2 origin khac nhau -> BAT BUOC dung API_BASE, giong moi hook khac
    // trong du an (useEarningsData...). EventSource ho tro
    // URL tuyet doi khac origin binh thuong; CORS wildcard "*" da co san o
    // Project A (next.config.ts) nen khong can cau hinh them.
    const es = new EventSource(`${API_BASE}/api/global/stream`);
    es.onopen = () => setConnected(true);
    es.onmessage = (e) => {
      try {
        const parsed: StreamPayload = JSON.parse(e.data);
        setData(parsed);
      } catch {
        // Frame loi (hiem, VD JSON bi cat giua chung) - bo qua, cho frame
        // tiep theo sau 5s thay vi crash toan bo stream.
      }
    };
    es.onerror = () => setConnected(false);
    return () => es.close();
  }, []);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetchMarketJson<GatewayPulse>("/api/world/pulse")
        .then((d) => { if (alive) { setGw(d); setGwOk(true); } })
        .catch(() => { if (alive) setGwOk(false); });
    load();
    const id = setInterval(load, GATEWAY_POLL_MS);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const merged = useMemo(() => mergePulse(data, gw), [data, gw]);
  return { data: merged.payload, connected: connected || gwOk, source: merged.source, monthlyFromProjectA: !!data?.macro };
}
