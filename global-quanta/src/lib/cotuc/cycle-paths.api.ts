import type { CyclePathsV3 } from './timing-types';
import { TICKER_RE, parseCyclePaths } from './cycle-paths.schema';

export type CyclePathsErrorKind =
  | 'INVALID_TICKER'
  | 'NETWORK'
  | 'TIMEOUT'
  | 'ABORTED'
  | 'HTTP'
  | 'PARSE'
  | 'SCHEMA'
  | 'TICKER_MISMATCH';

export class CyclePathsError extends Error {
  readonly kind: CyclePathsErrorKind;
  readonly status?: number;
  readonly issues?: string[];
  readonly originalError?: unknown;

  constructor(
    kind: CyclePathsErrorKind,
    message: string,
    extra: { status?: number; issues?: string[]; originalError?: unknown } = {},
  ) {
    super(message);
    this.name = 'CyclePathsError';
    this.kind = kind;
    this.status = extra.status;
    this.issues = extra.issues;
    this.originalError = extra.originalError;
  }
}

/** Chuẩn hoá mã: cắt khoảng trắng, chữ hoa. null nếu không hợp lệ. */
export function normalizeTicker(t: string | null | undefined): string | null {
  if (typeof t !== 'string') return null;
  const s = t.trim().toUpperCase();
  return TICKER_RE.test(s) ? s : null;
}

/** Base URL của API (host riêng). Đặt VITE_COTUC_API_BASE, để trống nếu cùng origin. */
export function defaultBaseUrl(): string {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  return (env?.VITE_COTUC_API_BASE ?? '').replace(/\/+$/, '');
}

export function buildCyclePathsUrl(ticker: string, baseUrl: string = defaultBaseUrl()): string {
  return `${baseUrl.replace(/\/+$/, '')}/api/cotuc/cycle-paths?ticker=${encodeURIComponent(ticker)}`;
}

/** Lỗi tạm thời đáng thử lại (mạng, timeout, 5xx, 429). Lỗi xác định (schema, 4xx khác) thì không. */
export function isRetryable(err: unknown): boolean {
  if (!(err instanceof CyclePathsError)) return false;
  if (err.kind === 'NETWORK' || err.kind === 'TIMEOUT') return true;
  if (err.kind === 'HTTP') return err.status === 429 || (err.status ?? 0) >= 500;
  return false;
}

/** Dữ liệu cũ hơn `staleAfterHours` (mặc định khớp EngineConfig.staleAfterHours = 36). asOf lỗi ⇒ coi là cũ. */
export function isPathsStale(paths: Pick<CyclePathsV3, 'asOf'>, nowMs: number, staleAfterHours = 36): boolean {
  const t = Date.parse(paths.asOf);
  if (Number.isNaN(t)) return true;
  return nowMs - t > staleAfterHours * 3_600_000;
}

export interface FetchCyclePathsOptions {
  baseUrl?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Tiêm fetch để test. Mặc định globalThis.fetch. */
  fetchImpl?: typeof fetch;
}

/**
 * Lấy và validate đường CAR của một mã.
 * - Trả null khi backend chưa có dữ liệu (404 hoặc 204): đây là trạng thái "chưa có", không phải lỗi.
 * - Ném CyclePathsError (có `kind`) cho mọi lỗi còn lại.
 * - ETag/Cache-Control do trình duyệt xử lý sẵn qua HTTP cache khi server gửi header tương ứng.
 */
export async function fetchCyclePaths(
  ticker: string,
  opts: FetchCyclePathsOptions = {},
): Promise<CyclePathsV3 | null> {
  const t = normalizeTicker(ticker);
  if (!t) throw new CyclePathsError('INVALID_TICKER', `Mã không hợp lệ: "${ticker}"`);

  const { baseUrl, timeoutMs = 15_000, signal, fetchImpl = globalThis.fetch } = opts;
  if (typeof fetchImpl !== 'function') throw new CyclePathsError('NETWORK', 'Môi trường không có fetch');

  if (signal?.aborted) throw new CyclePathsError('ABORTED', 'Yêu cầu đã bị huỷ trước khi gửi');

  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, timeoutMs);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort, { once: true });

  const classify = (e: unknown): CyclePathsError => {
    if (timedOut) return new CyclePathsError('TIMEOUT', `Quá ${timeoutMs} ms khi tải cycle-paths`, { originalError: e });
    if (signal?.aborted) return new CyclePathsError('ABORTED', 'Yêu cầu đã bị huỷ', { originalError: e });
    return new CyclePathsError('NETWORK', e instanceof Error ? e.message : 'Lỗi mạng', { originalError: e });
  };

  try {
    let res: Response;
    try {
      res = await fetchImpl(buildCyclePathsUrl(t, baseUrl), {
        headers: { Accept: 'application/json' },
        signal: ctrl.signal,
      });
    } catch (e) {
      throw classify(e);
    }

    if (res.status === 404 || res.status === 204) return null;
    if (!res.ok) throw new CyclePathsError('HTTP', `HTTP ${res.status}`, { status: res.status });

    let raw: unknown;
    try {
      raw = await res.json();
    } catch (e) {
      throw timedOut ? classify(e) : new CyclePathsError('PARSE', 'Phản hồi không phải JSON hợp lệ', { originalError: e });
    }

    const parsed = parseCyclePaths(raw);
    if (!parsed.ok) {
      throw new CyclePathsError('SCHEMA', 'Dữ liệu cycle-paths sai hợp đồng (schema)', { issues: parsed.issues });
    }
    if (parsed.data.ticker !== t) {
      throw new CyclePathsError('TICKER_MISMATCH', `Yêu cầu ${t} nhưng nhận ${parsed.data.ticker}`);
    }
    return parsed.data;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}
