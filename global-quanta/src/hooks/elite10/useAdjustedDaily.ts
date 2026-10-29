import useSWR from "swr";
import { isMarketGatewayEnabled, marketUrl } from "../../services/marketDataClient";
import type { DailyBar } from "../../lib/elite10/timingSpace";

export interface CorporateMark { date: string; factor: number; label: string }
interface Resp { bars: (DailyBar & { open: number; high: number; low: number })[]; corporateActions?: CorporateMark[]; priceBasis?: string }

/**
 * Nến ngày ĐIỀU CHỈNH cổ tức tiền + cổ phiếu thưởng / chia tách (Gateway /ta-series, ADJUSTED_CUMULATIVE — cùng cơ sở giá chart TA,
 * cùng "giá tổng lợi suất" của engine v3); giá trị GD giữ danh nghĩa. Thay /ohlcv (chưa điều chỉnh kịp: FPT thưởng CP 10% ngày
 * 21/09/2026 tạo bước giảm giả −9% trong đường kỳ tới / quạt). 1.300 phiên (~5 năm) để phủ các đợt sự kiện cũ.
 */
export function useAdjustedDaily(ticker: string | null) {
  const url = ticker && isMarketGatewayEnabled() ? marketUrl("/api/market/ta-series", { ticker, range: "5y", limit: 1300 }) : null;
  const { data, error, isLoading } = useSWR<Resp>(url, (u: string) => fetch(u).then(async (r) => {
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((body as { error?: string }).error ?? `API lỗi ${r.status}`);
    return body as Resp;
  }), { revalidateOnFocus: false, dedupingInterval: 60_000 });
  return { bars: data?.bars ?? [], corporateActions: data?.corporateActions ?? [], priceBasis: data?.priceBasis ?? null, isLoading: Boolean(url) && isLoading, error };
}
