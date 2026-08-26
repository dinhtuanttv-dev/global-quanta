import useSWR from "swr";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";
const fetcher = (url: string) => fetch(url).then((r) => {
  if (!r.ok) throw new Error(`Loi ${r.status}`);
  return r.json();
});

export interface ConfluenceStock {
  ticker: string;
  sectorKey: string;
  sectorQuadrant: string;
  rrgScore: number;
  rsScore: number;
  volumeScore: number;
  confluenceScore: number;
}

export interface Top20Response {
  generatedAt: string;
  totalAnalyzed: number;
  top20: ConfluenceStock[];
}

export function useTop20Radar(sectorKey: string | null) {
  const url = sectorKey
    ? `${API_BASE}/api/sector-filter/top20?sectorKey=${encodeURIComponent(sectorKey)}`
    : `${API_BASE}/api/sector-filter/top20`;

  const { data, error, isLoading, mutate } = useSWR<Top20Response>(
    url, fetcher,
    { revalidateOnFocus: false, dedupingInterval: 15 * 60 * 1000 }
  );
  return { top20Data: data, error, isLoading, refresh: mutate };
}