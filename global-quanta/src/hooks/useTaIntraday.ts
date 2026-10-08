import useSWR from "swr";
import { isMarketGatewayEnabled, marketUrl } from "../services/marketDataClient";
import type { IntradayBar } from "../lib/ta-command-center/TimeframeController";
import type { PriceBasis } from "./useTaSeries";

export const TA_INTRADAY_SESSIONS = 20;

interface TaIntradayResponse { bars: IntradayBar[]; sessions: string[]; priceBasis: PriceBasis }

const fetcher = (url: string) => fetch(url).then(async (res) => {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error ?? `API lỗi ${res.status}`);
  return body as TaIntradayResponse;
});

/** Nến 1 phút N phiên gần nhất (Gateway /ta-intraday) — chỉ tải khi người dùng chọn khung intraday. */
export function useTaIntraday(ticker: string | null, enabled: boolean) {
  const url = ticker && enabled && isMarketGatewayEnabled()
    ? marketUrl("/api/market/ta-intraday", { ticker, days: TA_INTRADAY_SESSIONS })
    : null;
  const { data, error, isLoading } = useSWR<TaIntradayResponse>(url, fetcher, { revalidateOnFocus: false, refreshInterval: 60_000, dedupingInterval: 30_000 });
  return {
    bars: data?.bars ?? [],
    sessions: data?.sessions ?? [],
    priceBasis: data?.priceBasis ?? null,
    isLoading: Boolean(url) && isLoading,
    error: !isMarketGatewayEnabled() && enabled ? "Khung intraday cần Market Gateway" : error ? String(error.message ?? error) : null,
  };
}
