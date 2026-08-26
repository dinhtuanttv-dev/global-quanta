import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => {
  if (!r.ok) throw new Error(`Loi ${r.status}`);
  return r.json();
});

export function usePatternScan() {
  const { data, error, isLoading, mutate } = useSWR(`${import.meta.env.VITE_API_BASE_URL ?? ""}/api/pattern-scan`, fetcher, {
    refreshInterval: 15 * 60 * 1000,
    revalidateOnFocus: false,
    dedupingInterval: 10 * 60 * 1000,
  });
  return { scanData: data, isLoading, error, refresh: mutate };
}
