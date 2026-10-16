// Hợp đồng dữ liệu Gateway /api/commodities/* (backend/src/market/commodities).
export type CommodityFreq = "day" | "month";

export interface CommoditySource {
  kind: "yahoo" | "wb" | "none";
  labelVi: string;
  symbol?: string;
  column?: string;
  updatedOn?: string | null;
  fetchedAt?: string | null;
}

export interface CommodityItem {
  id: string;
  nameVi: string;
  group: string;
  unit: string;
  sectorKey: string | null;
  vnPrice: boolean;
  twoWayVi: string | null;
  vnTickers: string[];
  available: boolean;
  freq: CommodityFreq | null;
  source: CommoditySource;
  reasonVi?: string;
  value?: number;
  /** "YYYY-MM-DD" (ngày) hoặc "YYYY-MM" (tháng) */
  period?: string;
  change?: { pct: number | null; basisVi: string };
  yoyPct?: number | null;
  history?: [string, number][];
}

export interface CommoditySnapshot {
  generatedAt: string;
  pinkSheet: { updatedOn: string | null; lastPeriod: string | null; fetchedAt: string; url: string; lastError: string | null } | null;
  items: CommodityItem[];
}

/** "2026-10-15" -> "15/10/2026"; "2026-09" -> "09/2026". */
export function fmtPeriod(p: string | undefined | null): string {
  if (!p) return "—";
  const [y, m, d] = p.split("-");
  return d ? `${d}/${m}/${y}` : `${m}/${y}`;
}

/** Số theo kiểu Việt Nam, số chữ số thập phân tuỳ độ lớn. */
export function fmtPrice(v: number | undefined | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const d = Math.abs(v) >= 1000 ? 0 : Math.abs(v) >= 100 ? 1 : 2;
  return v.toLocaleString("vi-VN", { minimumFractionDigits: d, maximumFractionDigits: d });
}

export function fmtPct(v: number | undefined | null, d = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toLocaleString("vi-VN", { minimumFractionDigits: d, maximumFractionDigits: d })}%`;
}

/**
 * Số liệu cũ? Ngày: phiên cuối cách hôm nay > 5 ngày. Tháng: bản Pink Sheet công bố > 45 ngày (chu kỳ công bố ~1 tháng).
 * Trả số ngày nếu cũ, null nếu bình thường.
 */
export function staleDays(item: Pick<CommodityItem, "freq" | "period" | "source">, now = Date.now()): number | null {
  const ref = item.freq === "month" ? item.source.updatedOn : item.period;
  if (!ref) return null;
  const days = Math.floor((now - Date.parse(ref)) / 86_400_000);
  return days > (item.freq === "month" ? 45 : 5) ? days : null;
}
