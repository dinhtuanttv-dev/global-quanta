import useSWR from "swr";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";
const fetcher = (url: string) => fetch(url).then((r) => {
  if (!r.ok) throw new Error(`Loi ${r.status}`);
  return r.json();
});

export interface HousingPriceRow {
  id: string;
  country_code: string;
  country_name: string;
  quarter_label: string;
  real_index_value: number;
  yoy_change_percent: number | null;
  source: string;
  fetched_at: string;
}

// Du lieu chi doi theo QUY - refreshInterval dai (6 tieng), khong can
// SSE/polling nhanh nhu macro/market pulse.
export function useHousingPrices() {
  const { data, error, isLoading } = useSWR(`${API_BASE}/api/global/housing`, fetcher, {
    refreshInterval: 6 * 60 * 60 * 1000,
    revalidateOnFocus: false,
    dedupingInterval: 6 * 60 * 60 * 1000,
  });

  return { countries: (data?.countries ?? []) as HousingPriceRow[], isLoading, error };
}
