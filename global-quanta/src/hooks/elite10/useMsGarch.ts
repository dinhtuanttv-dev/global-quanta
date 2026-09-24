import useSWR from 'swr';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'https://tuan-quant-scanner-psi.vercel.app';
const fetcher = (url: string) => fetch(url).then((r) => {
  if (!r.ok) throw new Error(`Loi ${r.status}`);
  return r.json();
});

// Elite 10 - Muc F (Tech Spec v2) Giai doan 5/5: hook cho MS-GARCH.
// Khac voi Debate AI (POST on-demand, ton chi phi AI that moi lan bam),
// route nay la GET va CHAY RAT NHANH (~250ms, khong goi AI nao ca, chi
// toi uu hoa so hoc thuan tuy) - nen tu dong goi khi mo ma, giong cach
// useSmcDetector/useConfluenceEngine da lam, khong can nut bam rieng.

export interface GarchRegimeParams { omega: number; alpha: number; beta: number; }
export interface FanChartPoint { day: number; p10: number; p50: number; p90: number; medianReturn: number; }

export interface MsGarchData {
  ticker: string; currentPrice: number;
  horizonDays: number; nSimulations: number;
  isConverged: boolean; warnings: string[];
  currentRegime: { label: 'calm' | 'volatile'; probCalm: number; probVolatile: number };
  regimeParams: { calm: GarchRegimeParams; volatile: GarchRegimeParams };
  fanChart: FanChartPoint[];
  dataSource: string; methodologyNote: string;
}

export function useMsGarch(ticker: string | null) {
  const { data, error, isLoading } = useSWR<MsGarchData>(
    ticker ? `${API_BASE}/api/elite10/ms-garch/${ticker}` : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60 * 60 * 1000, refreshInterval: 4 * 60 * 60 * 1000, shouldRetryOnError: false }
  );
  return { msGarch: data ?? null, isLoading, isError: Boolean(error) };
}
