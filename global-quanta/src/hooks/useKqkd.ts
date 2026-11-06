import useSWR from "swr";
import { fetchMarketJson } from "../services/marketDataClient";
import type { KqLedger, KqkdCalendar, KqkdDetail, KqkdSummary, SeasonLedger, SeasonMap, SeasonalityBundle } from "../lib/kqkd/types";

/** K6 (06/11/2026): KQKD theo quý — bảng toàn thị trường (Gateway /api/fundamentals/kqkd/summary). */
export function useKqkdSummary(enabled = true) {
  const { data, error, isLoading } = useSWR<KqkdSummary>(enabled ? "kqkd-summary" : null, () => fetchMarketJson<KqkdSummary>("/api/fundamentals/kqkd/summary"), {
    revalidateOnFocus: false, dedupingInterval: 10 * 60_000, refreshInterval: 30 * 60_000,
  });
  return { data: data ?? null, error: error ? String((error as Error).message ?? error) : null, isLoading };
}

/** LC-v1: lịch công bố KQKD (mùa hiện tại + kế tiếp). */
export function useKqkdCalendar(enabled = true) {
  const { data, error, isLoading } = useSWR<KqkdCalendar>(enabled ? "kqkd-calendar" : null, () => fetchMarketJson<KqkdCalendar>("/api/fundamentals/kqkd/calendar"), {
    revalidateOnFocus: false, dedupingInterval: 10 * 60_000, refreshInterval: 30 * 60_000,
  });
  return { data: data ?? null, error: error ? String((error as Error).message ?? error) : null, isLoading };
}

/** S7: gói Mùa vụ KQKD của một mã (9 API Project A + kiểm ngày làm mốc + bối cảnh kỳ tới) trong 1 lần gọi Gateway. */
export function useSeasonalityBundle(ticker: string | null) {
  const t = ticker?.toUpperCase() ?? null;
  const { data, error, isLoading } = useSWR<SeasonalityBundle>(t ? `kqkd-season:${t}` : null, () => fetchMarketJson<SeasonalityBundle>(`/api/fundamentals/kqkd/seasonality/${encodeURIComponent(t!)}`), {
    revalidateOnFocus: false, dedupingInterval: 30 * 60_000, shouldRetryOnError: false,
  });
  return { data: data ?? null, error: error ? String((error as Error).message ?? error) : null, isLoading };
}

/** S2: bản đồ mùa vụ toàn thị trường (dựng mỗi tuần trên Gateway). */
export function useSeasonMap(enabled = true) {
  const { data, error, isLoading } = useSWR<SeasonMap>(enabled ? "kqkd-season-map" : null, () => fetchMarketJson<SeasonMap>("/api/fundamentals/kqkd/season-map"), { revalidateOnFocus: false, dedupingInterval: 30 * 60_000, shouldRetryOnError: false });
  return { data: data ?? null, error: error ? String((error as Error).message ?? error) : null, isLoading };
}

/** S6: sổ theo dõi cửa sổ THEO DÕI / ĐẠT (ghi một lần trước kỳ, chấm sau khi đủ phiên). */
export function useSeasonLedger(enabled = true) {
  const { data, error, isLoading } = useSWR<SeasonLedger>(enabled ? "kqkd-season-ledger" : null, () => fetchMarketJson<SeasonLedger>("/api/fundamentals/kqkd/season-ledger"), { revalidateOnFocus: false, dedupingInterval: 30 * 60_000, shouldRetryOnError: false });
  return { data: data ?? null, error: error ? String((error as Error).message ?? error) : null, isLoading };
}

/** KQ-L1: sổ theo dõi tiến (ghi một lần, chấm sau 60 phiên). */
export function useKqkdLedger(enabled = true) {
  const { data, error } = useSWR<KqLedger>(enabled ? "kqkd-ledger" : null, () => fetchMarketJson<KqLedger>("/api/fundamentals/kqkd/ledger"), { revalidateOnFocus: false, dedupingInterval: 30 * 60_000 });
  return { data: data ?? null, error: error ? String((error as Error).message ?? error) : null };
}

/** Chi tiết một mã (ma trận quý & lũy kế, thác nước, chất lượng, mùa vụ, 3D/4D). */
export function useKqkdTicker(ticker: string | null) {
  const t = ticker?.toUpperCase() ?? null;
  const { data, error, isLoading } = useSWR<KqkdDetail>(t ? `kqkd-ticker:${t}` : null, () => fetchMarketJson<KqkdDetail>(`/api/fundamentals/kqkd/ticker/${encodeURIComponent(t!)}`), {
    revalidateOnFocus: false, dedupingInterval: 10 * 60_000,
  });
  return { data: data ?? null, error: error ? String((error as Error).message ?? error) : null, isLoading };
}
