import useSWR from "swr";
import type { ChartOverlayData } from "../../types/taVnIndex";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "https://tuan-quant-scanner-psi.vercel.app";
const fetcher = (url: string) => fetch(url).then((r) => {
  if (!r.ok) throw new Error(`Loi ${r.status}`);
  return r.json();
});

// Elite 10 - tich hop Time Engine + Confluence Engine len Chart. Doc du
// lieu THAT tu backend (events GDKHQ/DHCD that, Trade Scenario, cua so
// hien tai, risk flags).
export function useChartOverlay(ticker: string | null) {
  const { data, error, isLoading } = useSWR<ChartOverlayData>(
    ticker ? `${API_BASE}/api/elite10/chart-overlay/${ticker}` : null,
    fetcher,
    { refreshInterval: 30 * 60 * 1000, revalidateOnFocus: false, dedupingInterval: 10 * 60 * 1000 }
  );
  return { overlay: data ?? null, isLoading, error };
}
