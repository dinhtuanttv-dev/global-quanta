import type { CycleStatsV3 } from './timing-types';
import { TICKER_RE, parseCycleStats } from './cycle-stats.schema';

export type CycleStatsErrorKind =
  | 'INVALID_TICKER'
  | 'NETWORK'
  | 'TIMEOUT'
  | 'ABORTED'
  | 'HTTP'
  | 'PARSE'
  | 'SCHEMA'
  | 'TICKER_MISMATCH';

export class CycleStatsError extends Error {
  readonly kind: CycleStatsErrorKind;
  readonly status?: number;
  readonly issues?: string[];
  readonly originalError?: unknown;

  constructor(kind: CycleStatsErrorKind, message: string, extra: { status?: number; issues?: string[]; originalError?: unknown } = {}) {
    super(message);
    this.name = 'CycleStatsError';
    this.kind = kind;
    this.status = extra.status;
    this.issues = extra.issues;
    this.originalError = extra.originalError;
  }
}

export function normalizeTicker(t: string | null | undefined): string | null {
  if (typeof t !== 'string') return null;
  const s = t.trim().toUpperCase();
  return TICKER_RE.test(s) ? s : null;
}

export function defaultBaseUrl(): string {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  return (env?.VITE_COTUC_API_BASE || 'https://tuan-quant-scanner-psi.vercel.app').replace(/\/+$/, '');
}

export function buildCycleStatsUrl(ticker: string, baseUrl: string = defaultBaseUrl()): string {
  return `${baseUrl.replace(/\/+$/, '')}/api/cotuc/cycle-stats-v3?ticker=${encodeURIComponent(ticker)}`;
}

export function isRetryable(err: unknown): boolean {
  if (!(err instanceof CycleStatsError)) return false;
  if (err.kind === 'NETWORK' || err.kind === 'TIMEOUT') return true;
  if (err.kind === 'HTTP') return err.status === 429 || (err.status ?? 0) >= 500;
  return false;
}

/** cycle-stats precompute theo lô hằng đêm, giống cycle-paths (EngineConfig.staleAfterHours = 36). */
export function isStatsStale(stats: Pick<CycleStatsV3, 'asOf'>, nowMs: number, staleAfterHours = 36): boolean {
  const t = Date.parse(stats.asOf);
  if (Number.isNaN(t)) return true;
  return nowMs - t > staleAfterHours * 3_600_000;
}

export interface FetchCycleStatsOptions {
  baseUrl?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

/**
 * Lấy và validate CycleStatsV3 của một mã. Cùng hợp đồng lỗi với fetchCyclePaths
 * (xem cycle-paths.api.ts): 404/204 ⇒ null (chưa có dữ liệu), còn lại ném CycleStatsError.
 */
export async function fetchCycleStats(ticker: string, opts: FetchCycleStatsOptions = {}): Promise<CycleStatsV3 | null> {
  const t = normalizeTicker(ticker);
  if (!t) throw new CycleStatsError('INVALID_TICKER', `Mã không hợp lệ: "${ticker}"`);

  const { baseUrl, timeoutMs = 15_000, signal, fetchImpl = globalThis.fetch } = opts;
  if (typeof fetchImpl !== 'function') throw new CycleStatsError('NETWORK', 'Môi trường không có fetch');
  if (signal?.aborted) throw new CycleStatsError('ABORTED', 'Yêu cầu đã bị huỷ trước khi gửi');

  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, timeoutMs);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort, { once: true });

  const classify = (e: unknown): CycleStatsError => {
    if (timedOut) return new CycleStatsError('TIMEOUT', `Quá ${timeoutMs} ms khi tải cycle-stats`, { originalError: e });
    if (signal?.aborted) return new CycleStatsError('ABORTED', 'Yêu cầu đã bị huỷ', { originalError: e });
    return new CycleStatsError('NETWORK', e instanceof Error ? e.message : 'Lỗi mạng', { originalError: e });
  };

  try {
    let res: Response;
    try {
      res = await fetchImpl(buildCycleStatsUrl(t, baseUrl), { headers: { Accept: 'application/json' }, signal: ctrl.signal });
    } catch (e) {
      throw classify(e);
    }

    if (res.status === 404 || res.status === 204) return null;
    if (!res.ok) throw new CycleStatsError('HTTP', `HTTP ${res.status}`, { status: res.status });

    let raw: unknown;
    try {
      raw = await res.json();
    } catch (e) {
      throw timedOut ? classify(e) : new CycleStatsError('PARSE', 'Phản hồi không phải JSON hợp lệ', { originalError: e });
    }

    const parsed = parseCycleStats(raw);
    if (!parsed.ok) throw new CycleStatsError('SCHEMA', 'Dữ liệu cycle-stats sai hợp đồng (schema)', { issues: parsed.issues });
    if (parsed.data.ticker !== t) throw new CycleStatsError('TICKER_MISMATCH', `Yêu cầu ${t} nhưng nhận ${parsed.data.ticker}`);
    return parsed.data;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}
