import useSWR from "swr";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";
const fetcher = (url: string) => fetch(url).then((r) => {
  if (!r.ok) throw new Error(`Loi ${r.status}`);
  return r.json();
});

export interface AiAnalysisEntry {
  ticker: string;
  pros: string[];
  cons: string[];
  catalystScore: number | null;
  generatedAt: string;
}

// P2 (Bo Loc Co Phieu - Nhom B): doc Pros/Cons + Catalyst Score DA QUET
// SAN tu Database (Cron Job dividend-ai-analysis, vong xoay 15 ma/ngay).
// Dung CHUNG cho ca 17 ma theo doi goc VA Universe.
export function useAiAnalysis() {
  const { data, error, isLoading } = useSWR(`${API_BASE}/api/cotuc/ai-analysis`, fetcher, {
    refreshInterval: 30 * 60 * 1000,
    revalidateOnFocus: false,
    dedupingInterval: 10 * 60 * 1000,
  });

  const aiAnalysisMap: Record<string, AiAnalysisEntry> = {};
  if (data?.entries) {
    data.entries.forEach((e: AiAnalysisEntry) => { aiAnalysisMap[e.ticker] = e; });
  }

  return { aiAnalysisMap, isLoading, error };
}
