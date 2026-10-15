// Top 20 v2 (T4) — Gateway /api/market/alpha/top20. Bản dựng hằng ngày 16:10 nằm trong KV nên thường trả ngay.
import useSWR from 'swr';
import { marketUrl } from '../services/marketDataClient';
import type { AlphaTop20Response } from '../types/alphaTop20';

const fetcher = async (url: string): Promise<AlphaTop20Response> => {
  const r = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error((b as { error?: string }).error || `Lỗi ${r.status}`); }
  return r.json();
};

export function useAlphaTop20(enabled = true) {
  const { data, error, isLoading } = useSWR<AlphaTop20Response, Error>(enabled ? marketUrl('/api/market/alpha/top20') : null, fetcher, {
    revalidateOnFocus: false, dedupingInterval: 10 * 60_000, shouldRetryOnError: false,
  });
  return { data, error, isLoading };
}
