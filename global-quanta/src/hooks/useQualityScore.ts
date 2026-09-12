import useSWR from "swr";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";
const fetcher = (url: string) => fetch(url).then((r) => {
  if (!r.ok) throw new Error(`Loi ${r.status}`);
  return r.json();
});

export interface QualityScoreEntry {
  ticker: string;
  tier1: number | null;
  tier2: number | null;
  tier3: number | null;
  details: Record<string, unknown>;
}

// P2: lay Tier 1-3 cua Dividend Quality Score (Tang 4 tinh o CotucTab
// vi can realRsMap client-side). Tra ve map { ticker: {...} } de merge
// vao DIVIDEND_STOCKS, dung DUNG pattern da co san o cac hook khac.
export function useQualityScore() {
  const { data, error, isLoading, mutate } = useSWR(`${API_BASE}/api/cotuc/quality-score`, fetcher, {
    refreshInterval: 30 * 60 * 1000,
    revalidateOnFocus: false,
    dedupingInterval: 10 * 60 * 1000,
  });

  const qualityScoreMap: Record<string, QualityScoreEntry> = {};
  if (data?.results) {
    data.results.forEach((r: QualityScoreEntry) => {
      qualityScoreMap[r.ticker] = r;
    });
  }

  return { qualityScoreData: data, qualityScoreMap, isLoading, error, refresh: mutate };
}
