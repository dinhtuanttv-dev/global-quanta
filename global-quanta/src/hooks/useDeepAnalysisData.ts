import useSWR from "swr";
import { fetchMarketJson } from "../services/marketDataClient";
import type { FinancialStatementInput } from "../types/financialEngineering";

/** X5 — BCTC năm thật (VNDirect, qua Gateway) cho Beneish/Altman/Piotroski. */
export interface ForensicInputsResponse {
  ticker: string;
  source: string;
  reportType: "ANNUAL";
  applicable: boolean;
  reason: string | null;
  current: FinancialStatementInput | null;
  prior: FinancialStatementInput | null;
  fiscalDates?: [string, string];
  fetchedAt: string;
}

/** X5 — lợi suất ngày thật của danh mục ★ (cân bằng tỷ trọng, giá điều chỉnh) + beta với VN-Index. */
export interface PortfolioRiskResponse {
  requested: string[];
  used: string[];
  failed: string[];
  priceBasis: string;
  weighting: string;
  from: string | null;
  to: string | null;
  sampleSize: number;
  dailyReturns: number[];
  beta: number | null;
}

const opts = { revalidateOnFocus: false, dedupingInterval: 10 * 60 * 1000, shouldRetryOnError: false };

export function useForensicInputs(ticker: string | null) {
  const { data, error, isLoading } = useSWR<ForensicInputsResponse>(
    ticker ? ["forensic", ticker] : null,
    () => fetchMarketJson<ForensicInputsResponse>(`/api/market/fundamentals/${encodeURIComponent(ticker!)}/forensic`),
    opts,
  );
  return { data: data ?? null, error: error as Error | undefined, isLoading };
}

export function usePortfolioRiskData(tickers: string[]) {
  const key = [...new Set(tickers.map((t) => t.toUpperCase()))].sort().slice(0, 20).join(",");
  const { data, error, isLoading } = useSWR<PortfolioRiskResponse>(
    key ? ["portfolio-risk", key] : null,
    () => fetchMarketJson<PortfolioRiskResponse>("/api/market/portfolio-risk", { symbols: key }),
    opts,
  );
  return { data: data ?? null, error: error as Error | undefined, isLoading, symbols: key ? key.split(",") : [] };
}
