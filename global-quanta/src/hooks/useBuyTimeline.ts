import useSWR from 'swr';
import { isRetryableSeasonality, type SeasonalityFetchError } from '../lib/cotuc/http-json';
import { buildBuyTimelineUrl, fetchBuyTimeline, type BuyTimeline } from '../lib/cotuc/buy-timeline';

/**
 * Timeline điểm mua — thanh bên Elite Command Radar gọi trên MỌI tab.
 * N3 (2026-10-17): làm mới 10 phút/lần thay vì mỗi phút. Gateway giờ quét theo đợt (mỗi giờ trong phiên, N1) và route đọc
 * qua KV theo phiên bản dữ liệu (N2), nên gọi dày hơn không thấy dữ liệu mới hơn mà chỉ giữ CSDL Neon của Project A thức.
 */
export function useBuyTimeline() {
  const { data, error, isLoading } = useSWR<BuyTimeline | null>(buildBuyTimelineUrl(), () => fetchBuyTimeline(), {
    refreshInterval: 10 * 60_000,
    dedupingInterval: 5 * 60_000,
    revalidateOnFocus: true,
    shouldRetryOnError: (err: unknown) => isRetryableSeasonality(err as SeasonalityFetchError),
    errorRetryCount: 2,
  });
  return { data: data ?? null, loading: isLoading, error: error ? String((error as Error).message ?? error) : null };
}
