import useSWR from "swr";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";
const fetcher = (url: string) => fetch(url).then((r) => {
  if (!r.ok) throw new Error(`Loi ${r.status}`);
  return r.json();
});

export function useDividendEvents() {
  const { data, error, isLoading, mutate } = useSWR(`${API_BASE}/api/cotuc/events`, fetcher, {
    refreshInterval: 30 * 60 * 1000,
    revalidateOnFocus: false,
    dedupingInterval: 10 * 60 * 1000,
  });

  // Tra ve map { ticker: { exDate, agmDate } } de CotucTab de merge voi data tinh
  const realDatesMap: Record<string, { exDate: string | null; agmDate: string | null }> = {};
  if (data?.results) {
    data.results.forEach((r: any) => {
      if (!r.available) return;
      const exEvent = r.exDividendEvents?.[0]; // Su kien gan nhat
      const agmEvent = r.agmEvents?.[0];
      realDatesMap[r.ticker] = {
        exDate: exEvent?.exerciseDate ?? null,
        agmDate: agmEvent?.exerciseDate ?? null,
      };
    });
  }

  return { eventsData: data, realDatesMap, isLoading, error, refresh: mutate };
}
