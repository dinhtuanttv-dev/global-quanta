import useSWR from "swr";
import type { DomesticEvent } from "../types/catalyst";
import { fetchMarketJson } from "../services/marketDataClient";

// V4 (19/11/2026): đọc từ Market Gateway (trước đây Project A). Có timeout và kiểm mã lỗi qua fetchMarketJson.
export function useDomesticEvents() {
  const { data, error, isLoading } = useSWR<{ events: DomesticEvent[] }>(
    "/api/catalysts/domestic-events",
    () => fetchMarketJson<{ events: DomesticEvent[] }>("/api/catalysts/domestic-events"),
    { revalidateOnFocus: false, dedupingInterval: 5 * 60 * 1000 }
  );
  return { events: data?.events ?? [], isLoading, error };
}
