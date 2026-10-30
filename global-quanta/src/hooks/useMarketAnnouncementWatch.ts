import useSWR from "swr";
import type { MarketAnnouncementFinding } from "../types/catalyst";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";
const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useMarketAnnouncementWatch() {
  const { data, isLoading } = useSWR<{ findings: MarketAnnouncementFinding[] }>(
    `${API_BASE}/api/catalysts/vn30-review-latest`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 10 * 60 * 1000 }
  );
  return { findings: data?.findings ?? [], isLoading };
}
