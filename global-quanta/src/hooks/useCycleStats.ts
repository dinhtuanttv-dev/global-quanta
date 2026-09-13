import useSWR from "swr";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";
const fetcher = (url: string) => fetch(url).then((r) => {
  if (!r.ok) throw new Error(`Loi ${r.status}`);
  return r.json();
});

export interface CycleWindowStat {
  id: string; key: string; label: string; offset: [number, number]; holdDays: number;
  n: number;
  mean?: number; std?: number; winRate?: number; ci5?: number; ci95?: number;
  probMeanPositive?: number; annualized?: number; score?: number;
}

export interface CycleHistoryRow {
  exDate: string; divType: string;
  w_m1: number | null; w_pre_agm: number | null; w_pre_ex: number | null;
  w_post_ex: number | null; w_post_credit: number | null;
}

export interface CycleStatsData {
  generatedAt: string;
  ticker: string | null;
  totalEvents: number;
  history: CycleHistoryRow[];
  windowStats: CycleWindowStat[];
  bestWindow: CycleWindowStat | null;
}

// Timing Engine (P3): xac suat giai ngan quanh GDKHQ, tinh tu lich su
// THAT (VCI events + Yahoo adjClose), khong can nhap lieu thu cong nhu
// cong cu HTML goc.
export function useCycleStats(ticker?: string) {
  const url = ticker ? `${API_BASE}/api/cotuc/cycle-stats?ticker=${ticker}` : null;
  const { data, error, isLoading } = useSWR<CycleStatsData>(url, fetcher, {
    refreshInterval: 60 * 60 * 1000,
    revalidateOnFocus: false,
    dedupingInterval: 30 * 60 * 1000,
  });

  return { cycleData: data, isLoading, error };
}
