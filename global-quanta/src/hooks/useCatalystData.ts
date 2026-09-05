import useSWR from "swr";
import type { CatalystSnapshot, CatalystErrorResponse } from "../types/catalyst";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useCatalystData() {
  const { data, error, isLoading, mutate } = useSWR<CatalystSnapshot | CatalystErrorResponse>(
    `${API_BASE}/api/catalysts/latest`,
    fetcher,
    { refreshInterval: 5 * 60 * 1000, revalidateOnFocus: false, dedupingInterval: 60 * 1000 }
  );

  const hasError = data && "error" in data;
  const snapshot = data && !hasError ? (data as CatalystSnapshot) : null;
  const errorBody = hasError ? (data as CatalystErrorResponse) : null;
  // "transient" = loi Redis tam thoi (503) - nen khuyen khich thu lai.
  // Khac voi "chua co du lieu" (binh thuong, chi can doi lan quet dau tien).
  const isTransientError = !!(errorBody && (errorBody as any).transient === true);

  return {
    snapshot,
    noDataYet: !isTransientError ? errorBody?.error ?? null : null,
    transientError: isTransientError ? errorBody?.error ?? null : null,
    isLoading, error, refresh: mutate,
  };
}
