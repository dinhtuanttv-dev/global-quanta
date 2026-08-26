import useSWR from "swr";
import type { ConvergenceResult } from "../lib/ta-command-center/detectors/convergenceEngine";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

const fetcher = (url: string) => fetch(url).then((r) => {
  if (!r.ok) throw new Error(`Loi ${r.status}`);
  return r.json();
});

interface ConvergenceScanResponse {
  generatedAt: string;
  universeSource: "VN30_VN100" | "FALLBACK_60";
  totalUniverse: number;
  results: ConvergenceResult[];
}

export function useConvergenceFilter() {
  const { data, error, isLoading, mutate } = useSWR<ConvergenceScanResponse>(
    `${API_BASE}/api/convergence-scan`,
    fetcher,
    {
      refreshInterval: 20 * 60 * 1000,
      revalidateOnFocus: false,
      dedupingInterval: 10 * 60 * 1000,
    }
  );

  return {
    results: data?.results ?? [],
    universeSource: data?.universeSource ?? "FALLBACK_60",
    totalUniverse: data?.totalUniverse ?? 0,
    isLoading, error, refresh: mutate,
  };
}
