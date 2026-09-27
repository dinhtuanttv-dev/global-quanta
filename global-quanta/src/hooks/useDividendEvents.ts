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

  // Tra ve map { ticker: { exDate, agmDate, paymentDate } } de CotucTab de merge voi data tinh
  // paymentDate (Giai doan them cot "Thanh Toan" o Screener, 2026-09-27):
  // lay tu settlementDate cua CHINH exEvent gan nhat (ngay tien/CP thuc
  // te ve tai khoan sau dot GDKHQ do) - da co san trong API tra ve
  // (dung o DividendTimelinePanel "Vong doi co tuc"), truoc day CHUA
  // duoc trich vao map nay nen 17 ma theo doi chinh van hien paymentDate
  // MAU (hardcode) o bang Screener/Modal thay vi du lieu thuc.
  const realDatesMap: Record<string, { exDate: string | null; agmDate: string | null; paymentDate: string | null }> = {};
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
        paymentDate: exEvent?.settlementDate ?? null,
      };
      lifecycleEventsMap[r.ticker] = r.lifecycleEvents ?? [];
    });
  }

  return { eventsData: data, realDatesMap, lifecycleEventsMap, isLoading, error, refresh: mutate };
}
