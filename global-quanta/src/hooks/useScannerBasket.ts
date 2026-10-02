import useSWR from "swr";
import { useMemo } from "react";
import { fetchMarketJson, isMarketGatewayEnabled } from "../services/marketDataClient";
import type { SieuQuetStockItem } from "./useSieuQuetScanner";

// Rổ hiển thị của Bảng Siêu Quét: Tất cả (universe), VN30 (thành phần từ SSI) hoặc danh mục tự chọn.
// Mã của rổ không có trong lần quét (ngoài universe) được Gateway chấm điểm theo CÙNG công thức và
// bối cảnh universe (GET /api/market/scanner/custom) -> so sánh trực tiếp được với các mã trong bảng.

export type Basket = "ALL" | "VN30" | "WATCHLIST";

interface CustomScanResponse {
  dataAsOf: string; items: SieuQuetStockItem[]; notFound: string[]; insufficient: string[]; fundamentalsFetched: number;
}

/** Cùng thứ tự với Gateway/Project A: F-Score thấp xuống cuối, còn lại theo Smart Score giảm dần. */
export function sortLikeScanner(items: SieuQuetStockItem[]) {
  const excluded = (i: SieuQuetStockItem) => (i.piotroskiFScore !== null && i.piotroskiFScore <= Math.floor(i.fScoreMax * 3 / 9) ? 1 : 0);
  return [...items].sort((a, b) => excluded(a) - excluded(b) || (b.smartScore ?? 0) - (a.smartScore ?? 0));
}

export function useIndexComponents(code: string, enabled: boolean) {
  const { data } = useSWR<{ symbols: string[] }>(
    enabled && isMarketGatewayEnabled() ? ["index-components", code] : null,
    () => fetchMarketJson<{ symbols: string[] }>(`/api/market/indices/${encodeURIComponent(code)}/components`),
    { revalidateOnFocus: false, dedupingInterval: 10 * 60_000 },
  );
  return data?.symbols ?? null;
}

export function useScannerBasket(items: SieuQuetStockItem[], basket: Basket, watchlistTickers: string[]) {
  const vn30 = useIndexComponents("VN30", basket === "VN30");
  const tickers = basket === "VN30" ? vn30 : basket === "WATCHLIST" ? watchlistTickers : null;
  const byTicker = useMemo(() => new Map(items.map((i) => [i.ticker, i])), [items]);
  const missing = useMemo(() => (tickers ?? []).filter((t) => !byTicker.has(t)), [tickers, byTicker]);
  const missingKey = [...missing].sort().join(",");

  const { data: custom, error: customError, isLoading: customLoading } = useSWR<CustomScanResponse>(
    missing.length && isMarketGatewayEnabled() ? ["scanner-custom", missingKey] : null,
    () => fetchMarketJson<CustomScanResponse>("/api/market/scanner/custom", { tickers: missingKey }),
    { revalidateOnFocus: false, dedupingInterval: 5 * 60_000, keepPreviousData: true },
  );

  return useMemo(() => {
    if (!tickers) return { items: basket === "ALL" ? items : [], basketTickers: null, loading: basket === "VN30", notFound: [], insufficient: [], customError: null as unknown };
    const extra = new Map((custom?.items ?? []).map((i) => [i.ticker, i]));
    const list = tickers.map((t) => byTicker.get(t) ?? extra.get(t)).filter(Boolean) as SieuQuetStockItem[];
    return {
      items: sortLikeScanner(list),
      basketTickers: tickers,
      loading: customLoading && missing.length > 0,
      notFound: custom?.notFound ?? [],
      insufficient: custom?.insufficient ?? [],
      customError: customError ?? null,
    };
  }, [tickers, items, byTicker, custom, customLoading, customError, missing.length, basket]);
}
