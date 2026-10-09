// SEPA SP6 — cảnh báo phá vỡ trong phiên (/api/market/strategies/sepa/intraday). Trong phiên: làm mới 60 giây; ngoài phiên: 10 phút.
import useSWR from "swr";
import { marketUrl } from "../services/marketDataClient";

export type IntradayState = "BREAKOUT" | "BREAKOUT_LOW_VOL" | "EXTENDED" | "NEAR" | "BELOW";
export interface SepaIntradayRow {
  ticker: string; name?: string | null; sector?: string | null; list: string; pattern?: string | null; footprint?: string | null;
  scanStatus?: string; pivot: number; stopPct?: number | null; vol50?: number;
  price?: number; totalVolume?: number; quoteTime?: string | null; quoteToday?: boolean;
  state: IntradayState | null; label?: string; distPct?: number; projectedVolume?: number | null; projRatio?: number | null;
  volRatioReq?: number; buyZoneTop?: number; reliable?: boolean; minutesElapsed?: number; since?: string | null; reason?: string;
}
export interface SepaIntradayDoc {
  version: string; asOf: string; date: string; session: string; minutesElapsed: number; sessionMinutes: number;
  scanDataAsOf: string | null; candidates: number; counts: { breakout: number; lowVol: number; near: number; extended: number };
  rule: string; rows: SepaIntradayRow[];
}
const LIVE = ["ATO", "LO", "BREAK", "ATC"];

const fetcher = async (url: string): Promise<SepaIntradayDoc> => {
  const response = await fetch(url, { cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error ?? `Market API lỗi ${response.status}`);
  return body as SepaIntradayDoc;
};

export function useSepaIntraday() {
  const { data, error, isLoading, mutate } = useSWR<SepaIntradayDoc>(
    marketUrl("/api/market/strategies/sepa/intraday"),
    fetcher,
    { refreshInterval: (d) => (d && LIVE.includes(d.session) ? 60_000 : 10 * 60_000), revalidateOnFocus: true, dedupingInterval: 20_000 },
  );
  return { data, error: error as Error | undefined, isLoading, refresh: mutate, live: Boolean(data && LIVE.includes(data.session)) };
}
