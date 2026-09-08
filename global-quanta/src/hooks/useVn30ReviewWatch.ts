import useSWR from "swr";
import type { Vn30ReviewFinding } from "../types/catalyst";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";
const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useVn30ReviewWatch() {
  const { data, isLoading } = useSWR<{ finding: Vn30ReviewFinding | null }>(
    `${API_BASE}/api/catalysts/vn30-review-latest`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 10 * 60 * 1000 }
  );
  return { finding: data?.finding ?? null, isLoading };
}
