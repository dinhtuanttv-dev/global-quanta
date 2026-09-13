import useSWR from "swr";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "https://tuan-quant-scanner-psi.vercel.app";
const fetcher = (url: string) => fetch(url).then((r) => {
  if (!r.ok) throw new Error(`Loi ${r.status}`);
  return r.json();
});

export interface SieuQuetIndexState {
  asOf: string;
  ma20: number; ma50: number; ma200: number;
  maAlignmentScore: number;
  trendBias: string; trendLabel: string;
  rsi14: number; macdHistogram: number;
  marketBreadthPct: number; divergence: string;
  atr14: number; atrPercentile: number; breakoutProbability: number;
  impulseScore: number;
  narrative: string;
}

export interface SieuQuetStockItem {
  ticker: string;
  companyName: string | null;
  sector: string | null;
  price: number | null;
  changePct: number | null;
  faScore: number | null;
  taScore: number | null;
  eventImpactScore: number | null;
  smartScore: number | null;
  rsRating: number | null;
  riskAdjustedMomentum: number | null;
  riskRewardRatio: number | null;
  trendTag: string | null;
  qualityTag: string | null;
  confluenceStatusCode: string | null;
  confluenceStatusLabel: string | null;
  confluenceBoost: number | null;
  confluenceReasonCodes: string[];
  breakoutBoostBadge: boolean;
  piotroskiFScore: number | null;
  fScoreMax: number;
  computedAt: string;
}

// SIEU QUET AI - doc du lieu THAT (Confluence Engine + Scoring, da port
// tu Python + nuoi bang VN-Index that/Yahoo/VCI) tu Database, cap nhat
// dinh ky boi Cron Job sieu-quet-scan (1 lan/ngay).
export function useSieuQuetScanner() {
  const { data, error, isLoading, mutate } = useSWR<{
    generatedAt: string; indexState: SieuQuetIndexState | null; items: SieuQuetStockItem[]; totalCount: number;
  }>(`${API_BASE}/api/sieu-quet-ai/scanner`, fetcher, {
    refreshInterval: 30 * 60 * 1000,
    revalidateOnFocus: false,
    dedupingInterval: 10 * 60 * 1000,
  });

  return {
    indexState: data?.indexState ?? null,
    items: data?.items ?? [],
    isLoading, error, refresh: mutate,
  };
}
