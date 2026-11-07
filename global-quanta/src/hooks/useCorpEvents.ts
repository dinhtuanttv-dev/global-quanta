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

/** LSK5 XD-v1: hành vi giá quanh ngày GDKHQ (MÔ TẢ). */
export interface CiX { n: number; mean: number | null; lo: number | null; hi: number | null }
export interface ExBlock { n: number; dropRatioMedian: number | null; dropRatio: CiX; fillWithin20: number | null; fillDaysMedian: number | null; neverFilled60: number | null; carPre: CiX; carAnn: CiX; carPost: CiX }
export interface ExEvent { ex: string; cash: number; yieldCum: number | null; dropRatio: number | null; fillDays: number | null; pending: boolean; carPre: number | null; carAnn: number | null; carPost: number | null }
export function useExStudyMarket(enabled = true) {
  const { data } = useSWR<{ version: string; builtAt: string; events: number; aggregate: { all: ExBlock; byYield: Record<string, ExBlock> } }>(enabled ? "corp-ex-study" : null, () => fetchMarketJson("/api/corp-events/ex-study"), { revalidateOnFocus: false, dedupingInterval: 60 * 60_000, shouldRetryOnError: false });
  return data ?? null;
}
export function useExStudyTicker(ticker: string | null) {
  const t = ticker?.toUpperCase() ?? null;
  const { data } = useSWR<{ version: string; builtAt: string; summary: { n: number; dropRatioMedian: number | null; fillDaysMedian: number | null; fillWithin20: number | null; events: ExEvent[] } | null; market: ExBlock | null }>(t ? `corp-ex-study:${t}` : null, () => fetchMarketJson(`/api/corp-events/ex-study/${encodeURIComponent(t!)}`), { revalidateOnFocus: false, dedupingInterval: 60 * 60_000, shouldRetryOnError: false });
  return data ?? null;
}
/** LSK3 bản 1: tin về phương án / kế hoạch cổ tức (MÔ TẢ). */
export interface PlanNews { date: string; title: string; status: "APPROVED" | "PROPOSED" | "RECORD"; kind: "CASH" | "STOCK" | "UNSPECIFIED"; pct: number | null; dps: number | null; none: boolean; yearInTitle: number | null }
export function usePlanNews(ticker: string | null) {
  const t = ticker?.toUpperCase() ?? null;
  const { data } = useSWR<{ ticker: string; rows: PlanNews[] }>(t ? `corp-plan-news:${t}` : null, () => fetchMarketJson(`/api/corp-events/plan-news/${encodeURIComponent(t!)}`), { revalidateOnFocus: false, dedupingInterval: 60 * 60_000, shouldRetryOnError: false });
  return data ?? null;
}
