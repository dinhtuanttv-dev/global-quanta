import { useEffect, useMemo, useState } from "react";
import { fetchMarketJson } from "../services/marketDataClient";

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
  /** VT1: cấu trúc kỳ hạn biến động VIX / VIX3M (thay Risk-On trên giao diện; chỉ mô tả) — chỉ có từ Gateway */
  vix3m?: number | null;
  vol_term?: { vix: number; vix3m: number; slope: number; state: "CONTANGO" | "FLAT" | "BACKWARDATION"; stateVi: string; regime: "RISK_ON" | "NEUTRAL" | "RISK_OFF" } | null;
  vol_term_evidence?: { version: string; verdict: string; label: string; note: string; history: string };
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
  macro: Pick<MacroTrendRow, "dxy" | "vix" | "treasury_10y" | "gold" | "oil_brent" | "oil_wti" | "risk_on_score" | "risk_status" | "breakdown" | "fetched_at" | "quotes" | "risk_on_evidence" | "vix3m" | "vol_term" | "vol_term_evidence"> | null;
  markets: MarketPulseRow[];
  timestamp: string;
  missing: string[];
}

/** Nguồn của giá ngày đang hiển thị: chỉ còn Gateway (Yahoo, mỗi số kèm ngày phiên). */
export type PulseSource = "gateway" | null;

// Trường tháng/proxy cũ của Project A (cao su, urê, BDI, cước container, quặng sắt) không còn lấy qua luồng SSE:
// giá tháng World Bank (cao su, urê, cà phê, phân bón) và quặng sắt có ở Gateway /api/commodities (mục Nhịp đập hàng hoá).
const MONTHLY_DEFAULTS = {
  id: "gateway", baltic_dry_index: null, robusta_coffee: null, iron_ore_proxy_change_percent: null, rubber_price: null, rubber_change_percent: null,
  fertilizer_urea_price: null, fertilizer_urea_change_percent: null, container_freight_proxy_change_percent: null,
} satisfies Partial<MacroTrendRow>;
export const GATEWAY_POLL_MS = 60_000;

/**
 * 21/11/2026 — chỉ một nguồn: Gateway /api/world/pulse. Bỏ luồng SSE Project A (/api/global/stream): nó giữ một hàm Vercel
 * chạy liên tục (79% thời gian chạy hàm của Project A) chỉ để cấp vài số tháng đã cũ từ 10/09, và không dừng khi ẩn tab.
 */
export function buildPulse(gw: GatewayPulse | null): { payload: StreamPayload | null; source: PulseSource } {
  if (!gw?.macro) return { payload: null, source: null };
  const macro: MacroTrendRow = { ...MONTHLY_DEFAULTS, ...gw.macro } as MacroTrendRow;
  return { payload: { macro, markets: gw.markets ?? [], timestamp: gw.timestamp }, source: "gateway" };
}

const visible = () => typeof document === "undefined" || document.visibilityState !== "hidden";

export function useGlobalStream() {
  const [gw, setGw] = useState<GatewayPulse | null>(null);
  const [gwOk, setGwOk] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetchMarketJson<GatewayPulse>("/api/world/pulse")
        .then((d) => { if (alive) { setGw(d); setGwOk(true); } })
        .catch(() => { if (alive) setGwOk(false); });
    load();
    // Tab ẩn thì không hỏi Gateway; quay lại tab thì tải ngay.
    const id = setInterval(() => { if (visible()) void load(); }, GATEWAY_POLL_MS);
    const onVisible = () => { if (visible()) void load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { alive = false; clearInterval(id); document.removeEventListener("visibilitychange", onVisible); };
  }, []);

  const pulse = useMemo(() => buildPulse(gw), [gw]);
  return { data: pulse.payload, connected: gwOk, source: pulse.source };
}
