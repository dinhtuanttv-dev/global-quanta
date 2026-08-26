import useSWR from "swr";

// Sua so voi ban goc trong zip: them API_BASE, dung dung convention
// da co san o useGoldenFilter.ts (refreshInterval/dedupingInterval giong het,
// key build qua VITE_API_BASE_URL vi Project B khong cung-origin voi
// Project A o production).
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";
const fetcher = (url: string) => fetch(url).then((r) => {
  if (!r.ok) throw new Error(`Loi ${r.status}`);
  return r.json();
});

export function useEarningsData() {
  const { data, error, isLoading, mutate } = useSWR(`${API_BASE}/api/cotuc/earnings`, fetcher, {
    refreshInterval: 30 * 60 * 1000,
    revalidateOnFocus: false,
    dedupingInterval: 10 * 60 * 1000,
  });
  return { earningsData: data, isLoading, error, refresh: mutate };
}
