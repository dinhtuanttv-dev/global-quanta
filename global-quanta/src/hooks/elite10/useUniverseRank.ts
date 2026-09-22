import useSWR from "swr";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "https://tuan-quant-scanner-psi.vercel.app";
const fetcher = (url: string) => fetch(url).then((r) => {
  if (!r.ok) throw new Error(`Loi ${r.status}`);
  return r.json();
});

export interface UniverseRankData {
  ticker: string; inTop200: boolean; rank: number | null; score: number | null;
  totalUniverseSize: number; note: string;
}

// Elite 10 - Viec 5 (ra soat 2026-09-17): xep hang THAT theo thanh khoan
// + von hoa (Top 200 Universe, TradingView Scanner) - BO SUNG cho Pattern
// Scanner Panel, KHONG THAY THE phan "do khop mau hinh" (van con mock).
export function useUniverseRank(ticker: string | null) {
  const { data, error, isLoading } = useSWR<UniverseRankData>(
    ticker ? `${API_BASE}/api/elite10/universe-rank/${ticker}` : null,
    fetcher,
    { refreshInterval: 60 * 60 * 1000, revalidateOnFocus: false, dedupingInterval: 30 * 60 * 1000 }
  );
  return { universeRank: data ?? null, isLoading, error };
}
