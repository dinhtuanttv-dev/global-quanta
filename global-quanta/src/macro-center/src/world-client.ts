/** world-client.ts — typed fetch wrapper for /api/world/*; fetch is injectable. */
import { MacroApiError } from './macro-client';

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * W4 (19/11/2026): bộ đệm phản hồi THÀNH CÔNG dùng chung trong trang (khoá = baseUrl + phương thức + đường dẫn + thân), sống 5 phút.
 * Mọi route /api/world/* là tính toán chỉ đọc nên đệm an toàn; lỗi không đệm. Nhờ đó tải trước được khi rê chuột lên tab con,
 * và quay lại tab không phải tính lại. Mặc định chỉ bật với fetch thật (client có fetch tiêm vào — dùng trong test — không đệm).
 */
export const WORLD_CACHE_TTL_MS = 5 * 60_000;
const responseCache = new Map<string, { at: number; value: Promise<unknown> }>();
export function clearWorldCache() { responseCache.clear(); }

const abortError = () => new DOMException('Aborted', 'AbortError');
/** Gắn signal của người gọi vào một promise dùng chung: người gọi huỷ thì chỉ phần của họ bị huỷ, bản đệm vẫn còn. */
function withAbort<T>(p: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return p;
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError());
    signal.addEventListener('abort', onAbort, { once: true });
    p.then((v) => { signal.removeEventListener('abort', onAbort); resolve(v); }, (e) => { signal.removeEventListener('abort', onAbort); reject(e); });
  });
}

export function createWorldClient(baseUrl = '', fetchImpl?: FetchLike, opts: { cache?: boolean; now?: () => number } = {}) {
  const f: FetchLike = fetchImpl ?? ((url, init) => fetch(url, init));
  const useCache = opts.cache ?? !fetchImpl;
  const now = opts.now ?? Date.now;
  async function raw<T>(method: 'GET' | 'POST', path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    const res = await f(`${baseUrl}/api/world/${path}`, { method, signal, headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    let payload: unknown = null;
    try {
      payload = await res.json();
    } catch {
      /* non-JSON error page */
    }
    if (!res.ok) throw new MacroApiError(res.status, payload && typeof payload === 'object' && 'error' in payload ? String((payload as { error: unknown }).error) : `Lỗi ${res.status}`);
    return payload as T;
  }
  function call<T>(method: 'GET' | 'POST', path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    if (!useCache) return raw<T>(method, path, body, signal);
    const key = `${baseUrl}|${method}|${path}|${body === undefined ? '' : JSON.stringify(body)}`;
    const hit = responseCache.get(key);
    if (hit && now() - hit.at < WORLD_CACHE_TTL_MS) return withAbort(hit.value as Promise<T>, signal);
    const value = raw<T>(method, path, body);
    responseCache.set(key, { at: now(), value });
    value.catch(() => { if (responseCache.get(key)?.value === value) responseCache.delete(key); });
    if (responseCache.size > 200) responseCache.delete(responseCache.keys().next().value as string);
    return withAbort(value, signal);
  }
  const qs = (o: Record<string, string | number | undefined>) => {
    const e = Object.entries(o).filter(([, v]) => v !== undefined) as [string, string | number][];
    return e.length ? `?${e.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&')}` : '';
  };
  return {
    series: <T = unknown>(signal?: AbortSignal) => call<T>('GET', 'series', undefined, signal),
    overview: <T = unknown>(asOf?: string, signal?: AbortSignal) => call<T>('GET', `overview${qs({ asOf })}`, undefined, signal),
    matrix: <T = unknown>(body: Record<string, unknown> = {}, signal?: AbortSignal) => call<T>('POST', 'matrix', body, signal),
    connectedness: <T = unknown>(opts: { window?: number; H?: number; step?: number } = {}, signal?: AbortSignal) => call<T>('GET', `connectedness${qs(opts)}`, undefined, signal),
    events: <T = unknown>(signal?: AbortSignal) => call<T>('GET', 'events', undefined, signal),
    event: <T = unknown>(id: string, signal?: AbortSignal) => call<T>('GET', `events/${encodeURIComponent(id)}`, undefined, signal),
    stock: <T = unknown>(code: string, signal?: AbortSignal) => call<T>('GET', `stock/${encodeURIComponent(code)}`, undefined, signal),
    scenario: <T = unknown>(body: Record<string, unknown>, signal?: AbortSignal) => call<T>('POST', 'scenario', body, signal),
  };
}
export type WorldClient = ReturnType<typeof createWorldClient>;

/** W4: tải trước dữ liệu của một phần (rê chuột / focus vào tab con). Lỗi bị bỏ qua — phần đó sẽ tự tải lại khi mở. */
export function prefetchWorld(baseUrl: string, part: 'overview' | 'transmission' | 'markets'): void {
  const c = createWorldClient(baseUrl);
  const jobs: Promise<unknown>[] = part === 'overview' ? [c.overview(), c.matrix()]
    : part === 'transmission' ? [c.series(), c.matrix(), c.events()]
    : [c.connectedness()];
  for (const j of jobs) j.catch(() => {});
}
