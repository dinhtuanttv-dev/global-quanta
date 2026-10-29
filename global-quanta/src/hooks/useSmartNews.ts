import useSWR from "swr";
import { fetchMarketJson, isMarketGatewayEnabled } from "../services/marketDataClient";

/** N0: ESA tin tức — Campbell–Wasley (log giá trị GD, mô hình thị trường) + lợi suất bất thường theo mô hình thị trường. */
export interface NewsAbnormal {
  method: string; sessions: number; from?: string; to?: string;
  classification: "repricing" | "absorption" | "price_only" | "ignored" | "pending" | "insufficient";
  estimation?: { n: number; beta?: number | null; volumeBeta?: number | null; sigmaVolume?: number | null; sigmaReturn?: number | null; need?: number };
  sav0?: number | null; volumeMultiple0?: number | null; cav?: number | null; zVolume?: number | null; car?: number | null; zReturn?: number | null;
}
export interface NewsReaction { sessions: number; ret: number | null; excess: number | null; volumeRatio: number | null; from?: string; to?: string; abnormal?: NewsAbnormal | null }
export interface SmartNewsItem {
  id: string; title: string; summary: string; url: string | null; attachment: string | null;
  publishedAt: string | null; source: "DISCLOSURE" | "VNDIRECT_NEWS" | "VIETSTOCK" | "CAFEF" | string; sourceLabel: string;
  alsoIn: string[]; corroboration: number; tickers: string[];
  eventType: string; eventLabel: string; sentiment: number; sentimentHits: string[];
  reaction: NewsReaction | null; insight: { tone: "up" | "down" | "watch"; text: string } | null; importance: number;
}
export interface SmartNewsResponse {
  generatedAt: string; days: number; tickers: string[]; items: SmartNewsItem[];
  perTicker: Record<string, { count: number; avgSentiment: number; top: string | null }>;
  sources: Record<string, { ok: boolean; items?: number; error?: string }>;
}

/** Tin tức thật cho các mã (Gateway gom + gắn mã + khử trùng + phân loại + cảm xúc + phản ứng giá). */
export function useSmartNews(tickers: string[], days = 14) {
  const key = [...new Set(tickers)].sort().slice(0, 60).join(",");
  const { data, error, isLoading } = useSWR<SmartNewsResponse>(
    key && isMarketGatewayEnabled() ? ["smart-news", key, days] : null,
    () => fetchMarketJson<SmartNewsResponse>("/api/market/news", { tickers: key, days }),
    { refreshInterval: 3 * 60_000, revalidateOnFocus: false, dedupingInterval: 60_000, keepPreviousData: true },
  );
  return { data, error, isLoading, enabled: isMarketGatewayEnabled() };
}
