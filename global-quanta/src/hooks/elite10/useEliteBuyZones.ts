import useSWR from "swr";
import { fetchMarketJson, isMarketGatewayEnabled } from "../../services/marketDataClient";
import type { TimelineRow } from "../../lib/cotuc/buy-timeline";

/** Vùng mua của Elite 10: như dòng Timeline (tab Cổ tức) + bậc THĂM DÒ (cửa sổ tối ưu chưa qua kiểm định). */
export type ZoneTier = "VALIDATED" | "NEAR" | "EXPLORATORY";
export type ZoneRow = Omit<TimelineRow, "tier"> & { tier: ZoneTier };
interface ZonesResponse { today: string; tickers: string[]; rows: ZoneRow[]; notInUniverse: string[] }

const isRow = (r: unknown): r is ZoneRow => {
  const x = r as ZoneRow;
  return Boolean(x && typeof x.ticker === "string" && ["VALIDATED", "NEAR", "EXPLORATORY"].includes(x.tier) && ["UPCOMING", "IN_WINDOW", "PASSED"].includes(x.status)
    && /^\d{4}-\d{2}-\d{2}$/.test(x.entryFromDate) && /^\d{4}-\d{2}-\d{2}$/.test(x.entryToDate) && /^\d{4}-\d{2}-\d{2}$/.test(x.exitDate) && Array.isArray(x.missing));
};

/**
 * Vùng mua TỐI ƯU của các mã Elite 10 từ kho Cổ tức (Gateway /api/elite/buy-zones — cùng dữ liệu + cùng hàm với Timeline điểm mua tối ưu).
 * Endpoint chưa có / lỗi -> null (giao diện dùng Timeline như cũ). Dòng sai hợp đồng bị bỏ riêng.
 */
export function useEliteBuyZones(tickers: string[]) {
  const key = [...new Set(tickers.filter((t) => /^[A-Z][A-Z0-9]{2}$/.test(t)))].sort().join(",");
  const { data, error, isLoading } = useSWR(key && isMarketGatewayEnabled() ? ["elite-buy-zones", key] : null, async () => {
    const r = await fetchMarketJson<ZonesResponse>(`/api/elite/buy-zones?tickers=${key}`);
    return { ...r, rows: (r.rows ?? []).filter(isRow) };
  }, { revalidateOnFocus: false, dedupingInterval: 2 * 60_000, refreshInterval: 10 * 60_000, shouldRetryOnError: false });
  return { zones: data ?? null, error, isLoading };
}
