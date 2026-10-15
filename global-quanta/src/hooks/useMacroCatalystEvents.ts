import useSWR from "swr";
import { fetchMarketJson } from "../services/marketDataClient";
import type { MacroCalendarEvent } from "../types/catalyst";

/** Sự kiện vĩ mô từ Gateway (X3): lịch công bố ước tính, FOMC chính thức, cảnh báo/chuyển chế độ (chỉ khi có số liệu thật). */
export interface GatewayMacroEvent {
  id: string;
  kind: "release" | "fomc" | "alert" | "regime";
  title: string;
  date: string;
  daysRemaining: number;
  country: "VN" | "US";
  estimated: boolean;
  evidence: "SCHEDULE_ESTIMATE" | "OFFICIAL_SCHEDULE" | "REAL_DATA";
  level?: "info" | "warn" | "danger";
}

export interface MacroCatalystEventsResponse {
  mode: "real" | "synthetic";
  notice: string | null;
  asOf: string;
  horizonDays: number;
  caveat: string;
  events: GatewayMacroEvent[];
}

export interface UnifiedCalendarEvent {
  id: string;
  title: string;
  date: string;
  daysRemaining: number;
  kind: "release" | "fomc" | "alert" | "regime" | "policy";
  estimated: boolean;
  origin: "gateway" | "catalyst";
  level?: "info" | "warn" | "danger";
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();

/** Sự kiện lịch của engine xúc tác thuộc loại Gateway đã phủ (CPI/XNK của GSO, PMI, FOMC)? */
export function isCoveredByGateway(title: string): boolean {
  const t = norm(title);
  return t.includes("fomc") || t.includes("fed cong bo") || t.includes("cpi") || t.includes("xuat nhap khau") || t.includes("pmi");
}

/**
 * Hợp nhất lịch: Gateway là nguồn CHÍNH cho lịch công bố số liệu + FOMC (lịch tĩnh cũ của engine xúc tác ghi GSO ngày 29 —
 * đã lỗi thời từ 2025). Sự kiện chính sách khác của engine xúc tác (có ngày hiệu lực) được giữ. Gateway lỗi -> dùng lịch cũ.
 */
export function mergeMacroCalendar(catalyst: MacroCalendarEvent[], gateway: GatewayMacroEvent[] | null): UnifiedCalendarEvent[] {
  const out: UnifiedCalendarEvent[] = [];
  const seen = new Set<string>();
  const push = (e: UnifiedCalendarEvent) => {
    const key = `${e.kind}|${e.date.slice(0, 10)}|${norm(e.title)}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(e);
  };
  for (const g of gateway ?? []) {
    push({ id: g.id, title: g.title, date: g.date, daysRemaining: g.daysRemaining, kind: g.kind, estimated: g.estimated, origin: "gateway", level: g.level });
  }
  for (const c of catalyst) {
    if (gateway && isCoveredByGateway(c.title)) continue;
    const t = norm(c.title);
    const kind: UnifiedCalendarEvent["kind"] = t.includes("fomc") ? "fomc" : t.includes("cpi") || t.includes("pmi") ? "release" : "policy";
    push({ id: c.sourceId, title: c.title, date: c.executionDate, daysRemaining: c.daysRemaining, kind, estimated: false, origin: "catalyst" });
  }
  return out.sort((a, b) => a.daysRemaining - b.daysRemaining || a.date.localeCompare(b.date));
}

export function useMacroCatalystEvents(horizonDays = 60) {
  const { data, error, isLoading } = useSWR<MacroCatalystEventsResponse>(
    ["macro-catalyst-events", horizonDays],
    () => fetchMarketJson<MacroCatalystEventsResponse>("/api/macro/catalyst-events", { horizonDays }),
    { revalidateOnFocus: false, dedupingInterval: 10 * 60 * 1000 },
  );
  return { data: data ?? null, error: error as Error | undefined, isLoading };
}
