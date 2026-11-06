import useSWR from "swr";
import { fetchMarketJson } from "../services/marketDataClient";
import type { CorpEvent, CorpEventsDoc } from "../lib/events/calendar";

/** LSK1: Lịch sự kiện doanh nghiệp từ Gateway (VNDirect + kiểm chéo CafeF), làm mới 15 phút. */
export function useCorpEvents(enabled = true) {
  const { data, error, isLoading } = useSWR<CorpEventsDoc>(enabled ? "corp-events" : null, () => fetchMarketJson<CorpEventsDoc>("/api/corp-events"), {
    revalidateOnFocus: false, dedupingInterval: 5 * 60_000, refreshInterval: 15 * 60_000,
  });
  return { data: data ?? null, error: error ? String((error as Error).message ?? error) : null, isLoading };
}

/** Toàn bộ lịch sử sự kiện của một mã. */
export function useCorpEventsTicker(ticker: string | null) {
  const t = ticker?.toUpperCase() ?? null;
  const { data } = useSWR<{ ticker: string; events: CorpEvent[] }>(t ? `corp-events:${t}` : null, () => fetchMarketJson(`/api/corp-events/ticker/${encodeURIComponent(t!)}`), { revalidateOnFocus: false, dedupingInterval: 30 * 60_000 });
  return data ?? null;
}

export interface HabitRow { t: string; usual: string; paidYears: number; years: number; lastEx: string; lastCash: number | null }
/** Nếp lịch sử (MÔ TẢ): mã thường GDKHQ cổ tức tiền trong khoảng tới nhưng kỳ này chưa công bố. */
export function useDividendHabits(days: number, enabled = true) {
  const { data } = useSWR<{ version: string; label: string; test: string; asOf: string; days: number; rows: HabitRow[] }>(enabled ? `corp-events-habits:${days}` : null, () => fetchMarketJson(`/api/corp-events/habits?days=${days}`), { revalidateOnFocus: false, dedupingInterval: 30 * 60_000 });
  return data ?? null;
}
