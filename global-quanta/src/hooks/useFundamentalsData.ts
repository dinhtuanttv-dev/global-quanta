import useSWR from "swr";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";
const fetcher = (url: string) => fetch(url).then((r) => {
  if (!r.ok) throw new Error(`Loi ${r.status}`);
  return r.json();
});

export interface FundamentalsEntry {
  ticker: string;
  price: number | null;
  peRatio: number | null;
  roe: number | null;
  debtEquity: number | null;
  rsi14: number | null;
  dataQuality: "HARD_DATA" | "PARTIAL" | "UNAVAILABLE";
}

// P0: thay du lieu mau tinh (P/E, ROE, No/VCSH, RSI, gia) bang du lieu
// THAT tu VCI + Yahoo Finance. Tra ve map { ticker: {...} } de CotucTab
// merge, dung DUNG pattern da co san o useDividendEvents.ts.
export function useFundamentalsData() {
  const { data, error, isLoading, mutate } = useSWR(`${API_BASE}/api/cotuc/fundamentals`, fetcher, {
    refreshInterval: 30 * 60 * 1000,
    revalidateOnFocus: false,
    dedupingInterval: 10 * 60 * 1000,
  });

  const fundamentalsMap: Record<string, FundamentalsEntry> = {};
  if (data?.fundamentals) {
    data.fundamentals.forEach((f: FundamentalsEntry) => {
      fundamentalsMap[f.ticker] = f;
    });
  }

  return { fundamentalsData: data, fundamentalsMap, isLoading, error, refresh: mutate };
}
