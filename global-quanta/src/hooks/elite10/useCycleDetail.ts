import useSWR from "swr";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "https://tuan-quant-scanner-psi.vercel.app";
const fetcher = (url: string) => fetch(url).then((r) => {
  if (!r.ok) throw new Error(`Loi ${r.status}`);
  return r.json();
});

export interface WindowStat {
  windowId: string; label: string; avgReturn: number; winRate: number;
  ci90: [number, number]; annualizedScore: number; sampleSize: number;
  isLowSample: boolean; isCurrent: boolean;
}
export interface SeasonalStat { month: number; avgReturn: number; winRate: number; sampleSize: number; isLowSample: boolean; }
export interface TimingVerdict {
  ticker: string; action: string; confidence: string; recommendationScore: number;
  currentWindow: WindowStat | null; daysToNextEvent: number | null; nextEventDate: string | null;
  agreements: string[]; conflicts: string[]; windows: WindowStat[]; disclaimer: string;
  wyckoffPhase: string | null; wyckoffIntegrated: boolean;
  earningsWindows: WindowStat[] | null; earningsIntegrated: boolean;
}
export interface CycleDetailData {
  ticker: string;
  dividend: { totalEvents: number; windows: WindowStat[] };
  agm: { totalEvents: number; windows: WindowStat[] };
  seasonal: { currentMonth: number; stats: SeasonalStat[] };
  earnings: { integrated: boolean; note: string };
  wyckoff: { integrated: boolean; note: string };
  verdict: TimingVerdict;
  lastKnownDividendEvent: string | null;
}

// Elite 10 - Vung 2.5 day du (Dividend 5 cua so + AGM 2 cua so + Seasonal
// 12 thang + Verdict) - noi voi route /api/elite10/cycle da co san o
// Backend (truoc day chi dung 1 phan qua chart-overlay cho Ribbon don gian).
export function useCycleDetail(ticker: string | null) {
  const { data, error, isLoading } = useSWR<CycleDetailData>(
    ticker ? `${API_BASE}/api/elite10/cycle?ticker=${ticker}` : null,
    fetcher,
    { refreshInterval: 30 * 60 * 1000, revalidateOnFocus: false, dedupingInterval: 10 * 60 * 1000 }
  );
  return { cycleDetail: data ?? null, isLoading, error };
}
