import useSWR from 'swr';
import { isRetryableSeasonality, type SeasonalityFetchError } from '../lib/cotuc/http-json';
import { buildBuyTimelineUrl, fetchBuyTimeline, type BuyTimeline } from '../lib/cotuc/buy-timeline';

/**
 * Timeline điểm mua — làm mới mỗi 10 phút. Hook này chạy trong thanh bên Elite Command Radar trên MỌI tab: trước đây làm mới
 * mỗi phút + mỗi lần focus cửa sổ, mỗi lượt đọc nguyên snapshot của ~281 mã trên Supabase (vượt quota egress 10/2026).
 * Server nay đệm 10 phút + CDN 10 phút, nên làm mới dày hơn cũng không có dữ liệu mới hơn.
 */
export function useBuyTimeline() {
  const { data, error, isLoading } = useSWR<BuyTimeline | null>(buildBuyTimelineUrl(), () => fetchBuyTimeline(), {
    refreshInterval: 10 * 60_000,
    dedupingInterval: 5 * 60_000,
    revalidateOnFocus: false,
    shouldRetryOnError: (err: unknown) => isRetryableSeasonality(err as SeasonalityFetchError),
    errorRetryCount: 2,
  });
  return { data: data ?? null, loading: isLoading, error: error ? String((error as Error).message ?? error) : null };
}
