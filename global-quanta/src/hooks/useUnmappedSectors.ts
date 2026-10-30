import useSWR from "swr";
import type { UnmappedSectorsResponse } from "../types/catalyst";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";
const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useUnmappedSectors() {
  const { data, error, isLoading } = useSWR<UnmappedSectorsResponse>(
    `${API_BASE}/api/catalysts/unmapped-sectors`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 5 * 60 * 1000 }
  );
  return { items: data?.items ?? [], totalUnique: data?.totalUnique ?? 0, isLoading, error };
}
