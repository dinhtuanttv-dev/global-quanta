import useSWR from 'swr';
import { fetchMarketJson, isMarketGatewayEnabled } from '../services/marketDataClient';
import { parseBuyTimeline, type BuyTimeline } from '../lib/cotuc/buy-timeline';

/** Nguồn + độ tươi của Timeline qua Gateway (B1). */
export interface BuyTimingMeta {
  source: string; via: string; fetchedAt: string | null; snapshotToday: string | null; stale: boolean; lastError: string | null; nextRetryAt: string | null;
}
interface GatewayBuyTiming { available: boolean; today: string; sessions?: string[]; meta: BuyTimingMeta; [k: string]: unknown }

/**
 * B1/B3 (25/10/2026) — "Timeline điểm mua" qua Gateway /api/elite/buy-timing: bản tốt gần nhất (Railway Volume) khi Project A lỗi,
 * trạng thái / số phiên đã tính lại theo HÔM NAY, kèm `sessions` (phiên giao dịch sắp tới, có ngày nghỉ lễ).
 * Dùng cho ELITE COMMAND RADAR + Elite 10. (Tab Cổ tức giữ nguyên hook useBuyTimeline của nó.)
 * Mỗi dòng được kiểm hợp đồng bằng zod như hook gốc (dòng sai bị bỏ riêng).
 */
export function useGatewayBuyTimeline() {
  const key = isMarketGatewayEnabled() ? 'elite-buy-timing' : null;
  const { data, error, isLoading } = useSWR(key, async () => {
    const raw = await fetchMarketJson<GatewayBuyTiming>('/api/elite/buy-timing');
    if (!raw.available) return { timeline: null as BuyTimeline | null, sessions: raw.sessions ?? [], meta: raw.meta };
    const parsed = parseBuyTimeline(raw);
    if (!parsed.ok) throw new Error(`Timeline sai hợp đồng: ${parsed.issues.slice(0, 2).join('; ')}`);
    return { timeline: parsed.data, sessions: raw.sessions ?? [], meta: raw.meta };
  }, { refreshInterval: 10 * 60_000, dedupingInterval: 2 * 60_000, revalidateOnFocus: true, errorRetryCount: 2 });
  return {
    data: data?.timeline ?? null, sessions: data?.sessions ?? [], meta: data?.meta ?? null, loading: isLoading,
    error: error ? String((error as Error).message ?? error) : !isLoading && data && !data.timeline ? `Timeline tạm không có${data.meta?.lastError ? ` (${data.meta.lastError})` : ''}` : null,
  };
}
