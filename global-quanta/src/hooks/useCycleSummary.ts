// Tóm tắt Cycle Fingerprint cho nhiều mã (bảng Top 20) — Gateway /api/market/cycles-summary.
import useSWR from 'swr';
import { marketUrl } from '../services/marketDataClient';
import type { CycleSummaryDoc } from '../types/cycleFingerprintV2';

const fetcher = async (url: string): Promise<CycleSummaryDoc> => {
  const r = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error((b as { error?: string }).error || `Lỗi ${r.status}`); }
  return r.json();
};

export function useCycleSummary(symbols: string[]) {
  const key = symbols.length ? marketUrl(`/api/market/cycles-summary?symbols=${[...symbols].sort().join(',')}`) : null;
  const { data, error, isLoading } = useSWR<CycleSummaryDoc, Error>(key, fetcher, { revalidateOnFocus: false, dedupingInterval: 10 * 60_000, keepPreviousData: true, shouldRetryOnError: false });
  return { data, error, isLoading };
}
