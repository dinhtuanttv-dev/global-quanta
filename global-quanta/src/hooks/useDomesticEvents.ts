import useSWR from "swr";
import type { DomesticEvent } from "../types/catalyst";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";
const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useDomesticEvents() {
  const { data, error, isLoading } = useSWR<{ events: DomesticEvent[] }>(
    `${API_BASE}/api/catalysts/domestic-events`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 5 * 60 * 1000 }
  );
  return { events: data?.events ?? [], isLoading, error };
}
