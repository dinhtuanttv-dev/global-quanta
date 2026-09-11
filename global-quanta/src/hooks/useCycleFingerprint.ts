import useSWR from 'swr';
import type { CycleFingerprintResponse, CycleFingerprintParams, Timeframe } from '../types/cycleFingerprint';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';
const CYCLE_FINGERPRINT_ENDPOINT = `${API_BASE}/api/cycle-fingerprint/analyze`;

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const fetcher = async (url: string): Promise<CycleFingerprintResponse> => {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new ApiError(body || `Request failed with status ${res.status}`, res.status);
  }
  return res.json();
};

function buildUrl({ ticker, windowSize = 30, timeframe = 'daily' }: CycleFingerprintParams): string {
  const params = new URLSearchParams({ ticker, window: String(windowSize), timeframe });
  return `${CYCLE_FINGERPRINT_ENDPOINT}?${params.toString()}`;
}

export interface UseCycleFingerprintResult {
  data: CycleFingerprintResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  error: ApiError | undefined;
  isEmpty: boolean;
  refresh: () => void;
}

/**
 * Hook lấy dữ liệu Cycle Fingerprint cho một mã cổ phiếu.
 * `ticker` truyền từ useAppStore().selectedTicker, không tạo state cục bộ.
 */
export function useCycleFingerprint(
  ticker: string | null,
  windowSize: number = 30,
  timeframe: Timeframe = 'daily',
): UseCycleFingerprintResult {
  const shouldFetch = Boolean(ticker);
  const key = shouldFetch ? buildUrl({ ticker: ticker as string, windowSize, timeframe }) : null;

  const { data, error, isLoading, mutate } = useSWR<CycleFingerprintResponse, ApiError>(
    key, fetcher,
    { revalidateOnFocus: false, dedupingInterval: 30_000 },
  );

  const isEmpty = Boolean(data) && (data!.state === 'insufficient' || data!.topMatches.length === 0);

  return { data, isLoading, isError: Boolean(error), error, isEmpty, refresh: () => mutate() };
}
