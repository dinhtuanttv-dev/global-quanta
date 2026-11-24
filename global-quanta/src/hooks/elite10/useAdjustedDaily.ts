import useSWR from "swr";
import { isMarketGatewayEnabled, marketUrl } from "../../services/marketDataClient";
import type { DailyBar } from "../../lib/elite10/timingSpace";

export interface CorporateMark { date: string; factor: number; label: string }
interface Resp {
  bars: (DailyBar & { open: number; high: number; low: number; partial?: boolean })[];
  corporateActions?: CorporateMark[];
  priceBasis?: string;
  warnings?: string[];
  gapRepairs?: { date: string }[];
}
const EMPTY_BARS: Resp["bars"] = [];
const EMPTY_MARKS: CorporateMark[] = [];
const EMPTY_WARNINGS: string[] = [];
const EMPTY_REPAIRS: { date: string }[] = [];

/**
 * Nến ngày ĐIỀU CHỈNH cổ tức tiền + cổ phiếu thưởng / chia tách (Gateway /ta-series, ADJUSTED_CUMULATIVE — cùng cơ sở giá chart TA,
 * cùng "giá tổng lợi suất" của engine v3); giá trị GD giữ danh nghĩa. Thay /ohlcv (chưa điều chỉnh kịp: FPT thưởng CP 10% ngày
 * 21/09/2026 tạo bước giảm giả −9% trong đường kỳ tới / quạt). 1.300 phiên (~5 năm) để phủ các đợt sự kiện cũ.
 */
export function useAdjustedDaily(ticker: string | null, refresh = false) {
  const url = ticker && isMarketGatewayEnabled() ? marketUrl("/api/market/ta-series", { ticker, range: "5y", limit: 1300 }) : null;
  const { data, error, isLoading, mutate } = useSWR<Resp>(url, (u: string) => fetch(u, { signal: AbortSignal.timeout(9_000) }).then(async (r) => {
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((body as { error?: string }).error ?? `API lỗi ${r.status}`);
    if (!Array.isArray(body.bars)) throw new Error("Gateway trả chuỗi giá sai hợp đồng.");
    return body as Resp;
  }), { revalidateOnFocus: refresh, refreshInterval: refresh ? 60_000 : 0, dedupingInterval: 60_000, errorRetryCount: 1 });
  return { bars: data?.bars ?? EMPTY_BARS, corporateActions: data?.corporateActions ?? EMPTY_MARKS, priceBasis: data?.priceBasis ?? null,
    warnings: data?.warnings ?? EMPTY_WARNINGS, gapRepairs: data?.gapRepairs ?? EMPTY_REPAIRS, isLoading: Boolean(url) && isLoading, error, refresh: mutate };
}
