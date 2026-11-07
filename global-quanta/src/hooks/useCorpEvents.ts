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

/** BL6: sổ theo dõi tiến BL-L1 của mô hình nhân tố FM-v1 — mỗi tháng ghi điểm + ngũ phân vị mọi mã, chấm lợi nhuận sau 12 tháng. */
export interface FmCohort { month: string; recordedAt: string; n: number; result: { scoredAt: string; n: number; byQuintile: Record<string, number | null>; spread: number | null } | null }
export function useFmLedger(enabled = true) {
  const { data } = useSWR<{ version: string; cohorts: FmCohort[] }>(enabled ? "fm-ledger" : null, () => fetchMarketJson("/api/corp-events/fm-ledger"), { revalidateOnFocus: false, dedupingInterval: 60 * 60_000, shouldRetryOnError: false });
  return data ?? null;
}

/** TO-v1: Săn cổ tức trước GDKHQ — radar + tham chiếu + sổ TO-L1 (làm mới 15 phút), mô phỏng danh mục, W1–W5 (MÔ TẢ). */
export function useToOverview(enabled = true) {
  const { data, error, isLoading } = useSWR<import("../lib/cotuc/to").ToOverview>(enabled ? "to-overview" : null, () => fetchMarketJson("/api/corp-events/to"), { revalidateOnFocus: false, dedupingInterval: 5 * 60_000, refreshInterval: 15 * 60_000, shouldRetryOnError: false });
  return { data: data ?? null, error: error ? String((error as Error).message ?? error) : null, isLoading };
}
export function useToSim(enabled = true) {
  const { data } = useSWR<import("../lib/cotuc/to").ToSim>(enabled ? "to-sim" : null, () => fetchMarketJson("/api/corp-events/to/sim"), { revalidateOnFocus: false, dedupingInterval: 30 * 60_000, shouldRetryOnError: false });
  return data ?? null;
}
/** Elite × TO: mọi đợt cổ tức tiền của một mã (điều kiện TO-r1, kết quả tới phiên cuối còn quyền, phần sau GDKHQ 5 phiên). */
export function useToTicker(ticker: string | null) {
  const t = ticker && /^[A-Z0-9]{3,10}$/.test(ticker.toUpperCase()) ? ticker.toUpperCase() : null;
  const { data, error } = useSWR<import("../lib/cotuc/to").ToTickerHistory>(t ? `to-ticker:${t}` : null, () => fetchMarketJson(`/api/corp-events/to/ticker/${encodeURIComponent(t!)}`), { revalidateOnFocus: false, dedupingInterval: 30 * 60_000, shouldRetryOnError: false });
  return { data: data ?? null, error: error ? String((error as Error).message ?? error) : null };
}
export function useToWindows(ticker: string | null) {
  const t = ticker?.toUpperCase() ?? null;
  const { data } = useSWR<import("../lib/cotuc/to").ToWindows>(`to-windows:${t ?? "*"}`, () => fetchMarketJson(t ? `/api/corp-events/to/windows/${encodeURIComponent(t)}` : "/api/corp-events/to/windows"), { revalidateOnFocus: false, dedupingInterval: 60 * 60_000, shouldRetryOnError: false });
  return data ?? null;
}

/** BL1: dữ liệu Bộ lọc cổ phiếu (DS-v1, Gateway) — giá, cổ tức, cơ bản, chất lượng, giá quanh GDKHQ cho cả danh mục. */
export function useDividendScreener(enabled = true) {
  const { data, error, isLoading } = useSWR<import("../lib/cotuc/dsStocks").DsDoc>(enabled ? "dividend-screener" : null, () => fetchMarketJson("/api/corp-events/screener"), { revalidateOnFocus: false, dedupingInterval: 5 * 60_000, refreshInterval: 15 * 60_000 });
  return { data: data ?? null, error: error ? String((error as Error).message ?? error) : null, isLoading };
}
