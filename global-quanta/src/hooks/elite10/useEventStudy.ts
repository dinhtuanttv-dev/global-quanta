import useSWR from "swr";
import { defaultBaseUrl } from "../../lib/cotuc/cycle-paths.api";
import type { EventStudy } from "../../lib/elite10/timingSim";

/**
 * CH2 (29/10/2026) — nghiên cứu sự kiện cho chart mô phỏng thời điểm (Project A /api/cotuc/event-study, engine v3 chỉ đọc).
 * 404 = mã chưa đủ dữ liệu (không phải lỗi) -> data null. Làm mới 30 phút (đường CAR chỉ đổi khi có phiên mới).
 */
export function useEventStudy(ticker: string | null, kind: "DIVIDEND" | "EARNINGS", quarter: number | null = null) {
  const key = ticker ? ["event-study", ticker, kind, quarter ?? ""] : null;
  const { data, error, isLoading } = useSWR(key, async () => {
    const q = new URLSearchParams({ ticker: ticker!, kind });
    if (quarter) q.set("quarter", String(quarter));
    const res = await fetch(`${defaultBaseUrl()}/api/cotuc/event-study?${q}`, { headers: { accept: "application/json" } });
    if (res.status === 404) return { es: null as EventStudy | null, reason: ((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Chưa đủ dữ liệu." };
    if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${res.status}`);
    const es = (await res.json()) as EventStudy;
    if (!Array.isArray(es?.offsets) || !Array.isArray(es?.events)) throw new Error("Nghiên cứu sự kiện sai hợp đồng.");
    return { es, reason: null as string | null };
  }, { refreshInterval: 30 * 60_000, dedupingInterval: 10 * 60_000, revalidateOnFocus: false, errorRetryCount: 2 });
  return { es: data?.es ?? null, emptyReason: data?.reason ?? null, loading: isLoading, error: error ? String((error as Error).message ?? error) : null };
}
