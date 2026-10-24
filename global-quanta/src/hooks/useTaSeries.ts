import useSWR from "swr";
import { isMarketGatewayEnabled, marketUrl } from "../services/marketDataClient";
import type { OhlcvBar } from "../lib/ta-command-center/types";

/** Cơ sở giá của chuỗi TA (Gateway /api/market/ta-series — TA_VNINDEX_UPGRADE_SPEC §1.4). */
export type PriceBasis =
  | "ADJUSTED_CUMULATIVE"        // điều chỉnh cộng dồn theo sự kiện quyền (chuẩn cho TA)
  | "NOMINAL_UNADJUSTED"         // giá danh nghĩa, chưa điều chỉnh (thiếu dữ liệu sự kiện quyền)
  | "SSI_LATEST_EVENT_ADJUSTED"  // SSI DailyOhlc: chỉ điều chỉnh đợt quyền gần nhất
  | "INDEX_POINTS"               // điểm chỉ số
  | "LEGACY";                    // Project A /api/ohlcv (Gateway tắt)

export interface CorporateActionMark { date: string; factor: number; label: string }

/** A3 (D-01/D-02): nguồn gốc dữ liệu do Gateway gửi — trước đây bị bỏ. */
export interface SeriesProvenance {
  source: string | null; asOf: string | null; fetchedAt: string | null; isStale: boolean; fallbackReason: string | null; partialToday: boolean;
}
/** A3 (D-04/D-05): độ phủ điều chỉnh giá. */
export interface SeriesQuality { nominalCoverage?: number; eventsSkipped?: number; eventsSource?: string; flatBars?: number }

export interface TaSeries {
  bars: OhlcvBar[];
  priceBasis: PriceBasis;
  corporateActions: CorporateActionMark[];
  warnings: string[];
  quality: SeriesQuality;
  provenance: SeriesProvenance | null;
}

/** A3 (D-07): lỗi tải phân loại — mạng / không có mã / lỗi máy chủ — để báo đúng và cho thử lại. */
export type LoadErrorKind = "network" | "notFound" | "server" | "invalid";
export class SeriesLoadError extends Error {
  constructor(readonly kind: LoadErrorKind, readonly status: number | null, message: string) { super(message); this.name = "SeriesLoadError"; }
}
export const LOAD_ERROR_TEXT: Record<LoadErrorKind, string> = {
  network: "Không kết nối được máy chủ dữ liệu (mạng / Gateway đang khởi động lại).",
  notFound: "Không có dữ liệu cho mã này (mã sai, đã huỷ niêm yết hoặc chưa có lịch sử).",
  server: "Máy chủ dữ liệu đang lỗi — dữ liệu nguồn tạm thời không lấy được.",
  invalid: "Dữ liệu trả về không hợp lệ.",
};

export const TA_SERIES_RANGE = "5y";
export const TA_SERIES_LIMIT = 750; // ~3 năm phiên D (đặc tả §2.1.1); W gộp từ chuỗi này

const fetcher = async (url: string) => {
  let res: Response;
  try { res = await fetch(url); } catch { throw new SeriesLoadError("network", null, LOAD_ERROR_TEXT.network); }
  if (res.status === 404 || res.status === 400) throw new SeriesLoadError("notFound", res.status, LOAD_ERROR_TEXT.notFound);
  if (!res.ok) throw new SeriesLoadError("server", res.status, `${LOAD_ERROR_TEXT.server} (HTTP ${res.status})`);
  const body = await res.json().catch(() => null);
  if (!body || !Array.isArray(body.bars)) throw new SeriesLoadError("invalid", res.status, LOAD_ERROR_TEXT.invalid);
  return body;
};

export const PRICE_BASIS_LABEL: Record<PriceBasis, string> = {
  ADJUSTED_CUMULATIVE: "Giá điều chỉnh cộng dồn",
  NOMINAL_UNADJUSTED: "Giá danh nghĩa — CHƯA điều chỉnh",
  SSI_LATEST_EVENT_ADJUSTED: "Giá SSI — chỉ điều chỉnh đợt quyền gần nhất",
  INDEX_POINTS: "Điểm chỉ số",
  LEGACY: "Nguồn Project A",
};

export function useTaSeries(ticker: string | null) {
  const gateway = isMarketGatewayEnabled();
  const url = !ticker
    ? null
    : gateway
      ? marketUrl("/api/market/ta-series", { ticker, range: TA_SERIES_RANGE, limit: TA_SERIES_LIMIT })
      : `${import.meta.env.VITE_API_BASE_URL ?? ""}/api/ohlcv?ticker=${encodeURIComponent(ticker)}&range=1y&limit=250`;
  const { data, error, isLoading, mutate } = useSWR<Partial<TaSeries> & { bars: OhlcvBar[] }>(url, fetcher, { revalidateOnFocus: false, dedupingInterval: 60_000 });
  const p = (data as { provenance?: Partial<SeriesProvenance> } | undefined)?.provenance;
  const series: TaSeries = {
    bars: data?.bars ?? [],
    priceBasis: (data?.priceBasis as PriceBasis | undefined) ?? (gateway ? "SSI_LATEST_EVENT_ADJUSTED" : "LEGACY"),
    corporateActions: data?.corporateActions ?? [],
    warnings: data?.warnings ?? [],
    quality: (data?.quality as SeriesQuality | undefined) ?? {},
    provenance: p ? {
      source: p.source ?? null, asOf: p.asOf ?? null, fetchedAt: p.fetchedAt ?? null, isStale: Boolean(p.isStale),
      fallbackReason: p.fallbackReason ?? null, partialToday: Boolean(p.partialToday),
    } : null,
  };
  return { ...series, isLoading, error: error as SeriesLoadError | Error | undefined, retry: () => { void mutate(); } };
}
