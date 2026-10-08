import useSWR from "swr";
import { isMarketGatewayEnabled, marketUrl } from "../services/marketDataClient";
import type { FlowMinute } from "../lib/quant-core";

export interface ForeignDay { date: string; buyVal: number; sellVal: number; netVal: number; room: number | null }
interface TaFlowResponse {
  minutes: FlowMinute[];
  largePrintThreshold: number | null;
  foreign: ForeignDay[];
  coverage: { requestedSessions: number; tickSessions: number; firstTickSession: string | null };
}

const fetcher = (url: string) => fetch(url).then(async (res) => {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error ?? `API lỗi ${res.status}`);
  return body as TaFlowResponse;
});

/** Dòng lệnh theo phút + khối ngoại theo ngày (Gateway /ta-flow) — chỉ tải khi bật lớp Order Flow / Khối ngoại. */
export function useTaFlow(ticker: string | null, enabled: boolean) {
  const url = ticker && enabled && isMarketGatewayEnabled() ? marketUrl("/api/market/ta-flow", { ticker, days: 20 }) : null;
  const { data, error, isLoading } = useSWR<TaFlowResponse>(url, fetcher, { revalidateOnFocus: false, refreshInterval: 60_000, dedupingInterval: 30_000 });
  return {
    data: data ?? null,
    isLoading: Boolean(url) && isLoading,
    error: !isMarketGatewayEnabled() && enabled ? "Order Flow cần Market Gateway" : error ? String(error.message ?? error) : null,
  };
}
