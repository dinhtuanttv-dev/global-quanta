import { useMemo } from "react";
import useSWR from "swr";
import { fetchMarketJson } from "../../services/marketDataClient";
import type { OhlcvBar } from "../../lib/ta-command-center/types";
import type { TaVnIndexResponse, Timeframe } from "../../types/taVnIndex";
import { buildEliteAnalysis } from "../../lib/elite10/realAnalysis";
import { ApiError, type UseTaVnIndexResult } from "../ta-vn-index/useTaVnIndex";
import { TA_SERIES_LIMIT, TA_SERIES_RANGE } from "../useTaSeries";

const INDEX_TICKERS = new Set(["VNINDEX", "VN30", "HNXINDEX", "HNX30", "UPCOMINDEX", "VN100"]);

interface SeriesResp { bars: OhlcvBar[]; priceBasis?: string; warnings?: string[] }

/**
 * Elite 10 E0 (2026-10-17): dữ liệu kỹ thuật THẬT — nến điều chỉnh của Gateway (/api/market/ta-series, cùng nguồn với mọi tab)
 * + engine quant-core tính trên trình duyệt. Thay useTaVnIndex (route mô phỏng ta-vn-index/analyze). Cùng hình dạng kết quả để
 * các panel hiện có dùng lại được.
 */
export function useEliteAnalysis(ticker: string | null, timeframe: Timeframe): UseTaVnIndexResult & { priceBasis: string | null; warnings: string[] } {
  const key = ticker ? ["elite10-series", ticker] : null;
  const { data, error, isLoading, mutate } = useSWR<SeriesResp, Error>(
    key,
    () => fetchMarketJson<SeriesResp>("/api/market/ta-series", { ticker: ticker!, range: TA_SERIES_RANGE, limit: TA_SERIES_LIMIT }),
    { revalidateOnFocus: false, dedupingInterval: 60_000, errorRetryCount: 2 },
  );
  const analysis = useMemo<TaVnIndexResponse | undefined>(() => {
    if (!ticker || !data?.bars) return undefined;
    return buildEliteAnalysis(ticker, timeframe, data.bars, { priceBasis: data.priceBasis, isIndex: INDEX_TICKERS.has(ticker.toUpperCase()) }) ?? undefined;
  }, [ticker, timeframe, data]);
  return {
    data: analysis,
    isLoading,
    isError: Boolean(error),
    error: error ? new ApiError(error.message, 0) : undefined,
    isEmpty: Boolean(data) && !analysis,
    refresh: () => { void mutate(); },
    priceBasis: data?.priceBasis ?? null,
    warnings: data?.warnings ?? [],
  };
}
