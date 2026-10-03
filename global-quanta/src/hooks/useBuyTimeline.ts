import useSWR from 'swr';
import { isRetryableSeasonality, type SeasonalityFetchError } from '../lib/cotuc/http-json';
import { buildBuyTimelineUrl, fetchBuyTimeline, type BuyTimeline } from '../lib/cotuc/buy-timeline';

/** Timeline điểm mua — tự làm mới mỗi phút (Gateway quét liên tục cập nhật dữ liệu nguồn). */
export function useBuyTimeline() {
  const { data, error, isLoading } = useSWR<BuyTimeline | null>(buildBuyTimelineUrl(), () => fetchBuyTimeline(), {
    refreshInterval: 60_000,
    dedupingInterval: 30_000,
    revalidateOnFocus: true,
    shouldRetryOnError: (err: unknown) => isRetryableSeasonality(err as SeasonalityFetchError),
    errorRetryCount: 2,
  });
  return { data: data ?? null, loading: isLoading, error: error ? String((error as Error).message ?? error) : null };
}
