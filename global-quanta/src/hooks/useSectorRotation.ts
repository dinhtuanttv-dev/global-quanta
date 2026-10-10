// Lọc ngành (L4) — dữ liệu xoay vòng ngành: RRG tuần ICB (Gateway), phân ngành mã -> ICB (Gateway), chi tiết một ngành (Project A).
import useSWR from "swr";
import { marketUrl } from "../services/marketDataClient";
import type { GatewaySectorRrgDoc, SectorCycleDetail, SectorTrackingSummary } from "../lib/locnganh/types";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";
const get = async <T,>(url: string): Promise<T> => {
  const r = await fetch(url);
  if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error((b as { error?: string }).error || `Lỗi ${r.status}`); }
  return r.json();
};
const OPTS = { revalidateOnFocus: false, dedupingInterval: 10 * 60_000 };

export function useSectorRrg() {
  const { data, error, isLoading } = useSWR<GatewaySectorRrgDoc>(marketUrl("/api/market/sectors/rrg"), get, OPTS);
  return { data, error: error as Error | undefined, isLoading };
}

export function useSectorTaxonomy() {
  const { data } = useSWR<{ symbols: Record<string, { l1?: string; l2?: string; l3?: string }> }>(marketUrl("/api/market/sectors/taxonomy"), get, { ...OPTS, dedupingInterval: 60 * 60_000 });
  return data?.symbols ?? null;
}

export function useSectorCycle(code: string | null) {
  const { data, error, isLoading } = useSWR<SectorCycleDetail>(code ? `${API_BASE}/api/locnganh/sector-cycle?code=${encodeURIComponent(code)}` : null, get, OPTS);
  return { data, error: error as Error | undefined, isLoading };
}

/** Sổ theo dõi tín hiệu ngành thực tế (Project A /api/locnganh/signal-tracking). */
export function useSectorTracking() {
  const { data, error } = useSWR<SectorTrackingSummary>(`${API_BASE}/api/locnganh/signal-tracking`, get, OPTS);
  return { data, error: error as Error | undefined };
}
