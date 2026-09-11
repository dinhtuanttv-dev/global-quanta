import useSWR from "swr";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";
const fetcher = (url: string) => fetch(url).then((r) => {
  if (!r.ok) throw new Error(`Loi ${r.status}`);
  return r.json();
});

// NANG CAP (2026-09-11): them PVT/A-D + trong so dong - khop dung JSON
// moi tra ve tu backend (xem lib/sector-filter/scoring/confluence-score.ts)
export interface ConfluenceWeights { rrg: number; rs: number; volume: number; pvt: number; ad: number; }

export interface ConfluenceStock {
  ticker: string;
  sectorKey: string;
  sectorQuadrant: string;
  rs3m: number | null;
  volumeSpikeRatio: number | null;
  pvtScore: number | null;         // -100..100, tho
  adScore: number | null;          // -100..100, tho
  rrgScore: number;
  rsScore: number;
  volumeScore: number;
  pvtScoreNormalized: number;      // 0-100, da chuan hoa de hien thi
  adScoreNormalized: number;       // 0-100, da chuan hoa de hien thi
  weightsUsed: ConfluenceWeights;
  confluenceScore: number;
}

export interface Top20Response {
  generatedAt: string;
  totalAnalyzed: number;
  riskOnScore: number; // MOI - dung de giai thich tai sao trong so hien tai lai nhu vay
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
