import useSWR from 'swr';
import { fetchValidatedJson, isRetryableSeasonality, type SeasonalityFetchError } from '../lib/cotuc/http-json';
import { buildBuyTimelineUrl, fetchBuyTimeline, parseBuyTimeline, type BuyTimeline } from '../lib/cotuc/buy-timeline';
import { isMarketGatewayEnabled, marketUrl } from '../services/marketDataClient';

/**
 * Timeline điểm mua — thanh bên Elite Command Radar gọi trên MỌI tab.
 * N3 (2026-10-17): làm mới 10 phút/lần thay vì mỗi phút. Gateway giờ quét theo đợt (mỗi giờ trong phiên, N1) và route đọc
 * qua KV theo phiên bản dữ liệu (N2), nên gọi dày hơn không thấy dữ liệu mới hơn mà chỉ giữ CSDL Neon của Project A thức.
 */

/**
 * Mở khoá hẹp F0 (27/11/2026, theo quyết định của chủ dự án): CHỈ thêm nguồn dự phòng. Project A vẫn là nguồn chính, không đổi;
 * khi Project A lỗi (hoặc không trả dữ liệu), đọc bản Timeline Gateway tự tính từ kho (/api/cotuc-store/buy-timeline — trùng 169/169 dòng
 * với Project A ngày 27/11) và kiểm bằng CÙNG hàm parseBuyTimeline. Gateway cũng lỗi -> báo lỗi gốc của Project A như trước.
 * Không đổi giao diện, logic, tham số làm mới.
 */
export async function fetchBuyTimelineWithFallback(): Promise<BuyTimeline | null> {
  let primaryError: unknown = null;
  try {
    const data = await fetchBuyTimeline();
    if (data) return data;
  } catch (error) {
    primaryError = error;
  }
  if (isMarketGatewayEnabled()) {
    try {
      const fallback = await fetchValidatedJson(marketUrl('/api/cotuc-store/buy-timeline'), parseBuyTimeline, 'buy-timeline');
      if (fallback) return fallback;
    } catch {
      /* Gateway cũng lỗi: giữ lỗi gốc của Project A */
    }
  }
  if (primaryError) throw primaryError;
  return null;
}

export function useBuyTimeline() {
  const { data, error, isLoading } = useSWR<BuyTimeline | null>(buildBuyTimelineUrl(), fetchBuyTimelineWithFallback, {
    refreshInterval: 10 * 60_000,
    dedupingInterval: 5 * 60_000,
    revalidateOnFocus: true,
    shouldRetryOnError: (err: unknown) => isRetryableSeasonality(err as SeasonalityFetchError),
    errorRetryCount: 2,
  });
  return { data: data ?? null, loading: isLoading, error: error ? String((error as Error).message ?? error) : null };
}
