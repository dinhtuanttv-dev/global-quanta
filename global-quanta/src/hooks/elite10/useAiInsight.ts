import useSWR from "swr";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "https://tuan-quant-scanner-psi.vercel.app";
const fetcher = (url: string) => fetch(url).then((r) => {
  if (!r.ok) throw new Error(`Loi ${r.status}`);
  return r.json();
});

export interface CaseItem { point: string; sourceField: string; citedValue: string; dataStatus: string; }
export interface TradeScenario {
  winRate: number; sampleSize: number;
  buyZone: [number, number]; stopLoss: number; takeProfit: [number, number];
  isEstimated: boolean;
}
export interface AiInsightData {
  ticker: string; scoreNormalized: number; confidenceInterval: [number, number]; starRating: number;
  sourcesUsed: string; crossTabConvergence: number;
  bullCase: CaseItem[]; bearCase: CaseItem[];
  tradeScenario: TradeScenario; riskFlags: string[]; generatedAt: string; warnings: string[];
}

// Elite 10 - Vung 3 (Waterfall giai thich) + Vung 4 (Ma tran doi khang) +
// Vung 5 (AI Deep Insight) - noi voi route /ai-insight da co san o Backend
// (chua tung duoc Frontend goi truoc day).
export function useAiInsight(ticker: string | null) {
  const { data, error, isLoading } = useSWR<AiInsightData>(
    ticker ? `${API_BASE}/api/elite10/confluence/${ticker}/ai-insight` : null,
    fetcher,
    { refreshInterval: 30 * 60 * 1000, revalidateOnFocus: false, dedupingInterval: 10 * 60 * 1000 }
  );
  return { insight: data ?? null, isLoading, error };
}
