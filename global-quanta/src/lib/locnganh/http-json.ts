// Port từ locnganh-timing-engine (ui/sector-rotation/http-json.ts).
/**
 * http-json.ts — sao chép nguyên khối từ cotuc-timing-engine/src/ui/seasonality/http-json.ts
 * (chỉ đổi tên lớp lỗi), dùng chung cho các endpoint sector-rotation để không lặp lại khối
 * timeout/abort/phân loại lỗi ở từng file *.api.ts riêng lẻ.
 * Hợp đồng lỗi: 404/204 ⇒ null (chưa có dữ liệu), còn lại ném SectorFetchError có `kind` phân loại được.
 */
export type SectorErrorKind = 'INVALID_INPUT' | 'NETWORK' | 'TIMEOUT' | 'ABORTED' | 'HTTP' | 'PARSE' | 'SCHEMA' | 'MISMATCH';

export class SectorFetchError extends Error {
  readonly kind: SectorErrorKind;
  readonly status?: number;
  readonly issues?: string[];
  readonly originalError?: unknown;
  constructor(kind: SectorErrorKind, message: string, extra: { status?: number; issues?: string[]; originalError?: unknown } = {}) {
    super(message);
    this.name = 'SectorFetchError';
    this.kind = kind;
    this.status = extra.status;
    this.issues = extra.issues;
    this.originalError = extra.originalError;
  }
}

export function isRetryableSector(err: unknown): boolean {
  if (!(err instanceof SectorFetchError)) return false;
  if (err.kind === 'NETWORK' || err.kind === 'TIMEOUT') return true;
  if (err.kind === 'HTTP') return err.status === 429 || (err.status ?? 0) >= 500;
  return false;
}

export interface FetchJsonOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

export async function fetchValidatedJson<T>(
  url: string,
  parse: (raw: unknown) => { ok: true; data: T } | { ok: false; issues: string[] },
  what: string,
  opts: FetchJsonOptions = {},
): Promise<T | null> {
  const { timeoutMs = 15_000, signal, fetchImpl = globalThis.fetch } = opts;
  if (typeof fetchImpl !== 'function') throw new SectorFetchError('NETWORK', 'Môi trường không có fetch');
  if (signal?.aborted) throw new SectorFetchError('ABORTED', 'Yêu cầu đã bị huỷ trước khi gửi');

  const ctrl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, timeoutMs);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort, { once: true });

  const classify = (e: unknown): SectorFetchError => {
    if (timedOut) return new SectorFetchError('TIMEOUT', `Quá ${timeoutMs} ms khi tải ${what}`, { originalError: e });
    if (signal?.aborted) return new SectorFetchError('ABORTED', 'Yêu cầu đã bị huỷ', { originalError: e });
    return new SectorFetchError('NETWORK', e instanceof Error ? e.message : 'Lỗi mạng', { originalError: e });
  };

  try {
    let res: Response;
    try {
      res = await fetchImpl(url, { headers: { Accept: 'application/json' }, signal: ctrl.signal });
    } catch (e) {
      throw classify(e);
    }
    if (res.status === 404 || res.status === 204) return null;
    if (!res.ok) throw new SectorFetchError('HTTP', `HTTP ${res.status}`, { status: res.status });
    let raw: unknown;
    try {
      raw = await res.json();
    } catch (e) {
      throw timedOut ? classify(e) : new SectorFetchError('PARSE', 'Phản hồi không phải JSON hợp lệ', { originalError: e });
    }
    const parsed = parse(raw);
    if (!parsed.ok) throw new SectorFetchError('SCHEMA', `Dữ liệu ${what} sai hợp đồng (schema)`, { issues: parsed.issues });
    return parsed.data;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}
