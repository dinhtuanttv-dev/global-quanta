import useSWR from "swr";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";
const fetcher = (url: string) => fetch(url).then((r) => {
  if (!r.ok) throw new Error(`Loi ${r.status}`);
  return r.json();
});

export type DividendEventType = "CASH" | "STOCK_DIVIDEND" | "BONUS_ISSUE" | "ESOP";

export interface DividendLifecycleEvent {
  ticker: string;
  eventType: DividendEventType;
  eventTitleVi: string;
  publicDate: string | null;
  agmDate: string | null;
  exrightDate: string | null;
  recordDate: string | null;
  settlementDate: string | null;
  valuePerShare: number | null;
  exerciseRatio: number | null;
}

export function useDividendEvents() {
  const { data, error, isLoading, mutate } = useSWR(`${API_BASE}/api/cotuc/events`, fetcher, {
    refreshInterval: 30 * 60 * 1000,
    revalidateOnFocus: false,
    dedupingInterval: 10 * 60 * 1000,
  });

  // Tra ve map { ticker: { exDate, agmDate } } de CotucTab de merge voi data tinh
  const realDatesMap: Record<string, { exDate: string | null; agmDate: string | null }> = {};
  // P1 (UI Timeline): map moi { ticker: DividendLifecycleEvent[] } - 5
  // moc thuc te da chuan hoa + phan loai, dung cho panel "Vong doi co
  // tuc" trong Modal chi tiet.
  const lifecycleEventsMap: Record<string, DividendLifecycleEvent[]> = {};
  if (data?.results) {
    data.results.forEach((r: any) => {
      if (!r.available) return;
      const exEvent = r.exDividendEvents?.[0]; // Su kien gan nhat
      const agmEvent = r.agmEvents?.[0];
      realDatesMap[r.ticker] = {
        exDate: exEvent?.exerciseDate ?? null,
        agmDate: agmEvent?.exerciseDate ?? null,
      };
      lifecycleEventsMap[r.ticker] = r.lifecycleEvents ?? [];
    });
  }

  return { eventsData: data, realDatesMap, lifecycleEventsMap, isLoading, error, refresh: mutate };
}
