import type { TimingSignalsBulkV3 } from './timing-types';
import { parseTimingSignals } from './timing-signals.schema';

export type TimingSignalsErrorKind = 'NETWORK' | 'TIMEOUT' | 'ABORTED' | 'HTTP' | 'PARSE' | 'SCHEMA';

export class TimingSignalsError extends Error {
  readonly kind: TimingSignalsErrorKind;
  readonly status?: number;
  readonly issues?: string[];
  readonly originalError?: unknown;

  constructor(kind: TimingSignalsErrorKind, message: string, extra: { status?: number; issues?: string[]; originalError?: unknown } = {}) {
    super(message);
    this.name = 'TimingSignalsError';
    this.kind = kind;
    this.status = extra.status;
    this.issues = extra.issues;
    this.originalError = extra.originalError;
  }
}

export function defaultBaseUrl(): string {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  return (env?.VITE_COTUC_API_BASE || 'https://tuan-quant-scanner-psi.vercel.app').replace(/\/+$/, '');
}

/**
 * `universe` chọn nhóm mã (ví dụ 'vn30', 'vn100', 'dividend17') để backend không phải luôn
 * tính cho mọi mã đang theo dõi — để trống nếu backend chỉ có một vũ trụ duy nhất.
 */
export function buildTimingSignalsUrl(baseUrl: string = defaultBaseUrl(), universe?: string): string {
  const qs = universe ? `?universe=${encodeURIComponent(universe)}` : '';
  return `${baseUrl.replace(/\/+$/, '')}/api/cotuc/timing-signals${qs}`;
}

export function isRetryable(err: unknown): boolean {
  if (!(err instanceof TimingSignalsError)) return false;
  if (err.kind === 'NETWORK' || err.kind === 'TIMEOUT') return true;
  if (err.kind === 'HTTP') return err.status === 429 || (err.status ?? 0) >= 500;
  return false;
}

/** timing-signals precompute theo lô cho cả vũ trụ, làm mới trong giờ giao dịch (mục 12.1). */
export function isSignalsStale(bulk: Pick<TimingSignalsBulkV3, 'asOf'>, nowMs: number, staleAfterHours = 36): boolean {
  const t = Date.parse(bulk.asOf);
  if (Number.isNaN(t)) return true;
  return nowMs - t > staleAfterHours * 3_600_000;
}

export interface FetchTimingSignalsOptions {
  baseUrl?: string;
  universe?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

/**
 * Lấy và validate TimingSignal cho TOÀN BỘ vũ trụ trong một request (thay vì Screener gọi
 * cycle-stats riêng cho từng dòng bảng). Không có khái niệm "chưa có dữ liệu ⇒ null" như
 * cycle-paths/cycle-stats: 404/204 vẫn được coi là lỗi HTTP vì bulk endpoint luôn phải trả về
 * (kể cả mảng `signals` rỗng) một khi vũ trụ đã được cấu hình ở backend.
 */
export async function fetchTimingSignals(opts: FetchTimingSignalsOptions = {}): Promise<TimingSignalsBulkV3> {
  const { baseUrl, universe, timeoutMs = 20_000, signal, fetchImpl = globalThis.fetch } = opts;
  if (typeof fetchImpl !== 'function') throw new TimingSignalsError('NETWORK', 'Môi trường không có fetch');
  if (signal?.aborted) throw new TimingSignalsError('ABORTED', 'Yêu cầu đã bị huỷ trước khi gửi');

  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, timeoutMs);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort, { once: true });

  const classify = (e: unknown): TimingSignalsError => {
    if (timedOut) return new TimingSignalsError('TIMEOUT', `Quá ${timeoutMs} ms khi tải timing-signals`, { originalError: e });
    if (signal?.aborted) return new TimingSignalsError('ABORTED', 'Yêu cầu đã bị huỷ', { originalError: e });
    return new TimingSignalsError('NETWORK', e instanceof Error ? e.message : 'Lỗi mạng', { originalError: e });
  };

  try {
    let res: Response;
    try {
      res = await fetchImpl(buildTimingSignalsUrl(baseUrl, universe), { headers: { Accept: 'application/json' }, signal: ctrl.signal });
    } catch (e) {
      throw classify(e);
    }

    if (!res.ok) throw new TimingSignalsError('HTTP', `HTTP ${res.status}`, { status: res.status });

    let raw: unknown;
    try {
      raw = await res.json();
    } catch (e) {
      throw timedOut ? classify(e) : new TimingSignalsError('PARSE', 'Phản hồi không phải JSON hợp lệ', { originalError: e });
    }

    const parsed = parseTimingSignals(raw);
    if (!parsed.ok) throw new TimingSignalsError('SCHEMA', 'Dữ liệu timing-signals sai hợp đồng (schema)', { issues: parsed.issues });
    return parsed.data;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}
