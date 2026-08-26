import useSWR from "swr";
import { selectGoldenFilter } from "../lib/ta-command-center/golden-filter/goldenFilterEngine";
import { intersectGoldenFilterAndTop20 } from "../lib/ta-command-center/golden-filter/intersectAnalysis";

const fetcher = (url: string) => fetch(url).then((r) => {
  if (!r.ok) throw new Error(`Loi ${r.status}`);
  return r.json();
});

export function useGoldenFilter() {
  const { data, error, isLoading, mutate } = useSWR(`${import.meta.env.VITE_API_BASE_URL ?? ""}/api/golden-filter`, fetcher, {
    refreshInterval: 20 * 60 * 1000,
    revalidateOnFocus: false,
    dedupingInterval: 10 * 60 * 1000,
  });

  const goldenFilter = data ? selectGoldenFilter(data.patternMatches, 20) : [];
  const top20Tech = data?.top20Tech ?? [];
  const { results: intersectResults, intersectionCount } = data
    ? intersectGoldenFilterAndTop20(goldenFilter, top20Tech)
    : { results: [], intersectionCount: 0 };

  return {
    goldenFilter, top20Tech, intersectResults, intersectionCount,
    universeSource: data?.universeSource ?? "FALLBACK_60",
    isLoading, error, refresh: mutate,
  };
}
