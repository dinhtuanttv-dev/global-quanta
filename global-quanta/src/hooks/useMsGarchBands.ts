// MS-GARCH trên Gateway: chỉ gọi khi lớp được bật. Dải trả về theo tỷ lệ so với giá cuối, nên chart nhân với giá đang hiển thị.
import useSWR from "swr";
import { fetchMarketJson } from "../services/marketDataClient";

export interface MsGarchBand { day: number; p10: number; p50: number; p90: number }
export interface MsGarchDoc {
  symbol: string; available: boolean; reason?: string; asOf?: string; lastClose?: number; rule?: string; grade?: "A" | "B" | "C"; horizon?: number; nSims?: number; sessions?: number;
  regime?: { label: "calm" | "volatile"; probCalm: number; probVolatile: number }; volAnnualPct?: number; converged?: boolean; iterations?: number; warnings?: string[];
  bands?: MsGarchBand[]; baseline?: MsGarchBand[];
}

export function useMsGarchBands(ticker: string | null) {
  const path = ticker ? `/api/market/ms-garch/${encodeURIComponent(ticker.toUpperCase())}` : null;
  const { data, error, isLoading } = useSWR<MsGarchDoc>(path, () => fetchMarketJson<MsGarchDoc>(path as string), { revalidateOnFocus: false, dedupingInterval: 300_000, shouldRetryOnError: false });
  return { doc: data ?? null, error: error as Error | undefined, isLoading };
}
