import useSWR from "swr";
import { isMarketGatewayEnabled, marketUrl } from "../services/marketDataClient";
import type { OhlcvBar } from "../lib/ta-command-center/types";

/** Cơ sở giá của chuỗi TA (Gateway /api/market/ta-series — TA_VNINDEX_UPGRADE_SPEC §1.4). */
export type PriceBasis =
  | "ADJUSTED_CUMULATIVE"        // điều chỉnh cộng dồn theo sự kiện quyền (chuẩn cho TA)
  | "NOMINAL_UNADJUSTED"         // giá danh nghĩa, chưa điều chỉnh (thiếu dữ liệu sự kiện quyền)
  | "SSI_LATEST_EVENT_ADJUSTED"  // SSI DailyOhlc: chỉ điều chỉnh đợt quyền gần nhất
  | "INDEX_POINTS"               // điểm chỉ số
  | "LEGACY";                    // Project A /api/ohlcv (Gateway tắt)

export interface CorporateActionMark { date: string; factor: number; label: string }

export interface TaSeries {
  bars: OhlcvBar[];
  priceBasis: PriceBasis;
  corporateActions: CorporateActionMark[];
  warnings: string[];
  quality: Record<string, unknown>;
}

export const TA_SERIES_RANGE = "5y";
export const TA_SERIES_LIMIT = 750; // ~3 năm phiên D (đặc tả §2.1.1); W gộp từ chuỗi này

const fetcher = (url: string) => fetch(url).then((res) => {
  if (!res.ok) throw new Error(`API lỗi ${res.status}`);
  return res.json();
});

export const PRICE_BASIS_LABEL: Record<PriceBasis, string> = {
  ADJUSTED_CUMULATIVE: "Giá điều chỉnh cộng dồn",
  NOMINAL_UNADJUSTED: "Giá danh nghĩa — CHƯA điều chỉnh",
  SSI_LATEST_EVENT_ADJUSTED: "Giá SSI — chỉ điều chỉnh đợt quyền gần nhất",
  INDEX_POINTS: "Điểm chỉ số",
  LEGACY: "Nguồn Project A",
};

export function useTaSeries(ticker: string | null) {
  const gateway = isMarketGatewayEnabled();
  const url = !ticker
    ? null
    : gateway
      ? marketUrl("/api/market/ta-series", { ticker, range: TA_SERIES_RANGE, limit: TA_SERIES_LIMIT })
      : `${import.meta.env.VITE_API_BASE_URL ?? ""}/api/ohlcv?ticker=${encodeURIComponent(ticker)}&range=1y&limit=250`;
  const { data, error, isLoading } = useSWR<Partial<TaSeries> & { bars: OhlcvBar[] }>(url, fetcher, { revalidateOnFocus: false, dedupingInterval: 60_000 });
  const series: TaSeries = {
    bars: data?.bars ?? [],
    priceBasis: (data?.priceBasis as PriceBasis | undefined) ?? (gateway ? "SSI_LATEST_EVENT_ADJUSTED" : "LEGACY"),
    corporateActions: data?.corporateActions ?? [],
    warnings: data?.warnings ?? [],
    quality: data?.quality ?? {},
  };
  return { ...series, isLoading, error };
}
