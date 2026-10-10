// Cycle Fingerprint v2 (CF4) — Gateway /api/market/cycles/:symbol (engine CF2, thư viện toàn universe).
// Lần đầu sau khi Gateway khởi động có thể mất ~45 giây để dựng thư viện -> timeout dài, không tự thử lại liên tục.
import useSWR from 'swr';
import { marketUrl } from '../services/marketDataClient';
import type { CycleV2Response } from '../types/cycleFingerprintV2';

export class CycleV2Error extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

const fetcher = async (url: string): Promise<CycleV2Response> => {
  const r = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!r.ok) {
    const b = await r.json().catch(() => ({}));
    throw new CycleV2Error((b as { error?: string }).error || `Lỗi ${r.status}`, r.status);
  }
  return r.json();
};

export function useCycleFingerprintV2(ticker: string | null, enabled = true) {
  const key = ticker && enabled ? marketUrl(`/api/market/cycles/${encodeURIComponent(ticker.toUpperCase())}`) : null;
  const { data, error, isLoading, mutate } = useSWR<CycleV2Response, CycleV2Error>(key, fetcher, {
    revalidateOnFocus: false, dedupingInterval: 10 * 60_000, shouldRetryOnError: false,
  });
  return { data, error, isLoading, refresh: () => mutate() };
}
