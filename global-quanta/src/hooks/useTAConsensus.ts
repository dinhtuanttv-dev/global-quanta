import { selectGoldenFilter } from "../lib/ta-command-center/golden-filter/goldenFilterEngine";
import { computeTAConsensus } from "../lib/ta-command-center/golden-filter/taConsensus";
import { useGoldenFilter } from "./useGoldenFilter";
import { useConvergenceFilter } from "./useConvergenceFilter";

export function useTAConsensus() {
  const goldenState = useGoldenFilter();
  const convState = useConvergenceFilter();

  const isLoading = goldenState.isLoading || convState.isLoading;
  const hasData = goldenState.goldenFilter.length > 0 || convState.results.length > 0;

  const { results, intersectionCount } = hasData
    ? computeTAConsensus(goldenState.goldenFilter, convState.results)
    : { results: [], intersectionCount: 0 };

  return {
    results: results.slice(0, 20),
    intersectionCount,
    goldenCount: goldenState.goldenFilter.length,
    convergenceCount: convState.results.length,
    isLoading,
    error: goldenState.error ?? convState.error,
  };
}
