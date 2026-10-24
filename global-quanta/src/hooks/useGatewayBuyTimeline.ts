import useSWR from 'swr';
import { fetchMarketJson, isMarketGatewayEnabled } from '../services/marketDataClient';
import { parseBuyTimeline, type BuyTimeline } from '../lib/cotuc/buy-timeline';

/** Nguồn + độ tươi của Timeline qua Gateway (B1). */
export interface BuyTimingMeta {
  source: string; via: string; fetchedAt: string | null; snapshotToday: string | null; stale: boolean; lastError: string | null; nextRetryAt: string | null;
  /** B4: lần engine tính quyết định gần nhất + số phiên đã trôi qua từ đó (null = chưa rõ). */
  dataAsOf?: string | null; ageSessions?: number | null;
}

/** B4: một dòng nguồn + độ mới cho giao diện ("Gateway tự tính · dữ liệu 24/10 · cũ 2 phiên"). */
export function buyTimingFreshness(meta: BuyTimingMeta | null): { text: string; stale: boolean } | null {
  if (!meta) return null;
  const src = meta.source === 'GATEWAY_STORE' ? 'Gateway tự tính' : 'Project A (bản đệm)';
  const vn = meta.dataAsOf ? new Date(Date.parse(meta.dataAsOf) + 7 * 3_600_000).toISOString() : null; // ngày theo giờ VN, định dạng cố định dd/mm
  const d = vn ? `${vn.slice(8, 10)}/${vn.slice(5, 7)}` : null;
  const age = meta.ageSessions != null && meta.ageSessions > 1 ? ` · CŨ ${meta.ageSessions} phiên` : '';
  return { text: `${src}${d ? ` · dữ liệu ${d}` : ''}${age}`, stale: meta.stale };
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
