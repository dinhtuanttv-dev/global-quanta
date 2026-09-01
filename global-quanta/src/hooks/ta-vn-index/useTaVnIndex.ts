import useSWR from 'swr';
import type { TaVnIndexResponse, TaVnIndexParams, Timeframe } from '../../types/taVnIndex';

/**
 * Toàn bộ dữ liệu của Project B PHẢI đi qua Project A — cấm gọi thẳng
 * Yahoo Finance/DB/API ngoài từ trình duyệt (vi phạm ranh giới kiến trúc +
 * lỗi CORS).
 */
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

/**
 * ⚠️ XÁC NHẬN TRƯỚC KHI DÙNG: route giả định theo pattern
 * `/api/convergence-scan` đã có ở Project A. Kiểm tra route thật (có thể
 * là `/api/ta-vn-index/analyze`) trước khi build — KHÔNG viết trùng lặp
 * logic backend (SMC/Wyckoff/Elliott/ADX/Pattern Scanner đều thuộc Project A).
 */
const TA_VN_INDEX_ENDPOINT = `${API_BASE}/api/ta-vn-index/analyze`;

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const fetcher = async (url: string): Promise<TaVnIndexResponse> => {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new ApiError(body || `Request failed with status ${res.status}`, res.status);
  }
  return res.json();
};

function buildUrl({ ticker, timeframe = 'W' }: TaVnIndexParams): string {
  const params = new URLSearchParams({ ticker, timeframe });
  return `${TA_VN_INDEX_ENDPOINT}?${params.toString()}`;
}

export interface UseTaVnIndexResult {
  data: TaVnIndexResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  error: ApiError | undefined;
  isEmpty: boolean;
  refresh: () => void;
}

/**
 * Hook lấy dữ liệu TA VN-Index cho 1 mã. `ticker` nên đến từ
 * `useAppStore().selectedTicker` hoặc từ danh sách mã cục bộ của tab này —
 * không tạo state trùng lặp không cần thiết.
 */
export function useTaVnIndex(ticker: string | null, timeframe: Timeframe = 'W'): UseTaVnIndexResult {
  const shouldFetch = Boolean(ticker);
  const key = shouldFetch ? buildUrl({ ticker: ticker as string, timeframe }) : null;

  const { data, error, isLoading, mutate } = useSWR<TaVnIndexResponse, ApiError>(key, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 30_000,
  });

  const isEmpty = Boolean(data) && data!.priceSeries.length === 0;

  return {
    data,
    isLoading,
    isError: Boolean(error),
    error,
    isEmpty,
    refresh: () => mutate(),
  };
}
