// Định dạng + kiểu dữ liệu dùng chung cho phần nghiên cứu sự kiện (Event Radar · Phân tích chuyên sâu) — 30/10/2026,
// chuyển từ Quant Edge của tab Siêu quét AI. Một chỗ cho H1 nhanh (thẻ sự kiện) và H1 đầy đủ.

export type EventTimeSource = "publisher_timestamp" | "gateway_first_seen";

/** Kết quả /api/market/research/event-reaction (đủ trường cho bản đầy đủ; bản nhanh chỉ dùng một phần). */
export interface EventReactionStudy {
  status?: string;
  kind?: string; symbol?: string; eventDate?: string; eventLabel?: string;
  event: {
    stockReturn: number | null; benchmarkReturn?: number | null; excessReturn: number | null;
    abnormalVolumeRatio: number | null; intradayRangePct?: number | null; closeLocation?: number | null;
    tickFlow?: { minutes: number; classifiedShare: number | null; signedImbalance: number | null; method: string } | null;
    absorptionInterpretation: string;
  };
  drift: { horizon: number; status: string; stockReturn?: number | null; benchmarkReturn?: number | null; excessReturn: number | null }[];
  meta: {
    asOf: string | null; source?: string | null; priceBasis?: string | null; methodVersion: string; warnings: string[];
    sourceEventDate?: string | null; eventSessionDate?: string | null; timeMappingReason?: string | null;
  };
}

/** Sự kiện chuyển từ Radar sang phân tích chuyên sâu (điền sẵn H1 đúng thời điểm công bố). */
export interface EventSeed {
  symbol: string | null;
  eventDate: string;
  eventLabel: string;
  eventTimestamp: string;
  eventTimeSource: EventTimeSource;
}

const finite = (v: number | null | undefined): v is number => v !== null && v !== undefined && Number.isFinite(v);

export const signedPct = (v: number | null | undefined, digits = 1) => finite(v) ? `${v >= 0 ? "+" : "−"}${Math.abs(v * 100).toFixed(digits)}%` : "—";
export const plainPct = (v: number | null | undefined) => finite(v) ? `${(v * 100).toFixed(0)}%` : "—";
export const ratio = (v: number | null | undefined) => finite(v) ? `${v.toFixed(2)}×` : "—";

/** Ngày lịch VN (YYYY-MM-DD) của một thời điểm ISO; sai định dạng -> "". */
export function vnDate(value: string | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "";
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export const vnDateTime = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }) : "Chưa có thời điểm";

/** Hôm nay theo giờ VN — chặn trên cho ô ngày sự kiện. */
export const vnToday = () => vnDate(new Date().toISOString());

/** Dựng hạt giống H1 từ một sự kiện Radar. */
export function seedFromEvent(event: { tickers: string[]; publishedAt: string | null; firstSeenAt: string; eventLabel: string; title: string }): EventSeed {
  const eventTimestamp = event.publishedAt ?? event.firstSeenAt;
  return {
    symbol: event.tickers[0]?.toUpperCase() ?? null,
    eventDate: vnDate(eventTimestamp),
    eventLabel: (event.eventLabel || event.title).slice(0, 100),
    eventTimestamp,
    eventTimeSource: event.publishedAt ? "publisher_timestamp" : "gateway_first_seen",
  };
}

/** Nhóm sự kiện vĩ mô / toàn thị trường của Event Radar (Gateway, radar-classify-v2). */
export const MACRO_EVENT_TYPES = ["MACRO_NEWS", "MONETARY_POLICY", "FISCAL_POLICY", "MACRO_DATA", "SYSTEMIC_STRESS", "MARKET_STRUCTURE"] as const;
