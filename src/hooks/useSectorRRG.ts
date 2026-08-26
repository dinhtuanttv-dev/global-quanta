import useSWR from "swr";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";
const fetcher = (url: string) => fetch(url).then((r) => {
  if (!r.ok) throw new Error(`Loi ${r.status}`);
  return r.json();
});

export interface RRGPoint {
  sectorKey: string;
  sectorLabel: string;
  rsRatio: number;
  rsMomentum: number;
  quadrant: "Leading" | "Improving" | "Weakening" | "Lagging";
}

export interface RRGResponse {
  generatedAt: string;
  benchmark: string;
  points: RRGPoint[];
}

export function useSectorRRG() {
  const { data, error, isLoading, mutate } = useSWR<RRGResponse>(
    `${API_BASE}/api/sector-filter/rrg`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 15 * 60 * 1000 }
  );
  return { rrgData: data, error, isLoading, refresh: mutate };
}