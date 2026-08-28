import useSWR from "swr";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";
const fetcher = (url: string) => fetch(url).then((r) => {
  if (!r.ok) throw new Error(`Loi ${r.status}`);
  return r.json();
});

export interface SectorQuote {
  etfSymbol: string;
  sectorNameVi: string;
  market: string;
  changePercent: number;
  fetchedAt: string;
}

export function useSectorPulse() {
  // Du lieu trong phien - refresh 5 phut, khac han macro/market pulse
  // (2 lan/ngay qua cron) vi day la du lieu song, khong qua Supabase.
  const { data, error, isLoading } = useSWR(`${API_BASE}/api/global/sector-pulse`, fetcher, {
    refreshInterval: 5 * 60 * 1000,
    revalidateOnFocus: false,
  });

  return {
    topGainers: (data?.topGainers ?? []) as SectorQuote[],
    topLosers: (data?.topLosers ?? []) as SectorQuote[],
    isLoading, error,
  };
}
