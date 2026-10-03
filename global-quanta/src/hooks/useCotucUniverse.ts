import useSWR from 'swr';
import { fetchMarketJson, isMarketGatewayEnabled } from '../services/marketDataClient';
import type { UniverseRow } from '../lib/cotuc/universe-stocks';

// Danh mục tab Cổ tức = danh mục Siêu Quét AI (Market Gateway). Gateway tắt/lỗi -> rỗng (bảng vẫn có 17 mã gốc).
export function useCotucUniverse() {
  const { data, error, isLoading } = useSWR(
    isMarketGatewayEnabled() ? 'gw:/api/market/scanner/universe' : null,
    () => fetchMarketJson<{ tickers: UniverseRow[]; builtAt?: string }>('/api/market/scanner/universe'),
    { revalidateOnFocus: false, dedupingInterval: 30 * 60_000, refreshInterval: 60 * 60_000 },
  );
  return { rows: data?.tickers ?? [], builtAt: data?.builtAt ?? null, loading: isLoading, error: error ? String((error as Error).message ?? error) : null };
}

export interface CotucScanLane {
  offset: number; total: number | null; batches: number; passes: number; lastBatchAt: string | null; lastPassAt: string | null;
  progress: number | null; lastError: { at: string; message: string } | null;
  lastResult: { at: string; processed?: number | null; decisions?: number | null; liveQuotes?: number | null; regime?: string | null; levels?: Record<string, number> | null } | null;
}
export interface CotucScanStatus {
  enabled: boolean; reason: string | null; mode: 'SESSION' | 'OFF_HOURS'; running: boolean;
  intervals: { sessionMs: number; offHoursMs: number; timingLimit: number };
  timing: CotucScanLane; seasonality: CotucScanLane & { lastFinalizeAt: string | null };
}

/** Trạng thái quét liên tục (Gateway), làm mới mỗi 20 giây. */
export function useCotucScanStatus() {
  const { data, error } = useSWR(
    isMarketGatewayEnabled() ? 'gw:/api/market/cotuc-scan/status' : null,
    () => fetchMarketJson<CotucScanStatus>('/api/market/cotuc-scan/status'),
    { refreshInterval: 20_000, revalidateOnFocus: true, dedupingInterval: 10_000 },
  );
  return { status: data ?? null, error: error ? String((error as Error).message ?? error) : null };
}
